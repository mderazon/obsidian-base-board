import { TFile } from "obsidian";
import { KanbanView } from "./kanban-view";
import {
  CONFIG_KEY_CHIP_PROPERTIES,
  CONFIG_KEY_CHIP_COLORS,
  CONFIG_KEY_CHIP_FIXED_COLORS,
  CONFIG_KEY_CHIP_SHOW_LABELS,
  CONFIG_KEY_CHIP_ICONS,
  CONFIG_KEY_BORDER_PROPERTY,
  ORDER_PROPERTY,
} from "./constants";

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

// Default deterministic colors for chip values — same palette as Tags.
const DEFAULT_COLORS = [
  "#f87168", // Red
  "#fbbc04", // Orange
  "#fcc934", // Yellow
  "#34a853", // Green
  "#4285f4", // Blue
  "#a142f4", // Purple
  "#f442a1", // Pink
  "#20c997", // Teal
  "#fd7e14", // Orange
  "#6f42c1", // Indigo
];

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
  //  Color resolution
  // ---------------------------------------------------------------------------

  /** Get the color for a specific value of a property. */
  public getColorForValue(propName: string, value: string): string {
    // Fixed color takes precedence over per-value mapping
    const fixed = this.getFixedColors();
    if (fixed[propName]) {
      return fixed[propName];
    }

    const colors = this.getChipColors();
    const propColors = colors[propName];
    if (propColors && propColors[value]) {
      return propColors[value];
    }
    // Fallback to deterministic hash
    return this.getDeterministicColor(value);
  }

  /** Set a custom color for a specific value of a property. */
  public setCustomColor(propName: string, value: string, color: string): void {
    const colors = this.getChipColors();
    if (!colors[propName]) colors[propName] = {};
    if (color) {
      colors[propName][value] = color;
    } else {
      delete colors[propName][value];
      // Clean up empty property entries
      if (Object.keys(colors[propName]).length === 0) {
        delete colors[propName];
      }
    }
    this.view.config?.set(CONFIG_KEY_CHIP_COLORS, colors);
    this.view.scheduleRender();
  }

  /** Get all color mappings for a property. */
  public getColorsForProperty(propName: string): Record<string, string> {
    const colors = this.getChipColors();
    return colors[propName] || {};
  }

  private getDeterministicColor(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = value.charCodeAt(i) + ((hash << 5) - hash);
    }
    return (
      DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length] ||
      DEFAULT_COLORS[0]
    );
  }

  // ---------------------------------------------------------------------------
  //  Property discovery
  // ---------------------------------------------------------------------------

  /** Discover all available frontmatter properties from current entries. */
  public discoverAvailableProperties(): AvailableProperty[] {
    const groupByProp = this.view.getGroupByProperty();
    const configured = new Set(this.getChipProperties());
    const seen = new Map<string, Set<string>>(); // propName -> Set<values>

    const entries: Array<
      (typeof this.view.currentGroups)[number]["entries"][number]
    > = [];
    for (const group of this.view.currentGroups) {
      entries.push(...group.entries);
    }

    const fallbackEntries = this.view.data?.data ?? [];
    const entriesToInspect = entries.length > 0 ? entries : fallbackEntries;

    for (const entry of entriesToInspect) {
      if (!(entry.file instanceof TFile)) continue;
      const cache = this.view.app.metadataCache.getFileCache(entry.file);
      const fm = cache?.frontmatter;
      if (!fm) continue;

      for (const key of Object.keys(fm)) {
        const val = (fm as Record<string, unknown>)[key];
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
