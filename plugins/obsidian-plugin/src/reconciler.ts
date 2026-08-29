import type { CardData, Column } from "@base-board/board-core/types";
import { NullValue, TFile } from "obsidian";
import type { KanbanView } from "./kanban-view";
import {
  CONFIG_KEY_COLUMNS,
  NO_VALUE_COLUMN,
  ORDER_PROPERTY,
} from "./constants";
import { createRenderContext, type RenderContext } from "./render-context";

/**
 * BoardReconciler — incremental DOM updates driven by data changes.
 *
 * Instead of tearing down and rebuilding the whole board on every
 * onDataUpdated (the old render() path), this diffs fresh column/card data
 * against the existing DOM and patches minimally:
 *
 *   - columns: added / removed / reordered elements (keyed by name, with
 *     card-set based rename detection so a column rename only changes the
 *     header text, exactly like Trello)
 *   - cards:   added / removed / repositioned elements (keyed by file path)
 *   - card content: rebuilt in place only when the card's data fingerprint
 *     (frontmatter, tags, title) actually changed
 *
 * Scroll positions, multi-selection and virtualized (not-yet-hydrated)
 * shells all survive an update untouched.
 */
export class BoardReconciler {
  private view: KanbanView;
  /** filePath → content fingerprint, populated for every card seen. */
  private fingerprints = new Map<string, string>();
  /** Last rendered filter bar fingerprint ("" = unknown). */
  private filterBarFp = "";

  constructor(view: KanbanView) {
    this.view = view;
  }

  /** Called after a full render — the fresh DOM has no diff history. */
  public invalidate(): void {
    this.fingerprints.clear();
    this.filterBarFp = "";
  }

  // ---------------------------------------------------------------------------
  //  Entry point
  // ---------------------------------------------------------------------------

  public update(): void {
    const boardEl = this.view.containerEl.querySelector(".base-board-board");
    if (!(boardEl instanceof HTMLElement)) {
      // No board DOM yet (or placeholder shown) — fall back to full render.
      this.view.render();
      return;
    }

    // Remove drag leftovers — a successful drop leaves the placeholder in
    // place (dragend skips cleanup) and the reconciler takes over from here.
    boardEl
      .querySelectorAll(
        ".base-board-card-placeholder, .base-board-column-placeholder",
      )
      .forEach((el) => el.remove());

    const groupedData = this.view.refreshGroups();
    const hasGroupBy =
      groupedData.length > 1 ||
      (groupedData.length === 1 &&
        groupedData[0].key !== undefined &&
        !(groupedData[0].key instanceof NullValue));

    const stored =
      (this.view.config?.get(CONFIG_KEY_COLUMNS) as string[] | undefined) ?? [];
    const shouldShowPlaceholder =
      !hasGroupBy && groupedData.length <= 1 && stored.length === 0;
    if (shouldShowPlaceholder) {
      this.view.render();
      return;
    }

    const ctx = createRenderContext(this.view);
    const columns = this.view.getColumns();
    const names = this.view.currentGroups.map((g) => g.name);
    const groupMap = new Map<string, Column | null>(
      this.view.currentGroups.map((g) => [g.name, g]),
    );

    // ---- Recent renames -------------------------------------------------
    // While the groupBy rewrite propagates, Bases re-queries in waves and
    // mid-regroup waves report the renamed column as empty or partial —
    // and can still list the OLD column name while the stored config
    // already has the NEW one. All shielding logic lives in the tracker.
    const renames = this.view.renameTracker;
    const groupSizes = new Map<string, number>();
    for (const [name, group] of groupMap) {
      groupSizes.set(name, group?.cards.length ?? 0);
    }
    renames.refresh(names, groupSizes);
    renames.suppressFromColumns(columns, names);
    renames.carryGroups(groupMap);

    // ---- Match existing column elements to the new column list ----
    const colEls = new Map<string, HTMLElement>();
    boardEl
      .querySelectorAll<HTMLElement>(".base-board-column")
      .forEach((el) => {
        const name = el.dataset.columnName;
        if (name && !colEls.has(name)) colEls.set(name, el);
      });

    const matched = new Map<string, HTMLElement>();
    for (const name of columns) {
      // Rename claim: if this column was just renamed, adopt the old
      // column's existing element — settled or not. (Without this, a fast
      // settle would remove+create instead — visible as a flash.) The
      // tracker's chain walk handles back-to-back renames (A→B→C) where
      // the DOM element may still carry any earlier name in the chain.
      const el = renames.claimElement(name, colEls);
      if (el) matched.set(name, el);
    }

    // Rename detection: an unmatched old column whose card set exactly
    // equals an unmatched new column's card set is the same column renamed.
    // (Compare by ELEMENT: a claimed element's name key stays "unmatched".)
    const claimedEls = new Set(matched.values());
    const unmatchedNew = columns.filter((n) => !matched.has(n));
    const unmatchedOld = [...colEls.entries()]
      .filter(([, el]) => !claimedEls.has(el))
      .map(([n]) => n);
    for (const newName of unmatchedNew) {
      const newPathSet = new Set(
        groupMap.get(newName)?.cards.map((c) => c.filePath) ?? [],
      );
      for (const oldName of unmatchedOld) {
        const oldEl = colEls.get(oldName);
        if (!oldEl) continue;
        const oldPathSet = new Set(
          [...oldEl.querySelectorAll<HTMLElement>(".base-board-card")].map(
            (el) => el.dataset.filePath ?? "",
          ),
        );
        if (setsEqual(oldPathSet, newPathSet)) {
          matched.set(newName, oldEl);
          unmatchedOld.splice(unmatchedOld.indexOf(oldName), 1);
          break;
        }
      }
    }

    // ---- Remove columns that no longer exist ----
    // Compare elements (not names): the tracker may claim the old column's
    // element under the new name. Also never remove an element whose name
    // is involved in a recent rename — a mid-propagation wave can
    // transiently break the match, and removing it shows as a flash.
    const matchedEls = new Set(matched.values());
    for (const el of colEls.values()) {
      if (matchedEls.has(el)) continue;
      if (renames.isRenameInvolved(el.dataset.columnName ?? "")) continue;
      const cardsEl = el.querySelector(".base-board-cards");
      if (cardsEl instanceof HTMLElement) {
        this.view.cardManager.dropLazyColumn(cardsEl);
      }
      el.remove();
    }

    // ---- Create missing columns, then reorder all elements in one pass ----
    columns.forEach((name, idx) => {
      if (!matched.has(name)) {
        this.view.columnManager.renderColumn(
          boardEl,
          name,
          groupMap.get(name) ?? null,
          idx,
          ctx,
        );
        // renderColumn appends the element to boardEl
        const allCols =
          boardEl.querySelectorAll<HTMLElement>(".base-board-column");
        const appended = allCols[allCols.length - 1];
        if (appended) matched.set(name, appended);
      }
    });

    const addBtn = boardEl.querySelector(".base-board-add-column-btn");
    let ref: Element | null = addBtn;
    for (let i = columns.length - 1; i >= 0; i--) {
      const el = matched.get(columns[i]);
      if (!el) continue;
      if (el.nextElementSibling !== ref) {
        boardEl.insertBefore(el, ref);
      }
      ref = el;
    }

    // ---- Patch each column's chrome + cards ----
    for (const name of columns) {
      const el = matched.get(name);
      if (!el) continue;
      // A freshly renamed column is frozen until its rename entry settles:
      // Bases re-queries in waves and mid-regroup waves report the column
      // as empty/partial — trusting them would remove and re-add every
      // card (count → 0, reflow, scroll jump). Ignore card changes until
      // the data settles; only the title/dataset change.
      const freezeCards = renames.isFrozen(name);
      this.updateColumn(el, name, groupMap.get(name) ?? null, ctx, freezeCards);
    }

    // ---- Filter bar: rebuild only when its content actually changed ----
    const barFp = this.computeFilterBarFingerprint(ctx);
    const existingBar = this.view.containerEl.querySelector(
      ".base-board-filter-bar",
    );
    if (!existingBar) {
      this.view.tags.renderFilterBar(this.view.containerEl, ctx);
      this.filterBarFp = barFp;
    } else if (barFp !== this.filterBarFp) {
      existingBar.remove();
      this.view.tags.renderFilterBar(this.view.containerEl, ctx);
      this.filterBarFp = barFp;
    }
  }

  // ---------------------------------------------------------------------------
  //  Per-column update
  // ---------------------------------------------------------------------------

  private updateColumn(
    colEl: HTMLElement,
    columnName: string,
    group: Column | null,
    ctx: RenderContext,
    freezeCards = false,
  ): void {
    const oldName = colEl.dataset.columnName ?? columnName;
    const renamed = oldName !== columnName;

    // ---- Chrome: header title, count badge, WIP class, color ----
    if (renamed) {
      colEl.dataset.columnName = columnName;
      const titleEl = colEl.querySelector<HTMLElement>(
        ".base-board-column-title",
      );
      if (titleEl) {
        titleEl.setText(columnName);
        titleEl.toggleClass(
          "base-board-no-value-title",
          columnName === NO_VALUE_COLUMN,
        );
      }
      colEl
        .querySelectorAll<HTMLElement>(".base-board-card")
        .forEach((cardEl) => {
          cardEl.dataset.columnName = columnName;
        });
    }

    // Frozen (freshly renamed) column: card DOM and count stay untouched —
    // incoming Bases waves may not have settled yet (count → 0, reflow,
    // scroll jump). Only the title/dataset patch above is applied.
    if (freezeCards) return;

    const cards = group?.cards ?? [];
    const wipLimit = group?.wipLimit ?? this.view.getWipLimit(columnName);
    const countEl = colEl.querySelector<HTMLElement>(
      ".base-board-column-count",
    );
    if (countEl) {
      const countText =
        wipLimit !== null
          ? `${cards.length} / ${wipLimit}`
          : String(cards.length);
      if (countEl.textContent !== countText) countEl.setText(countText);
    }

    colEl.toggleClass(
      "base-board-column--wip-overflow",
      wipLimit !== null && cards.length > wipLimit,
    );

    const color = this.view.getColumnColor(columnName);
    if (color) {
      colEl.style.setProperty("--column-color", color);
      const accentEl = colEl.querySelector<HTMLElement>(
        ".base-board-column-accent",
      );
      if (accentEl) accentEl.style.backgroundColor = color;
    }

    // ---- Cards: diff DOM against the sorted, filtered card list ----
    const cardsEl = colEl.querySelector<HTMLElement>(".base-board-cards");
    if (!cardsEl) return;
    this.view.cardManager.ensureLazyColumn(cardsEl);

    const activeFilters = this.view.tags.activeFilters;
    const sortPos = (c: CardData): number => {
      const o = ctx.orderOf(c.filePath);
      return Number.isFinite(o) ? o : Number.MAX_SAFE_INTEGER;
    };
    const visible = [...cards]
      .sort((a, b) => sortPos(a) - sortPos(b))
      .filter(
        (c) =>
          activeFilters.size === 0 ||
          ctx.tagsOf(c.filePath).some((t) => activeFilters.has(t)),
      );

    const elMap = new Map<string, HTMLElement>();
    cardsEl.querySelectorAll<HTMLElement>(".base-board-card").forEach((el) => {
      const path = el.dataset.filePath ?? "";
      if (path && !elMap.has(path)) elMap.set(path, el);
      // Strip transient drag state — the reconciler owns positioning now.
      el.classList.remove(
        "base-board-card--dragging",
        "base-board-card--drag-ghost",
      );
    });

    let prev: HTMLElement | null = null;
    for (const card of visible) {
      let el: HTMLElement | null | undefined = elMap.get(card.filePath);
      if (!el) {
        // Hydrate immediately so a freshly created card never paints as a
        // hidden placeholder in the visible viewport.
        el = this.view.cardManager.renderCard(
          cardsEl,
          card,
          columnName,
          ctx,
          true,
        );
        elMap.set(card.filePath, el);
      }
      const expected: ChildNode | null = prev
        ? prev.nextSibling
        : cardsEl.firstChild;
      if (el !== expected && el.parentElement === cardsEl) {
        cardsEl.insertBefore(el, expected);
      }
      prev = el;
    }

    // Remove cards that are gone (moved columns, deleted, filtered out)
    const visiblePaths = new Set(visible.map((c) => c.filePath));
    for (const [path, el] of elMap) {
      if (!visiblePaths.has(path) && el.parentElement === cardsEl) {
        el.remove();
      }
    }

    // ---- Rebuild card content in place only where the data changed ----
    for (const card of visible) {
      const el = elMap.get(card.filePath);
      if (!el || el.classList.contains("base-board-card--virtual")) continue;
      const fp = this.computeFingerprint(card, ctx);
      const prevFp = this.fingerprints.get(card.filePath);
      this.fingerprints.set(card.filePath, fp);
      if (prevFp !== undefined && prevFp !== fp) {
        this.view.cardManager.rerenderCardContent(el, card, columnName, ctx);
      }
    }
  }

  // ---------------------------------------------------------------------------
  //  Fingerprinting
  // ---------------------------------------------------------------------------

  /**
   * Everything renderCard renders that is data-derived: frontmatter values,
   * tags + their colors, the file basename, and embeds (covers via
   * "first embed"). Config-only changes go through full renders instead.
   *
   * Render-irrelevant properties are excluded: `kanban_order` (changes on
   * every reorder) and the groupBy property (changes on every column move /
   * rename). Otherwise dropping a card or renaming a column would rebuild
   * every affected card's content — visible as whole-board flicker.
   */
  private computeFingerprint(card: CardData, ctx: RenderContext): string {
    // groupBy only affects rendering if some chip/border displays it
    const skip = new Set<string>([ORDER_PROPERTY]);
    const groupBy = ctx.groupByProp;
    if (
      groupBy &&
      !ctx.chipProps.includes(groupBy) &&
      ctx.borderProperty !== groupBy
    ) {
      skip.add(groupBy);
    }

    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(card.properties)) {
      if (!skip.has(key)) props[key] = value;
    }

    const parts: string[] = [
      card.displayName,
      JSON.stringify(props),
      ctx
        .tagsOf(card.filePath)
        .map(
          (t) =>
            `${t}=${ctx.tagColors[t] ?? this.view.tags.getDeterministicColor(t)}`,
        )
        .join("|"),
    ];

    if (ctx.useFirstEmbed) {
      const file = this.view.app.vault.getAbstractFileByPath(card.filePath);
      if (file instanceof TFile) {
        const cache = this.view.app.metadataCache.getFileCache(file);
        parts.push((cache?.embeds ?? []).map((e) => e.link).join("|"));
      }
    }

    return parts.join("§");
  }

  /** Fingerprint of the filter bar's rendered content (tags, colors, active states). */
  private computeFilterBarFingerprint(ctx: RenderContext): string {
    const allTags = new Set<string>();
    for (const column of this.view.currentGroups) {
      for (const card of column.cards) {
        ctx.tagsOf(card.filePath).forEach((t) => allTags.add(t));
      }
    }
    const tags = [...allTags].sort();
    const active = [...this.view.tags.activeFilters].sort();
    const colors = tags.map((t) => this.view.tags.getColorForTag(t));
    return `${tags.join("|")}#${active.join("|")}#${colors.join("|")}`;
  }
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}
