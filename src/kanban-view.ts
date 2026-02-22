import {
  BasesView,
  BasesEntry,
  BasesEntryGroup,
  BasesPropertyId,
  QueryController,
  NullValue,
  setIcon,
  TFile,
  Notice,
  Modal,
  Menu,
  App,
  Setting,
} from "obsidian";
import type BaseBoardPlugin from "./main";
import { DragDropManager } from "./drag-drop";

const NO_VALUE_COLUMN = "(No value)";
const ORDER_PROPERTY = "kanban_order";

/** Key used by BasesViewConfig.set/get to persist column order in the .base file. */
const CONFIG_KEY_COLUMNS = "boardColumns";

// ---------------------------------------------------------------------------
//  Simple input modal (since window.prompt doesn't work in Obsidian)
// ---------------------------------------------------------------------------

class InputModal extends Modal {
  private value = "";
  private onSubmit: (value: string) => void;
  private title: string;
  private placeholder: string;

  constructor(
    app: App,
    title: string,
    placeholder: string,
    onSubmit: (value: string) => void,
  ) {
    super(app);
    this.title = title;
    this.placeholder = placeholder;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });

    new Setting(contentEl).setName("Name").addText((text) => {
      text.setPlaceholder(this.placeholder);
      text.onChange((v) => (this.value = v));
      // Focus and handle Enter key
      setTimeout(() => {
        text.inputEl.focus();
        text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.submit();
          }
        });
      }, 50);
    });

    new Setting(contentEl).addButton((btn) => {
      btn
        .setButtonText("Add")
        .setCta()
        .onClick(() => this.submit());
    });
  }

  private submit(): void {
    const trimmed = this.value.trim();
    if (trimmed) {
      this.onSubmit(trimmed);
    }
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
//  Kanban View
// ---------------------------------------------------------------------------

export class KanbanView extends BasesView {
  type = "kanban";
  scrollEl: HTMLElement;
  containerEl: HTMLElement;
  plugin: BaseBoardPlugin;

  private dragDropManager: DragDropManager;
  private currentGroups: BasesEntryGroup[] = [];

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

  static getViewOptions(): any[] {
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
  private getGroupByProperty(): string | null {
    const cfg = this.config as any;

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

  private getColumnName(key: any): string {
    if (key === undefined || key === null || key instanceof NullValue) {
      return NO_VALUE_COLUMN;
    }
    if (typeof key === "object" && "value" in key) {
      return String(key.value);
    }
    return String(key);
  }

  /**
   * Read kanban_order from metadataCache (more reliable than entry.values
   * since the Bases engine may not expose all properties).
   */
  private getFileOrder(filePath: string): number {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) return Infinity;
    const cache = this.app.metadataCache.getFileCache(file);
    const order = cache?.frontmatter?.[ORDER_PROPERTY];
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
  private getColumns(): string[] {
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

  private render(): void {
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
      this.renderColumn(boardEl, columnName, group, idx);
    });

    this.renderAddColumnButton(boardEl);
    this.dragDropManager.initBoard(boardEl);
  }

  private renderColumn(
    boardEl: HTMLElement,
    columnName: string,
    group: BasesEntryGroup | null,
    columnIndex: number,
  ): void {
    const isNoValue = columnName === NO_VALUE_COLUMN;
    const entries = group ? group.entries : [];

    const columnEl = boardEl.createDiv({ cls: "base-board-column" });
    columnEl.dataset.columnName = columnName;
    columnEl.dataset.columnIndex = String(columnIndex);

    // ---- Header ----
    const headerEl = columnEl.createDiv({ cls: "base-board-column-header" });

    const dragHandle = headerEl.createDiv({
      cls: "base-board-column-drag-handle",
    });
    dragHandle.setAttr("draggable", "true");
    setIcon(dragHandle, "grip-vertical");

    const titleEl = headerEl.createEl("span", {
      text: columnName,
      cls: "base-board-column-title",
    });
    if (isNoValue) {
      titleEl.addClass("base-board-no-value-title");
    } else {
      // Double-click to rename
      titleEl.addEventListener("dblclick", () => {
        this.startColumnRename(titleEl, columnName, entries);
      });
    }

    const headerRight = headerEl.createDiv({
      cls: "base-board-header-right",
    });

    headerRight.createEl("span", {
      text: String(entries.length),
      cls: "base-board-column-count",
    });

    if (entries.length === 0 && !isNoValue) {
      const deleteBtn = headerRight.createDiv({
        cls: "base-board-column-delete",
      });
      setIcon(deleteBtn, "x");
      deleteBtn.addEventListener("click", () => {
        this.handleDeleteColumn(columnName);
      });
    }

    // ---- Cards container ----
    const cardsEl = columnEl.createDiv({ cls: "base-board-cards" });

    // Sort entries by kanban_order (read from metadataCache for reliability)
    const sorted = [...entries].sort((a: any, b: any) => {
      const pathA = a.file?.path ?? "";
      const pathB = b.file?.path ?? "";
      return this.getFileOrder(pathA) - this.getFileOrder(pathB);
    });

    sorted.forEach((entry, cardIndex) => {
      this.renderCard(cardsEl, entry, columnName, cardIndex);
    });

    // ---- Add card button ----
    if (!isNoValue) {
      const addCardBtn = columnEl.createDiv({
        cls: "base-board-add-card-btn",
      });
      setIcon(
        addCardBtn.createSpan({ cls: "base-board-add-card-icon" }),
        "plus",
      );
      addCardBtn.createSpan({ text: "Add card" });
      addCardBtn.addEventListener("click", () => {
        this.startInlineCardCreation(addCardBtn, columnName, sorted.length);
      });
    }
  }

  private renderCard(
    cardsEl: HTMLElement,
    entry: BasesEntry,
    columnName: string,
    cardIndex: number = 0,
  ): void {
    const filePath = entry.file?.path ?? "";
    const cardEl = cardsEl.createDiv({ cls: "base-board-card" });
    cardEl.setAttr("draggable", "true");
    cardEl.dataset.filePath = filePath;
    cardEl.dataset.columnName = columnName;

    // Open the note on click; guard against accidental clicks after a drag
    let dragging = false;
    cardEl.addEventListener("dragstart", () => {
      dragging = true;
    });
    cardEl.addEventListener("dragend", () => {
      setTimeout(() => {
        dragging = false;
      }, 0);
    });

    cardEl.addEventListener("click", (e: MouseEvent) => {
      if (dragging) return;
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;
      const newTab = e.ctrlKey || e.metaKey;
      this.app.workspace.getLeaf(newTab ? "tab" : false).openFile(file);
    });

    // Middle-click → always open in new tab
    cardEl.addEventListener("auxclick", (e: MouseEvent) => {
      if (e.button !== 1) return;
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;
      this.app.workspace.getLeaf("tab").openFile(file);
    });

    // Right-click → standard Obsidian file context menu
    cardEl.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;
      const menu = new Menu();
      this.app.workspace.trigger(
        "file-menu",
        menu,
        file,
        "base-board-card",
        this.app.workspace.getMostRecentLeaf(),
      );
      menu.showAtMouseEvent(e);
    });

    const titleEl = cardEl.createDiv({ cls: "base-board-card-title" });
    titleEl.createEl("span", { text: entry.file?.basename ?? "Untitled" });

    // ---- Edit button (visible on hover) ----
    const editBtn = cardEl.createDiv({ cls: "base-board-card-edit-btn" });
    setIcon(editBtn, "lucide-pencil");
    editBtn.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation(); // Don't open the note
      this.showCardActionMenu(editBtn, filePath, titleEl);
    });

    // ---- Property chips ----
    const propsEl = cardEl.createDiv({ cls: "base-board-card-props" });
    const groupByProp = this.getGroupByProperty();
    const visibleProps: BasesPropertyId[] =
      this.data?.properties ?? this.allProperties ?? [];
    let shown = 0;
    for (const propId of visibleProps) {
      if (shown >= 3) break;
      // Skip file-level, formula, groupBy, and order properties
      if (propId.startsWith("file.") || propId.startsWith("formula.")) continue;
      const propName = propId.startsWith("note.") ? propId.slice(5) : propId;
      if (groupByProp && propName === groupByProp) continue;
      if (propName === ORDER_PROPERTY) continue;

      const val = entry.getValue(propId);
      if (!val || val instanceof NullValue || !val.isTruthy()) continue;
      const display = val.toString();
      if (!display) continue;

      const chip = propsEl.createEl("span", {
        cls: "base-board-card-chip",
      });
      const displayName = this.config?.getDisplayName(propId) ?? propName;
      chip.createEl("span", {
        text: displayName,
        cls: "base-board-chip-label",
      });
      chip.createEl("span", {
        text: display,
        cls: "base-board-chip-value",
      });
      shown++;
    }
  }

  private showCardActionMenu(
    anchorEl: HTMLElement,
    filePath: string,
    titleEl: HTMLElement,
  ): void {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) return;

    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle("Open")
        .setIcon("lucide-file-text")
        .onClick(() => {
          this.app.workspace.getLeaf(false).openFile(file);
        });
    });

    menu.addItem((item) => {
      item
        .setTitle("Open in new tab")
        .setIcon("lucide-file-plus")
        .onClick(() => {
          this.app.workspace.getLeaf("tab").openFile(file);
        });
    });

    menu.addSeparator();

    menu.addItem((item) => {
      item
        .setTitle("Rename")
        .setIcon("lucide-pencil")
        .onClick(() => {
          this.startCardRename(titleEl, file);
        });
    });

    menu.addItem((item) => {
      item
        .setTitle("Delete")
        .setIcon("lucide-trash-2")
        .onClick(async () => {
          await this.app.vault.trash(file, true);
          new Notice(`Moved "${file.basename}" to trash`);
        });
    });

    const rect = anchorEl.getBoundingClientRect();
    menu.showAtPosition({ x: rect.right, y: rect.bottom });
  }

  private startCardRename(titleEl: HTMLElement, file: TFile): void {
    const titleSpan = titleEl.querySelector("span");
    if (!titleSpan) return;

    const input = document.createElement("input");
    input.type = "text";
    input.value = file.basename;
    input.className = "base-board-card-rename-input";

    titleSpan.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const newName = input.value.trim();
      if (newName && newName !== file.basename) {
        const newPath = file.path.replace(
          /[^/]+\.md$/,
          `${newName.replace(/[\\/:*?"<>|]/g, "")}.md`,
        );
        try {
          await this.app.fileManager.renameFile(file, newPath);
        } catch (err) {
          new Notice(`Rename failed: ${err}`);
        }
      }
      // Re-render will pick up the new name via onDataUpdated
      this.scheduleRender();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        committed = true;
        this.scheduleRender();
      }
    });
    input.addEventListener("blur", () => commit());
  }

  private renderAddColumnButton(boardEl: HTMLElement): void {
    const addBtn = boardEl.createDiv({ cls: "base-board-add-column-btn" });
    setIcon(addBtn.createSpan(), "plus");
    addBtn.createEl("span", { text: "Add column" });
    addBtn.addEventListener("click", () => this.promptAddColumn());
  }

  // ---------------------------------------------------------------------------
  //  Column management
  // ---------------------------------------------------------------------------

  private promptAddColumn(): void {
    new InputModal(this.app, "Add column", "Column name…", (name: string) => {
      const columns = this.getColumns();
      if (columns.includes(name)) {
        new Notice(`Column "${name}" already exists.`);
        return;
      }
      columns.push(name);
      this.saveColumns(columns);
      this.render();
    }).open();
  }

  private handleDeleteColumn(columnName: string): void {
    const columns = this.getColumns().filter((c) => c !== columnName);
    this.saveColumns(columns);
    this.render();
  }

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
  private saveColumns(columns: string[]): void {
    // Primary: persist in .base file via the official config API
    this.config?.set(CONFIG_KEY_COLUMNS, columns);

    // Legacy fallback: also write to plugin data.json
    this.plugin.saveColumnConfig(this.getBaseId(), { columns });
  }

  private startColumnRename(
    titleEl: HTMLElement,
    oldName: string,
    entries: any[],
  ): void {
    const input = document.createElement("input");
    input.type = "text";
    input.value = oldName;
    input.className = "base-board-column-title-input";

    // Replace the span with the input
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const newName = input.value.trim();
      if (newName && newName !== oldName) {
        this.handleRenameColumn(oldName, newName, entries);
      } else {
        // Revert — just re-render to restore the span
        this.render();
      }
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        committed = true;
        this.render();
      }
    });
    input.addEventListener("blur", commit);
  }

  private async handleRenameColumn(
    oldName: string,
    newName: string,
    entries: any[],
  ): Promise<void> {
    const columns = this.getColumns();
    if (columns.includes(newName)) {
      new Notice(`Column "${newName}" already exists.`);
      this.render();
      return;
    }

    const groupByProp = this.getGroupByProperty();

    // Block re-renders during batch update
    this.isUpdating = true;
    this.pendingRender = false;

    try {
      // 1. Update column config
      const updatedColumns = columns.map((c) => (c === oldName ? newName : c));
      this.saveColumns(updatedColumns);

      // 2. Update frontmatter for all cards in this column
      if (groupByProp) {
        for (const entry of entries) {
          const filePath = entry.file?.path;
          if (!filePath) continue;
          const file = this.app.vault.getAbstractFileByPath(filePath);
          if (!file || !(file instanceof TFile)) continue;
          await this.app.fileManager.processFrontMatter(file, (fm) => {
            fm[groupByProp] = newName;
          });
        }
      }
    } finally {
      this.isUpdating = false;
    }

    if (this.pendingRender) {
      this.pendingRender = false;
      this.scheduleRender();
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
    if (!groupByProp) return;

    // Block re-renders during batch update
    this.isUpdating = true;
    this.pendingRender = false;

    try {
      // 1. Move card to new column if needed
      const draggedFile = this.app.vault.getAbstractFileByPath(filePath);
      if (draggedFile && draggedFile instanceof TFile) {
        const sourceColumn = this.getCardSourceColumn(filePath);
        if (sourceColumn !== targetColumnName) {
          await this.app.fileManager.processFrontMatter(draggedFile, (fm) => {
            if (targetColumnName === NO_VALUE_COLUMN) {
              delete fm[groupByProp];
            } else {
              fm[groupByProp] = targetColumnName;
            }
          });
        }
      }

      // 2. Update kanban_order for all cards in the target column
      for (let i = 0; i < orderedPaths.length; i++) {
        const cardPath = orderedPaths[i];
        const file = this.app.vault.getAbstractFileByPath(cardPath);
        if (!file || !(file instanceof TFile)) continue;
        await this.app.fileManager.processFrontMatter(file, (fm) => {
          fm[ORDER_PROPERTY] = i;
        });
      }
    } finally {
      this.isUpdating = false;
    }

    // If Bases fired onDataUpdated during our batch, schedule a debounced render.
    // Otherwise, Bases will fire onDataUpdated soon and the debouncer handles it.
    if (this.pendingRender) {
      this.pendingRender = false;
      this.scheduleRender();
    }
  }

  /** Debounced render — coalesces multiple calls into one. */
  private scheduleRender(): void {
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

  // ---------------------------------------------------------------------------
  //  Card creation
  // ---------------------------------------------------------------------------

  private startInlineCardCreation(
    btnEl: HTMLElement,
    columnName: string,
    existingCount: number,
  ): void {
    // Hide the button and show an input
    btnEl.style.display = "none";

    const inputWrapper = btnEl.parentElement!.createDiv({
      cls: "base-board-add-card-input-wrapper",
    });
    const input = inputWrapper.createEl("input", {
      cls: "base-board-add-card-input",
      attr: { type: "text", placeholder: "Card title…" },
    });
    input.focus();

    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const name = input.value.trim();
      inputWrapper.remove();
      btnEl.style.display = "";
      if (name) {
        await this.createNewCard(name, columnName, existingCount);
      }
    };

    const cancel = () => {
      committed = true;
      inputWrapper.remove();
      btnEl.style.display = "";
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    });
    input.addEventListener("blur", () => commit());
  }

  private async createNewCard(
    title: string,
    columnName: string,
    orderIndex: number,
  ): Promise<void> {
    const groupByProp = this.getGroupByProperty();
    if (!groupByProp) {
      new Notice("Cannot create card: no groupBy property configured.");
      return;
    }

    const folder = this.getTargetFolder();
    const safeName = title.replace(/[\\/:*?"<>|]/g, "");
    let filePath = `${folder}/${safeName}.md`;

    // Avoid overwriting existing files
    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(filePath)) {
      filePath = `${folder}/${safeName} ${counter}.md`;
      counter++;
    }

    const frontmatter = [
      "---",
      `${groupByProp}: ${columnName}`,
      `${ORDER_PROPERTY}: ${orderIndex}`,
      "---",
      "",
      `# ${title}`,
      "",
    ].join("\n");

    await this.app.vault.create(filePath, frontmatter);
    new Notice(`Created "${safeName}"`);
  }

  /**
   * Determine the folder for new cards by looking at existing entries.
   * Falls back to the vault root.
   *
   * Uses the official BasesEntry.file property (TFile) which is
   * guaranteed by the Obsidian API.
   */
  private getTargetFolder(): string {
    // All entries in this board share the same .base query, so the first
    // entry's parent folder is a good default for new cards.
    for (const group of this.currentGroups) {
      for (const entry of group.entries) {
        const path = entry.file?.path;
        if (path) {
          const lastSlash = path.lastIndexOf("/");
          if (lastSlash > 0) return path.substring(0, lastSlash);
        }
      }
    }

    // Fallback: try to infer from the first entry in the raw data list
    const entries: BasesEntry[] = this.data?.data ?? [];
    if (entries.length > 0) {
      const path = entries[0].file?.path ?? "";
      const lastSlash = path.lastIndexOf("/");
      if (lastSlash > 0) return path.substring(0, lastSlash);
    }

    return "";
  }
}
