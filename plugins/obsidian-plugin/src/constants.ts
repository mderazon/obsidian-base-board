/** Column label used when an entry has no value for the groupBy property. */
export const NO_VALUE_COLUMN = "(No value)";

/** Frontmatter property that controls card ordering within a column. */
export const ORDER_PROPERTY = "kanban_order";

/** Key used by BasesViewConfig.set/get to persist column order in the .base file. */
export const CONFIG_KEY_COLUMNS = "boardColumns";

/** Key used by BasesViewConfig.set/get to persist custom tag colors in the .base file. */
export const CONFIG_KEY_TAG_COLORS = "tagColors";

/** Key used by BasesViewConfig.set/get to persist card open behavior in the .base file. */
export const CONFIG_KEY_BOARD_OPEN_BEHAVIOR = "boardOpenBehavior";

/** Key used by BasesViewConfig.set/get to persist frontmatter field for card title. */
export const CONFIG_KEY_CARD_TITLE_PROPERTY = "cardTitleProperty";

/** Key used by BasesViewConfig.set/get to persist column colors in the .base file. */
export const CONFIG_KEY_COLUMN_COLORS = "columnColors";

/** Key used by BasesViewConfig.set/get to persist per-column WIP limits. */
export const CONFIG_KEY_WIP_LIMITS = "wipLimits";

/** Key used by BasesViewConfig.set/get to persist the frontmatter cover property name in the .base file. */
export const CONFIG_KEY_BOARD_COVER_PROPERTY = "boardCoverProperty";

/** Key used by BasesViewConfig.set/get to persist whether to use first embed as cover fallback. */
export const CONFIG_KEY_BOARD_USE_FIRST_EMBED = "boardUseFirstEmbed";

/** Key used by BasesViewConfig.set/get to persist selected chip property names. */
export const CONFIG_KEY_CHIP_PROPERTIES = "chipProperties";

/** Key used by BasesViewConfig.set/get to persist per-property value→color mappings. */
export const CONFIG_KEY_CHIP_COLORS = "chipColors";

/** Key used by BasesViewConfig.set/get to persist one fixed color per chip property. */
export const CONFIG_KEY_CHIP_FIXED_COLORS = "chipFixedColors";

/** Key used by BasesViewConfig.set/get to persist per-property "show label in front of value" toggles. */
export const CONFIG_KEY_CHIP_SHOW_LABELS = "chipShowLabels";

/** Key used by BasesViewConfig.set/get to persist per-property "show label in front of icon" toggles. */
export const CONFIG_KEY_CHIP_ICON_SHOW_LABELS = "chipIconShowLabels";

/** Key used by BasesViewConfig.set/get to persist per-property value→icon mappings. */
export const CONFIG_KEY_CHIP_ICONS = "chipIcons";

/** Key used by BasesViewConfig.set/get to persist per-property conditional style rules. */
export const CONFIG_KEY_CHIP_STYLERULES = "chipStyleRules";

/** Key used by BasesViewConfig.set/get to persist which property controls card border color. */
export const CONFIG_KEY_BORDER_PROPERTY = "borderProperty";

/** Key used by BasesViewConfig.set/get to persist per-property chip color mode. */
export const CONFIG_KEY_CHIP_PROPERTY_MODES = "chipPropertyModes";

/** Default color used for chip icons when no explicit color is mapped. */
export const DEFAULT_CHIP_COLOR = "#808080";

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
