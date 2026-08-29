import {
  BasesView,
  BasesEntry,
  BasesEntryGroup,
  BasesAllOptions,
  BooleanValue,
  HoverParent,
  HoverPopover,
  NullValue,
  NumberValue,
  QueryController,
  setIcon,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import type { CardData, Column } from "@base-board/board-core/types";
import type BaseBoardPlugin from "./main";
import { DragDropManager } from "./drag-drop";
import { ColumnManager } from "./column";
import { CardManager } from "./card";
import { Tags } from "./tags";
import { ChipPropertiesManager } from "./chip-properties";
import {
  BoardSettingsModal,
  BoardSettingsState,
  ChipConfigSnapshot,
} from "./board-settings-modal";
import {
  NO_VALUE_COLUMN,
  ORDER_PROPERTY,
  CONFIG_KEY_COLUMNS,
  CONFIG_KEY_BOARD_OPEN_BEHAVIOR,
  CONFIG_KEY_COLUMN_COLORS,
  CONFIG_KEY_WIP_LIMITS,
  CONFIG_KEY_BOARD_COVER_PROPERTY,
  CONFIG_KEY_BOARD_USE_FIRST_EMBED,
  CONFIG_KEY_CARD_TITLE_PROPERTY,
  CONFIG_KEY_BORDER_PROPERTY,
  CONFIG_KEY_CHIP_PROPERTIES,
  CONFIG_KEY_CHIP_COLORS,
  CONFIG_KEY_CHIP_FIXED_COLORS,
  CONFIG_KEY_CHIP_ICONS,
  CONFIG_KEY_CHIP_STYLERULES,
} from "./constants";
import {
  REINDEX_THRESHOLD,
  getDropPosition,
  renormalizeColumn,
  type PositionContext,
} from "./order";
import { coerceColumnValue, GroupByValueType } from "./value-utils";
import { createRenderContext } from "./render-context";
import { BoardReconciler } from "./reconciler";
import { ColumnRenameTracker } from "./column-rename-tracker";

// ---------------------------------------------------------------------------
//  Kanban View
// ---------------------------------------------------------------------------

export class KanbanView extends BasesView implements HoverParent {
  type = "kanban";
  // Required by HoverParent — Obsidian manages the popover lifecycle.
  hoverPopover: HoverPopover | null = null;
  scrollEl: HTMLElement;
  containerEl: HTMLElement;
  plugin: BaseBoardPlugin;

  private dragDropManager: DragDropManager;
  public columnManager: ColumnManager;
  /** Board-core Column objects derived from BasesEntryGroup data. */
  public currentGroups: Column[] = [];
  /** Raw Bases typed groups — preserved for groupBy type inference (Boolean/NumberValue) */
  private typedGroups: BasesEntryGroup[] = [];
  /** Raw Bases entries (kept for source-column lookups during card drops) */
  public rawEntries: BasesEntry[] = [];
  public cardManager: CardManager;
  public chipProperties: ChipPropertiesManager;

  /** Prevent re-renders while we batch-update frontmatter. */
  private isUpdating = false;
  /** Track if Bases fired onDataUpdated while we were updating. */
  private pendingRender = false;
  /** True until the first successful render completes. */
  private isFirstRender = true;
  /** Debounce timer for render/update calls. */
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * What the pending debounced call should do. Data updates reconcile the
   * existing DOM in place (Trello-style); config changes request a full
   * render. "full" wins over "update" if both are requested in one window.
   */
  private pendingUpdateKind: "full" | "update" = "update";
  /** Incremental DOM reconciler for data-driven updates. */
  public reconciler: BoardReconciler;
  /** Label Manager for tags and filters */
  public tags: Tags;
  /** Currently selected card file paths (for batch operations) */
  public selectedCards: Set<string> = new Set();
  public detailLeaf: WorkspaceLeaf | null = null;
  /**
   * Single source of truth for in-flight / recent column renames (see
   * ColumnRenameTracker): element claiming, mid-propagation shielding,
   * stale-name scrubbing and scroll restoration all derive from it.
   */
  public renameTracker: ColumnRenameTracker;

  constructor(
    controller: QueryController,
    scrollEl: HTMLElement,
    plugin: BaseBoardPlugin,
  ) {
    super(controller);
    this.scrollEl = scrollEl;
    this.plugin = plugin;

    // .base-board-container is anchored with position:absolute + inset:0
    // (see styles.css) so it reliably fills the available space even if
    // scrollEl's own height resolves to "auto". That requires scrollEl to
    // be a positioning context — set it defensively rather than relying on
    // Obsidian's default wrapper styling, which can vary by context
    // (full view vs. inline embed) and silently break the anchor.
    if (getComputedStyle(scrollEl).position === "static") {
      scrollEl.classList.add("base-board-positioned-root");
    }

    this.containerEl = scrollEl.createDiv({ cls: "base-board-container" });

    this.tags = new Tags(this);
    this.tags.setChipConfigCallback(() => {
      const state: BoardSettingsState = {
        coverProperty: this.getCardCoverProperty() ?? "",
        useFirstEmbed: this.shouldUseFirstEmbed(),
        openBehavior: this.getCardOpenBehavior(),
        cardTitleProperty: this.getCardTitleProperty() ?? "",
      };
      new BoardSettingsModal(
        this.app,
        this.chipProperties,
        state,
        (chipConfig: ChipConfigSnapshot | null) => {
          // DEBUG VALUE IF NEEDED
          // console.log("[chip-debug] onSubmit received", chipConfig);
          if (chipConfig) {
            this.config?.set(CONFIG_KEY_CHIP_PROPERTIES, chipConfig.properties);
            this.config?.set(
              CONFIG_KEY_BORDER_PROPERTY,
              chipConfig.borderProperty,
            );
            this.config?.set(CONFIG_KEY_CHIP_COLORS, chipConfig.colors);
            this.config?.set(
              CONFIG_KEY_CHIP_FIXED_COLORS,
              chipConfig.fixedColors,
            );
            this.config?.set(CONFIG_KEY_CHIP_ICONS, chipConfig.icons);
            this.config?.set(CONFIG_KEY_CHIP_STYLERULES, chipConfig.styleRules);
          }
          this.scheduleRender();
        },
        {
          onCoverPropertyChange: (property) => {
            this.config?.set(CONFIG_KEY_BOARD_COVER_PROPERTY, property);
          },
          onUseFirstEmbedChange: (useFirstEmbed) => {
            this.config?.set(CONFIG_KEY_BOARD_USE_FIRST_EMBED, useFirstEmbed);
          },
          onOpenBehaviorChange: (behavior) => {
            this.config?.set(CONFIG_KEY_BOARD_OPEN_BEHAVIOR, behavior);
          },
          onCardTitlePropertyChange: (property) => {
            this.config?.set(CONFIG_KEY_CARD_TITLE_PROPERTY, property);
          },
        },
      ).open();
    });
    this.cardManager = new CardManager(this);
    this.columnManager = new ColumnManager(this);
    this.chipProperties = new ChipPropertiesManager(this);
    this.renameTracker = new ColumnRenameTracker({
      onSettled: (oldName) => {
        // Scrub the old name from the stored column config — Bases may
        // re-persist a mid-rename column list to the .base file.
        const storedList = this.config?.get(CONFIG_KEY_COLUMNS) as
          | string[]
          | undefined;
        if (Array.isArray(storedList) && storedList.includes(oldName)) {
          this.saveColumns(storedList.filter((c) => c !== oldName));
        }
      },
    });
    this.reconciler = new BoardReconciler(this);

    this.dragDropManager = new DragDropManager(this.app, {
      onCardDrop: (
        filePath: string,
        targetColumn: string,
        orderedPaths: string[],
      ) => this.handleCardDrop(filePath, targetColumn, orderedPaths),
      onColumnReorder: (orderedNames: string[]) =>
        this.handleColumnReorder(orderedNames),
      getSelectedCards: () => this.selectedCards,
    });
  }

  onload(): void {}

  onunload(): void {
    this.dragDropManager.destroy();
    this.cardManager.resetLazyColumns();
    if (this.renderTimer) window.clearTimeout(this.renderTimer);
  }

  public focus(): void {
    this.containerEl.focus({ preventScroll: true });
  }

  public onDataUpdated(): void {
    if (this.isUpdating) {
      this.pendingRender = true;
      return;
    }
    this.scheduleUpdate();
  }

  /**
   * Run a batch of state updates without triggering intermediate re-renders.
   * Defers rendering until the entire batch is complete.
   */
  public async applyBatchUpdate(
    updateFn: () => Promise<void> | void,
  ): Promise<void> {
    this.isUpdating = true;
    this.pendingRender = false;

    try {
      await updateFn();
    } finally {
      this.isUpdating = false;
    }

    // If Bases fired onDataUpdated during our batch, schedule a debounced update.
    if (this.pendingRender) {
      this.pendingRender = false;
      this.scheduleUpdate();
    }
  }

  static getViewOptions(): BasesAllOptions[] {
    return [];
  }

  // ---------------------------------------------------------------------------
  //  Adapters: Obsidian types → board-core types
  // ---------------------------------------------------------------------------

  /** Convert a BasesEntry to our CardData domain type. */
  private toCardData(entry: BasesEntry): CardData {
    const filePath = entry.file?.path ?? "";
    const displayName =
      entry.file?.basename ?? filePath.split("/").pop() ?? "Untitled";
    // Extract frontmatter properties from the metadata cache
    const file = entry.file instanceof TFile ? entry.file : null;
    const properties: Record<string, unknown> = {};
    if (file) {
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (fm) {
        for (const [key, val] of Object.entries(fm)) {
          properties[key] = val;
        }
      }
    }
    return { filePath, displayName, properties };
  }

  /** Convert a BasesEntryGroup to a board-core Column. */
  private toColumn(group: BasesEntryGroup): Column {
    const name = this.getColumnName(group.key);
    const entries = group.entries;
    const cards = entries.map((e) => this.toCardData(e));
    // Extract WIP limit and color from the group's stored data if available
    const wipLimit = this.getWipLimit(name);
    const color = this.getColumnColor(name);
    return { name, cards, wipLimit, color };
  }

  // ---------------------------------------------------------------------------
  //  Base identity
  // ---------------------------------------------------------------------------

  /**
   * Build a stable, unique identifier for this board view.
   *
   * Uses the view's display name (unique within a .base file) combined with
   * the groupBy property.  If neither is available we fall back to a hash
   * derived from the file paths currently in the dataset so that column
   * configs never collide across different boards.
   */
  private getBaseId(): string {
    const viewName = this.config?.name ?? "";
    const groupBy = this.getGroupByProperty() ?? "";

    // Try to discover the .base file path from the entries in the dataset.
    // All entries originate from the same .base query so any entry's folder
    // ancestor pattern is a reasonable proxy.  This gives us a path-qualified
    // key even when two .base files share the same view name.
    let basePath = "";
    const rawEntries: BasesEntry[] = this.data?.data ?? [];
    if (rawEntries.length > 0) {
      const firstPath = rawEntries[0].file?.path ?? "";
      const lastSlash = firstPath.lastIndexOf("/");
      basePath = lastSlash > 0 ? firstPath.substring(0, lastSlash) : "";
    }

    return `${basePath}::${viewName}::${groupBy}`;
  }

  // ---------------------------------------------------------------------------
  //  Helpers
  // ---------------------------------------------------------------------------

  /**
   * Return the frontmatter property name used for groupBy (e.g. "status").
   *
   * The Bases engine stores this in the view config as a BasesPropertyId
   * like "note.status".  We strip the "note." prefix so the result is
   * directly usable as a frontmatter key.
   *
   * Note: `BasesViewConfig.get()` only retrieves custom options registered
   * via `BasesViewRegistration.options`.  The `groupBy` setting is a
   * built-in structural property on the config object, so we access it
   * directly from the config's internal representation.
   */
  public getGroupByProperty(): string | null {
    const cfg = this.config as {
      groupBy?: { property?: string };
      get?: (key: string) => unknown;
    };

    // 1. Direct access to the built-in groupBy config property
    const groupBy = cfg?.groupBy;
    if (groupBy?.property) {
      const raw: string = groupBy.property;
      return raw.startsWith("note.") ? raw.slice(5) : raw;
    }

    // 2. Fallback: try the custom-options API in case future Obsidian
    //    versions surface groupBy through get()
    const fromGet = cfg?.get?.("groupBy") as { property?: string } | undefined;
    if (fromGet?.property) {
      const raw: string = fromGet.property;
      return raw.startsWith("note.") ? raw.slice(5) : raw;
    }

    return null;
  }

  public getCardOpenBehavior(): "active" | "modal" | "split" | "tab" {
    const val = this.config?.get(CONFIG_KEY_BOARD_OPEN_BEHAVIOR);
    if (val === "modal" || val === "split" || val === "tab") return val;
    return "active";
  }

  public getCardCoverProperty(): string | null {
    const val = this.config?.get(CONFIG_KEY_BOARD_COVER_PROPERTY);
    return typeof val === "string" && val.trim() !== "" ? val.trim() : null;
  }

  public shouldUseFirstEmbed(): boolean {
    const val = this.config?.get(CONFIG_KEY_BOARD_USE_FIRST_EMBED);
    return val === true;
  }

  public getCardTitleProperty(): string | null {
    const val = this.config?.get(CONFIG_KEY_CARD_TITLE_PROPERTY);
    return typeof val === "string" && val.trim() !== "" ? val.trim() : null;
  }

  public isLeafAttached(leaf: WorkspaceLeaf): boolean {
    let found = false;
    this.app.workspace.iterateAllLeaves((l) => {
      if (l === leaf) found = true;
    });
    return found;
  }

  public getColumnColors(): Record<string, string> {
    const raw = this.config?.get(CONFIG_KEY_COLUMN_COLORS);
    return raw && typeof raw === "object"
      ? (raw as Record<string, string>)
      : {};
  }

  public getColumnColor(columnName: string): string | null {
    const customColors = this.getColumnColors();
    return customColors[columnName] ?? null;
  }

  public setColumnColor(columnName: string, color: string): void {
    const colors = this.getColumnColors();
    if (color) {
      colors[columnName] = color;
    } else {
      delete colors[columnName];
    }
    this.config?.set(CONFIG_KEY_COLUMN_COLORS, colors);
    this.scheduleUpdate();
  }

  // ---------------------------------------------------------------------------
  //  WIP Limits
  // ---------------------------------------------------------------------------

  public getWipLimits(): Record<string, number> {
    const raw = this.config?.get(CONFIG_KEY_WIP_LIMITS);
    return raw && typeof raw === "object"
      ? (raw as Record<string, number>)
      : {};
  }

  public getWipLimit(columnName: string): number | null {
    const limits = this.getWipLimits();
    const val = limits[columnName];
    return typeof val === "number" && val > 0 ? val : null;
  }

  public setWipLimit(columnName: string, limit: number | null): void {
    const limits = this.getWipLimits();
    if (limit !== null && limit > 0) {
      limits[columnName] = limit;
    } else {
      delete limits[columnName];
    }
    this.config?.set(CONFIG_KEY_WIP_LIMITS, limits);
    this.scheduleUpdate();
  }

  private getColumnName(key: unknown): string {
    if (key === undefined || key === null || key instanceof NullValue) {
      return NO_VALUE_COLUMN;
    }
    if (typeof key === "object" && key !== null) {
      if ("value" in key) {
        return String(key.value);
      }
      // Bases group-key objects expose the column name via toString()
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- Bases-controlled object with custom toString
      return String(key);
    }
    if (typeof key === "string") return key;
    if (typeof key === "number" || typeof key === "boolean") return String(key);
    return "";
  }

  /**
   * Infer the JS type of the groupBy property from the group keys that Bases
   * actually produced. Bases exposes group keys as typed Value objects, so a
   * checkbox-grouped board yields BooleanValue keys and a numeric one yields
   * NumberValue keys. Booleans win outright so a mix of real checkboxes and
   * already-corrupted "false" strings still resolves to "boolean".
   */
  private groupByValueType(): GroupByValueType {
    for (const group of this.typedGroups) {
      if (group.key instanceof BooleanValue) return "boolean";
      if (group.key instanceof NumberValue) return "number";
    }
    return "other";
  }

  /**
   * Write the groupBy property for a card into `fm`, preserving its real type.
   *
   * The "(No value)" column removes the property entirely; every other column
   * stores a correctly-typed value so a checkbox `false` is never turned into
   * the string "false" (which is truthy and breaks grouping).
   */
  public applyGroupByValue(
    fm: Record<string, unknown>,
    groupByProp: string,
    columnName: string,
  ): void {
    if (columnName === NO_VALUE_COLUMN) {
      delete fm[groupByProp];
      return;
    }
    fm[groupByProp] = coerceColumnValue(columnName, this.groupByValueType());
  }

  /**
   * Read kanban_order from metadataCache (more reliable than entry.values
   * since the Bases engine may not expose all properties).
   */
  public getFileOrder(filePath: string): number {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) return Infinity;
    const cache = this.app.metadataCache.getFileCache(file);
    const order: unknown = cache?.frontmatter?.[ORDER_PROPERTY];
    if (typeof order === "number") return order;
    return Infinity;
  }

  // ---------------------------------------------------------------------------
  //  Column config  (single-layer: .base file via config API)
  // ---------------------------------------------------------------------------

  /**
   * Read the persisted column order from the .base file.
   *
   * Any columns present in the live data but missing from the stored list
   * are appended at the end so they are never silently hidden.
   */
  public getColumns(): string[] {
    const fromConfig = this.config?.get(CONFIG_KEY_COLUMNS) as
      | string[]
      | undefined;

    const stored = fromConfig?.length
      ? fromConfig.map((col) => (col === "" ? NO_VALUE_COLUMN : col))
      : null;

    const dataColumns = this.currentGroups.map((g) => g.name);

    if (stored && stored.length > 0) {
      const result = [...stored];
      for (const col of dataColumns) {
        if (!result.includes(col)) {
          result.push(col);
        }
      }
      return result;
    }

    return dataColumns;
  }

  private getGroupForColumn(columnName: string): Column | null {
    for (const col of this.currentGroups) {
      if (col.name === columnName) {
        return col;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  //  Rendering
  // ---------------------------------------------------------------------------

  /** Re-map the live Bases query result into currentGroups (shared by render + reconcile). */
  public refreshGroups(): BasesEntryGroup[] {
    const groupedData: BasesEntryGroup[] = this.data?.groupedData ?? [];
    this.rawEntries = groupedData.flatMap((g) => g.entries);
    this.typedGroups = groupedData;
    this.currentGroups = groupedData.map((g) => this.toColumn(g));
    return groupedData;
  }

  public render(): void {
    this.selectedCards.clear();
    this.cardManager.resetLazyColumns();
    this.reconciler.invalidate();

    // Save scroll positions before destroying the DOM so we can restore
    // them after rebuild.  Without this the board jumps back to 0 on every
    // re-render (metadata update, drag hover, etc.).
    const prevBoardEl = this.containerEl.querySelector(".base-board-board");
    const savedScrollLeft = prevBoardEl?.scrollLeft ?? 0;
    const savedScrollTop = this.scrollEl.scrollTop;

    // Save per-column vertical scroll (each .base-board-cards has overflow-y)
    const savedColumnScrolls: Record<string, number> = {};
    if (prevBoardEl) {
      prevBoardEl.querySelectorAll(".base-board-column").forEach((col) => {
        const name = (col as HTMLElement).dataset.columnName;
        const cardsEl = col.querySelector(".base-board-cards");
        if (name && cardsEl) {
          savedColumnScrolls[name] = cardsEl.scrollTop;
        }
      });
    }

    this.containerEl.empty();

    // Use the official API: this.data is a BasesQueryResult
    const groupedData = this.refreshGroups();
    const hasGroupBy =
      groupedData.length > 1 ||
      (groupedData.length === 1 &&
        groupedData[0].key !== undefined &&
        !(groupedData[0].key instanceof NullValue));

    // If the board has configured columns but no cards exist yet, render
    // the empty columns so users can see and add cards instead of showing
    // an opaque placeholder.
    const stored =
      (this.config?.get(CONFIG_KEY_COLUMNS) as string[] | undefined) ?? [];
    const hasStoredColumns = stored.length > 0;
    const shouldShowPlaceholder =
      !hasGroupBy && groupedData.length <= 1 && !hasStoredColumns;

    if (shouldShowPlaceholder) {
      const msgEl = this.containerEl.createDiv({
        cls: "base-board-placeholder",
      });
      setIcon(
        msgEl.createSpan({ cls: "base-board-placeholder-icon" }),
        "lucide-kanban",
      );
      msgEl.createEl("p", {
        text: 'Set "group by" in the sort menu to organize cards into columns.',
      });
      return;
    }

    // Map raw BasesEntryGroup → board-core Column
    const columns = this.getColumns();
    const ctx = createRenderContext(this);
    const boardEl = this.containerEl.createDiv({ cls: "base-board-board" });
    // Only animate cards on the very first render
    if (this.isFirstRender) {
      boardEl.addClass("base-board-board--animate");
      this.isFirstRender = false;
    }

    this.tags.renderFilterBar(this.containerEl, ctx);

    columns.forEach((columnName, idx) => {
      const column = this.getGroupForColumn(columnName);
      this.columnManager.renderColumn(boardEl, columnName, column, idx, ctx);
    });

    this.columnManager.renderAddColumnButton(boardEl);
    this.dragDropManager.initBoard(boardEl);

    // Restore scroll positions after the browser has laid out the new DOM
    const hasColumnScrolls = Object.keys(savedColumnScrolls).some(
      (k) => savedColumnScrolls[k] > 0,
    );
    if (savedScrollLeft > 0 || savedScrollTop > 0 || hasColumnScrolls) {
      window.requestAnimationFrame(() => {
        boardEl.scrollLeft = savedScrollLeft;
        this.scrollEl.scrollTop = savedScrollTop;

        boardEl.querySelectorAll(".base-board-column").forEach((col) => {
          const name = (col as HTMLElement).dataset.columnName;
          const cardsEl = col.querySelector(".base-board-cards");
          // Follow rename history so a renamed column keeps its scroll
          const scroll = name
            ? (savedColumnScrolls[name] ??
              savedColumnScrolls[this.renameTracker.previousNameOf(name) ?? ""])
            : undefined;
          if (cardsEl && scroll != null && scroll > 0) {
            cardsEl.scrollTop = scroll;
          }
        });
      });
    }
  }

  /**
   * Move per-column config entries (colors, WIP limits) from `oldName` to
   * `newName` after a rename. With `newName` null (merge into an existing
   * column) the old entry is dropped unless the target lacks one.
   */
  public migrateColumnKeyedConfig(
    oldName: string,
    newName: string | null,
  ): void {
    const colors = this.getColumnColors();
    if (Object.prototype.hasOwnProperty.call(colors, oldName)) {
      const color = colors[oldName];
      delete colors[oldName];
      if (newName && !colors[newName]) colors[newName] = color;
      this.config?.set(CONFIG_KEY_COLUMN_COLORS, colors);
    }
    const limits = this.getWipLimits();
    if (Object.prototype.hasOwnProperty.call(limits, oldName)) {
      const limit = limits[oldName];
      delete limits[oldName];
      if (newName && !limits[newName]) limits[newName] = limit;
      this.config?.set(CONFIG_KEY_WIP_LIMITS, limits);
    }
  }

  /**
   * Record a column rename in the tracker: element claiming, mid-propagation
   * shielding, stale-name scrubbing and scroll restore all derive from it.
   */
  public registerColumnRename(
    oldName: string,
    newName: string,
    expectedCount = 0,
  ): void {
    this.renameTracker.register(oldName, newName, expectedCount);
  }

  // ---------------------------------------------------------------------------
  //  Column & Filter management helpers
  // ---------------------------------------------------------------------------

  private handleColumnReorder(orderedNames: string[]): void {
    this.saveColumns(orderedNames);
    this.scheduleUpdate();
  }

  /**
   * Persist the column list to the .base file via BasesViewConfig.
   */
  public saveColumns(columns: string[]): void {
    const toSave = columns.map((col) => (col === NO_VALUE_COLUMN ? "" : col));
    this.config?.set(CONFIG_KEY_COLUMNS, toSave);
  }

  // ---------------------------------------------------------------------------
  //  Re-index safeguard
  // ---------------------------------------------------------------------------

  /**
   * Renormalize the given final card arrangement if any adjacent gap is
   * below the threshold.
   *
   * Unlike the old group-based check this reads live kanban_order values
   * AFTER the drop writes have landed and uses the caller-provided order
   * (which includes just-moved cards), so a re-index can never overwrite
   * or scramble the positions a drop just wrote.
   */
  public async renormalizeIfNeeded(orderedPaths: string[]): Promise<void> {
    if (orderedPaths.length < 2) return;

    const orders = orderedPaths.map((fp) => this.getFileOrder(fp));
    for (let i = 1; i < orders.length; i++) {
      const prev = orders[i - 1];
      const curr = orders[i];
      if (
        Number.isFinite(prev) &&
        Number.isFinite(curr) &&
        curr - prev < REINDEX_THRESHOLD
      ) {
        await renormalizeColumn(
          orderedPaths.map((fp) => ({ filePath: fp })),
          (fp, pos) => this.updateCardOrder(fp, pos),
        );
        return;
      }
    }
  }

  /** Update a single card's kanban_order frontmatter field. */
  private async updateCardOrder(
    filePath: string,
    position: number,
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) return;
    await this.app.fileManager.processFrontMatter(
      file,
      (fm: Record<string, unknown>) => {
        fm[ORDER_PROPERTY] = position;
      },
    );
  }

  // ---------------------------------------------------------------------------
  //  Card drop handler (column move + reordering)
  // ---------------------------------------------------------------------------

  private async handleCardDrop(
    filePath: string,
    targetColumnName: string,
    orderedPaths: string[],
  ): Promise<void> {
    const groupByProp = this.getGroupByProperty();
    if (!groupByProp) return;

    // Snapshot the selection NOW, before any async work or re-render can clear it
    const selectedSnapshot = new Set(this.selectedCards);
    const isMultiDrag =
      selectedSnapshot.size > 1 && selectedSnapshot.has(filePath);

    // If the dragged card is part of a multi-selection, expand the drop to
    // include all selected cards. The dragged card goes where it was dropped
    // (already in orderedPaths); the rest of the selection is appended after.
    const otherSelected = isMultiDrag
      ? Array.from(selectedSnapshot).filter(
          (p) => p !== filePath && !orderedPaths.includes(p),
        )
      : [];

    // Insert co-selected cards right after the dragged card's position
    const fullOrderedPaths = [...orderedPaths];
    if (otherSelected.length > 0) {
      const dropIdx = fullOrderedPaths.indexOf(filePath);
      const insertAt = dropIdx !== -1 ? dropIdx + 1 : fullOrderedPaths.length;
      fullOrderedPaths.splice(insertAt, 0, ...otherSelected);
    }

    // Collect the target column's current cards so we can compute positions
    // based on neighbors (Trello-style float positioning).
    const targetColumn = this.currentGroups.find(
      (g) => g.name === targetColumnName,
    );
    const allCardsInColumn = targetColumn?.cards ?? [];

    await this.applyBatchUpdate(async () => {
      // 1. Move all cards to the target column (dragged card + any co-selected)
      const pathsToMove = isMultiDrag
        ? [filePath, ...otherSelected]
        : [filePath];

      const movePromises = pathsToMove.map((fp) => {
        const file = this.app.vault.getAbstractFileByPath(fp);
        if (!file || !(file instanceof TFile)) return Promise.resolve();
        const sourceColumn = this.getCardSourceColumn(fp);
        if (sourceColumn === targetColumnName) return Promise.resolve();
        return this.app.fileManager.processFrontMatter(
          file,
          (fm: Record<string, unknown>) => {
            this.applyGroupByValue(fm, groupByProp, targetColumnName);
          },
        );
      });
      await Promise.all(movePromises);

      // 2. Update kanban_order ONLY for the cards that actually moved.
      //    Each gets a float position computed from its neighbors in the
      //    target column — no other cards are touched.
      const movedPaths = isMultiDrag
        ? [filePath, ...otherSelected]
        : [filePath];

      // Compute positions sequentially so co-moved cards can use each
      // other's new positions as neighbors (their old orders are stale or
      // belong to a different column).
      const positionOverrides = new Map<string, number>();
      const positionCtx: PositionContext = {
        getFileOrder: (fp: string) =>
          positionOverrides.get(fp) ?? this.getFileOrder(fp),
      };

      const orderPromises = movedPaths.map((movedPath) => {
        const idx = fullOrderedPaths.indexOf(movedPath);
        if (idx === -1) return Promise.resolve();
        const file = this.app.vault.getAbstractFileByPath(movedPath);
        if (!file || !(file instanceof TFile)) return Promise.resolve();
        const position = getDropPosition(
          idx,
          fullOrderedPaths,
          allCardsInColumn,
          positionCtx,
        );
        positionOverrides.set(movedPath, position);
        return this.app.fileManager.processFrontMatter(
          file,
          (fm: Record<string, unknown>) => {
            fm[ORDER_PROPERTY] = position;
          },
        );
      });
      await Promise.all(orderPromises);

      // Renormalize based on the FINAL arrangement (not the stale render
      // data), so a re-index can never overwrite the positions just written.
      await this.renormalizeIfNeeded(fullOrderedPaths);
    });

    // Always ensure a re-render, even if Bases hasn't fired onDataUpdated yet.
    // The scheduleUpdate is debounced, so if Bases fires later it just coalesces.
    this.scheduleUpdate();
  }

  /** Request a full board rebuild (config changes, structural switches). */
  public scheduleRender(): void {
    this.pendingUpdateKind = "full";
    this.scheduleDebounced();
  }

  /**
   * Request an incremental update: diff fresh data against the existing DOM
   * and patch it in place (no teardown, scroll/selection preserved).
   */
  public scheduleUpdate(): void {
    this.scheduleDebounced();
  }

  private scheduleDebounced(): void {
    if (this.renderTimer) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;
      const kind = this.pendingUpdateKind;
      this.pendingUpdateKind = "update";
      if (kind === "full") {
        this.render();
      } else {
        this.reconciler.update();
      }
    }, 50);
  }

  private getCardSourceColumn(filePath: string): string | null {
    for (const entry of this.rawEntries) {
      if (entry.file?.path === filePath) {
        // Find which group this entry belongs to
        for (const group of this.currentGroups) {
          if (group.cards.some((c: CardData) => c.filePath === filePath)) {
            return group.name;
          }
        }
      }
    }
    return null;
  }
}
