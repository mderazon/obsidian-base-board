import { Menu, Notice, TFile } from "obsidian";
import { KanbanView } from "./kanban-view";
import { ORDER_PROPERTY, sanitizeFilename } from "./constants";

/**
 * Card-level actions: edit menu, rename, inline creation.
 * Extracted from CardManager to keep card.ts focused on rendering/laziness.
 */
export class CardActionManager {
  private view: KanbanView;

  constructor(view: KanbanView) {
    this.view = view;
  }

  public showCardActionMenu(
    anchorEl: HTMLElement,
    filePath: string,
    titleEl: HTMLElement,
  ): void {
    const file = this.view.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) return;

    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle("Edit tags")
        .setIcon("lucide-tags")
        .onClick(() => {
          this.view.tags.promptEditTags(file);
        });
    });

    menu.addItem((item) => {
      item
        .setTitle("Open")
        .setIcon("lucide-file-text")
        .onClick(() => {
          this.view.cardManager.openFileWithBehavior(file);
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
          await this.view.app.fileManager.trashFile(file);
          new Notice(`Moved "${file.basename}" to trash`);
        });
    });

    const rect = anchorEl.getBoundingClientRect();
    menu.showAtPosition({ x: rect.right, y: rect.bottom });
  }

  public startCardRename(titleEl: HTMLElement, file: TFile): void {
    const titleSpan = titleEl.querySelector("span");
    if (!titleSpan) return;

    // Check if cardTitleProperty is configured and has a value
    const titleProp = this.view.config.get("cardTitleProperty") as
      | string
      | undefined;
    let isFrontmatterEdit = false;
    let fieldValue = "";

    if (titleProp && titleProp.trim()) {
      // Read frontmatter to check if the property has a value
      const cache = this.view.app.metadataCache.getFileCache(file);
      const propValue = cache?.frontmatter?.[titleProp] as string | undefined;
      if (
        propValue !== undefined &&
        propValue !== null &&
        String(propValue).trim() !== ""
      ) {
        fieldValue = String(propValue).trim();
        isFrontmatterEdit = true;
      }
    }

    const input = activeDocument.createElement("input");
    input.type = "text";
    input.value = isFrontmatterEdit ? fieldValue : file.basename;
    input.className = "base-board-card-rename-input";

    const originalTitle = titleSpan.textContent ?? "";
    const restoreTitle = (text: string) => {
      input.replaceWith(titleEl.createSpan({ text }));
    };

    titleSpan.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const newValue = input.value.trim();

      if (isFrontmatterEdit && titleProp && newValue !== fieldValue) {
        // Update frontmatter field instead of renaming file
        try {
          await this.view.app.fileManager.processFrontMatter(
            file,
            (fm: Record<string, unknown>) => {
              fm[titleProp] = newValue;
            },
          );
        } catch (err) {
          new Notice(`Failed to update title: ${String(err)}`);
        }
      } else if (!isFrontmatterEdit && newValue && newValue !== file.basename) {
        // Rename the file
        const newPath = file.path.replace(
          /[^/]+\.md$/,
          `${sanitizeFilename(newValue)}.md`,
        );
        try {
          await this.view.app.fileManager.renameFile(file, newPath);
        } catch (err) {
          new Notice(`Rename failed: ${String(err)}`);
        }
      }
      // Show the new title immediately; the reconciler keeps everything else
      // in sync via onDataUpdated.
      restoreTitle(newValue || originalTitle);
      this.view.scheduleUpdate();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        committed = true;
        restoreTitle(originalTitle);
      }
    });
    input.addEventListener("blur", () => {
      void commit();
    });
  }

  public startInlineCardCreation(btnEl: HTMLElement, columnName: string): void {
    // Find the cards list for this column.
    // The trigger button may be in the header OR in the footer, so we walk
    // up to the column element and then down into .base-board-cards.
    const columnEl = btnEl.closest<HTMLElement>(".base-board-column");
    const cardsEl =
      (columnEl?.querySelector(".base-board-cards") as HTMLElement | null) ??
      btnEl.parentElement!;

    // Resolve the live column identity — the closure columnName goes stale
    // once the column has been renamed.
    const liveColumnName = columnEl?.dataset.columnName ?? columnName;

    btnEl.classList.add("base-board-hidden");

    const inputWrapper = cardsEl.createDiv({
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
      btnEl.classList.remove("base-board-hidden");
      if (name) {
        await this.createNewCard(name, liveColumnName);
      }
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        committed = true;
        inputWrapper.remove();
        btnEl.classList.remove("base-board-hidden");
      }
    });
    input.addEventListener("blur", () => {
      void commit();
    });
  }

  private async createNewCard(
    title: string,
    columnName: string,
  ): Promise<void> {
    const groupByProp = this.view.getGroupByProperty();
    if (!groupByProp) {
      new Notice("Cannot create card: no group by property configured.");
      return;
    }

    // Compute position based on neighbors (Trello-style float positioning).
    // New cards append at the end, so position = last + 1_000_000.
    // Use the live group — always current, even across renames.
    const existingCards =
      this.view.currentGroups.find((g) => g.name === columnName)?.cards ?? [];
    let position = 1_000_000;
    for (const card of existingCards) {
      const order = this.view.getFileOrder(card.filePath);
      if (order > position) {
        position = order;
      }
    }
    position += 1_000_000;

    const overrides = (fm: Record<string, unknown>) => {
      this.view.applyGroupByValue(fm, groupByProp, columnName);
      fm[ORDER_PROPERTY] = position;
    };

    try {
      await this.view.createFileForView(title, overrides);
    } catch (err) {
      new Notice(`Failed to create card: ${String(err)}`);
    }
  }
}
