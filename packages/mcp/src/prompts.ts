/**
 * MCP prompt registrations.
 *
 * Prompts are pre-built message templates that set up the agent context.
 * They call core functions directly (not via tools) to assemble rich context
 * in a single round-trip.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  firstPendingCard,
  getBoard,
  getCard,
} from "../../core/src/obsidian.js";
import { formatBoard } from "../../core/src/format.js";
import type { BoardConfig } from "../../core/src/types.js";

function getConfig(): BoardConfig {
  return {
    vault: process.env["BB_VAULT"],
    board: process.env["BB_BOARD"],
  };
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "work-on-task",
    {
      description:
        "Load a task from the kanban board and prepare the agent to implement it. Includes board overview, full card content, and instruction to mark the card Done when finished.",
      argsSchema: {
        board: z
          .string()
          .optional()
          .describe(
            "Board name. Defaults to BB_BOARD env var or first board found.",
          ),
        task: z
          .string()
          .optional()
          .describe(
            "Card id to work on (e.g. amber-wolf-42). Defaults to the first card in the first non-Done column.",
          ),
      },
    },
    async ({ board, task }) => {
      const config: BoardConfig = {
        ...getConfig(),
        ...(board ? { board } : {}),
      };

      const boardData = await getBoard(config);
      const boardOverview = formatBoard(boardData);

      const allCards = Object.values(boardData.columns).flat();
      const card = task
        ? allCards.find((c) => c.id === task)
        : firstPendingCard(boardData);

      if (!card) {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: task
                  ? `Card "${task}" not found. Run bb assign-ids if cards are missing ids.`
                  : "No pending tasks found on the board. All done!",
              },
            },
          ],
        };
      }

      const cardContent = await getCard(config, card.path);

      const prompt = [
        `You are working on a task from the "${boardData.name}" kanban board.`,
        ``,
        `## Board Overview`,
        boardOverview,
        ``,
        `## Task to implement: ${card.title} [${card.id ?? "no-id"}]`,
        ``,
        cardContent,
        ``,
        `---`,
        `When you have finished implementing the task, call \`board_move_card\``,
        `to move card "${card.id ?? card.title}" to "Done".`,
      ].join("\n");

      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text: prompt },
          },
        ],
      };
    },
  );
}
