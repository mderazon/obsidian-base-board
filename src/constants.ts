/** Column label used when an entry has no value for the groupBy property. */
export const NO_VALUE_COLUMN = "(No value)";

/** Frontmatter property that controls card ordering within a column. */
export const ORDER_PROPERTY = "kanban_order";

/** Key used by BasesViewConfig.set/get to persist column order in the .base file. */
export const CONFIG_KEY_COLUMNS = "boardColumns";

/**
 * Regex matching characters that are invalid in file/folder names.
 * Used when sanitizing user input before creating vault items.
 */
export const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/**
 * Sanitize a string for use as a file or folder name by stripping
 * characters that are not allowed on common operating systems.
 */
export function sanitizeFilename(name: string): string {
  return name.replace(UNSAFE_FILENAME_CHARS, "");
}
