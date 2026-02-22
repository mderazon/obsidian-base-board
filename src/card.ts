import {
  BasesEntry,
  BasesPropertyId,
  NullValue,
  setIcon,
  TFile,
  Notice,
  Menu,
} from "obsidian";
import { KanbanView } from "./kanban-view";
import { ORDER_PROPERTY, sanitizeFilename } from "./constants";

export class CardManager {
  private view: KanbanView;

  constructor(view: KanbanView) {
    this.view = view;
  }

  public renderCard(
    cardsEl: HTMLElement,
    entry: BasesEntry,
    columnName: string,
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
      const file = this.view.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;
      const newTab = e.ctrlKey || e.metaKey;
      void this.view.app.workspace
        .getLeaf(newTab ? "tab" : false)
        .openFile(file);
    });

    // Middle-click → always open in new tab
    cardEl.addEventListener("auxclick", (e: MouseEvent) => {
      if (e.button !== 1) return;
      const file = this.view.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;
      void this.view.app.workspace.getLeaf("tab").openFile(file);
    });

    // Right-click → standard Obsidian file context menu
    cardEl.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      const file = this.view.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;
      const menu = new Menu();
      this.view.app.workspace.trigger(
        "file-menu",
        menu,
        file,
        "base-board-card",
        this.view.app.workspace.getMostRecentLeaf(),
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
    const groupByProp = this.view.getGroupByProperty();
    const viewData = this.view as unknown as {
      data?: { properties?: BasesPropertyId[] };
      allProperties?: BasesPropertyId[];
    };
    const visibleProps: BasesPropertyId[] =
      viewData.data?.properties ?? viewData.allProperties ?? [];
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
      const viewConfig = this.view as unknown as {
        config?: { getDisplayName: (id: string) => string };
      };
      const displayName = viewConfig.config?.getDisplayName(propId) ?? propName;
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
    const file = this.view.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) return;

    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle("Open")
        .setIcon("lucide-file-text")
        .onClick(() => {
          void this.view.app.workspace.getLeaf(false).openFile(file);
        });
    });

    menu.addItem((item) => {
      item
        .setTitle("Open in new tab")
        .setIcon("lucide-file-plus")
        .onClick(() => {
          void this.view.app.workspace.getLeaf("tab").openFile(file);
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
          await this.view.app.vault.trash(file, true);
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
          `${sanitizeFilename(newName)}.md`,
        );
        try {
          await this.view.app.fileManager.renameFile(file, newPath);
        } catch (err) {
          new Notice(`Rename failed: ${String(err)}`);
        }
      }
      // Re-render will pick up the new name via onDataUpdated
      this.view.scheduleRender();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        committed = true;
        this.view.scheduleRender();
      }
    });
    input.addEventListener("blur", () => {
      void commit();
    });
  }

  public startInlineCardCreation(
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
        void commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    });
    input.addEventListener("blur", () => {
      void commit();
    });
  }

  private async createNewCard(
    title: string,
    columnName: string,
    orderIndex: number,
  ): Promise<void> {
    const groupByProp = this.view.getGroupByProperty();
    if (!groupByProp) {
      new Notice("Cannot create card: no groupBy property configured.");
      return;
    }

    const folder = this.getTargetFolder();
    const safeName = sanitizeFilename(title);
    let filePath = `${folder}/${safeName}.md`;

    // Avoid overwriting existing files
    let counter = 1;
    while (this.view.app.vault.getAbstractFileByPath(filePath)) {
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

    await this.view.app.vault.create(filePath, frontmatter);
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
    for (const group of this.view.currentGroups) {
      for (const entry of group.entries) {
        const path = entry.file?.path;
        if (path) {
          const lastSlash = path.lastIndexOf("/");
          if (lastSlash > 0) return path.substring(0, lastSlash);
        }
      }
    }

    // Fallback: try to infer from the first entry in the raw data list
    const viewData = (
      this.view as unknown as { data?: { data?: BasesEntry[] } }
    ).data;
    const entries: BasesEntry[] = viewData?.data ?? [];
    if (entries.length > 0) {
      const path = entries[0].file?.path ?? "";
      const lastSlash = path.lastIndexOf("/");
      if (lastSlash > 0) return path.substring(0, lastSlash);
    }

    return "";
  }
}
