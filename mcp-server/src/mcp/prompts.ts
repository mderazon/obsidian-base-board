/**
 * MCP prompt registrations.
 *
 * Prompts are pre-built message templates that set up the agent context.
 * They call core functions directly (not via tools) to assemble rich context
 * in a single round-trip.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { firstPendingCard, getBoard, getCard } from "../core/obsidian.js";
import { formatBoard } from "../core/format.js";
import type { BoardConfig } from "../core/types.js";

function getConfig(): BoardConfig {
  return {
    vault: process.env["BB_VAULT"],
    board: process.env["BB_BOARD"],
  };
}

export function registerPrompts(server: McpServer): void {
  // -------------------------------------------------------------------------
  // work-on-task
  // Assembles everything the agent needs to start working on a task:
  //   - Board overview (so the agent knows context)
  //   - Full card content (frontmatter + body)
  //   - Instruction to move the card when done
  // One prompt call = one agent ready to work.
  // -------------------------------------------------------------------------
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
            "Task title to work on. Defaults to the first card in the first non-Done column.",
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

      // Resolve which card to work on
      const cardTitle = task ?? firstPendingCard(boardData)?.title;
      if (!cardTitle) {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: "No pending tasks found on the board. All done!",
              },
            },
          ],
        };
      }

      const cardContent = await getCard(config, cardTitle);

      const prompt = [
        `You are working on a task from the "${boardData.name}" kanban board.`,
        ``,
        `## Board Overview`,
        boardOverview,
        ``,
        `## Task to implement: ${cardTitle}`,
        ``,
        cardContent,
        ``,
        `---`,
        `When you have finished implementing the task, call the \`board_move_card\` tool`,
        `to move "${cardTitle}" to "Done".`,
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
