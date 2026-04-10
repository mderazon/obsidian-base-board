/** Column label used when an entry has no value for the groupBy property. */
export const NO_VALUE_COLUMN = "(No value)";

/** Frontmatter property that controls card ordering within a column. */
export const ORDER_PROPERTY = "kanban_order";

/** Key used by BasesViewConfig.set/get to persist column order in the .base file. */
export const CONFIG_KEY_COLUMNS = "boardColumns";

/** Key used by BasesViewConfig.set/get to persist custom tag colors in the .base file. */
export const CONFIG_KEY_TAG_COLORS = "tagColors";

/**
 * Key used by BasesViewConfig.set/get to specify which frontmatter property
 * to display as the card title instead of the filename.
 *
 * When set, the card title shows the value of this property (e.g. "raw_title")
 * with a fallback to the file basename if the property is empty or missing.
 *
 * Accepts either a bare property name ("raw_title") or a Bases property ID
 * ("note.raw_title").
 */
export const CONFIG_KEY_TITLE_PROPERTY = "cardTitleProperty";

/**
 * Key used by BasesViewConfig.set/get to control the maximum number of
 * property chips displayed on each card.
 *
 * Defaults to 3 when not set.
 */
export const CONFIG_KEY_MAX_PROPERTIES = "maxCardProperties";

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
