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
import { existsSync } from "node:fs";
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
  // Explicit override takes priority
  if (process.env["BB_XDG_CONFIG_HOME"])
    return process.env["BB_XDG_CONFIG_HOME"];
  // Auto-detect snap install
  const snapPath = `${process.env["HOME"]}/snap/obsidian/current/.config`;
  if (existsSync(`${snapPath}/obsidian/obsidian.json`)) return snapPath;
  return undefined;
}

const XDG_CONFIG_HOME = resolveXdgConfigHome();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build the optional vault prefix for all obsidian CLI commands. */
function vaultPrefix(config: BoardConfig): string {
  return config.vault ? `vault="${config.vault}" ` : "";
}

/**
 * Run an obsidian CLI command and return stdout.
 * Throws a descriptive error if the CLI is not found or Obsidian isn't running.
 */
async function run(command: string): Promise<string> {
  // --no-sandbox: required on Linux with AppArmor userns restrictions
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
//
// Key field names:
//   "file name"  — the note title (file name without .md extension)
//   "path"       — vault-relative path to the note
//   "status"     — the groupBy property (or whatever the board groups by)
// ---------------------------------------------------------------------------

/** Safely convert an unknown value to string, avoiding [object Object] output. */
function toStr(val: unknown): string {
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return "";
}

/**
 * Parse the JSON returned by `obsidian base:query path=<board> format=json` into a Board.
 */
export function parseQueryResult(raw: unknown, boardName: string): Board {
  if (!Array.isArray(raw)) {
    throw new Error(`Unexpected base:query output format. Got: ${typeof raw}`);
  }

  // Detect groupBy column: prefer "status", fall back to first non-system string property.
  // System fields from the CLI are: "path", "file name".
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
    // Use the confirmed "file name" field; fall back to "path" stem for safety.
    const rawTitle = row["file name"] ?? row["path"];
    const title = toStr(rawTitle).replace(/\.md$/, "").split("/").pop() ?? "";
    const column = toStr(row[groupBy]);
    if (!columns[column]) columns[column] = [];
    columns[column].push({ title, column, properties: row });
  }

  return { name: boardName, groupBy, columns };
}

// ---------------------------------------------------------------------------
// Public API — pure functions, no side effects beyond CLI calls.
// These are imported directly by the MCP tools and (in future) by the CLI.
// ---------------------------------------------------------------------------

/**
 * Return the full board state (all cards grouped by column).
 * Uses `base:query format=json` for authoritative Obsidian data.
 */
export async function getBoard(config: BoardConfig): Promise<Board> {
  const pfx = vaultPrefix(config);
  const name = config.board ?? "";
  // CLI requires path= (not file=) to target a .base file by path.
  // Without it, the CLI defaults to the active file which may not be a base.
  const pathArg = name ? `path="${name}" ` : "";
  const raw = await run(`${pfx}base:query ${pathArg}format=json`);
  const parsed = JSON.parse(raw) as unknown;
  return parseQueryResult(parsed, name.replace(/\.base$/, "") || "Board");
}

/**
 * Return the full markdown content of a single card (frontmatter + body).
 * Uses `obsidian read file=<name>`.
 */
export async function getCard(
  config: BoardConfig,
  title: string,
): Promise<string> {
  const pfx = vaultPrefix(config);
  return run(`${pfx}read file="${title}"`);
}

/**
 * Move a card to a different column by updating its groupBy property.
 * Returns a MoveResult with the from/to column names.
 */
export async function moveCard(
  config: BoardConfig,
  title: string,
  toColumn: string,
): Promise<MoveResult> {
  // Determine the current column so we can report it in the result.
  const board = await getBoard(config);
  const fromColumn = findCardColumn(board, title) ?? "unknown";

  const pfx = vaultPrefix(config);
  await run(
    `${pfx}property:set name="${board.groupBy}" value="${toColumn}" file="${title}"`,
  );

  return { title, fromColumn, toColumn };
}

/**
 * Create a new card in the given column.
 * Creates the note via `base:create`, then sets additional properties.
 */
export async function createCard(
  config: BoardConfig,
  title: string,
  options: CreateCardOptions,
): Promise<void> {
  const pfx = vaultPrefix(config);
  const boardArg = config.board ? `file="${config.board}" ` : "";

  // Create the note via base:create (sets the status/column via the base's groupBy property)
  await run(`${pfx}base:create ${boardArg}name="${title}"`);

  // Set the target column (status / groupBy property)
  const board = await getBoard(config);
  await run(
    `${pfx}property:set name="${board.groupBy}" value="${options.column}" file="${title}"`,
  );

  // Optional additional properties
  if (options.priority) {
    await run(
      `${pfx}property:set name="priority" value="${options.priority}" file="${title}"`,
    );
  }
  if (options.tags?.length) {
    // Tags is a list property — join as comma-separated for the CLI.
    // The CLI's property:set should handle list types.
    await run(
      `${pfx}property:set name="tags" value="${options.tags.join(",")}" type=list file="${title}"`,
    );
  }

  // Append body content if provided
  if (options.body) {
    await run(
      `${pfx}append file="${title}" content="${options.body.replace(/"/g, '\\"')}"`,
    );
  }
}

/**
 * Get a list of all .base files (boards) in the vault.
 */
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

function findCardColumn(board: Board, title: string): string | undefined {
  for (const [col, cards] of Object.entries(board.columns)) {
    if (cards.some((c) => c.title === title)) return col;
  }
  return undefined;
}

/** Return the first card in the first non-empty column that is not "Done". */
export function firstPendingCard(board: Board): Card | undefined {
  const doneVariants = new Set(["done", "completed", "closed"]);
  for (const [col, cards] of Object.entries(board.columns)) {
    if (!doneVariants.has(col.toLowerCase()) && cards.length > 0) {
      return cards[0];
    }
  }
  return undefined;
}
