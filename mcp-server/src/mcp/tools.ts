/**
 * MCP tool registrations.
 *
 * Each tool is a thin adapter: validate input with Zod, call the core library,
 * format the result for token-lean output, and return it.
 *
 * Core operations live in ../core/obsidian.ts — this file contains no
 * business logic. A future CLI adapter in ../cli/ will import the same
 * core functions directly.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createCard,
  getBoard,
  getCard,
  listBoards,
  moveCard,
} from "../core/obsidian.js";
import {
  formatBoard,
  formatBoardList,
  formatCreateResult,
  formatMoveResult,
} from "../core/format.js";
import type { BoardConfig } from "../core/types.js";

/** Read base config from environment variables. */
function getConfig(): BoardConfig {
  return {
    vault: process.env["BB_VAULT"],
    board: process.env["BB_BOARD"],
  };
}

/** Wrap a tool handler to catch errors and return a friendly message. */
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
  // -------------------------------------------------------------------------
  // board_get
  // Returns the board overview: card titles + key properties grouped by column.
  // Does NOT return card bodies — keeps the response token-lean.
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // board_get_card
  // Fetches the full content of a single card (frontmatter + body).
  // Call this after board_get to drill into a specific task.
  // -------------------------------------------------------------------------
  server.registerTool(
    "board_get_card",
    {
      description:
        "Get the full markdown content (frontmatter + body) of a specific card by title.",
      inputSchema: {
        title: z
          .string()
          .describe("Exact card title (note file name without .md extension)."),
      },
    },
    async ({ title }) =>
      safe(async () => {
        const config = getConfig();
        return getCard(config, title);
      }),
  );

  // -------------------------------------------------------------------------
  // board_move_card
  // Moves a card to a different column by updating its groupBy property.
  // -------------------------------------------------------------------------
  server.registerTool(
    "board_move_card",
    {
      description:
        "Move a card to a different column. Updates the card's status property in its frontmatter.",
      inputSchema: {
        title: z
          .string()
          .describe("Exact card title (note file name without .md extension)."),
        column: z
          .string()
          .describe(
            "Target column name (must match an existing column value exactly, e.g. 'In Progress', 'Done').",
          ),
      },
    },
    async ({ title, column }) =>
      safe(async () => {
        const config = getConfig();
        const result = await moveCard(config, title, column);
        return formatMoveResult(result);
      }),
  );

  // -------------------------------------------------------------------------
  // board_create_card
  // Creates a new card in a given column.
  // -------------------------------------------------------------------------
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
        priority: z
          .string()
          .optional()
          .describe("Priority value, e.g. 'high', 'medium', 'low'."),
        tags: z.array(z.string()).optional().describe("List of tags."),
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
    async ({ title, column, priority, tags, body, board }) =>
      safe(async () => {
        const config = { ...getConfig(), ...(board ? { board } : {}) };
        await createCard(config, title, { column, priority, tags, body });
        return formatCreateResult(title, column);
      }),
  );

  // -------------------------------------------------------------------------
  // board_list  (Tier 2 — included now since it's trivial)
  // -------------------------------------------------------------------------
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
