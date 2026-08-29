import { setIcon, TFile, Notice, Menu, Platform } from "obsidian";
import type { CardData, Column } from "@base-board/board-core/types";
import { KanbanView } from "./kanban-view";
import { InputModal } from "./modals";
import { NO_VALUE_COLUMN } from "./constants";
import { ColorPickerModal } from "./tags";
import { WipLimitModal } from "./modals";
import type { RenderContext } from "./render-context";

export class ColumnManager {
  private view: KanbanView;

  constructor(view: KanbanView) {
    this.view = view;
  }

  public renderColumn(
    boardEl: HTMLElement,
    columnName: string,
    column: Column | null,
    columnIndex: number,
    ctx: RenderContext,
  ): void {
    const isNoValue = columnName === NO_VALUE_COLUMN;
    const cards = column ? column.cards : [];

    // Sort cards up-front so the header add-card button can reference sorted.length.
    // Cards without a kanban_order sort last; mapping them to MAX_SAFE_INTEGER
    // keeps the comparator finite (NaN from Infinity-Infinity would make the
    // sort order undefined). V8's sort is stable, so ties keep entry order.
    const sortPos = (c: CardData): number => {
      const o = ctx.orderOf(c.filePath);
      return Number.isFinite(o) ? o : Number.MAX_SAFE_INTEGER;
    };
    const sorted = [...cards].sort(
      (a: CardData, b: CardData) => sortPos(a) - sortPos(b),
    );

    const activeFilters = this.view.tags.activeFilters;
    const visibleCards =
      activeFilters.size > 0
        ? sorted.filter((card) => {
            // Tags come from the per-render snapshot (no per-card cache lookups)
            const fileTags = ctx.tagsOf(card.filePath);
            return Array.from(activeFilters).some((filter) =>
              fileTags.includes(filter),
            );
          })
        : sorted;

    const columnEl = boardEl.createDiv({ cls: "base-board-column" });
    columnEl.dataset.columnName = columnName;
    columnEl.dataset.columnIndex = String(columnIndex);

    // ---- WIP limit check ----
    const wipLimit = column?.wipLimit ?? this.view.getWipLimit(columnName);
    if (wipLimit !== null && cards.length > wipLimit) {
      columnEl.addClass("base-board-column--wip-overflow");
    }

    const columnColor = this.view.getColumnColor(columnName);
    if (columnColor) {
      columnEl.style.setProperty("--column-color", columnColor);
      const accentEl = columnEl.createDiv({ cls: "base-board-column-accent" });
      accentEl.style.backgroundColor = columnColor;
    }

    // ---- Header ----
    const headerEl = columnEl.createDiv({ cls: "base-board-column-header" });
    headerEl.setAttr("draggable", "true");

    const dragHandle = headerEl.createDiv({
      cls: "base-board-column-drag-handle",
    });
    setIcon(dragHandle, "grip-vertical");

    // Title + inline count badge
    const titleEl = headerEl.createSpan({
      text: columnName,
      cls: "base-board-column-title",
    });
    if (isNoValue) {
      titleEl.addClass("base-board-no-value-title");
    }

    // Count badge sits right after the title, inline
    // Show "count / limit" when a WIP limit is set
    const countText =
      wipLimit !== null
        ? `${cards.length} / ${wipLimit}`
        : String(cards.length);
    const countEl = headerEl.createSpan({
      text: countText,
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
        this.view.cardManager.actions.startInlineCardCreation(
          addCardHeaderBtn!,
          columnName,
        );
      });
    }

    // ---- Column menu button (for mobile, also desktop convenience) ----
    let menuBtn: HTMLElement | null = null;
    if (!isNoValue) {
      menuBtn = headerEl.createDiv({
        cls: "base-board-column-menu-btn",
      });
      setIcon(menuBtn, "more-horizontal");
      menuBtn.addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation();
        this.showColumnMenu(
          e,
          columnName,
          cards,
          titleEl,
          countEl,
          addCardHeaderBtn,
          menuBtn,
        );
      });
    }

    // ---- Right-click context menu on header ----
    headerEl.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      if (Platform.isMobile) return;
      this.showColumnMenu(
        e,
        columnName,
        cards,
        titleEl,
        countEl,
        addCardHeaderBtn,
        menuBtn,
      );
    });

    // ---- Cards container ----
    const cardsEl = columnEl.createDiv({ cls: "base-board-cards" });
    this.view.cardManager.attachCardContainerListeners(cardsEl);
    this.view.cardManager.ensureLazyColumn(cardsEl);

    visibleCards.forEach((card) => {
      this.view.cardManager.renderCard(cardsEl, card, columnName, ctx);
    });
  }

  public renderAddColumnButton(boardEl: HTMLElement): void {
    const addBtn = boardEl.createDiv({ cls: "base-board-add-column-btn" });
    setIcon(addBtn.createSpan(), "plus");
    addBtn.createSpan({ text: "Add column" });
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
        this.view.scheduleUpdate();
      },
    ).open();
  }

  public handleDeleteColumn(columnName: string): void {
    const columns = this.view.getColumns().filter((c) => c !== columnName);
    this.view.saveColumns(columns);
    this.view.scheduleUpdate();
  }

  private showColumnMenu(
    e: MouseEvent,
    columnName: string,
    cards: CardData[],
    titleEl: HTMLElement,
    countEl?: HTMLElement | null,
    addCardHeaderBtn?: HTMLElement | null,
    menuBtn?: HTMLElement | null,
  ): void {
    // Resolve the LIVE column identity — the caller's closures go stale as
    // soon as the reconciler renames/updates the column.
    const colEl = (e.target as HTMLElement).closest<HTMLElement>(
      ".base-board-column",
    );
    const liveName = colEl?.dataset.columnName ?? columnName;
    const liveCards =
      this.view.currentGroups.find((g) => g.name === liveName)?.cards ?? cards;

    const isNoValue = liveName === NO_VALUE_COLUMN;
    const menu = new Menu();

    if (!isNoValue) {
      menu.addItem((item) => {
        item
          .setTitle("Rename column")
          .setIcon("lucide-pencil")
          .onClick(() => {
            this.startColumnRename(
              titleEl,
              liveName,
              liveCards,
              countEl,
              addCardHeaderBtn,
              menuBtn,
            );
          });
      });
      menu.addSeparator();
    }

    const currentColor = this.view.getColumnColor(liveName) ?? "";
    menu.addItem((item) => {
      item
        .setTitle("Change color")
        .setIcon("lucide-palette")
        .onClick(() => {
          new ColorPickerModal(
            this.view.app,
            liveName,
            currentColor,
            (color) => {
              this.view.setColumnColor(liveName, color);
            },
          ).open();
        });
    });

    const currentWipLimit = this.view.getWipLimit(liveName);
    menu.addItem((item) => {
      item
        .setTitle(
          currentWipLimit !== null
            ? `WIP limit: ${currentWipLimit}`
            : "Set WIP limit",
        )
        .setIcon("lucide-gauge")
        .onClick(() => {
          new WipLimitModal(
            this.view.app,
            liveName,
            currentWipLimit,
            (limit) => {
              this.view.setWipLimit(liveName, limit);
            },
          ).open();
        });
    });
    menu.addSeparator();

    menu.addItem((item) => {
      item
        .setTitle(
          liveCards.length > 0
            ? `Delete column (${liveCards.length} card${liveCards.length > 1 ? "s" : ""} will remain)`
            : "Delete column",
        )
        .setIcon("lucide-trash-2")
        .setWarning(true)
        .onClick(() => {
          this.handleDeleteColumn(liveName);
        });
    });

    menu.showAtMouseEvent(e);
  }

  public startColumnRename(
    titleEl: HTMLElement,
    oldName: string,
    cards: CardData[],
    countEl?: HTMLElement | null,
    addCardBtn?: HTMLElement | null,
    menuBtn?: HTMLElement | null,
  ): void {
    // Resolve the LIVE header elements: the caller's references are
    // render-time closures and go stale once the reconciler has patched the
    // header (e.g. renaming the same column twice in a row).
    const colEl = this.view.containerEl.querySelector<HTMLElement>(
      `.base-board-column[data-column-name="${CSS.escape(oldName)}"]`,
    );
    const headerEl =
      colEl?.querySelector<HTMLElement>(".base-board-column-header") ?? null;
    titleEl =
      headerEl?.querySelector<HTMLElement>(".base-board-column-title") ??
      titleEl;
    countEl =
      headerEl?.querySelector<HTMLElement>(".base-board-column-count") ??
      countEl;
    addCardBtn =
      headerEl?.querySelector<HTMLElement>(".base-board-column-add-card") ??
      addCardBtn;
    menuBtn =
      headerEl?.querySelector<HTMLElement>(".base-board-column-menu-btn") ??
      menuBtn;

    const input = activeDocument.createElement("input");
    input.type = "text";
    input.value = oldName;
    input.className = "base-board-column-title-input";

    // Hide count and + during editing so the input can use the full width
    if (countEl) countEl.classList.add("base-board-hidden");
    if (addCardBtn) addCardBtn.classList.add("base-board-hidden");
    if (menuBtn) menuBtn.classList.add("base-board-hidden");

    const restoreChrome = () => {
      if (countEl) countEl.classList.remove("base-board-hidden");
      if (addCardBtn) addCardBtn.classList.remove("base-board-hidden");
      if (menuBtn) menuBtn.classList.remove("base-board-hidden");
    };

    // Replace the span with the input
    const restoreTitle = (text: string) => {
      const titleSpan = activeDocument.createElement("span");
      titleSpan.className = "base-board-column-title";
      if (oldName === NO_VALUE_COLUMN) {
        titleSpan.classList.add("base-board-no-value-title");
      }
      titleSpan.setText(text);
      input.replaceWith(titleSpan);
    };
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
        // Optimistic header update — the reconciler syncs everything else
        restoreTitle(newName);
        void this.handleRenameColumn(oldName, newName, cards);
      } else {
        restoreTitle(oldName);
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
        restoreTitle(oldName);
      }
    });
    input.addEventListener("blur", commit);
  }

  private async handleRenameColumn(
    oldName: string,
    newName: string,
    cards: CardData[],
  ): Promise<void> {
    const columns = this.view.getColumns();

    // The card list to rewrite must be complete even when Bases' data is
    // stale mid-rename: union the live group with the column's DOM cards
    // (the reconciler keeps the DOM in sync, shells included).
    const pathSet = new Set<string>();
    for (const card of this.view.currentGroups.find((g) => g.name === oldName)
      ?.cards ?? []) {
      pathSet.add(card.filePath);
    }
    const colEl = this.view.containerEl.querySelector<HTMLElement>(
      `.base-board-column[data-column-name="${CSS.escape(oldName)}"]`,
    );
    colEl?.querySelectorAll<HTMLElement>(".base-board-card").forEach((el) => {
      const p = el.dataset.filePath;
      if (p) pathSet.add(p);
    });
    const freshCards: CardData[] = [...pathSet].map((filePath) => ({
      filePath,
      displayName: "",
      properties: {},
    }));

    // Renaming onto an existing column name merges: all cards move to the
    // target column and the old name is dropped from the config.
    const merge = columns.includes(newName);

    const groupByProp = this.view.getGroupByProperty();

    // Let the reconciler shield this column while Bases propagates the
    // rename (partial/empty mid-regroup waves), and restore its scroll
    // position if a full render happens anyway.
    this.view.registerColumnRename(oldName, newName, freshCards.length);

    await this.view.applyBatchUpdate(async () => {
      // 1. Update column config
      const updatedColumns = merge
        ? columns.filter((c) => c !== oldName)
        : columns.map((c) => (c === oldName ? newName : c));
      this.view.saveColumns(updatedColumns);

      // 2. Migrate per-column config keyed by name (colors, WIP limits)
      this.view.migrateColumnKeyedConfig(oldName, merge ? newName : null);

      // 3. Update frontmatter for all cards in this column
      if (groupByProp) {
        const updatePromises = freshCards.map((card) => {
          const file = this.view.app.vault.getAbstractFileByPath(card.filePath);
          if (!file || !(file instanceof TFile)) return Promise.resolve();
          return this.view.app.fileManager.processFrontMatter(
            file,
            (fm: Record<string, unknown>) => {
              this.view.applyGroupByValue(fm, groupByProp, newName);
            },
          );
        });
        await Promise.all(updatePromises);
      }
    });
  }
}
