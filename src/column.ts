import {
  BasesEntry,
  BasesEntryGroup,
  setIcon,
  TFile,
  Notice,
  Menu,
} from "obsidian";
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

    // Sort entries up-front so the header add-card button can reference sorted.length
    const sorted = [...entries].sort((a: BasesEntry, b: BasesEntry) => {
      const pathA = a.file?.path ?? "";
      const pathB = b.file?.path ?? "";
      return this.view.getFileOrder(pathA) - this.view.getFileOrder(pathB);
    });

    const activeFilters = this.view.tags.activeFilters;
    const visibleCards =
      activeFilters.size > 0
        ? sorted.filter((entry) => {
            const file = entry.file;
            if (!(file instanceof TFile)) return false;
            const fileTags = this.view.tags.extractTagsFromFile(file);
            return Array.from(activeFilters).some((filter) =>
              fileTags.includes(filter),
            );
          })
        : sorted;

    const columnEl = boardEl.createDiv({ cls: "base-board-column" });
    columnEl.dataset.columnName = columnName;
    columnEl.dataset.columnIndex = String(columnIndex);

    // ---- Header ----
    const headerEl = columnEl.createDiv({ cls: "base-board-column-header" });
    headerEl.setAttr("draggable", "true");

    const dragHandle = headerEl.createDiv({
      cls: "base-board-column-drag-handle",
    });
    setIcon(dragHandle, "grip-vertical");

    // Title + inline count badge
    const titleEl = headerEl.createEl("span", {
      text: columnName,
      cls: "base-board-column-title",
    });
    if (isNoValue) {
      titleEl.addClass("base-board-no-value-title");
    }

    // Count badge sits right after the title, inline
    const countEl = headerEl.createEl("span", {
      text: String(entries.length),
      cls: "base-board-column-count",
    });

    // Spacer pushes the + button to the far right
    headerEl.createDiv({ cls: "base-board-header-spacer" });

    // ---- Add card button — always visible ----
    let addCardHeaderBtn: HTMLElement | null = null;
    if (!isNoValue) {
      addCardHeaderBtn = headerEl.createDiv({
        cls: "base-board-column-add-card",
      });
      setIcon(addCardHeaderBtn, "plus");
      addCardHeaderBtn.addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation();
        this.view.cardManager.startInlineCardCreation(
          addCardHeaderBtn!,
          columnName,
          sorted.length,
        );
      });
    }

    // ---- Right-click context menu on header ----
    if (!isNoValue) {
      headerEl.addEventListener("contextmenu", (e: MouseEvent) => {
        e.preventDefault();
        const menu = new Menu();

        menu.addItem((item) => {
          item
            .setTitle("Rename column")
            .setIcon("lucide-pencil")
            .onClick(() => {
              this.startColumnRename(
                titleEl,
                columnName,
                entries,
                countEl,
                addCardHeaderBtn,
              );
            });
        });

        menu.addSeparator();
        menu.addItem((item) => {
          item
            .setTitle(
              entries.length > 0
                ? `Delete column (${entries.length} card${entries.length > 1 ? "s" : ""} will remain)`
                : "Delete column",
            )
            .setIcon("lucide-trash-2")
            .setWarning(true)
            .onClick(() => {
              this.handleDeleteColumn(columnName);
            });
        });

        menu.showAtMouseEvent(e);
      });
    }

    // ---- Cards container ----
    const cardsEl = columnEl.createDiv({ cls: "base-board-cards" });

    visibleCards.forEach((entry) => {
      this.view.cardManager.renderCard(cardsEl, entry, columnName);
    });
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
    countEl?: HTMLElement | null,
    addCardBtn?: HTMLElement | null,
  ): void {
    const input = document.createElement("input");
    input.type = "text";
    input.value = oldName;
    input.className = "base-board-column-title-input";

    // Hide count and + during editing so the input can use the full width
    if (countEl) countEl.style.display = "none";
    if (addCardBtn) addCardBtn.style.display = "none";

    const restoreChrome = () => {
      if (countEl) countEl.style.display = "";
      if (addCardBtn) addCardBtn.style.display = "";
    };

    // Replace the span with the input
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const newName = input.value.trim();
      restoreChrome();
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
        restoreChrome();
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
