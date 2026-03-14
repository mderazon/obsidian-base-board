/**
 * MCP tool registrations.
 *
 * Each tool is a thin adapter: validate input with Zod, call the core library,
 * format the result for token-lean output, and return it.
 *
 * Core operations live in ../../core/src/obsidian.ts — this file contains no
 * business logic.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createCard,
  getBoard,
  getCard,
  listBoards,
  moveCard,
} from "../../core/src/obsidian.js";
import {
  formatBoard,
  formatBoardList,
  formatCreateResult,
  formatMoveResult,
} from "../../core/src/format.js";
import type { BoardConfig } from "../../core/src/types.js";

function getConfig(): BoardConfig {
  return {
    vault: process.env["BB_VAULT"],
    board: process.env["BB_BOARD"],
  };
}

async function safe(
  fn: () => Promise<string>,
): Promise<{ content: [{ type: "text"; text: string }] }> {
  try {
    const text = await fn();
    return { content: [{ type: "text", text }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${msg}` }] };
  }
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "board_get",
    {
      description:
        "Get a compact overview of the kanban board: all cards grouped by column with key properties. Does not include card bodies.",
      inputSchema: {
        board: z
          .string()
          .optional()
          .describe(
            "Board name (.base file). Defaults to BB_BOARD env var or first board found.",
          ),
      },
    },
    async ({ board }) =>
      safe(async () => {
        const config = { ...getConfig(), ...(board ? { board } : {}) };
        const data = await getBoard(config);
        return formatBoard(data);
      }),
  );

  server.registerTool(
    "board_get_card",
    {
      description:
        "Get the full markdown content (frontmatter + body) of a specific card by its id.",
      inputSchema: {
        id: z
          .string()
          .describe(
            "Card id (e.g. amber-wolf-42). Shown in brackets in board_get output.",
          ),
      },
    },
    async ({ id }) =>
      safe(async () => {
        const config = getConfig();
        const board = await getBoard(config);
        const cards = Object.values(board.columns).flat();
        const card = cards.find((c) => c.id === id);
        if (!card)
          throw new Error(
            `Card not found: "${id}". Run bb assign-ids if cards are missing ids.`,
          );
        return getCard(config, card.path);
      }),
  );

  server.registerTool(
    "board_move_card",
    {
      description:
        "Move a card to a different column. Updates the card's status property in its frontmatter.",
      inputSchema: {
        id: z
          .string()
          .describe(
            "Card id (e.g. amber-wolf-42). Shown in brackets in board_get output.",
          ),
        column: z
          .string()
          .describe(
            "Target column name (must match an existing column value exactly, e.g. 'In Progress', 'Done').",
          ),
      },
    },
    async ({ id, column }) =>
      safe(async () => {
        const config = getConfig();
        const board = await getBoard(config);
        const cards = Object.values(board.columns).flat();
        const card = cards.find((c) => c.id === id);
        if (!card) throw new Error(`Card not found: "${id}".`);
        const result = await moveCard(config, card.path, column);
        return formatMoveResult(result);
      }),
  );

  server.registerTool(
    "board_create_card",
    {
      description: "Create a new card (task note) in a specified column.",
      inputSchema: {
        title: z.string().describe("Card title — becomes the note file name."),
        column: z
          .string()
          .describe(
            "Column (status value) to place the card in, e.g. 'Backlog'.",
          ),
        properties: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            'Arbitrary frontmatter properties to set, e.g. {"priority": "high", "due": "2026-03-20"}.',
          ),
        body: z
          .string()
          .optional()
          .describe("Optional markdown body content for the card."),
        board: z
          .string()
          .optional()
          .describe(
            "Board name. Defaults to BB_BOARD env var or first board found.",
          ),
      },
    },
    async ({ title, column, properties, body, board }) =>
      safe(async () => {
        const { generateId } = await import("../../core/src/id.js");
        const id = generateId(title);
        const config = { ...getConfig(), ...(board ? { board } : {}) };
        await createCard(config, title, { column, id, properties, body });
        return formatCreateResult(title, id, column);
      }),
  );

  server.registerTool(
    "board_list",
    {
      description:
        "List all kanban boards (.base files) available in the vault.",
      inputSchema: {},
    },
    async () =>
      safe(async () => {
        const boards = await listBoards(getConfig());
        return formatBoardList(boards);
      }),
  );
}
