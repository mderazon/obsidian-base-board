/* eslint-disable import/no-nodejs-modules */
/**
 * Thin wrapper over the Obsidian CLI (`obsidian` v1.12+).
 *
 * All data operations go through here. No direct file I/O — we delegate
 * everything to Obsidian's own engine via its CLI, which means we get correct
 * link resolution, metadataCache, and vault awareness for free.
 *
 * Requires Obsidian to be running with CLI enabled
 * (Settings → General → Command line interface).
 */

import { exec } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";
import type {
  Board,
  BoardConfig,
  Card,
  CreateCardOptions,
  MoveResult,
} from "./types.js";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Linux / Snap environment setup
//
// Two issues on Linux that require workarounds until Obsidian fixes them:
//
// 1. AppArmor userns restriction (Ubuntu 23.10+): Electron crashes when
//    spawned as a subprocess without --no-sandbox.
//    https://github.com/obsidianmd/obsidian-help/issues/1046
//
// 2. Snap install: config is at ~/snap/obsidian/current/.config/obsidian/
//    instead of ~/.config/obsidian/, so we set XDG_CONFIG_HOME.
//    BB_XDG_CONFIG_HOME env var overrides auto-detection.
// ---------------------------------------------------------------------------

/** Resolve XDG_CONFIG_HOME for the obsidian CLI subprocess. */
function resolveXdgConfigHome(): string | undefined {
  if (process.env["BB_XDG_CONFIG_HOME"])
    return process.env["BB_XDG_CONFIG_HOME"];
  const snapPath = `${process.env["HOME"]}/snap/obsidian/current/.config`;
  if (existsSync(`${snapPath}/obsidian/obsidian.json`)) return snapPath;
  return undefined;
}

const XDG_CONFIG_HOME = resolveXdgConfigHome();

// ---------------------------------------------------------------------------
// Vault path resolution — needed to read frontmatter directly from files
// (base:query only returns the groupBy property, not arbitrary frontmatter)
// ---------------------------------------------------------------------------

interface ObsidianConfig {
  vaults?: Record<string, { path: string }>;
}

function getVaultPaths(): string[] {
  const xdgConfig = XDG_CONFIG_HOME ?? `${process.env["HOME"] ?? ""}/.config`;
  const obsidianJson = `${xdgConfig}/obsidian/obsidian.json`;
  try {
    const data = JSON.parse(
      readFileSync(obsidianJson, "utf8"),
    ) as ObsidianConfig;
    return Object.values(data.vaults ?? {}).map((v) => v.path);
  } catch {
    return [];
  }
}

/**
 * Resolve the filesystem root of the vault that contains a given file path.
 * `cardPath` is vault-relative (e.g. "Tasks/Foo.md").
 */
function resolveVaultRoot(cardPath: string): string | undefined {
  for (const vaultPath of getVaultPaths()) {
    if (existsSync(`${vaultPath}/${cardPath}`)) return vaultPath;
  }
  return undefined;
}

/** Extract a single frontmatter property value from raw markdown content. */
function readFrontmatterProp(
  markdown: string,
  key: string,
): string | undefined {
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!fmMatch) return undefined;
  const line = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(fmMatch[1]);
  return line ? line[1].trim() : undefined;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function vaultPrefix(config: BoardConfig): string {
  return config.vault ? `vault="${config.vault}" ` : "";
}

async function run(command: string): Promise<string> {
  const fullCmd = `obsidian --no-sandbox ${command}`;
  const env = XDG_CONFIG_HOME
    ? { ...process.env, XDG_CONFIG_HOME }
    : process.env;

  try {
    const { stdout } = await execAsync(fullCmd, { env });
    return stdout.trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("command not found") || msg.includes("ENOENT")) {
      throw new Error(
        "Obsidian CLI not found. Make sure Obsidian is installed, running, " +
          "and CLI is enabled (Settings → General → Command line interface).",
      );
    }
    if (msg.includes("ECONNREFUSED") || msg.includes("not running")) {
      throw new Error("Obsidian is not running. Start Obsidian and try again.");
    }
    throw new Error(`Obsidian CLI error: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Query raw board JSON from the CLI
//
// Confirmed schema (Obsidian CLI v1.12.4) from `base:query path=<x> format=json`:
//   [
//     { "path": "Tasks/Foo.md", "file name": "Foo", "status": "Backlog", ...custom props },
//     ...
//   ]
// ---------------------------------------------------------------------------

function toStr(val: unknown): string {
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return "";
}

export function parseQueryResult(raw: unknown, boardName: string): Board {
  if (!Array.isArray(raw)) {
    throw new Error(`Unexpected base:query output format. Got: ${typeof raw}`);
  }

  const systemFields = new Set(["path", "file name"]);
  const sample = raw[0] as Record<string, unknown> | undefined;
  const groupBy =
    sample && "status" in sample
      ? "status"
      : (Object.keys(sample ?? {})
          .filter((k) => !systemFields.has(k))
          .find(
            (k) => typeof (sample as Record<string, unknown>)[k] === "string",
          ) ?? "status");

  const columns: Record<string, Card[]> = {};
  for (const row of raw as Record<string, unknown>[]) {
    const rawTitle = row["file name"] ?? row["path"];
    const title = toStr(rawTitle).replace(/\.md$/, "").split("/").pop() ?? "";
    const column = toStr(row[groupBy]);
    const path = toStr(row["path"]);
    const id = typeof row["id"] === "string" ? row["id"] : undefined;

    if (!columns[column]) columns[column] = [];
    columns[column].push({ id, title, path, column, properties: row });
  }

  return { name: boardName, groupBy, columns };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getBoard(config: BoardConfig): Promise<Board> {
  const pfx = vaultPrefix(config);
  const name = config.board ?? "";
  const pathArg = name ? `path="${name}" ` : "";
  const raw = await run(`${pfx}base:query ${pathArg}format=json`);
  const parsed = JSON.parse(raw) as unknown;
  const board = parseQueryResult(
    parsed,
    name.replace(/\.base$/, "") || "Board",
  );

  // base:query only returns the groupBy property — read id from files directly
  const cards = allCards(board);
  const vaultRoot =
    cards.length > 0 ? resolveVaultRoot(cards[0].path) : undefined;
  if (vaultRoot) {
    for (const card of cards) {
      try {
        const content = readFileSync(`${vaultRoot}/${card.path}`, "utf8");
        card.id = readFrontmatterProp(content, "id");
      } catch {
        // file unreadable — leave id as undefined
      }
    }
  }

  return board;
}

export async function getCard(
  config: BoardConfig,
  path: string,
): Promise<string> {
  const pfx = vaultPrefix(config);
  return run(`${pfx}read file="${path}"`);
}

export async function moveCard(
  config: BoardConfig,
  path: string,
  toColumn: string,
): Promise<MoveResult> {
  const board = await getBoard(config);
  const card = findCardByPath(board, path);
  const fromColumn = card?.column ?? "unknown";
  const title = card?.title ?? path;

  const pfx = vaultPrefix(config);
  await run(
    `${pfx}property:set name="${board.groupBy}" value="${toColumn}" file="${path}"`,
  );

  return { title, fromColumn, toColumn };
}

export async function createCard(
  config: BoardConfig,
  title: string,
  options: CreateCardOptions,
): Promise<void> {
  const pfx = vaultPrefix(config);
  const boardArg = config.board ? `file="${config.board}" ` : "";

  await run(`${pfx}base:create ${boardArg}name="${title}"`);

  const board = await getBoard(config);
  await run(
    `${pfx}property:set name="${board.groupBy}" value="${options.column}" file="${title}"`,
  );
  if (options.id) {
    await run(
      `${pfx}property:set name="id" value="${options.id}" file="${title}"`,
    );
  }

  for (const [key, value] of Object.entries(options.properties ?? {})) {
    await run(
      `${pfx}property:set name="${key}" value="${value}" file="${title}"`,
    );
  }
  if (options.body) {
    await run(
      `${pfx}append file="${title}" content="${options.body.replace(/"/g, '\\"')}"`,
    );
  }
}

export async function setProperty(
  config: BoardConfig,
  path: string,
  key: string,
  value: string,
): Promise<void> {
  const pfx = vaultPrefix(config);
  await run(`${pfx}property:set name="${key}" value="${value}" file="${path}"`);
}

export async function listBoards(config: BoardConfig): Promise<string[]> {
  const pfx = vaultPrefix(config);
  const out = await run(`${pfx}bases`);
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

function findCardByPath(board: Board, path: string): Card | undefined {
  for (const cards of Object.values(board.columns)) {
    const found = cards.find((c) => c.path === path);
    if (found) return found;
  }
  return undefined;
}

export function allCards(board: Board): Card[] {
  return Object.values(board.columns).flat();
}

export function firstPendingCard(board: Board): Card | undefined {
  const doneVariants = new Set(["done", "completed", "closed"]);
  for (const [col, cards] of Object.entries(board.columns)) {
    if (!doneVariants.has(col.toLowerCase()) && cards.length > 0) {
      return cards[0];
    }
  }
  return undefined;
}
