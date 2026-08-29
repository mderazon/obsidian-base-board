import type { CardData } from "@base-board/board-core/types";

/**
 * Gap threshold below which we renormalize the column.
 *
 * With initial spacing of 1_000_000, the midpoint formula halves the gap each
 * time: 1M → 500k → 250k → ... → 1.0 after ~20 operations. JavaScript doubles
 * lose exact precision past ~2^-52, which would take ~53 halvings. We re-index
 * well before that to stay safely in integer-land and keep frontmatter values
 * clean.
 */
export const REINDEX_THRESHOLD = 1.0;

/** Initial spacing between cards (multiples of this value). */
const SPACING = 1_000_000;

/**
 * Context object abstracting away Obsidian-specific operations needed by the
 * ordering module. Keeps the position algorithm testable without Obsidian deps.
 */
export interface PositionContext {
  /** Look up kanban_order for a card's file path. Returns Infinity if absent. */
  getFileOrder(filePath: string): number;
}

/**
 * Compute the float position for a card dropped at `index` within an ordered
 * list of cards in the target column. Uses Trello-style midpoint positioning:
 * only the dropped card(s) need their position updated — no column-wide
 * renumbering required.
 *
 * Position scheme (matches existing frontmatter values):
 *   - First card (prepend):     negative or midpoint below first card
 *   - Between two cards:        (prev + next) / 2
 *   - Last card (append):       last + 1_000_000
 */
export function getDropPosition(
  index: number,
  orderedPaths: string[],
  allCards: CardData[],
  ctx: PositionContext,
): number {
  // Build a position map: filePath → kanban_order
  const posMap = new Map<string, number>();
  let maxFinite = 0;
  for (const card of allCards) {
    const order = ctx.getFileOrder(card.filePath);
    if (order !== Infinity) {
      posMap.set(card.filePath, order);
      if (Number.isFinite(order) && order > maxFinite) maxFinite = order;
    }
  }

  const getPos = (path: string): number => posMap.get(path) ?? Infinity;

  if (orderedPaths.length === 0) {
    // Empty column — start at 1_000_000
    return SPACING;
  }

  const prevPos = index > 0 ? getPos(orderedPaths[index - 1]) : 0;
  const nextPos =
    index < orderedPaths.length - 1
      ? getPos(orderedPaths[index + 1])
      : Infinity;

  // Fallback for any path where the math yields a non-finite position
  // (e.g. a neighbor without a kanban_order property): sort after every
  // card that has a known position.
  const fallback = maxFinite + SPACING;

  if (nextPos === Infinity) {
    // Append at end
    if (!Number.isFinite(prevPos)) return fallback;
    return prevPos === 0 ? SPACING : prevPos + SPACING;
  }
  const atStart = index === 0; // truly at the start of the column
  if (atStart && prevPos === 0) {
    // Prepend: no card before this position.
    // If next card is also at 0 (legacy), go negative to sort above it.
    // Otherwise midpoint between 0 and nextPos.
    if (nextPos === 0) return -SPACING;
    return nextPos / 2;
  }
  if (prevPos === 0) {
    // Between a legacy card (position 0) and the next card.
    // Standard midpoint works: (0 + nextPos) / 2 = nextPos / 2.
    // This gives e.g. 0.5 between legacy cards at 0 and 1.
    return nextPos / 2;
  }
  // Insert between two cards
  const position = (prevPos + nextPos) / 2;
  return Number.isFinite(position) ? position : fallback;
}

/**
 * Renumber all cards in a column with fresh multiples of SPACING.
 * Expects `orderedCards` to already be sorted by current order (caller's
 * responsibility — it has access to getFileOrder).
 *
 * Called when adjacent gaps shrink below REINDEX_THRESHOLD.
 */
export async function renormalizeColumn(
  orderedCards: ReadonlyArray<{ filePath: string }>,
  updateOrder: (filePath: string, position: number) => Promise<void>,
): Promise<void> {
  await Promise.all(
    orderedCards.map((card, i) => {
      const position = (i + 1) * SPACING;
      return updateOrder(card.filePath, position);
    }),
  );
}
