import { KanbanView } from "./kanban-view";
import {
  CONFIG_KEY_CHIP_PROPERTIES,
  CONFIG_KEY_CHIP_COLORS,
  CONFIG_KEY_CHIP_FIXED_COLORS,
  CONFIG_KEY_CHIP_SHOW_LABELS,
  CONFIG_KEY_CHIP_ICON_SHOW_LABELS,
  CONFIG_KEY_CHIP_ICONS,
  CONFIG_KEY_CHIP_STYLERULES,
  CONFIG_KEY_BORDER_PROPERTY,
  CONFIG_KEY_CHIP_PROPERTY_MODES,
  ORDER_PROPERTY,
} from "./constants";

/** Style rule operators for conditional chip coloring. */
export type StyleRuleOperator =
  | "contains"
  | "equals"
  | "starts-with"
  | "ends-with";

/** A conditional style rule. */
export interface ChipStyleRule {
  id: string;
  operator: StyleRuleOperator;
  pattern: string;
  color: string;
}

/** Per-property style rules map. */
export type ChipStyleRulesMap = Record<string, ChipStyleRule[]>;

// File properties that are redundant (shown as the card title) or are
// complex list types that don't render usefully as a short chip value.
const FILE_PROPS_TO_SKIP = new Set([
  "name",
  "basename",
  "fullname",
  "ext",
  "extension",
  "path",
  "links",
  "backlinks",
  "inlinks",
  "outlinks",
  "embeds",
  "tags",
]);

/** A discovered frontmatter property with its sample values. */
export interface AvailableProperty {
  name: string;
  displayName: string;
  isConfigured: boolean;
  sampleValues: string[];
}

/** Chip color mapping stored in view config. */
export type ChipColorMap = Record<string, Record<string, string>>;

/** Fixed (single) color per chip property. */
export type ChipFixedColorMap = Record<string, string>;

export class ChipPropertiesManager {
  private view: KanbanView;

  constructor(view: KanbanView) {
    this.view = view;
  }

  // ---------------------------------------------------------------------------
  //  Config getters/setters
  // ---------------------------------------------------------------------------

  public getChipProperties(): string[] {
    const raw = this.view.config?.get(CONFIG_KEY_CHIP_PROPERTIES);
    return Array.isArray(raw) ? (raw as string[]) : [];
  }

  public setChipProperties(properties: string[]): void {
    this.view.config?.set(CONFIG_KEY_CHIP_PROPERTIES, properties);
    this.view.scheduleRender();
  }

  public getBorderProperty(): string {
    const raw = this.view.config?.get(CONFIG_KEY_BORDER_PROPERTY);
    return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : "";
  }

  public setBorderProperty(name: string): void {
    this.view.config?.set(CONFIG_KEY_BORDER_PROPERTY, name || "");
    this.view.scheduleRender();
  }

  public getChipColors(): ChipColorMap {
    const raw = this.view.config?.get(CONFIG_KEY_CHIP_COLORS);
    return raw && typeof raw === "object" ? (raw as ChipColorMap) : {};
  }

  public setChipColors(colors: ChipColorMap): void {
    this.view.config?.set(CONFIG_KEY_CHIP_COLORS, colors);
    this.view.scheduleRender();
  }

  public getFixedColors(): ChipFixedColorMap {
    const raw = this.view.config?.get(CONFIG_KEY_CHIP_FIXED_COLORS);
    return raw && typeof raw === "object" ? (raw as ChipFixedColorMap) : {};
  }

  public setFixedColors(colors: ChipFixedColorMap): void {
    this.view.config?.set(CONFIG_KEY_CHIP_FIXED_COLORS, colors);
    this.view.scheduleRender();
  }

  public getShowLabels(): Record<string, boolean> {
    const raw = this.view.config?.get(CONFIG_KEY_CHIP_SHOW_LABELS);
    return raw && typeof raw === "object"
      ? (raw as Record<string, boolean>)
      : {};
  }

  public setShowLabels(labels: Record<string, boolean>): void {
    this.view.config?.set(CONFIG_KEY_CHIP_SHOW_LABELS, labels);
    this.view.scheduleRender();
  }

  public getIconShowLabels(): Record<string, boolean> {
    const raw = this.view.config?.get(CONFIG_KEY_CHIP_ICON_SHOW_LABELS);
    return raw && typeof raw === "object"
      ? (raw as Record<string, boolean>)
      : {};
  }

  public setIconShowLabels(labels: Record<string, boolean>): void {
    this.view.config?.set(CONFIG_KEY_CHIP_ICON_SHOW_LABELS, labels);
    this.view.scheduleRender();
  }

  public getChipIcons(): Record<string, Record<string, string>> {
    const raw = this.view.config?.get(CONFIG_KEY_CHIP_ICONS);
    return raw && typeof raw === "object"
      ? (raw as Record<string, Record<string, string>>)
      : {};
  }

  public setChipIcons(icons: Record<string, Record<string, string>>): void {
    this.view.config?.set(CONFIG_KEY_CHIP_ICONS, icons);
    this.view.scheduleRender();
  }

  public getChipIcon(propName: string, value: string): string | null {
    const icon = this.getChipIcons()[propName]?.[value];
    return typeof icon === "string" && icon.trim() !== "" ? icon.trim() : null;
  }

  public setChipIcon(propName: string, value: string, icon: string): void {
    const icons = this.getChipIcons();
    if (!icons[propName]) icons[propName] = {};
    if (icon) {
      icons[propName][value] = icon;
    } else {
      delete icons[propName][value];
      if (Object.keys(icons[propName]).length === 0) {
        delete icons[propName];
      }
    }
    this.view.config?.set(CONFIG_KEY_CHIP_ICONS, icons);
    this.view.scheduleRender();
  }

  // ---------------------------------------------------------------------------
  //  Style rules
  // ---------------------------------------------------------------------------

  public getStyleRules(): ChipStyleRulesMap {
    const raw = this.view.config?.get(CONFIG_KEY_CHIP_STYLERULES);
    return raw && typeof raw === "object" ? (raw as ChipStyleRulesMap) : {};
  }

  public setStyleRules(rules: ChipStyleRulesMap): void {
    this.view.config?.set(CONFIG_KEY_CHIP_STYLERULES, rules);
    this.view.scheduleRender();
  }

  public getStyleRulesForProperty(propName: string): ChipStyleRule[] {
    return this.getStyleRules()[propName] || [];
  }

  public addStyleRule(propName: string, rule: ChipStyleRule): void {
    const rules = this.getStyleRules();
    if (!rules[propName]) rules[propName] = [];
    rules[propName] = [...rules[propName], rule];
    this.setStyleRules(rules);
  }

  public updateStyleRule(
    propName: string,
    ruleId: string,
    updates: Partial<ChipStyleRule>,
  ): void {
    const rules = this.getStyleRules();
    if (!rules[propName]) return;
    rules[propName] = rules[propName].map((r) =>
      r.id === ruleId ? { ...r, ...updates } : r,
    );
    this.setStyleRules(rules);
  }

  public removeStyleRule(propName: string, ruleId: string): void {
    const rules = this.getStyleRules();
    if (!rules[propName]) return;
    rules[propName] = rules[propName].filter((r) => r.id !== ruleId);
    if (rules[propName].length === 0) {
      delete rules[propName];
    }
    this.setStyleRules(rules);
  }

  // ---------------------------------------------------------------------------
  //  Property mode (fixed / per-value / style-rules)
  // ---------------------------------------------------------------------------

  public getPropertyModes(): Record<string, string> {
    const raw = this.view.config?.get(CONFIG_KEY_CHIP_PROPERTY_MODES);
    return raw && typeof raw === "object"
      ? (raw as Record<string, string>)
      : {};
  }

  public setPropertyMode(propName: string, mode: string): void {
    const modes = this.getPropertyModes();
    modes[propName] = mode;
    this.view.config?.set(CONFIG_KEY_CHIP_PROPERTY_MODES, modes);
  }

  // ---------------------------------------------------------------------------
  //  Color resolution
  // ---------------------------------------------------------------------------

  /** Get the color for a specific value of a property. */
  public getColorForValue(propName: string, value: string): string | null {
    const mode = this.getPropertyModes()[propName];

    if (mode === "fixed") {
      return this.getFixedColors()[propName] ?? null;
    }

    if (mode === "style-rules") {
      // Only style rules apply in this mode — no fallback to per-value or fixed
      return this.getColorFromStyleRules(propName, value);
    }

    // per-value (default / unknown mode) — only per-value mapping applies
    return this.getChipColors()[propName]?.[value] ?? null;
  }

  /** Check style rules for a property value and return color if any rule matches. */
  private getColorFromStyleRules(
    propName: string,
    value: string,
  ): string | null {
    const rules = this.getStyleRulesForProperty(propName);
    for (const rule of rules) {
      if (!rule.pattern) continue;
      const lowerValue = value.toLowerCase();
      const lowerPattern = rule.pattern.toLowerCase();

      let matches = false;
      switch (rule.operator) {
        case "equals":
          matches = lowerValue === lowerPattern;
          break;
        case "contains":
          matches = lowerValue.includes(lowerPattern);
          break;
        case "starts-with":
          matches = lowerValue.startsWith(lowerPattern);
          break;
        case "ends-with":
          matches = lowerValue.endsWith(lowerPattern);
          break;
      }

      if (matches && rule.color) {
        return rule.color;
      }
    }
    return null;
  }

  /** Get all color mappings for a property. */
  public getColorsForProperty(propName: string): Record<string, string> {
    const colors = this.getChipColors();
    return colors[propName] || {};
  }

  // ---------------------------------------------------------------------------
  //  Property discovery
  // ---------------------------------------------------------------------------

  /** Discover all available frontmatter properties from current cards. */
  public discoverAvailableProperties(): AvailableProperty[] {
    const groupByProp = this.view.getGroupByProperty();
    const configured = new Set(this.getChipProperties());
    const seen = new Map<string, Set<string>>(); // propName -> Set<values>

    // Flatten all cards from all columns
    const allCards = this.view.currentGroups.flatMap((col) => col.cards);

    for (const card of allCards) {
      const fm = card.properties;
      if (!fm || Object.keys(fm).length === 0) continue;

      for (const key of Object.keys(fm)) {
        const val = fm[key];
        // Skip known file properties and special keys
        if (FILE_PROPS_TO_SKIP.has(key)) continue;
        if (key === ORDER_PROPERTY) continue;
        if (groupByProp && key === groupByProp) continue;
        if (
          val === null ||
          val === undefined ||
          (typeof val === "string" && val.trim() === "")
        ) {
          continue;
        }

        // Normalize value to string
        let display: string;
        if (typeof val === "number" || typeof val === "boolean") {
          display = String(val);
        } else if (Array.isArray(val)) {
          // For array values, use the first non-empty element as sample
          const first = val.find(
            (v): v is string => typeof v === "string" && v.trim() !== "",
          );
          display = first ? first : "";
        } else if (typeof val === "object") {
          // Skip objects (would stringify to [object Object])
          continue;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string -- val is guaranteed to be a primitive string after type checks
          display = String(val);
        }

        if (!display) continue;

        if (!seen.has(key)) seen.set(key, new Set());
        seen.get(key)!.add(display);
      }
    }

    const discovered = Array.from(seen.entries()).map(([name, values]) => ({
      name,
      displayName: formatPropertyName(name),
      isConfigured: configured.has(name),
      sampleValues: Array.from(values).slice(0, 10),
    }));

    const configuredOnly = Array.from(configured)
      .filter((name) => !seen.has(name))
      .map((name) => ({
        name,
        displayName: formatPropertyName(name),
        isConfigured: true,
        sampleValues: [] as string[],
      }));

    return [...discovered, ...configuredOnly].sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }
}

/** Format a property name for display (e.g. "team_name" → "Team Name"). */
function formatPropertyName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
