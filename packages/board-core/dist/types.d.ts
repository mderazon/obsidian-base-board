/**
 * Minimal card representation used throughout board-core.
 * The Obsidian adapter maps BasesEntry → CardData before passing to managers.
 */
export interface CardData {
    /** Absolute vault path (e.g. "Notes/My Task.md") */
    filePath: string;
    /** Display name shown as the card title (usually the file basename) */
    displayName: string;
    /** Frontmatter key→value pairs. Used by chips, filters, cover images, etc. */
    properties: Record<string, unknown>;
}
/**
 * A column on the Kanban board.
 */
export interface Column {
    /** Column identifier / group name */
    name: string;
    /** Cards in this column, in display order */
    cards: CardData[];
    /** Optional accent color for the column header bar */
    color?: string | null;
    /** Optional WIP limit (null = unlimited) */
    wipLimit?: number | null;
}
/**
 * Board-level configuration persisted in the .base file.
 */
export interface BoardConfig {
    /** Frontmatter property used to group cards into columns */
    groupBy: string;
    /** Ordered list of column names (includes configured + discovered) */
    columns: string[];
    /** Per-column accent colors */
    columnColors: Record<string, string>;
    /** Per-column WIP limits (null = unlimited) */
    wipLimits: Record<string, number | null>;
    /** Where clicking a card opens the note */
    cardOpenBehavior: "active" | "modal" | "split" | "tab";
    /** Which column to create new cards in by default */
    defaultColumn?: string;
    /** Frontmatter property used as the card title (empty = filename) */
    cardTitleProperty?: string;
    /** Frontmatter property containing a cover image path/URL */
    cardCoverProperty: string;
    /** Custom tag colors (tag → hex) */
    tagColors: Record<string, string>;
    /** Chip properties: frontmatter fields rendered as colored pills */
    chipProperties: string[];
    /** Per-property, per-value color overrides for chips */
    chipColors: Record<string, Record<string, string>>;
    /** Single fixed color applied to all values of a property */
    chipFixedColors: Record<string, string>;
    /** Whether to show the property label on chip pills */
    chipShowLabels: Record<string, boolean>;
    /** Icon overrides for chip values (prop → value → icon name) */
    chipIcons: Record<string, Record<string, string>>;
    /** Conditional style rules per property (prop → ordered rules) */
    chipStyleRules: ChipStyleRulesMap;
    /** Which property controls card border color (empty = none) */
    borderProperty: string;
}
/** Default board config values. */
export declare const DEFAULT_BOARD_CONFIG: BoardConfig;
/**
 * Color mapping types for chip properties.
 */
export type ChipColorMap = Record<string, Record<string, string>>;
export type ChipFixedColorMap = Record<string, string>;
/**
 * Style rule operators for conditional chip coloring.
 */
export type StyleRuleOperator = "contains" | "equals" | "starts-with" | "ends-with";
/**
 * A conditional style rule: when a property value matches the operator/pattern,
 * apply the given color instead of the per-value or fallback color.
 */
export interface ChipStyleRule {
    /** Unique identifier for this rule (e.g. UUID). */
    id: string;
    /** How to match the property value against the pattern. */
    operator: StyleRuleOperator;
    /** The text pattern to match against. */
    pattern: string;
    /** Hex color to apply when the rule matches. */
    color: string;
}
/** Per-property style rules map: property name → ordered list of rules. */
export type ChipStyleRulesMap = Record<string, ChipStyleRule[]>;
/**
 * A discovered frontmatter property with its sample values.
 */
export interface AvailableProperty {
    name: string;
    displayName: string;
    isConfigured: boolean;
    sampleValues: string[];
}
//# sourceMappingURL=types.d.ts.map