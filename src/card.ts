import {
  BasesEntry,
  BasesPropertyId,
  DateValue,
  NullValue,
  setIcon,
  TFile,
  Notice,
  Menu,
} from "obsidian";
import { KanbanView } from "./kanban-view";
import { ORDER_PROPERTY, sanitizeFilename } from "./constants";
import { relativeLuminance } from "./color-utils";
import { CardDetailModal } from "./card-detail-modal";

const SUFFIX_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function generateCardId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Array.from(
    { length: 4 },
    () => SUFFIX_CHARS[Math.floor(Math.random() * SUFFIX_CHARS.length)],
  ).join("");
  return `${slug}-${suffix}`;
}

// File properties that are redundant (shown as the card title) or are
// complex list types that don't render usefully as a short chip value.
const FILE_PROPS_TO_SKIP = new Set([
  "name",
  "basename",
  "fullname",
  "ext",
  "extension",
  "path",
  "links",
  "backlinks",
  "inlinks",
  "outlinks",
  "embeds",
  "tags",
]);

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

      const isMultiKey = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;

      if (isMultiKey || isShift) {
        e.preventDefault();
        this.handleCardSelect(filePath, columnName, isShift);
        return;
      }

      // If there are selected cards, clear them on a plain click instead of opening
      if (this.view.selectedCards.size > 0) {
        this.clearSelection();
        return;
      }

      const file = this.view.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;

      new CardDetailModal(this.view.app, file, this.view).open();
    });

    // Middle-click → always open in new tab
    cardEl.addEventListener("auxclick", (e: MouseEvent) => {
      if (e.button !== 1) return;
      const file = this.view.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;
      void this.view.app.workspace.getLeaf("tab").openFile(file);
    });

    // Keyboard: Escape clears multi-selection when a card is focused
    cardEl.setAttribute("tabindex", "-1");
    cardEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape" && this.view.selectedCards.size > 0) {
        e.preventDefault();
        this.clearSelection();
      }
    });

    // Hover → native Obsidian page-preview popover (same as hovering a [[wikilink]])
    // Use mouseenter (not mouseover) — mouseover bubbles from every child element
    // and would re-trigger the preview on each chip/tag/title crossing.
    cardEl.addEventListener("mouseenter", (evt: MouseEvent) => {
      if (!filePath) return;
      this.view.app.workspace.trigger("hover-link", {
        event: evt,
        source: "base-board",
        hoverParent: this.view,
        targetEl: cardEl,
        linktext: filePath,
      });
    });

    // Right-click → batch move menu when cards are selected, otherwise standard file menu
    cardEl.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      const file = this.view.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;

      // If this card is part of a multi-selection, show the batch move menu
      if (
        this.view.selectedCards.size > 1 &&
        this.view.selectedCards.has(filePath)
      ) {
        this.showBatchMoveMenu(e);
        return;
      }

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

    const tagContainerEl = cardEl.createDiv({
      cls: "base-board-tag-container",
    });
    const file = this.view.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      const fileTags = this.view.tags.extractTagsFromFile(file);
      for (const tag of fileTags) {
        const tagEl = tagContainerEl.createSpan({
          cls: "base-board-card-tag",
          text: tag,
        });
        const color = this.view.tags.getColorForTag(tag);
        if (color) {
          tagEl.style.setProperty("--tag-color", color);
          if (relativeLuminance(color) === "dark") {
            tagEl.addClass("base-board-card-tag-light");
          } else {
            tagEl.addClass("base-board-card-tag-dark");
          }
        }
      }
    }

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
    // Use the official API: getOrder() returns the user-configured visible
    // properties in the order set via the Properties toolbar menu.
    const visibleProps: BasesPropertyId[] = this.view.config.getOrder();
    let shown = 0;
    for (const propId of visibleProps) {
      if (shown >= 3) break;
      // Skip formula properties (not user-readable as chips).
      if (propId.startsWith("formula.")) continue;
      // For file.* properties, only skip ones that are redundant (name/path
      // variants already shown as the card title) or complex list types that
      // don't render well as a short chip value.
      if (propId.startsWith("file.")) {
        if (FILE_PROPS_TO_SKIP.has(propId.slice(5))) continue;
        // file.ctime, file.mtime, file.size, file.folder, etc. pass through.
      }
      const propName = propId.startsWith("note.") ? propId.slice(5) : propId;
      if (groupByProp && propName === groupByProp) continue;
      if (propName === ORDER_PROPERTY) continue;

      const val = entry.getValue(propId);
      if (!val || val instanceof NullValue || !val.isTruthy()) continue;
      // Use relative time for dates (e.g. "3 days ago") — much more readable
      // on a card chip than a raw ISO string or a full locale date.
      const display =
        val instanceof DateValue ? val.relative() : val.toString();
      if (!display) continue;

      const chip = propsEl.createEl("span", {
        cls: "base-board-card-chip",
      });
      // getDisplayName respects user-configured renames from the Base config.
      const displayName = this.view.config.getDisplayName(propId);
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
          new CardDetailModal(this.view.app, file, this.view).open();
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
    // Find the cards list for this column.
    // The trigger button may be in the header OR in the footer, so we walk
    // up to the column element and then down into .base-board-cards.
    const columnEl = btnEl.closest(".base-board-column");
    const cardsEl =
      (columnEl?.querySelector(".base-board-cards") as HTMLElement | null) ??
      btnEl.parentElement!;

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
        await this.createNewCard(name, columnName, existingCount);
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
    orderIndex: number,
  ): Promise<void> {
    const groupByProp = this.view.getGroupByProperty();
    if (!groupByProp) {
      new Notice("Cannot create card: no group by property configured.");
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

    const id = generateCardId(title);
    const frontmatter = [
      "---",
      `${groupByProp}: ${columnName}`,
      `${ORDER_PROPERTY}: ${orderIndex}`,
      `id: ${id}`,
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

  // ---------------------------------------------------------------------------
  //  Multi-select helpers
  // ---------------------------------------------------------------------------

  /**
   * Toggle or range-select a card.
   *
   * - Cmd/Ctrl+click  → toggle this card in/out of the selection
   * - Shift+click     → select a contiguous range from the last-selected card
   *                     to this one (within the same column's DOM order)
   */
  public handleCardSelect(
    filePath: string,
    columnName: string,
    isShift: boolean,
  ): void {
    const sel = this.view.selectedCards;

    if (isShift && sel.size > 0) {
      // Build DOM order for the column
      const columnEl = this.view.containerEl.querySelector(
        `[data-column-name="${CSS.escape(columnName)}"]`,
      );
      if (columnEl) {
        const cardEls = Array.from(
          columnEl.querySelectorAll<HTMLElement>(".base-board-card"),
        );
        const paths = cardEls.map((el) => el.dataset.filePath ?? "");
        const clickedIdx = paths.indexOf(filePath);
        // Find the last card in the current selection that exists in this column
        const lastIdx = paths.reduceRight((found, p, i) => {
          if (found !== -1) return found;
          return sel.has(p) ? i : -1;
        }, -1);
        if (clickedIdx !== -1 && lastIdx !== -1) {
          const [from, to] = [
            Math.min(clickedIdx, lastIdx),
            Math.max(clickedIdx, lastIdx),
          ];
          for (let i = from; i <= to; i++) {
            if (paths[i]) sel.add(paths[i]);
          }
        } else {
          sel.add(filePath); // fallback: just add
        }
      }
    } else {
      // Cmd/Ctrl+click: toggle
      if (sel.has(filePath)) {
        sel.delete(filePath);
      } else {
        sel.add(filePath);
      }
    }

    // Sync visual state on all card elements
    this.view.containerEl
      .querySelectorAll<HTMLElement>(".base-board-card")
      .forEach((el) => {
        if (sel.has(el.dataset.filePath ?? "")) {
          el.addClass("base-board-card--selected");
        } else {
          el.removeClass("base-board-card--selected");
        }
      });
  }

  public clearSelection(): void {
    this.view.selectedCards.clear();
    this.view.containerEl
      .querySelectorAll<HTMLElement>(".base-board-card--selected")
      .forEach((el) => el.removeClass("base-board-card--selected"));
  }

  /**
   * Show a "Move to…" context menu for the current multi-selection.
   * Uses the same `applyBatchUpdate` + `processFrontMatter` pattern as
   * the single-card drag/drop to stay consistent.
   */
  public showBatchMoveMenu(e: MouseEvent): void {
    const selectedPaths = Array.from(this.view.selectedCards);
    const groupByProp = this.view.getGroupByProperty();
    if (!groupByProp) return;

    const columns = this.view.getColumns();
    const menu = new Menu();

    menu.addItem((item) => {
      item.setTitle(`Move ${selectedPaths.length} cards to…`).setDisabled(true);
    });
    menu.addSeparator();

    for (const col of columns) {
      menu.addItem((item) => {
        item.setTitle(col).onClick(() => {
          void this.moveBatchToColumn(selectedPaths, col, groupByProp);
        });
      });
    }

    menu.showAtMouseEvent(e);
  }

  private async moveBatchToColumn(
    filePaths: string[],
    targetColumn: string,
    groupByProp: string,
  ): Promise<void> {
    await this.view.applyBatchUpdate(async () => {
      const updates = filePaths.map((fp, i) => {
        const file = this.view.app.vault.getAbstractFileByPath(fp);
        if (!file || !(file instanceof TFile)) return Promise.resolve();
        return this.view.app.fileManager.processFrontMatter(
          file,
          (fm: Record<string, unknown>) => {
            fm[groupByProp] = targetColumn;
            // Preserve relative order by assigning sequential indices
            fm[ORDER_PROPERTY] = i;
          },
        );
      });
      await Promise.all(updates);
    });
    this.clearSelection();
    new Notice(
      `Moved ${filePaths.length} card${filePaths.length > 1 ? "s" : ""} to "${targetColumn}"`,
    );
  }
}
