import { Menu, Notice, TFile } from "obsidian";
import { KanbanView } from "./kanban-view";
import { ORDER_PROPERTY } from "./constants";

/**
 * Multi-selection and batch operations for cards.
 * Extracted from CardManager to keep card.ts focused on rendering/laziness.
 */
export class CardSelectionManager {
  private view: KanbanView;

  constructor(view: KanbanView) {
    this.view = view;
  }

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
      // Batch moves append to the end of the target column. Compute the
      // base from the highest existing order so the new positions can never
      // collide with cards already in the column.
      const targetGroup = this.view.currentGroups.find(
        (g) => g.name === targetColumn,
      );
      let base = 0;
      for (const card of targetGroup?.cards ?? []) {
        const order = this.view.getFileOrder(card.filePath);
        if (Number.isFinite(order) && order > base) base = order;
      }

      const updates = filePaths.map((fp, i) => {
        const file = this.view.app.vault.getAbstractFileByPath(fp);
        if (!file || !(file instanceof TFile)) return Promise.resolve();
        return this.view.app.fileManager.processFrontMatter(
          file,
          (fm: Record<string, unknown>) => {
            this.view.applyGroupByValue(fm, groupByProp, targetColumn);
            fm[ORDER_PROPERTY] = base + (i + 1) * 1_000_000;
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
