import { BasesEntry, BasesEntryGroup, setIcon, TFile, Notice } from "obsidian";
import { KanbanView } from "./kanban-view";
import { InputModal } from "./modals";
import { NO_VALUE_COLUMN } from "./constants";

export class ColumnManager {
  private view: KanbanView;

  constructor(view: KanbanView) {
    this.view = view;
  }

  public renderColumn(
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
    const sorted = [...entries].sort((a: BasesEntry, b: BasesEntry) => {
      const pathA = a.file?.path ?? "";
      const pathB = b.file?.path ?? "";
      return this.view.getFileOrder(pathA) - this.view.getFileOrder(pathB);
    });

    const activeFilters = this.view.labels.activeFilters;
    let visibleCards = sorted;
    if (activeFilters.size > 0) {
      visibleCards = sorted.filter((entry) => {
        const file = entry.file;
        if (!(file instanceof TFile)) return false;
        const fileTags = this.view.labels.extractTagsFromFile(file);
        // Match ANY of the active tag filters
        return Array.from(activeFilters).some((filter) =>
          fileTags.includes(filter),
        );
      });
    }

    visibleCards.forEach((entry) => {
      this.view.cardManager.renderCard(cardsEl, entry, columnName);
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
        this.view.cardManager.startInlineCardCreation(
          addCardBtn,
          columnName,
          sorted.length,
        );
      });
    }
  }

  public renderAddColumnButton(boardEl: HTMLElement): void {
    const addBtn = boardEl.createDiv({ cls: "base-board-add-column-btn" });
    setIcon(addBtn.createSpan(), "plus");
    addBtn.createEl("span", { text: "Add column" });
    addBtn.addEventListener("click", () => this.promptAddColumn());
  }

  public promptAddColumn(): void {
    new InputModal(
      this.view.app,
      "Add column",
      "Column name…",
      (name: string) => {
        const columns = this.view.getColumns();
        if (columns.includes(name)) {
          new Notice(`Column "${name}" already exists.`);
          return;
        }
        columns.push(name);
        this.view.saveColumns(columns);
        this.view.render();
      },
    ).open();
  }

  public handleDeleteColumn(columnName: string): void {
    const columns = this.view.getColumns().filter((c) => c !== columnName);
    this.view.saveColumns(columns);
    this.view.render();
  }

  public startColumnRename(
    titleEl: HTMLElement,
    oldName: string,
    entries: BasesEntry[],
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
        void this.handleRenameColumn(oldName, newName, entries);
      } else {
        // Revert — just re-render to restore the span
        this.view.render();
      }
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        committed = true;
        this.view.render();
      }
    });
    input.addEventListener("blur", commit);
  }

  private async handleRenameColumn(
    oldName: string,
    newName: string,
    entries: BasesEntry[],
  ): Promise<void> {
    const columns = this.view.getColumns();
    if (columns.includes(newName)) {
      new Notice(`Column "${newName}" already exists.`);
      this.view.render();
      return;
    }

    const groupByProp = this.view.getGroupByProperty();

    await this.view.applyBatchUpdate(async () => {
      // 1. Update column config
      const updatedColumns = columns.map((c) => (c === oldName ? newName : c));
      this.view.saveColumns(updatedColumns);

      // 2. Update frontmatter for all cards in this column
      if (groupByProp) {
        const updatePromises = entries.map((entry) => {
          const filePath = entry.file?.path;
          if (!filePath) return Promise.resolve();
          const file = this.view.app.vault.getAbstractFileByPath(filePath);
          if (!file || !(file instanceof TFile)) return Promise.resolve();
          return this.view.app.fileManager.processFrontMatter(
            file,
            (fm: Record<string, unknown>) => {
              fm[groupByProp] = newName;
            },
          );
        });
        await Promise.all(updatePromises);
      }
    });
  }
}
