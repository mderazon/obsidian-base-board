import { setIcon, TFile, Notice, Menu, Keymap } from "obsidian";
import type { CardData } from "@base-board/board-core/types";
import { KanbanView } from "./kanban-view";
import {
  ORDER_PROPERTY,
  sanitizeFilename,
  DEFAULT_CHIP_COLOR,
} from "./constants";
import { getDropPosition, type PositionContext } from "./order";
import { relativeLuminance } from "./color-utils";
import { CardDetailModal } from "./card-detail-modal";

const IMAGE_EXTENSIONS = new Set([
  "apng",
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);

/** Check if a raw property value should be displayed. */
function isValuePresent(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === "string") return val.trim() !== "";
  if (typeof val === "boolean") return true; // BooleanValue(false) is explicit
  if (typeof val === "number") return true;
  if (Array.isArray(val)) return val.length > 0;
  return false;
}

/** Format a raw property value for chip display. */
function formatValueForChip(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean" || typeof val === "number") return String(val);
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    const parts: string[] = [];
    for (const item of val) {
      if (isValuePresent(item)) {
        parts.push(formatValueForChip(item));
      }
    }
    return parts.join(", ");
  }
  if (typeof val === "object") return ""; // skip objects
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- val is prIMITIVE at this point
  return String(val);
}

/**
 * Resolve a property value from CardData using a Bases-style property ID.
 * Strips the "note." prefix if present and looks up the key in properties.
 */
function resolvePropertyValue(card: CardData, propId: string): unknown {
  const key = propId.startsWith("note.") ? propId.slice(5) : propId;
  return card.properties[key];
}

/**
 * Extract the first image embed path from a TFile's markdown source.
 *
 * Matches `![[path]]` wiki-links, capturing only the file path before any
 * size modifier (e.g. `![[image|400]]`). Resolves via metadataCache and
 * checks against IMAGE_EXTENSIONS.
 */
function extractFirstEmbed(view: KanbanView, file: TFile): string | null {
  const cache = view.app.metadataCache.getFileCache(file);
  const links = cache?.links ?? [];

  // Try wikilinks first ([[...]])
  for (const link of links) {
    const resolved = view.app.metadataCache.getFirstLinkpathDest(
      link.link,
      file.path,
    );
    if (
      resolved instanceof TFile &&
      IMAGE_EXTENSIONS.has(resolved.extension.toLowerCase())
    ) {
      return view.app.vault.getResourcePath(resolved);
    }
  }

  // Try embeds (![[...]]) — Obsidian stores these separately from wikilinks
  const embeds = cache?.embeds ?? [];
  for (const embed of embeds) {
    if (!embed?.link) continue;
    const resolved = view.app.metadataCache.getFirstLinkpathDest(
      embed.link,
      file.path,
    );
    if (
      resolved instanceof TFile &&
      IMAGE_EXTENSIONS.has(resolved.extension.toLowerCase())
    ) {
      return view.app.vault.getResourcePath(resolved);
    }
  }

  return null;
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
    card: CardData,
    columnName: string,
  ): void {
    const filePath = card.filePath;
    const cardEl = cardsEl.createDiv({ cls: "base-board-card" });
    cardEl.setAttr("draggable", "true");
    cardEl.dataset.filePath = filePath;
    cardEl.dataset.columnName = columnName;

    const file = this.view.app.vault.getAbstractFileByPath(filePath);
    const coverProp = this.view.getCardCoverProperty();
    if (
      file instanceof TFile &&
      (coverProp || this.view.shouldUseFirstEmbed())
    ) {
      const src = this.getCardCoverSrc(file, card, coverProp);
      if (src) {
        this.renderCardThumbnail(cardEl, src);
      }
    }

    // Open the note on click; guard against accidental clicks after a drag
    let dragging = false;
    cardEl.addEventListener("dragstart", () => {
      dragging = true;
    });
    cardEl.addEventListener("dragend", () => {
      window.setTimeout(() => {
        dragging = false;
      }, 0);
    });

    cardEl.addEventListener("click", (e: MouseEvent) => {
      if (dragging) return;

      const isAlt = e.altKey;
      const isShift = e.shiftKey;
      const isMod = e.ctrlKey || e.metaKey;

      if ((isAlt || isShift) && !isMod) {
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

      // Handle standard Obsidian modifiers using Keymap.isModEvent(e)
      const mod = Keymap.isModEvent(e);
      if (mod) {
        e.preventDefault();
        void this.view.app.workspace.getLeaf(mod).openFile(file);
        return;
      }

      this.openFileWithBehavior(file);
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

    // ---- Chip properties (custom frontmatter value chips) ----
    this.renderChipProperties(cardEl, card);

    // ---- Card border color from configured border property ----
    const borderProp = this.view.chipProperties.getBorderProperty();
    if (borderProp) {
      const borderPropId = borderProp.startsWith("note.")
        ? borderProp
        : `note.${borderProp}`;
      const borderVal = resolvePropertyValue(card, borderPropId);
      if (isValuePresent(borderVal)) {
        const display = formatValueForChip(borderVal);
        if (display) {
          const borderColor = this.view.chipProperties.getColorForValue(
            borderProp,
            display,
          );
          if (borderColor) {
            cardEl.style.setProperty("--card-border-color", borderColor);
          }
        }
      }
    }

    const titleEl = cardEl.createDiv({ cls: "base-board-card-title" });

    // Respect cardTitleProperty if configured — use a frontmatter property
    // (e.g. "title") as the card heading instead of the filename.
    let cardTitle = card.displayName;
    const titleProp = this.view.config.get("cardTitleProperty") as
      | string
      | undefined;
    if (titleProp) {
      const propId = titleProp.startsWith("note.")
        ? titleProp
        : `note.${titleProp}`;
      const tv = resolvePropertyValue(card, propId);
      if (isValuePresent(tv)) {
        cardTitle = formatValueForChip(tv);
      }
    }
    titleEl.createSpan({ text: cardTitle });

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
    const visibleProps: string[] = this.view.config.getOrder();

    // Collect eligible chip descriptors in one pass so filtering logic lives
    // in one place.  No DOM is created yet.
    interface ChipDescriptor {
      propId: string;
      displayName: string;
      display: string;
    }

    const chips: ChipDescriptor[] = [];
    const chipPropNames = new Set(this.view.chipProperties.getChipProperties());
    const borderPropName = this.view.chipProperties.getBorderProperty();
    for (const propId of visibleProps) {
      if (chips.length >= 6) break;
      if (propId.startsWith("file.")) {
        if (FILE_PROPS_TO_SKIP.has(propId.slice(5))) continue;
      }
      const propName = propId.startsWith("note.") ? propId.slice(5) : propId;
      if (groupByProp && propName === groupByProp) continue;
      if (propName === ORDER_PROPERTY) continue;
      if (chipPropNames.has(propName)) continue;
      if (borderPropName && propName === borderPropName) continue;

      const val = resolvePropertyValue(card, propId);
      if (!isValuePresent(val)) continue;
      const display = formatValueForChip(val);
      if (!display) continue;

      chips.push({
        propId,
        displayName: this.view.config.getDisplayName(propId as never),
        display,
      });
    }

    const CHIP_VISIBLE = 4;

    // Render visible chips.
    for (let i = 0; i < chips.length && i < CHIP_VISIBLE; i++) {
      const { displayName, display, propId } = chips[i];
      this.renderChip(propsEl, displayName, display, propId);
    }

    // Overflow chips (if any) go into a collapsible container.
    let overflowEl: HTMLDivElement | null = null;
    for (let i = CHIP_VISIBLE; i < chips.length; i++) {
      if (!overflowEl) {
        overflowEl = propsEl.createDiv({
          cls: "base-board-card-chips-overflow",
        });
      }
      const { displayName, display, propId } = chips[i];
      this.renderChip(overflowEl, displayName, display, propId);
    }

    // ---- Expand toggle when chips exceed visible threshold ----
    if (overflowEl) {
      const overflowCount = chips.length - CHIP_VISIBLE;
      const toggleBtn = propsEl.createSpan({
        cls: "base-board-card-chip-more",
      });
      toggleBtn.setText(`+${overflowCount} more`);
      toggleBtn.addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation();
        const expanded = overflowEl.classList.toggle(
          "base-board-card-chips-overflow--expanded",
        );
        toggleBtn.setText(expanded ? "show less" : `+${overflowCount} more`);
      });
    }
  }

  /** Create a single chip span with label + value inside the given parent. */
  private renderChip(
    parent: HTMLElement,
    label: string,
    value: string,
    propId?: string,
  ): HTMLElement {
    const chip = parent.createSpan({ cls: "base-board-card-chip" });
    if (propId) chip.setAttr("data-property-id", propId);
    chip.createSpan({ text: label, cls: "base-board-chip-label" });
    chip.createSpan({ text: value, cls: "base-board-chip-value" });
    return chip;
  }

  /** Render custom frontmatter fields as colored value-only chips. */
  private renderChipProperties(parent: HTMLElement, card: CardData): void {
    const chipProps = this.view.chipProperties.getChipProperties();
    if (chipProps.length === 0) return;

    const container = parent.createDiv({
      cls: "base-board-chip-property-container",
    });

    for (const propName of chipProps) {
      const propId = propName.startsWith("note.")
        ? propName
        : `note.${propName}`;
      const val = resolvePropertyValue(card, propId);
      if (!isValuePresent(val)) continue;

      const display = formatValueForChip(val);
      if (!display) continue;

      this.renderChipProperty(container, propName, display);
    }
  }

  /** Render a single chip property pill. */
  private renderChipProperty(
    parent: HTMLElement,
    propName: string,
    value: string,
  ): void {
    const mode = this.view.chipProperties.getPropertyModes()[propName];

    // Resolve color and icon based on property mode
    let color: string | null = null;
    let chipIconName: string | null = null;
    let skipValueText = false;

    if (mode === "style-rules") {
      const match = this.view.chipProperties.getStyleRuleMatch(propName, value);
      if (match) {
        color = match.color;
        chipIconName = match.icon || null;
      } else if (
        this.view.chipProperties
          .getStyleRulesForProperty(propName)
          .some((r) => r.icon)
      ) {
        skipValueText = true;
      }
    } else {
      color = this.view.chipProperties.getColorForValue(propName, value);
      chipIconName = this.view.chipProperties.getChipIcon(propName, value);

      // If any value for this property has an icon, skip non-matching values
      const icons = this.view.chipProperties.getChipIcons();
      const propIcons = icons[propName] || {};
      if (Object.values(propIcons).some((v) => v) && !chipIconName) {
        skipValueText = true;
      }
    }

    // Skip rendering entirely when there's nothing to show (icon-only mode with no match)
    if (skipValueText && !chipIconName) return;

    const chip = parent.createSpan({ cls: "base-board-chip-property" });
    chip.setAttr("data-property-name", propName);

    const resolvedColor = color ?? (chipIconName ? DEFAULT_CHIP_COLOR : null);
    if (resolvedColor) {
      chip.style.setProperty("--chip-color", resolvedColor);
      if (relativeLuminance(resolvedColor) === "dark") {
        chip.addClass("base-board-chip-property-light");
      } else {
        chip.addClass("base-board-chip-property-dark");
      }
    }

    const showLabels = this.view.chipProperties.getShowLabels();
    const showIconLabels = this.view.chipProperties.getIconShowLabels();
    const showLabelBeforeIcon = chipIconName && showIconLabels[propName];
    if ((showLabels[propName] && !chipIconName) || showLabelBeforeIcon) {
      const propId = propName.startsWith("note.")
        ? propName
        : `note.${propName}`;
      const displayName = this.view.config.getDisplayName(propId as never);
      chip.createSpan({
        text: `${displayName}: `,
        cls: "base-board-chip-property-label",
      });
    }

    if (chipIconName) {
      chip.removeClass("base-board-chip-property");
      chip.addClass("base-board-chip-property-icon-only");
      const iconEl = chip.createSpan({
        cls: "base-board-chip-property-icon",
      });
      setIcon(iconEl, chipIconName);
    } else {
      chip.createSpan({ text: value, cls: "base-board-chip-property-value" });
    }
  }

  private openFileWithBehavior(file: TFile): void {
    const behavior = this.view.getCardOpenBehavior();
    if (behavior === "split") {
      if (
        this.view.detailLeaf &&
        this.view.isLeafAttached(this.view.detailLeaf)
      ) {
        this.view.detailLeaf
          .openFile(file)
          .catch((err) => new Notice(`Failed to open note: ${String(err)}`));
      } else {
        this.view.detailLeaf = this.view.app.workspace.getLeaf(
          "split",
          "vertical",
        );
        this.view.detailLeaf
          .openFile(file)
          .catch((err) => new Notice(`Failed to open note: ${String(err)}`));
      }
    } else if (behavior === "tab") {
      this.view.app.workspace
        .getLeaf("tab")
        .openFile(file)
        .catch((err) => new Notice(`Failed to open note: ${String(err)}`));
    } else if (behavior === "active") {
      this.view.app.workspace
        .getLeaf(false)
        .openFile(file)
        .catch((err) => new Notice(`Failed to open note: ${String(err)}`));
    } else {
      new CardDetailModal(this.view.app, file, this.view).open();
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
          this.openFileWithBehavior(file);
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
    existingCards: CardData[],
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
        await this.createNewCard(name, columnName, existingCards);
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
    existingCards: CardData[],
  ): Promise<void> {
    const groupByProp = this.view.getGroupByProperty();
    if (!groupByProp) {
      new Notice("Cannot create card: no group by property configured.");
      return;
    }

    // Compute position based on neighbors (Trello-style float positioning).
    // New cards append at the end, so position = last + 1_000_000.
    let position = 1_000_000;
    for (const card of existingCards) {
      const order = this.view.getFileOrder(card.filePath);
      if (order > position) {
        position = order;
      }
    }
    position += 1_000_000;

    const overrides = (fm: Record<string, unknown>) => {
      fm[groupByProp] = columnName;
      fm[ORDER_PROPERTY] = position;
    };

    try {
      await this.view.createFileForView(title, overrides);
    } catch (err) {
      new Notice(`Failed to create card: ${String(err)}`);
    }
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
      // Get the target column's cards so we can compute float positions
      // based on neighbors (Trello-style).
      const targetGroup = this.view.currentGroups.find(
        (g) => g.name === targetColumn,
      );
      const allCardsInColumn = targetGroup?.cards ?? [];

      const ctx: PositionContext = {
        getFileOrder: (fp: string) => this.view.getFileOrder(fp),
      };

      const updates = filePaths.map((fp, i) => {
        const file = this.view.app.vault.getAbstractFileByPath(fp);
        if (!file || !(file instanceof TFile)) return Promise.resolve();
        // Compute position from neighbors in the target column
        const position = getDropPosition(i, filePaths, allCardsInColumn, ctx);
        return this.view.app.fileManager.processFrontMatter(
          file,
          (fm: Record<string, unknown>) => {
            fm[groupByProp] = targetColumn;
            fm[ORDER_PROPERTY] = position;
          },
        );
      });
      await Promise.all(updates);

      // Check if adjacent gaps shrank too small and renormalize if needed.
      await this.view.checkAndRenormalize(targetColumn);
    });
    this.clearSelection();
    new Notice(
      `Moved ${filePaths.length} card${filePaths.length > 1 ? "s" : ""} to "${targetColumn}"`,
    );
  }

  private getCardCoverSrc(
    file: TFile,
    card: CardData,
    coverPropName: string | null,
  ): string | null {
    // Guard against prototype pollution keys even if coverPropName is set
    if (coverPropName === "__proto__" || coverPropName === "constructor")
      return null;

    // 1. Try frontmatter first (only if a property name is configured)
    if (coverPropName) {
      const cache = this.view.app.metadataCache.getFileCache(file);
      const rawValue: unknown = cache?.frontmatter?.[coverPropName];
      if (
        rawValue &&
        (typeof rawValue === "string" || typeof rawValue === "number")
      ) {
        const src = this.resolveCoverString(String(rawValue), file);
        if (src) return src;
      }
    }

    // 2. Try first embed if enabled
    if (this.view.shouldUseFirstEmbed()) {
      const embedSrc = extractFirstEmbed(this.view, file);
      if (embedSrc) return embedSrc;
    }

    return null;
  }

  private resolveCoverString(rawValue: string, file: TFile): string | null {
    if (!rawValue) return null;

    if (/^https?:\/\//i.test(rawValue)) return rawValue;

    const cleanPath = rawValue
      .replace(/^!?\[\[(.*?)\]\]$/, "$1")
      .split("|")[0]
      .split("#")[0]
      .trim();

    if (!cleanPath) return null;

    const resolved = this.view.app.metadataCache.getFirstLinkpathDest(
      cleanPath,
      file.path,
    );

    if (
      resolved instanceof TFile &&
      IMAGE_EXTENSIONS.has(resolved.extension.toLowerCase())
    ) {
      return this.view.app.vault.getResourcePath(resolved);
    }

    return null;
  }

  private renderCardThumbnail(cardEl: HTMLElement, src: string): void {
    const thumbEl = activeDocument.createElement("div");
    thumbEl.className = "base-board-card-thumbnail";
    const thumbImg = thumbEl.createEl("img", {
      cls: "base-board-card-thumbnail-img",
      attr: { src, loading: "lazy", draggable: "false" },
    });
    thumbImg.addEventListener("error", () => {
      thumbEl.remove();
      cardEl.removeClass("base-board-card--has-thumbnail");
    });
    cardEl.prepend(thumbEl);
    cardEl.addClass("base-board-card--has-thumbnail");
  }
}
