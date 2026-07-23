import {
  BasesView,
  BasesEntry,
  BasesEntryGroup,
  BasesAllOptions,
  HoverParent,
  HoverPopover,
  QueryController,
  NullValue,
  Notice,
  setIcon,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import type BaseBoardPlugin from "./main";
import { DragDropManager } from "./drag-drop";
import { ColumnManager } from "./column";
import { CardManager } from "./card";
import { Tags } from "./tags";
import {
  compareOrderValues,
  generateOrderKeys,
  isOrderKey,
  OrderValue,
  readOrderValue,
} from "./order";
import {
  NO_VALUE_COLUMN,
  ORDER_PROPERTY,
  CONFIG_KEY_COLUMNS,
  CONFIG_KEY_DEFAULT_COLUMN,
  CONFIG_KEY_OPEN_BEHAVIOR,
  CONFIG_KEY_COLUMN_COLORS,
  CONFIG_KEY_WIP_LIMITS,
  CONFIG_KEY_COVER_PROPERTY,
  CONFIG_KEY_ADD_TO_TOP,
} from "./constants";

interface BoardScrollState {
  boardLeft: number;
  viewTop: number;
  columnTops: Map<string, number>;
}

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
  private columnManager: ColumnManager;
  public currentGroups: BasesEntryGroup[] = [];
  public cardManager: CardManager;

  /** Entry paths from the previous snapshot, to detect newly-created notes. */
  private seenEntryPaths: Set<string> | null = null;

  /** Prevent re-renders while we batch-update frontmatter. */
  private isUpdating = false;
  /** Track if Bases delivered fresh query data while we were updating. */
  private pendingDataRender = false;
  /** True until the first successful render completes. */
  private isFirstRender = true;
  /** Debounce timer for render calls. */
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  /** Local drop intent retained until Bases publishes the matching groups. */
  private optimisticMoves = new Map<string, string>();
  private optimisticColumnOrders = new Map<string, string[]>();
  /** Label Manager for tags and filters */
  public tags: Tags;
  /** Currently selected card file paths (for batch operations) */
  public selectedCards: Set<string> = new Set();
  public detailLeaf: WorkspaceLeaf | null = null;

  constructor(
    controller: QueryController,
    scrollEl: HTMLElement,
    plugin: BaseBoardPlugin,
  ) {
    super(controller);
    this.scrollEl = scrollEl;
    this.plugin = plugin;
    this.containerEl = scrollEl.createDiv({ cls: "base-board-container" });

    this.tags = new Tags(this);
    this.cardManager = new CardManager(this);
    this.columnManager = new ColumnManager(this);

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
    if (this.renderTimer) window.clearTimeout(this.renderTimer);
  }

  public focus(): void {
    this.containerEl.focus({ preventScroll: true });
  }

  public onDataUpdated(): void {
    if (this.isUpdating) {
      this.pendingDataRender = true;
      return;
    }
    this.acknowledgeOptimisticMoves();
    this.assignDefaultColumnToNewEntries();
    this.scheduleRender();
  }

  /**
   * Move newly-created no-value notes into the default column. The native Bases
   * "New" button bypasses `createFileForView`, so we detect new entries here by
   * diffing snapshots and write the default column into their frontmatter.
   */
  private assignDefaultColumnToNewEntries(): void {
    const currentPaths = new Set<string>();
    for (const entry of this.data?.data ?? []) {
      const path = entry.file?.path;
      if (path) currentPaths.add(path);
    }

    // First snapshot only establishes the baseline; never reassign existing notes.
    if (this.seenEntryPaths === null) {
      this.seenEntryPaths = currentPaths;
      return;
    }

    const previousPaths = this.seenEntryPaths;
    this.seenEntryPaths = currentPaths;

    const groupByProp = this.getGroupByProperty();
    const defaultColumn = this.getDefaultColumn();
    if (!groupByProp || !defaultColumn || defaultColumn === NO_VALUE_COLUMN) {
      return;
    }

    const newFiles: TFile[] = [];
    for (const group of this.data?.groupedData ?? []) {
      if (this.getColumnName(group.key) !== NO_VALUE_COLUMN) continue;
      for (const entry of group.entries) {
        const path = entry.file?.path;
        if (!path || previousPaths.has(path)) continue;
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) newFiles.push(file);
      }
    }

    if (newFiles.length === 0) return;

    // Order must be computed before the optimistic move, or the new cards would
    // count themselves as existing column members.
    const movedPaths = newFiles.map((file) => file.path);
    const orders = this.generateNewCardOrders(defaultColumn, movedPaths.length);
    const existingPaths = this.getOrderedPathsForColumn(defaultColumn);
    const orderedPaths = this.isAddNewCardsToTop()
      ? [...movedPaths, ...existingPaths]
      : [...existingPaths, ...movedPaths];

    // Optimistic placement avoids a flash before the async write lands.
    for (const path of movedPaths) {
      this.optimisticMoves.set(path, defaultColumn);
    }
    this.optimisticColumnOrders.set(defaultColumn, orderedPaths);

    void this.applyBatchUpdate(async () => {
      await Promise.all(
        newFiles.map((file, i) =>
          this.app.fileManager.processFrontMatter(
            file,
            (fm: Record<string, unknown>) => {
              fm[groupByProp] = defaultColumn;
              fm[ORDER_PROPERTY] = orders[i];
            },
          ),
        ),
      );
    }).catch((err) => {
      for (const path of movedPaths) this.optimisticMoves.delete(path);
      this.optimisticColumnOrders.delete(defaultColumn);
      new Notice(`Failed to move new card to default column: ${String(err)}`);
      this.scheduleRender();
    });
  }

  /**
   * Run a batch of state updates without triggering intermediate re-renders.
   * Defers rendering until the entire batch is complete.
   */
  public async applyBatchUpdate(
    updateFn: () => Promise<void> | void,
  ): Promise<void> {
    this.isUpdating = true;
    this.pendingDataRender = false;

    try {
      await updateFn();
    } finally {
      this.isUpdating = false;
    }

    // If Bases fired onDataUpdated during our batch, schedule a debounced render.
    if (this.pendingDataRender) {
      this.pendingDataRender = false;
      this.scheduleRender();
    }
  }

  static getViewOptions(): BasesAllOptions[] {
    return [
      {
        type: "group" as const,
        displayName: "Display",
        items: [
          {
            key: CONFIG_KEY_OPEN_BEHAVIOR,
            type: "dropdown" as const,
            displayName: "Open card in",
            default: "active",
            options: {
              active: "Active pane / tab",
              modal: "Floating modal",
              split: "Split to the right",
              tab: "New tab",
            },
          },
          {
            key: CONFIG_KEY_COVER_PROPERTY,
            type: "text" as const,
            displayName: "Cover property",
            default: "cover",
            placeholder: "E.g. cover",
          },
          {
            key: CONFIG_KEY_ADD_TO_TOP,
            type: "toggle" as const,
            displayName: "Add new cards to top",
            default: false,
          },
          {
            key: CONFIG_KEY_DEFAULT_COLUMN,
            type: "text" as const,
            displayName: "Default column for new cards",
            default: "",
            placeholder: "E.g. To Do",
          },
        ],
      },
    ];
  }

  public isAddNewCardsToTop(): boolean {
    return !!this.config?.get(CONFIG_KEY_ADD_TO_TOP);
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
    const entries: BasesEntry[] = this.data?.data ?? [];
    if (entries.length > 0) {
      const firstPath = entries[0].file?.path ?? "";
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
    const val = this.config?.get(CONFIG_KEY_OPEN_BEHAVIOR);
    if (val === "modal" || val === "split" || val === "tab") return val;
    return "active";
  }

  public getCardCoverProperty(): string | null {
    const val = this.config?.get(CONFIG_KEY_COVER_PROPERTY);
    if (val === undefined || val === null) {
      return "cover";
    }
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
    this.scheduleRender();
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
    this.scheduleRender();
  }

  private getColumnName(key: unknown): string {
    if (key === undefined || key === null || key instanceof NullValue) {
      return NO_VALUE_COLUMN;
    }
    if (typeof key === "object" && key !== null) {
      if ("value" in key) {
        const val = (key as Record<string, unknown>).value;
        return String(val);
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
   * Read kanban_order from metadataCache (more reliable than entry.values
   * since the Bases engine may not expose all properties).
   */
  public getFileOrder(filePath: string): OrderValue {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) return null;
    const cache = this.app.metadataCache.getFileCache(file);
    return readOrderValue(cache?.frontmatter?.[ORDER_PROPERTY]);
  }

  public compareFileOrder(pathA: string, pathB: string): number {
    return compareOrderValues(
      this.getFileOrder(pathA),
      this.getFileOrder(pathB),
    );
  }

  public compareCardOrder(
    columnName: string,
    pathA: string,
    pathB: string,
  ): number {
    const optimisticOrder = this.optimisticColumnOrders.get(columnName);
    if (optimisticOrder) {
      const indexA = optimisticOrder.indexOf(pathA);
      const indexB = optimisticOrder.indexOf(pathB);
      if (indexA !== -1 || indexB !== -1) {
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      }
    }
    return this.compareFileOrder(pathA, pathB);
  }

  public getEntriesForColumn(
    columnName: string,
    group: BasesEntryGroup | null,
  ): BasesEntry[] {
    const entries = [...(group?.entries ?? [])].filter((entry) => {
      const path = entry.file?.path;
      const optimisticColumn = path ? this.optimisticMoves.get(path) : null;
      return !optimisticColumn || optimisticColumn === columnName;
    });
    const present = new Set(entries.map((entry) => entry.file?.path));

    for (const entry of this.data?.data ?? []) {
      const path = entry.file?.path;
      if (
        path &&
        this.optimisticMoves.get(path) === columnName &&
        !present.has(path)
      ) {
        entries.push(entry);
      }
    }
    return entries;
  }

  public getOrderedPathsForColumn(columnName: string): string[] {
    const group = this.currentGroups.find(
      (candidate) => this.getColumnName(candidate.key) === columnName,
    );
    const paths = (group?.entries ?? [])
      .map((entry) => entry.file?.path)
      .filter((path): path is string => typeof path === "string");
    return paths.sort((a, b) => this.compareFileOrder(a, b));
  }

  /**
   * `count` distinct `kanban_order` values for new cards in `columnName`,
   * honoring the "Add new cards to top" setting.
   */
  public generateNewCardOrders(
    columnName: string,
    count: number,
  ): OrderValue[] {
    if (count <= 0) return [];

    const group = this.getGroupForColumn(columnName);
    const orders = this.getEntriesForColumn(columnName, group).map((entry) =>
      entry.file?.path ? this.getFileOrder(entry.file.path) : null,
    );
    const addToTop = this.isAddNewCardsToTop();

    const keys = orders.filter(isOrderKey);
    if (keys.length === orders.length && keys.length > 0) {
      keys.sort((a, b) => compareOrderValues(a, b));
      return addToTop
        ? generateOrderKeys(null, keys[0], count)
        : generateOrderKeys(keys[keys.length - 1], null, count);
    }

    if (orders.length === 0) {
      return generateOrderKeys(null, null, count);
    }

    // Legacy numeric columns: fall back to numeric spacing.
    const numericOrders = orders.filter(
      (order): order is number => typeof order === "number",
    );
    const min = Math.min(...numericOrders, 0);
    const max = Math.max(...numericOrders, -1000);
    return Array.from({ length: count }, (_, i) =>
      addToTop ? min - 1000 * (count - i) : max + 1000 * (i + 1),
    );
  }

  // ---------------------------------------------------------------------------
  //  Column config  (dual-layer: .base file via config API + plugin data.json)
  // ---------------------------------------------------------------------------

  /**
   * Read the persisted column order.
   *
   * Priority:
   *  1. View-level config stored inside the .base file (via BasesViewConfig)
   *  2. Legacy plugin data.json (for backwards-compat with existing boards)
   *  3. Fall back to whatever columns the data naturally produces
   *
   * Any columns present in the live data but missing from the stored list
   * are appended at the end so they are never silently hidden.
   */
  public getColumns(): string[] {
    // 1. Try .base file config first (new preferred storage)
    const fromConfig = this.config?.get(CONFIG_KEY_COLUMNS) as
      string[] | undefined;

    // 2. Fallback: legacy plugin data.json
    const fromPlugin = this.plugin.getColumnConfig(this.getBaseId());

    const rawStored = fromConfig?.length
      ? fromConfig
      : fromPlugin?.columns?.length
        ? fromPlugin.columns
        : null;

    const stored = rawStored
      ? rawStored.map((col) => (col === "" ? NO_VALUE_COLUMN : col))
      : null;

    const dataColumns = this.currentGroups.map((g) =>
      this.getColumnName(g.key),
    );

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

  public getDefaultColumn(): string | null {
    const value = this.config?.get(CONFIG_KEY_DEFAULT_COLUMN);
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  public setDefaultColumn(columnName: string | null): void {
    this.config?.set(CONFIG_KEY_DEFAULT_COLUMN, columnName?.trim() ?? "");
  }

  private getGroupForColumn(columnName: string): BasesEntryGroup | null {
    for (const group of this.currentGroups) {
      if (this.getColumnName(group.key) === columnName) {
        return group;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  //  Rendering
  // ---------------------------------------------------------------------------

  public cardElCache = new Map<string, HTMLElement>();
  public columnElCache = new Map<string, HTMLElement>();

  public render(): void {
    this.selectedCards.clear();
    const scrollState = this.captureScrollState();

    // Index stable DOM nodes before rebuilding the lightweight board shell.
    // Columns are detached as complete subtrees, preserving their card lists,
    // card descendants, scroll state, image elements, and event listeners.
    this.cardElCache.clear();
    this.containerEl.querySelectorAll(".base-board-card").forEach((el) => {
      const path = (el as HTMLElement).dataset.filePath;
      if (path) {
        this.cardElCache.set(path, el as HTMLElement);
      }
    });

    this.columnElCache.clear();
    this.containerEl
      .querySelectorAll<HTMLElement>(".base-board-column")
      .forEach((el) => {
        const name = el.dataset.columnName;
        if (name) {
          this.columnElCache.set(name, el);
          el.remove();
        }
      });

    this.containerEl.empty();

    // Use the official API: this.data is a BasesQueryResult
    const groupedData: BasesEntryGroup[] = this.data?.groupedData ?? [];
    const hasGroupBy =
      groupedData.length > 1 ||
      (groupedData.length === 1 &&
        groupedData[0].key !== undefined &&
        !(groupedData[0].key instanceof NullValue));

    // If the board has configured columns (from .base or data.json) but
    // no cards exist yet, render the empty columns so users can see and
    // add cards instead of showing an opaque placeholder.
    const stored =
      (this.config?.get(CONFIG_KEY_COLUMNS) as string[] | undefined) ??
      this.plugin.getColumnConfig(this.getBaseId())?.columns;
    const hasStoredColumns = stored && stored.length > 0;
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

    this.currentGroups = groupedData;
    const columns = this.getColumns();
    const boardEl = this.containerEl.createDiv({ cls: "base-board-board" });

    // Only animate cards on the very first render
    if (this.isFirstRender) {
      boardEl.addClass("base-board-board--animate");
      this.isFirstRender = false;
    }

    this.tags.renderFilterBar(this.containerEl);

    columns.forEach((columnName, idx) => {
      const group = this.getGroupForColumn(columnName);
      this.columnManager.renderColumn(
        boardEl,
        columnName,
        group,
        idx,
        this.columnElCache.get(columnName),
      );
    });

    this.columnManager.renderAddColumnButton(boardEl);
    this.dragDropManager.initBoard(boardEl);
    this.restoreScrollState(boardEl, scrollState);
  }

  private captureScrollState(): BoardScrollState {
    const boardEl =
      this.containerEl.querySelector<HTMLElement>(".base-board-board");
    const columnTops = new Map<string, number>();

    boardEl
      ?.querySelectorAll<HTMLElement>(".base-board-column")
      .forEach((columnEl) => {
        const name = columnEl.dataset.columnName;
        const cardsEl =
          columnEl.querySelector<HTMLElement>(".base-board-cards");
        if (name && cardsEl) columnTops.set(name, cardsEl.scrollTop);
      });

    return {
      boardLeft: boardEl?.scrollLeft ?? 0,
      viewTop: this.scrollEl.scrollTop,
      columnTops,
    };
  }

  private restoreScrollState(
    boardEl: HTMLElement,
    state: BoardScrollState,
  ): void {
    // All columns are attached, so these assignments restore against the final
    // layout and cannot race a deferred callback from an earlier render.
    boardEl.scrollLeft = state.boardLeft;
    this.scrollEl.scrollTop = state.viewTop;

    boardEl
      .querySelectorAll<HTMLElement>(".base-board-column")
      .forEach((columnEl) => {
        const name = columnEl.dataset.columnName;
        const cardsEl =
          columnEl.querySelector<HTMLElement>(".base-board-cards");
        const scrollTop = name ? state.columnTops.get(name) : undefined;
        if (cardsEl && scrollTop !== undefined) {
          cardsEl.scrollTop = scrollTop;
        }
      });
  }

  // ---------------------------------------------------------------------------
  //  Column & Filter management helpers
  // ---------------------------------------------------------------------------

  private handleColumnReorder(orderedNames: string[]): void {
    this.saveColumns(orderedNames);
    this.render();
  }

  /**
   * Persist the column list.
   *
   * Writes to two locations for compatibility:
   *  - BasesViewConfig (stored inside the .base file itself — portable)
   *  - Plugin data.json (legacy, kept so older board setups still work)
   */
  public saveColumns(columns: string[]): void {
    // Primary: persist in .base file via the official config API
    const toSave = columns.map((col) => (col === NO_VALUE_COLUMN ? "" : col));
    this.config?.set(CONFIG_KEY_COLUMNS, toSave);

    // Legacy fallback: also write to plugin data.json
    void this.plugin.saveColumnConfig(this.getBaseId(), { columns });
  }

  public updateColumnPreferences(oldName: string, newName: string): void {
    if (this.getDefaultColumn() === oldName) {
      this.setDefaultColumn(newName);
    }
  }

  public removeColumnPreferences(columnName: string): void {
    if (this.getDefaultColumn() === columnName) {
      this.setDefaultColumn(null);
    }
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
    if (!groupByProp) {
      throw new Error("Cannot move a card without a group by property");
    }

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

    const pathsToMove = isMultiDrag ? [filePath, ...otherSelected] : [filePath];
    for (const path of pathsToMove) {
      this.optimisticMoves.set(path, targetColumnName);
    }
    this.optimisticColumnOrders.set(targetColumnName, fullOrderedPaths);

    try {
      await this.applyBatchUpdate(async () => {
        // 1. Move all cards to the target column (dragged card + any co-selected)
        const movePromises = pathsToMove.map((fp) => {
          const file = this.app.vault.getAbstractFileByPath(fp);
          if (!file || !(file instanceof TFile)) return Promise.resolve();
          const sourceColumn = this.getCardSourceColumn(fp);
          if (sourceColumn === targetColumnName) return Promise.resolve();
          return this.app.fileManager.processFrontMatter(
            file,
            (fm: Record<string, unknown>) => {
              if (targetColumnName === NO_VALUE_COLUMN) {
                delete fm[groupByProp];
              } else {
                fm[groupByProp] = targetColumnName;
              }
            },
          );
        });
        await Promise.all(movePromises);

        // 2. Update only the moved cards when the column already uses string
        // fractional keys. Numeric legacy columns are migrated once, in DOM order.
        await this.writeCardOrder(fullOrderedPaths, pathsToMove);
      });
    } catch (error) {
      this.clearOptimisticMoves(pathsToMove, targetColumnName);
      this.scheduleRender();
      throw error;
    }

    // The optimistic DOM move remains visible until Bases acknowledges the
    // write through onDataUpdated(), which is the only fresh-data render path.
  }

  private acknowledgeOptimisticMoves(): void {
    const confirmedPaths: string[] = [];
    for (const [path, expectedColumn] of this.optimisticMoves) {
      if (
        this.findCardColumn(this.data?.groupedData ?? [], path) ===
        expectedColumn
      ) {
        confirmedPaths.push(path);
      }
    }
    for (const path of confirmedPaths) this.optimisticMoves.delete(path);

    for (const [columnName, orderedPaths] of this.optimisticColumnOrders) {
      if (orderedPaths.every((path) => !this.optimisticMoves.has(path))) {
        this.optimisticColumnOrders.delete(columnName);
      }
    }
  }

  private clearOptimisticMoves(paths: string[], columnName: string): void {
    for (const path of paths) this.optimisticMoves.delete(path);
    this.optimisticColumnOrders.delete(columnName);
  }

  /** Persist a contiguous block within an ordered column. */
  public async writeCardOrder(
    orderedPaths: string[],
    pathsToAssign: string[],
  ): Promise<void> {
    if (pathsToAssign.length === 0) return;

    const startIdx = orderedPaths.indexOf(pathsToAssign[0]);
    const prevPath = startIdx > 0 ? orderedPaths[startIdx - 1] : null;
    const nextPath =
      startIdx + pathsToAssign.length < orderedPaths.length
        ? orderedPaths[startIdx + pathsToAssign.length]
        : null;
    const existingPaths = orderedPaths.filter(
      (path) => !pathsToAssign.includes(path),
    );
    const hasLegacyOrder = existingPaths.some(
      (path) => !isOrderKey(this.getFileOrder(path)),
    );
    const pathsToWrite = hasLegacyOrder ? orderedPaths : pathsToAssign;
    const previousOrder = prevPath ? this.getFileOrder(prevPath) : null;
    const followingOrder = nextPath ? this.getFileOrder(nextPath) : null;
    const newOrders = hasLegacyOrder
      ? generateOrderKeys(null, null, orderedPaths.length)
      : generateOrderKeys(
          isOrderKey(previousOrder) ? previousOrder : null,
          isOrderKey(followingOrder) ? followingOrder : null,
          pathsToAssign.length,
        );

    await Promise.all(
      pathsToWrite.map((cardPath, index) => {
        const file = this.app.vault.getAbstractFileByPath(cardPath);
        if (!file || !(file instanceof TFile)) return Promise.resolve();
        const orderVal = hasLegacyOrder
          ? newOrders[index]
          : newOrders[pathsToAssign.indexOf(cardPath)];
        return this.app.fileManager.processFrontMatter(
          file,
          (fm: Record<string, unknown>) => {
            fm[ORDER_PROPERTY] = orderVal;
          },
        );
      }),
    );
  }

  /** Debounced render — coalesces multiple calls into one. */
  public scheduleRender(): void {
    if (this.renderTimer) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;
      this.render();
    }, 50);
  }

  private getCardSourceColumn(filePath: string): string | null {
    return this.findCardColumn(this.currentGroups, filePath);
  }

  private findCardColumn(
    groups: BasesEntryGroup[],
    filePath: string,
  ): string | null {
    for (const group of groups) {
      for (const entry of group.entries) {
        if (entry.file?.path === filePath) {
          return this.getColumnName(group.key);
        }
      }
    }
    return null;
  }
}
