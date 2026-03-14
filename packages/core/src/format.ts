/**
 * Token-lean output formatters.
 *
 * Plain text rather than JSON to minimise token cost. A full board overview
 * costs ~200 tokens; a complete "pick up task → implement → mark done"
 * workflow costs ~520 tokens total.
 *
 * Pure functions with no I/O — easy to unit-test, reusable by all adapters.
 */

import type { Board, Card, MoveResult } from "./types.js";

/** Render the board as a compact, column-grouped card list with usage footer. */
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

  lines.push("---");
  lines.push(
    "→ bb card <id>  |  bb move <id> <column>  |  bb update <id> --set key=value",
  );

  return lines.join("\n");
}

/** Render a single card as one compact line with id prefix and property chips. */
function formatCardLine(card: Card): string {
  const idPrefix = card.id ? `[${card.id}] ` : "[no-id] ";
  const chips: string[] = [];

  const p = card.properties;
  if (typeof p["priority"] === "string")
    chips.push(`priority:${p["priority"]}`);
  if (Array.isArray(p["tags"]) && (p["tags"] as unknown[]).length > 0) {
    chips.push(`tags:${(p["tags"] as string[]).join(",")}`);
  }
  if (typeof p["due"] === "string") chips.push(`due:${p["due"]}`);

  const chips_str = chips.length > 0 ? `  [${chips.join(", ")}]` : "";
  return `${idPrefix}${card.title}${chips_str}`;
}

/** Render the result of a move operation. */
export function formatMoveResult(result: MoveResult): string {
  return `Moved "${result.title}": ${result.fromColumn} → ${result.toColumn}`;
}

/** Render a create-card confirmation. */
export function formatCreateResult(
  title: string,
  id: string,
  column: string,
): string {
  return `Created "${title}" [${id}] in ${column}`;
}

/** Render a list of board names. */
export function formatBoardList(boards: string[]): string {
  if (boards.length === 0) return "No boards found in vault.";
  return boards.map((b) => `  - ${b}`).join("\n");
}
