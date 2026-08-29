import { setIcon, TFile, Notice, Menu, Keymap, Platform } from "obsidian";
import type { CardData } from "@base-board/board-core/types";
import { LazyList } from "@base-board/board-core";
import { KanbanView } from "./kanban-view";
import { ORDER_PROPERTY, DEFAULT_CHIP_COLOR } from "./constants";
import { relativeLuminance } from "@base-board/board-core";
import { CardDetailModal } from "./card-detail-modal";
import { resolveChipColor, type RenderContext } from "./render-context";
import { matchStyleRule, FILE_PROPS_TO_SKIP } from "./chip-properties";
import { CardCoverRenderer } from "./card-cover";
import { CardActionManager } from "./card-actions";
import { CardSelectionManager } from "./card-selection";

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

export class CardManager {
  private view: KanbanView;
  /** Cover resolution + thumbnails (card-cover.ts). */
  public readonly cover: CardCoverRenderer;
  /** Card edit menu / rename / inline creation (card-actions.ts). */
  public readonly actions: CardActionManager;
  /** Multi-select + batch move (card-selection.ts). */
  public readonly selection: CardSelectionManager;

  constructor(view: KanbanView) {
    this.view = view;
    this.cover = new CardCoverRenderer(view);
    this.actions = new CardActionManager(view);
    this.selection = new CardSelectionManager(view);
  }

  // ---------------------------------------------------------------------------
  //  Lazy card rendering (virtualization)
  //
  //  renderCard only creates a lightweight shell; the full card DOM is built
  //  by hydrateCard when the shell approaches the column's viewport. Shells
  //  carry the same classes/dataset as real cards so event delegation and
  //  drag-drop ordering keep working unchanged.
  // ---------------------------------------------------------------------------

  private lazyLists = new Map<HTMLElement, LazyList>();

  /** Create (or replace) the lazy list for a column's cards container. */
  public beginLazyColumn(cardsEl: HTMLElement): void {
    this.lazyLists.get(cardsEl)?.destroy();
    this.lazyLists.set(cardsEl, new LazyList(cardsEl));
  }

  /** Get the lazy list for a container, creating it if needed (no reset). */
  public ensureLazyColumn(cardsEl: HTMLElement): LazyList {
    let list = this.lazyLists.get(cardsEl);
    if (!list) {
      list = new LazyList(cardsEl);
      this.lazyLists.set(cardsEl, list);
    }
    return list;
  }

  /** Drop the lazy list for a removed container. */
  public dropLazyColumn(cardsEl: HTMLElement): void {
    this.lazyLists.get(cardsEl)?.destroy();
    this.lazyLists.delete(cardsEl);
  }

  /** Rebuild an existing card element's content in place (no reposition). */
  public rerenderCardContent(
    cardEl: HTMLElement,
    card: CardData,
    columnName: string,
    ctx: RenderContext,
  ): void {
    cardEl.empty();
    this.hydrateCard(cardEl, card, columnName, ctx);
  }

  /** Disconnect all observers (call at the start of each board render). */
  public resetLazyColumns(): void {
    for (const list of this.lazyLists.values()) list.destroy();
    this.lazyLists.clear();
  }

  public renderCard(
    cardsEl: HTMLElement,
    card: CardData,
    columnName: string,
    ctx: RenderContext,
    hydrateNow = false,
  ): HTMLElement {
    const filePath = card.filePath;
    const cardEl = cardsEl.createDiv({
      cls: "base-board-card base-board-card--virtual",
    });
    cardEl.setAttr("draggable", "true");
    cardEl.dataset.filePath = filePath;
    cardEl.dataset.columnName = columnName;
    cardEl.setAttribute("tabindex", "-1");

    // Estimated height keeps the scrollbar and scroll restoration roughly
    // stable for cards that are never scrolled near (and thus never hydrated).
    const file = this.view.app.vault.getAbstractFileByPath(filePath);
    const hasCover =
      file instanceof TFile &&
      Boolean(ctx.coverProperty || ctx.useFirstEmbed) &&
      this.cover.getCoverSrc(file, card, ctx) !== null;
    cardEl.style.minHeight = hasCover ? "176px" : "72px";

    const list = this.lazyLists.get(cardsEl);
    list?.register(cardEl, () => {
      this.hydrateCard(cardEl, card, columnName, ctx);
    });
    if (hydrateNow) {
      list?.hydrateNow(cardEl);
    }
    return cardEl;
  }

  /** Build the full card DOM inside a previously created shell. */
  private hydrateCard(
    cardEl: HTMLElement,
    card: CardData,
    columnName: string,
    ctx: RenderContext,
  ): void {
    const filePath = card.filePath;

    const file = this.view.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile && (ctx.coverProperty || ctx.useFirstEmbed)) {
      const src = this.cover.getCoverSrc(file, card, ctx);
      if (src) {
        this.cover.renderThumbnail(cardEl, src);
      }
    }

    const tagContainerEl = cardEl.createDiv({
      cls: "base-board-tag-container",
    });
    const fileTags = ctx.tagsOf(filePath);
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

    // ---- Chip properties (custom frontmatter value chips) ----
    this.renderChipProperties(cardEl, card, ctx);

    // ---- Card border color from configured border property ----
    const borderProp = ctx.borderProperty;
    if (borderProp) {
      const borderPropId = borderProp.startsWith("note.")
        ? borderProp
        : `note.${borderProp}`;
      const borderVal = resolvePropertyValue(card, borderPropId);
      if (isValuePresent(borderVal)) {
        const display = formatValueForChip(borderVal);
        if (display) {
          const borderColor = resolveChipColor(ctx, borderProp, display);
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
    const titleProp = ctx.cardTitleProperty;
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

    // ---- Edit button (visible on hover; icon injected lazily by the
    // delegated mouseover handler to avoid 300 SVGs per board render) ----
    cardEl.createDiv({ cls: "base-board-card-edit-btn" });

    // ---- Property chips ----
    const propsEl = cardEl.createDiv({ cls: "base-board-card-props" });
    const groupByProp = ctx.groupByProp;
    const visibleProps: string[] = ctx.visibleProps;

    // Collect eligible chip descriptors in one pass so filtering logic lives
    // in one place.  No DOM is created yet.
    interface ChipDescriptor {
      propId: string;
      displayName: string;
      display: string;
    }

    const chips: ChipDescriptor[] = [];
    const chipPropNames = ctx.chipPropNames;
    const borderPropName = ctx.borderProperty;
    for (const propId of visibleProps) {
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
        displayName: ctx.displayName(propId),
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
    }

    // Hand size estimation back to content-visibility so offscreen skipped
    // layout uses a per-card approximation instead of the generic 120px.
    const isCover = cardEl.querySelector(".base-board-card-thumbnail") !== null;
    cardEl.style.containIntrinsicSize = `auto ${isCover ? 176 : 72}px`;
    cardEl.removeClass("base-board-card--virtual");
    cardEl.style.removeProperty("min-height");
  }

  // ---------------------------------------------------------------------------
  //  Delegated card events
  //
  //  One listener set per column's .base-board-cards container instead of
  //  ~7 listeners per card. On a 300-card board this replaces ~2000 listener
  //  registrations with a handful.
  // ---------------------------------------------------------------------------

  /** Timestamp of the last card dragend — guards clicks right after a drag. */
  private lastDragEnd = 0;

  /**
   * Attach delegated listeners for all cards inside the given container.
   * Call once when the container is created (per render).
   */
  public attachCardContainerListeners(cardsEl: HTMLElement): void {
    cardsEl.addEventListener("dragend", () => {
      this.lastDragEnd = Date.now();
    });

    cardsEl.addEventListener("click", (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // "+N more" chip overflow toggle
      const moreBtn = target.closest<HTMLElement>(".base-board-card-chip-more");
      if (moreBtn && cardsEl.contains(moreBtn)) {
        e.stopPropagation();
        const overflow = moreBtn.parentElement?.querySelector(
          ".base-board-card-chips-overflow",
        );
        if (overflow) {
          const expanded = overflow.classList.toggle(
            "base-board-card-chips-overflow--expanded",
          );
          const count = overflow.children.length;
          moreBtn.setText(expanded ? "show less" : `+${count} more`);
        }
        return;
      }

      // Edit (pencil) button — open the card action menu
      const editBtn = target.closest<HTMLElement>(".base-board-card-edit-btn");
      const cardEl = target.closest<HTMLElement>(".base-board-card");
      if (editBtn && cardEl && cardEl.contains(editBtn)) {
        e.stopPropagation();
        const filePath = cardEl.dataset.filePath ?? "";
        const titleEl = cardEl.querySelector<HTMLElement>(
          ".base-board-card-title",
        );
        if (filePath && titleEl) {
          this.actions.showCardActionMenu(editBtn, filePath, titleEl);
        }
        return;
      }

      if (!cardEl || !cardsEl.contains(cardEl)) return;
      if (Date.now() - this.lastDragEnd < 100) return;

      const filePath = cardEl.dataset.filePath ?? "";
      const columnName = cardEl.dataset.columnName ?? "";

      const isAlt = e.altKey;
      const isShift = e.shiftKey;
      const isMod = e.ctrlKey || e.metaKey;

      if ((isAlt || isShift) && !isMod) {
        e.preventDefault();
        this.selection.handleCardSelect(filePath, columnName, isShift);
        return;
      }

      // If there are selected cards, clear them on a plain click instead of opening
      if (this.view.selectedCards.size > 0) {
        this.selection.clearSelection();
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
    cardsEl.addEventListener("auxclick", (e: MouseEvent) => {
      if (e.button !== 1) return;
      const cardEl = (e.target as HTMLElement).closest<HTMLElement>(
        ".base-board-card",
      );
      if (!cardEl || !cardsEl.contains(cardEl)) return;
      const file = this.view.app.vault.getAbstractFileByPath(
        cardEl.dataset.filePath ?? "",
      );
      if (!(file instanceof TFile)) return;
      void this.view.app.workspace.getLeaf("tab").openFile(file);
    });

    // Keyboard: Escape clears multi-selection when a card is focused
    cardsEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        this.view.selectedCards.size > 0 &&
        (e.target as HTMLElement).closest(".base-board-card")
      ) {
        e.preventDefault();
        this.selection.clearSelection();
      }
    });

    // Hover → lazy edit-btn icon + native Obsidian page-preview popover
    // (same as hovering a [[wikilink]]). mouseover bubbles, so ignore events
    // moving between children of the same card.
    cardsEl.addEventListener("mouseover", (e: MouseEvent) => {
      const cardEl = (e.target as HTMLElement).closest<HTMLElement>(
        ".base-board-card",
      );
      if (!cardEl || !cardsEl.contains(cardEl)) return;
      if (cardEl.contains(e.relatedTarget as Node)) return;

      const editBtn = cardEl.querySelector<HTMLElement>(
        ".base-board-card-edit-btn",
      );
      if (editBtn && editBtn.childNodes.length === 0) {
        setIcon(editBtn, "lucide-pencil");
      }

      const filePath = cardEl.dataset.filePath;
      if (!filePath) return;
      this.view.app.workspace.trigger("hover-link", {
        event: e,
        source: "base-board",
        hoverParent: this.view,
        targetEl: cardEl,
        linktext: filePath,
      });
    });

    // Right-click → batch move menu when cards are selected, otherwise
    // standard file menu
    cardsEl.addEventListener("contextmenu", (e: MouseEvent) => {
      const cardEl = (e.target as HTMLElement).closest<HTMLElement>(
        ".base-board-card",
      );
      if (!cardEl || !cardsEl.contains(cardEl)) return;
      e.preventDefault();
      if (Platform.isMobile) return;
      const filePath = cardEl.dataset.filePath ?? "";
      const file = this.view.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;

      // If this card is part of a multi-selection, show the batch move menu
      if (
        this.view.selectedCards.size > 1 &&
        this.view.selectedCards.has(filePath)
      ) {
        this.selection.showBatchMoveMenu(e);
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
  private renderChipProperties(
    parent: HTMLElement,
    card: CardData,
    ctx: RenderContext,
  ): void {
    const chipProps = ctx.chipProps;
    if (chipProps.length === 0) return;

    const container = parent.createDiv({
      cls: "base-board-chip-property-container",
    });

    // Load persisted newline positions (indices into the chip property list).
    const newlinePositions = ctx.newlinePositions;

    for (let i = 0; i < chipProps.length; i++) {
      // Insert a separator before this property if its position matches.
      if (newlinePositions.has(i)) {
        container.createEl("div", { cls: "base-board-chip-newline" });
      }

      const propName = chipProps[i];
      const propId = propName.startsWith("note.")
        ? propName
        : `note.${propName}`;
      const val = resolvePropertyValue(card, propId);
      if (!isValuePresent(val)) continue;

      const display = formatValueForChip(val);
      if (!display) continue;

      this.renderChipProperty(container, propName, display, ctx);
    }
  }

  /** Render a single chip property pill. */
  private renderChipProperty(
    parent: HTMLElement,
    propName: string,
    value: string,
    ctx: RenderContext,
  ): void {
    const mode = ctx.propertyModes[propName];

    // Resolve color and icon based on property mode
    let color: string | null = null;
    let chipIconName: string | null = null;
    let skipValueText = false;

    const propStyleRules = ctx.styleRules[propName] ?? [];

    if (mode === "style-rules") {
      const match = matchStyleRule(propStyleRules, value);
      if (match) {
        color = match.color;
        chipIconName = match.icon || null;
      } else if (propStyleRules.some((r) => r.icon)) {
        skipValueText = true;
      }
    } else {
      color = resolveChipColor(ctx, propName, value);
      const icon = ctx.chipIcons[propName]?.[value];
      chipIconName =
        typeof icon === "string" && icon.trim() !== "" ? icon.trim() : null;

      // If any value for this property has an icon, skip non-matching values
      const propIcons = ctx.chipIcons[propName] || {};
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

    const showLabels = ctx.showLabels;
    const showIconLabels = ctx.iconShowLabels;
    const showLabelBeforeIcon = chipIconName && showIconLabels[propName];
    if ((showLabels[propName] && !chipIconName) || showLabelBeforeIcon) {
      const propId = propName.startsWith("note.")
        ? propName
        : `note.${propName}`;
      const displayName = ctx.displayName(propId);
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

  public openFileWithBehavior(file: TFile): void {
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
}
