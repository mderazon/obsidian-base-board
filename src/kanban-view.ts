import {
  BasesView,
  BasesEntry,
  BasesEntryGroup,
  QueryController,
  NullValue,
  setIcon,
  TFile,
} from "obsidian";
import type BaseBoardPlugin from "./main";
import { DragDropManager } from "./drag-drop";
import { ColumnManager } from "./column";
import { CardManager } from "./card";
import {
  NO_VALUE_COLUMN,
  ORDER_PROPERTY,
  CONFIG_KEY_COLUMNS,
} from "./constants";

// ---------------------------------------------------------------------------
//  Kanban View
// ---------------------------------------------------------------------------

export class KanbanView extends BasesView {
  type = "kanban";
  scrollEl: HTMLElement;
  containerEl: HTMLElement;
  plugin: BaseBoardPlugin;

  private dragDropManager: DragDropManager;
  private columnManager: ColumnManager;
  public currentGroups: BasesEntryGroup[] = [];
  public cardManager: CardManager;

  /** Prevent re-renders while we batch-update frontmatter. */
  private isUpdating = false;
  /** Track if Bases fired onDataUpdated while we were updating. */
  private pendingRender = false;
  /** True until the first successful render completes. */
  private isFirstRender = true;
  /** Debounce timer for render calls. */
  private renderTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    controller: QueryController,
    scrollEl: HTMLElement,
    plugin: BaseBoardPlugin,
  ) {
    super(controller);
    this.scrollEl = scrollEl;
    this.plugin = plugin;
    this.containerEl = scrollEl.createDiv({ cls: "base-board-container" });

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
    });
  }

  onload(): void {}

  onunload(): void {
    this.dragDropManager.destroy();
    if (this.renderTimer) clearTimeout(this.renderTimer);
  }

  public focus(): void {
    this.containerEl.focus({ preventScroll: true });
  }

  public onDataUpdated(): void {
    if (this.isUpdating) {
      this.pendingRender = true;
      return;
    }
    this.scheduleRender();
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

    // If Bases fired onDataUpdated during our batch, schedule a debounced render.
    if (this.pendingRender) {
      this.pendingRender = false;
      this.scheduleRender();
    }
  }

  static getViewOptions(): never[] {
    return [];
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

  private getColumnName(key: unknown): string {
    if (key === undefined || key === null || key instanceof NullValue) {
      return NO_VALUE_COLUMN;
    }
    if (typeof key === "object" && key !== null && "value" in key) {
      const val = (key as Record<string, unknown>).value;
      return String(val as { toString(): string });
    }
    return String(key as { toString(): string });
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
      | string[]
      | undefined;

    // 2. Fallback: legacy plugin data.json
    const fromPlugin = this.plugin.getColumnConfig(this.getBaseId());

    const stored = fromConfig?.length
      ? fromConfig
      : fromPlugin?.columns?.length
        ? fromPlugin.columns
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

  public render(): void {
    this.containerEl.empty();

    // Use the official API: this.data is a BasesQueryResult
    const groupedData: BasesEntryGroup[] = this.data?.groupedData ?? [];

    const hasGroupBy =
      groupedData.length > 1 ||
      (groupedData.length === 1 &&
        groupedData[0].key !== undefined &&
        !(groupedData[0].key instanceof NullValue));

    if (!hasGroupBy && groupedData.length <= 1) {
      const msgEl = this.containerEl.createDiv({
        cls: "base-board-placeholder",
      });
      setIcon(
        msgEl.createSpan({ cls: "base-board-placeholder-icon" }),
        "lucide-kanban",
      );
      msgEl.createEl("p", {
        text: 'Set "Group by" in the sort menu to organize cards into columns.',
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

    columns.forEach((columnName, idx) => {
      const group = this.getGroupForColumn(columnName);
      this.columnManager.renderColumn(boardEl, columnName, group, idx);
    });

    this.columnManager.renderAddColumnButton(boardEl);
    this.dragDropManager.initBoard(boardEl);
  }

  // ---------------------------------------------------------------------------
  //  Column management helpers
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
    this.config?.set(CONFIG_KEY_COLUMNS, columns);

    // Legacy fallback: also write to plugin data.json
    void this.plugin.saveColumnConfig(this.getBaseId(), { columns });
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

    await this.applyBatchUpdate(async () => {
      // 1. Move card to new column if needed
      const draggedFile = this.app.vault.getAbstractFileByPath(filePath);
      if (draggedFile && draggedFile instanceof TFile) {
        const sourceColumn = this.getCardSourceColumn(filePath);
        if (sourceColumn !== targetColumnName) {
          await this.app.fileManager.processFrontMatter(
            draggedFile,
            (fm: Record<string, unknown>) => {
              if (targetColumnName === NO_VALUE_COLUMN) {
                delete fm[groupByProp];
              } else {
                fm[groupByProp] = targetColumnName;
              }
            },
          );
        }
      }

      // 2. Update kanban_order for all cards in the target column
      const updatePromises = orderedPaths.map((cardPath, i) => {
        const file = this.app.vault.getAbstractFileByPath(cardPath);
        if (!file || !(file instanceof TFile)) return Promise.resolve();
        return this.app.fileManager.processFrontMatter(
          file,
          (fm: Record<string, unknown>) => {
            fm[ORDER_PROPERTY] = i;
          },
        );
      });
      await Promise.all(updatePromises);
    });
  }

  /** Debounced render — coalesces multiple calls into one. */
  public scheduleRender(): void {
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      this.render();
    }, 50);
  }

  private getCardSourceColumn(filePath: string): string | null {
    for (const group of this.currentGroups) {
      for (const entry of group.entries) {
        if (entry.file?.path === filePath) {
          return this.getColumnName(group.key);
        }
      }
    }
    return null;
  }
}
