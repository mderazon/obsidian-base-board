import type { KanbanView } from "./kanban-view";
import { TFile } from "obsidian";
import type {
  ChipColorMap,
  ChipFixedColorMap,
  ChipStyleRule,
  ChipStyleRulesMap,
} from "./chip-properties";
import { matchStyleRule } from "./chip-properties";

/**
 * Immutable snapshot of view configuration taken once per render pass.
 *
 * card.ts previously re-read config getters per card (and per chip), which
 * meant hundreds of redundant `config.get()` calls per render on large
 * boards. Everything a card needs to render is read once here and passed
 * down through renderColumn → renderCard.
 */
export interface RenderContext {
  coverProperty: string | null;
  useFirstEmbed: boolean;
  borderProperty: string;
  cardTitleProperty: string | null;
  groupByProp: string | null;
  visibleProps: string[];
  chipProps: string[];
  chipPropNames: Set<string>;
  newlinePositions: Set<number>;
  propertyModes: Record<string, string>;
  styleRules: ChipStyleRulesMap;
  chipColors: ChipColorMap;
  fixedColors: ChipFixedColorMap;
  chipIcons: Record<string, Record<string, string>>;
  showLabels: Record<string, boolean>;
  iconShowLabels: Record<string, boolean>;
  tagColors: Record<string, string>;
  displayName(propId: string): string;
  /** kanban_order lookup backed by a map built once per render. */
  orderOf(filePath: string): number;
  /** Frontmatter tags per file, extracted once per render. */
  tagsOf(filePath: string): string[];
}

export function createRenderContext(view: KanbanView): RenderContext {
  const chipProperties = view.chipProperties;

  // Pre-resolve kanban_order for every entry in the current dataset so the
  // per-column sort doesn't hit vault/metadataCache per card.
  const orderMap = new Map<string, number>();
  const tagsMap = new Map<string, string[]>();
  for (const entry of view.rawEntries) {
    const path = entry.file?.path;
    if (!path) continue;
    const order = view.getFileOrder(path);
    if (order !== Infinity) orderMap.set(path, order);
    const file =
      entry.file instanceof TFile
        ? entry.file
        : view.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile && !tagsMap.has(path)) {
      tagsMap.set(path, view.tags.extractTagsFromFile(file));
    }
  }

  return {
    coverProperty: view.getCardCoverProperty(),
    useFirstEmbed: view.shouldUseFirstEmbed(),
    borderProperty: chipProperties.getBorderProperty(),
    cardTitleProperty: view.getCardTitleProperty(),
    groupByProp: view.getGroupByProperty(),
    visibleProps: view.config.getOrder(),
    chipProps: chipProperties.getChipProperties(),
    chipPropNames: new Set(chipProperties.getChipProperties()),
    newlinePositions: new Set(chipProperties.getNewlinePositions()),
    propertyModes: chipProperties.getPropertyModes(),
    styleRules: chipProperties.getStyleRules(),
    chipColors: chipProperties.getChipColors(),
    fixedColors: chipProperties.getFixedColors(),
    chipIcons: chipProperties.getChipIcons(),
    showLabels: chipProperties.getShowLabels(),
    iconShowLabels: chipProperties.getIconShowLabels(),
    tagColors: view.tags.getColors(),
    displayName: (propId: string) =>
      view.config.getDisplayName(propId as never),
    orderOf: (filePath: string) =>
      orderMap.get(filePath) ?? view.getFileOrder(filePath),
    tagsOf: (filePath: string) => tagsMap.get(filePath) ?? [],
  };
}

/** Resolve a chip color from the snapshot (mirrors ChipPropertiesManager.getColorForValue). */
export function resolveChipColor(
  ctx: RenderContext,
  propName: string,
  value: string,
): string | null {
  const mode = ctx.propertyModes[propName];

  if (mode === "fixed") {
    return ctx.fixedColors[propName] ?? null;
  }

  if (mode === "style-rules") {
    const rules: ChipStyleRule[] = ctx.styleRules[propName] ?? [];
    return matchStyleRule(rules, value)?.color ?? null;
  }

  // per-value (default / unknown mode) — only per-value mapping applies
  return ctx.chipColors[propName]?.[value] ?? null;
}
