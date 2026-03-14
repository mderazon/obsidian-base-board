#!/usr/bin/env node
/* eslint-disable import/no-nodejs-modules */
/**
 * bb — Base Board CLI
 *
 * Manage your Obsidian kanban board from the terminal (or from an LLM tool).
 *
 * Usage:  bb <command> [options]
 * Config: BB_VAULT=<vault-name>  BB_BOARD=<board-file>
 *
 * Run `bb --help` for full usage.
 * Run `bb board` to get started — shows the board + usage cheat-sheet.
 */

import { parseArgs } from "node:util";
import {
  getBoard,
  getCard,
  moveCard,
  createCard,
  listBoards,
  setProperty,
  allCards,
} from "../../core/src/obsidian.js";
import {
  formatBoard,
  formatBoardList,
  formatCreateResult,
  formatMoveResult,
} from "../../core/src/format.js";
import { generateId } from "../../core/src/id.js";
import type { BoardConfig, Card } from "../../core/src/types.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getConfig(overrides?: {
  vault?: string;
  board?: string;
}): BoardConfig {
  return {
    vault: overrides?.vault ?? process.env["BB_VAULT"],
    board: overrides?.board ?? process.env["BB_BOARD"],
  };
}

// ---------------------------------------------------------------------------
// Card resolution — id only
// ---------------------------------------------------------------------------

function resolveCard(
  board: Awaited<ReturnType<typeof getBoard>>,
  id: string,
): Card {
  const card = allCards(board).find((c) => c.id === id);
  if (!card) {
    throw new Error(
      `Card not found: "${id}"\n` +
        `Tip: run \`bb board\` to see all card ids\n` +
        `     run \`bb assign-ids\` if cards are missing ids`,
    );
  }
  return card;
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function print(msg: string): void {
  process.stdout.write(msg + "\n");
}

function fail(msg: string): never {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP = `
Base Board CLI — manage your Obsidian kanban board from the terminal.

Usage: bb <command> [options]

Commands:
  board                           Show board overview with all cards grouped by column
  card <id>                       Show full content of a card
  move <id> <column>              Move a card to a different column
  create <title>                  Create a new card
  update <id> --set <key=value>   Update a card property
  list                            List all boards in the vault
  assign-ids                      Assign stable ids to cards that don't have one yet

Global options:
  --vault <name>    Obsidian vault to use (default: $BB_VAULT or active vault)
  --board <name>    Board file to target (default: $BB_BOARD or first .base found)
  --help            Show this help
  --version         Show version

Create options:
  --column <col>          Column to place the card in (e.g. Backlog)
  --set <key=value>       Set a frontmatter property (repeatable)
  --body <text>           Card body content

Examples:
  bb board
  bb card add-card-button-hdnr
  bb move add-card-button-hdnr "In Progress"
  bb create "Fix login bug" --column Backlog --set priority=high
  bb update add-card-button-hdnr --set priority=low
  bb assign-ids

Run \`bb <command> --help\` for details on a specific command.
`.trim();

const COMMAND_HELP: Record<string, string> = {
  board: `
Usage: bb board [--vault <name>] [--board <name>]

Show the kanban board: all cards grouped by column with key properties.
Card ids are shown in brackets — use them with card, move, and update.

Example:
  bb board
  BB_BOARD="Tasks/Work.base" bb board
`.trim(),

  card: `
Usage: bb card <id> [--vault <name>] [--board <name>]

Show the full markdown content (frontmatter + body) of a card.

Example:
  bb card amber-wolf-42
`.trim(),

  move: `
Usage: bb move <id> <column> [--vault <name>] [--board <name>]

Move a card to a different column by updating its status property.
Column must match an existing column name exactly.

Example:
  bb move amber-wolf-42 "In Progress"
  bb move amber-wolf-42 Done
`.trim(),

  create: `
Usage: bb create <title> [--column <col>] [--set <key=value> ...] [--body <text>]

Create a new card. A stable id is automatically assigned.
Use --set to add any frontmatter property (repeatable).

Example:
  bb create "Fix login bug" --column Backlog --set priority=high --set due=2026-03-20
`.trim(),

  update: `
Usage: bb update <id> --set <key=value> [--set <key=value> ...]

Update one or more frontmatter properties on a card.

Example:
  bb update amber-wolf-42 --set priority=low
  bb update amber-wolf-42 --set status=Done --set priority=high
`.trim(),

  list: `
Usage: bb list [--vault <name>]

List all kanban boards (.base files) in the vault.

Example:
  bb list
`.trim(),

  "assign-ids": `
Usage: bb assign-ids [--vault <name>] [--board <name>]

Assign a stable id to every card that doesn't already have one.
Run this once on an existing vault to enable id-based commands.

Example:
  bb assign-ids
`.trim(),
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const [, , command, ...rawArgs] = process.argv;

if (!command || command === "--help" || command === "-h") {
  print(HELP);
  process.exit(0);
}

if (command === "--version" || command === "-v") {
  print("0.1.0-beta");
  process.exit(0);
}

if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
  const cmdHelp = COMMAND_HELP[command];
  print(
    cmdHelp ??
      `No help available for "${command}". Run \`bb --help\` for all commands.`,
  );
  process.exit(0);
}

// Parse global flags from remaining args
const { values: rawFlags, positionals } = parseArgs({
  args: rawArgs,
  options: {
    vault: { type: "string" },
    board: { type: "string" },
    column: { type: "string" },
    body: { type: "string" },
    set: { type: "string", multiple: true },
  },
  allowPositionals: true,
  strict: false,
});

// parseArgs types values as string | boolean — cast to expected types
const flags = {
  vault: rawFlags.vault as string | undefined,
  board: rawFlags.board as string | undefined,
  column: rawFlags.column as string | undefined,
  body: rawFlags.body as string | undefined,
  set: rawFlags.set as string[] | undefined,
};

const config = getConfig({ vault: flags.vault, board: flags.board });

// ---------------------------------------------------------------------------
// Command dispatch
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  switch (command) {
    case "board": {
      const board = await getBoard(config);
      print(formatBoard(board));
      break;
    }

    case "card": {
      const id = positionals[0];
      if (!id)
        fail(
          `missing argument <id>\nUsage: bb card <id>\nTip: run \`bb board\` to see all card ids`,
        );
      const board = await getBoard(config);
      const card = resolveCard(board, id);
      print(await getCard(config, card.path));
      break;
    }

    case "move": {
      const id = positionals[0];
      const column = positionals[1];
      if (!id)
        fail(
          `missing argument <id>\nUsage: bb move <id> <column>\nExample: bb move amber-wolf-42 Done`,
        );
      if (!column) {
        // Show available columns to help the LLM
        const board = await getBoard(config);
        const cols = Object.keys(board.columns).join(", ");
        fail(
          `missing argument <column>\nUsage: bb move <id> <column>\nExample: bb move ${id} Done\n\nAvailable columns: ${cols}`,
        );
      }
      const board = await getBoard(config);
      const card = resolveCard(board, id);
      const result = await moveCard(config, card.path, column);
      print(formatMoveResult(result));
      break;
    }

    case "create": {
      const title = positionals[0];
      if (!title)
        fail(
          `missing argument <title>\nUsage: bb create <title> [--column <col>] [--set <key=value>]\nExample: bb create "Fix bug" --column Backlog --set priority=high`,
        );
      const column = flags.column ?? "Backlog";
      const properties: Record<string, string> = {};
      for (const kv of flags.set ?? []) {
        const eqIdx = kv.indexOf("=");
        if (eqIdx === -1)
          fail(`invalid --set value "${kv}" — expected key=value format`);
        properties[kv.slice(0, eqIdx)] = kv.slice(eqIdx + 1);
      }
      const id = generateId(title);
      await createCard(config, title, {
        column,
        id,
        properties,
        body: flags.body,
      });
      print(formatCreateResult(title, id, column));
      break;
    }

    case "update": {
      const id = positionals[0];
      if (!id)
        fail(
          `missing argument <id>\nUsage: bb update <id> --set <key=value>\nExample: bb update amber-wolf-42 --set priority=low`,
        );
      const sets = flags.set ?? [];
      if (sets.length === 0)
        fail(
          `missing --set flag\nUsage: bb update <id> --set <key=value>\nExample: bb update amber-wolf-42 --set priority=low`,
        );
      const board = await getBoard(config);
      const card = resolveCard(board, id);
      for (const kv of sets) {
        const eqIdx = kv.indexOf("=");
        if (eqIdx === -1)
          fail(`invalid --set value "${kv}" — expected key=value format`);
        const key = kv.slice(0, eqIdx);
        const value = kv.slice(eqIdx + 1);
        await setProperty(config, card.path, key, value);
        print(`Updated "${card.title}": ${key} = ${value}`);
      }
      break;
    }

    case "list": {
      const boards = await listBoards(config);
      print(formatBoardList(boards));
      break;
    }

    case "assign-ids": {
      const board = await getBoard(config);
      const cards = allCards(board).filter((c) => !c.id);
      if (cards.length === 0) {
        print("All cards already have ids.");
        break;
      }
      for (const card of cards) {
        const id = generateId(card.title);
        await setProperty(config, card.path, "id", id);
        print(`  [${id}] ${card.title}`);
      }
      print(
        `\nAssigned ids to ${cards.length} card${cards.length === 1 ? "" : "s"}.`,
      );
      break;
    }

    default:
      fail(
        `unknown command "${command}"\nRun \`bb --help\` for available commands`,
      );
  }
}

run().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
});
