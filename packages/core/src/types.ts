/**
 * Shared types used by all consumers (CLI, MCP, future adapters).
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
  /** Stable frontmatter id e.g. "amber-wolf-42". Undefined for cards created outside bb. */
  id: string | undefined;
  /** The note title (file name without extension). */
  title: string;
  /** Vault-relative path e.g. "Tasks/Foo.md" — used for all file operations. */
  path: string;
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
  /** Stable id to assign (e.g. "amber-wolf-42"). If omitted, no id is written. */
  id?: string;
  /** Arbitrary frontmatter properties to set on the new card. */
  properties?: Record<string, string>;
  /** Optional markdown body appended below the frontmatter. */
  body?: string;
}

/** Result of a move operation. */
export interface MoveResult {
  title: string;
  fromColumn: string;
  toColumn: string;
}
