import {
  BasesView,
  BasesEntryGroup,
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

  private getBaseId(): string {
    const data = (this as any).data;
    const path =
      data?.file?.path ?? data?.filePath ?? data?.config?.filePath ?? "";
    const groupBy = data?.config?.groupBy?.property ?? "";
    return `${path}::${groupBy}`;
  }

  // ---------------------------------------------------------------------------
  //  Helpers
  // ---------------------------------------------------------------------------

  private getGroupByProperty(): string | null {
    const config = (this as any).data?.config;
    if (config?.groupBy?.property) {
      const raw: string = config.groupBy.property;
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
  //  Column config
  // ---------------------------------------------------------------------------

  private getColumns(): string[] {
    const stored = this.plugin.getColumnConfig(this.getBaseId());
    const dataColumns = this.currentGroups.map((g) =>
      this.getColumnName(g.key),
    );

    if (stored && stored.columns.length > 0) {
      const result = [...stored.columns];
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

    const groupedData: BasesEntryGroup[] =
      (this as any).data?.groupedData ?? [];

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
  }

  private renderCard(
    cardsEl: HTMLElement,
    entry: any,
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

    const propsEl = cardEl.createDiv({ cls: "base-board-card-props" });
    const props = (entry as any).values;
    if (props && typeof props === "object") {
      let shown = 0;
      for (const [key, val] of Object.entries(props)) {
        if (shown >= 3) break;
        if (key.startsWith("file.") || key.startsWith("formula.")) continue;
        const groupByProp = this.getGroupByProperty();
        if (
          groupByProp &&
          (key === groupByProp || key === `note.${groupByProp}`)
        )
          continue;
        if (key === ORDER_PROPERTY || key === `note.${ORDER_PROPERTY}`)
          continue;
        const display = this.displayValue(val);
        if (!display) continue;
        const chip = propsEl.createEl("span", {
          cls: "base-board-card-chip",
        });
        chip.createEl("span", { text: key, cls: "base-board-chip-label" });
        chip.createEl("span", {
          text: display,
          cls: "base-board-chip-value",
        });
        shown++;
      }
    }
  }

  private renderAddColumnButton(boardEl: HTMLElement): void {
    const addBtn = boardEl.createDiv({ cls: "base-board-add-column-btn" });
    setIcon(addBtn.createSpan(), "plus");
    addBtn.createEl("span", { text: "Add column" });
    addBtn.addEventListener("click", () => this.promptAddColumn());
  }

  private displayValue(val: any): string {
    if (val === undefined || val === null) return "";
    if (val instanceof NullValue) return "";
    if (typeof val === "object" && "value" in val) {
      const v = val.value;
      if (v === undefined || v === null) return "";
      if (Array.isArray(v)) return v.join(", ");
      return String(v);
    }
    if (typeof val === "string") return val;
    if (typeof val === "number" || typeof val === "boolean") return String(val);
    return "";
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
      this.plugin.saveColumnConfig(this.getBaseId(), { columns });
      this.render();
    }).open();
  }

  private handleDeleteColumn(columnName: string): void {
    const columns = this.getColumns().filter((c) => c !== columnName);
    this.plugin.saveColumnConfig(this.getBaseId(), { columns });
    this.render();
  }

  private handleColumnReorder(orderedNames: string[]): void {
    this.plugin.saveColumnConfig(this.getBaseId(), { columns: orderedNames });
    this.render();
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
      this.plugin.saveColumnConfig(this.getBaseId(), {
        columns: updatedColumns,
      });

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
        if ((entry as any).file?.path === filePath) {
          return this.getColumnName(group.key);
        }
      }
    }
    return null;
  }
}
