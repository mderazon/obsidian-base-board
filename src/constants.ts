/** Serialized Bases view-type id. Namespaced to this plugin so it never
 * collides with Obsidian's native Bases views (native "kanban" arrived in
 * Obsidian 1.14 — see #62). The displayed name is "Base Board". */
export const VIEW_TYPE = "base-board";

/** Legacy view-type id used before the #62 rename. Existing boards created by
 * older Base Board versions serialize this as their view `type`. */
export const LEGACY_VIEW_TYPE = "kanban";

/** Column label used when an entry has no value for the groupBy property. */
export const NO_VALUE_COLUMN = "(No value)";

/** Frontmatter property that controls card ordering within a column. */
export const ORDER_PROPERTY = "kanban_order";

/** Key used by BasesViewConfig.set/get to persist column order in the .base file. */
export const CONFIG_KEY_COLUMNS = "boardColumns";

/** Key used by BasesViewConfig.set/get to persist collapsed column state. */
export const CONFIG_KEY_COLLAPSED_COLUMNS = "collapsedColumns";

/** Key used by BasesViewConfig.set/get to persist custom tag colors in the .base file. */
export const CONFIG_KEY_TAG_COLORS = "tagColors";

/** Key used by BasesViewConfig.set/get to persist card click behavior in the .base file. */
export const CONFIG_KEY_OPEN_BEHAVIOR = "cardOpenBehavior";

/** Key used by BasesViewConfig.set/get to persist column colors in the .base file. */
export const CONFIG_KEY_COLUMN_COLORS = "columnColors";

/** Key used by BasesViewConfig.set/get to persist per-column WIP limits. */
export const CONFIG_KEY_WIP_LIMITS = "wipLimits";

/** Key used by BasesViewConfig.set/get to persist card cover property key in the .base file. */
export const CONFIG_KEY_COVER_PROPERTY = "cardCoverProperty";

/** Key used by BasesViewConfig.set/get to persist if new cards should be added to the top in the .base file. */
export const CONFIG_KEY_ADD_TO_TOP = "newCardsToTop";

/** The Base Board-specific view-config keys. A `.base` view carrying any of
 * these was configured by Base Board, which lets the migration auto-identify
 * legacy `type: kanban` views that are really Base Board boards. */
export const BASE_BOARD_CONFIG_KEYS = [
  CONFIG_KEY_COLUMNS,
  CONFIG_KEY_COLLAPSED_COLUMNS,
  CONFIG_KEY_TAG_COLORS,
  CONFIG_KEY_OPEN_BEHAVIOR,
  CONFIG_KEY_COLUMN_COLORS,
  CONFIG_KEY_WIP_LIMITS,
  CONFIG_KEY_COVER_PROPERTY,
  CONFIG_KEY_ADD_TO_TOP,
];

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
