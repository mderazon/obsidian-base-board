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
    // Hide the button and show an input
    btnEl.classList.add("base-board-hidden");

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
      btnEl.classList.remove("base-board-hidden");
      if (name) {
        await this.createNewCard(name, columnName, existingCount);
      }
    };

    const cancel = () => {
      committed = true;
      inputWrapper.remove();
      btnEl.classList.remove("base-board-hidden");
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
