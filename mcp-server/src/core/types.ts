/**
 * Shared types used by both the core library and all consumers (MCP, future CLI).
 */

/** Config resolved from environment variables or caller options. */
export interface BoardConfig {
  /** Vault name to target. Defaults to the active vault. */
  vault?: string;
  /** Default board name (.base file). Defaults to first found. */
  board?: string;
}

/** A single kanban card as returned by the Obsidian CLI. */
export interface Card {
  /** The note title (file name without extension). */
  title: string;
  /** The current column value (e.g. "Backlog", "In Progress"). */
  column: string;
  /** All frontmatter properties */
  properties: Record<string, unknown>;
}

/** Parsed board state. */
export interface Board {
  /** Human-readable board name. */
  name: string;
  /** The frontmatter property used for grouping (e.g. "status"). */
  groupBy: string;
  /** Cards grouped by column name, in column order. */
  columns: Record<string, Card[]>;
}

/** Options for creating a new card. */
export interface CreateCardOptions {
  /** Which column to place the card in. */
  column: string;
  /** Optional priority property value. */
  priority?: string;
  /** Optional tags. */
  tags?: string[];
  /** Optional markdown body appended below the frontmatter. */
  body?: string;
}

/** Result of a move operation. */
export interface MoveResult {
  title: string;
  fromColumn: string;
  toColumn: string;
}
