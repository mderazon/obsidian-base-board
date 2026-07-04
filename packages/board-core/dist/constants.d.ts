/** Column label used when an entry has no value for the groupBy property. */
export declare const NO_VALUE_COLUMN = "(No value)";
/** Frontmatter property that controls card ordering within a column. */
export declare const ORDER_PROPERTY = "kanban_order";
/** Key used by BasesViewConfig.set/get to persist column order in the .base file. */
export declare const CONFIG_KEY_COLUMNS = "boardColumns";
/** Key used by BasesViewConfig.set/get to persist custom tag colors in the .base file. */
export declare const CONFIG_KEY_TAG_COLORS = "tagColors";
/** Key used by BasesViewConfig.set/get to persist card open behavior in the .base file. */
export declare const CONFIG_KEY_BOARD_OPEN_BEHAVIOR = "boardOpenBehavior";
/** Key used by BasesViewConfig.set/get to persist column colors in the .base file. */
export declare const CONFIG_KEY_COLUMN_COLORS = "columnColors";
/** Key used by BasesViewConfig.set/get to persist per-column WIP limits. */
export declare const CONFIG_KEY_WIP_LIMITS = "wipLimits";
/** Key used by BasesViewConfig.set/get to persist the frontmatter cover property name in the .base file. */
export declare const CONFIG_KEY_BOARD_COVER_PROPERTY = "boardCoverProperty";
/** Key used by BasesViewConfig.set/get to persist whether to use first embed as cover fallback. */
export declare const CONFIG_KEY_BOARD_USE_FIRST_EMBED = "boardUseFirstEmbed";
/** Key used by BasesViewConfig.set/get to persist selected chip property names. */
export declare const CONFIG_KEY_CHIP_PROPERTIES = "chipProperties";
/** Key used by BasesViewConfig.set/get to persist per-property value→color mappings. */
export declare const CONFIG_KEY_CHIP_COLORS = "chipColors";
/** Key used by BasesViewConfig.set/get to persist one fixed color per chip property. */
export declare const CONFIG_KEY_CHIP_FIXED_COLORS = "chipFixedColors";
/** Key used by BasesViewConfig.set/get to persist per-property "show label" toggles. */
export declare const CONFIG_KEY_CHIP_SHOW_LABELS = "chipShowLabels";
/** Key used by BasesViewConfig.set/get to persist per-property value→icon mappings. */
export declare const CONFIG_KEY_CHIP_ICONS = "chipIcons";
/** Key used by BasesViewConfig.set/get to persist which property controls card border color. */
export declare const CONFIG_KEY_BORDER_PROPERTY = "borderProperty";
/**
 * Regex matching characters that are invalid in file/folder names.
 * Used when sanitizing user input before creating vault items.
 */
export declare const UNSAFE_FILENAME_CHARS: RegExp;
/**
 * Sanitize a string for use as a file or folder name by stripping
 * characters that are not allowed on common operating systems.
 */
export declare function sanitizeFilename(name: string): string;
//# sourceMappingURL=constants.d.ts.map