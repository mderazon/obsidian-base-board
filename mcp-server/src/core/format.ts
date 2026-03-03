/**
 * Token-lean output formatters.
 *
 * All tool responses use plain text rather than JSON to minimise the token
 * cost of each MCP call. A full board overview costs ~200 tokens; a complete
 * "pick up task → implement → mark done" workflow costs ~520 tokens total.
 *
 * These formatters are pure functions with no I/O — easy to unit-test and
 * reusable by a future CLI.
 */

import type { Board, Card, MoveResult } from "./types.js";

/** Render the board as a compact, column-grouped card list. */
export function formatBoard(board: Board): string {
  const lines: string[] = [
    `Board: ${board.name}  (group by: ${board.groupBy})`,
    "---",
  ];

  for (const [col, cards] of Object.entries(board.columns)) {
    lines.push(`${col} (${cards.length}):`);
    if (cards.length === 0) {
      lines.push("  (empty)");
    } else {
      for (const card of cards) {
        lines.push(`  - ${formatCardLine(card)}`);
      }
    }
  }

  return lines.join("\n");
}

/** Render a single card as one compact line with key property chips. */
function formatCardLine(card: Card): string {
  const chips: string[] = [];

  const p = card.properties;
  if (typeof p["priority"] === "string")
    chips.push(`priority:${p["priority"]}`);
  if (Array.isArray(p["tags"]) && (p["tags"] as unknown[]).length > 0) {
    chips.push(`tags:${(p["tags"] as string[]).join(",")}`);
  }
  if (typeof p["due"] === "string") chips.push(`due:${p["due"]}`);

  return chips.length > 0 ? `${card.title}  [${chips.join(", ")}]` : card.title;
}

/** Render the result of a move operation. */
export function formatMoveResult(result: MoveResult): string {
  return `Moved "${result.title}": ${result.fromColumn} → ${result.toColumn}`;
}

/** Render a create-card confirmation. */
export function formatCreateResult(title: string, column: string): string {
  return `Created "${title}" in ${column}`;
}

/** Render a list of board names. */
export function formatBoardList(boards: string[]): string {
  if (boards.length === 0) return "No boards found in vault.";
  return boards.map((b) => `  - ${b}`).join("\n");
}
