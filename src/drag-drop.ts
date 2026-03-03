import { App } from "obsidian";

// We use dataTransfer types to distinguish card vs column drags
const CARD_MIME = "application/x-kanban-card";
const COLUMN_MIME = "application/x-kanban-column";

export interface DragDropCallbacks {
  /** Card dropped (same or different column). orderedPaths = new card order in target column. */
  onCardDrop: (
    filePath: string,
    targetColumnName: string,
    orderedFilePaths: string[],
  ) => Promise<void>;
  /** Column header was dragged to a new position. */
  onColumnReorder: (orderedColumnNames: string[]) => void;
  /** Returns the set of currently selected card file paths. */
  getSelectedCards: () => Set<string>;
}

export class DragDropManager {
  private app: App;
  private callbacks: DragDropCallbacks;
  private boardEl: HTMLElement | null = null;
  private draggedEl: HTMLElement | null = null;
  private placeholderEl: HTMLElement | null = null;
  private dragType: "card" | "column" | null = null;
  /** True after a successful card drop — prevents visual cleanup before re-render */
  private cardDropped = false;
  /** Height of the dragged card, used to size the placeholder */
  private draggedCardHeight = 0;
  /** Other selected card elements dimmed during multi-drag */
  private multiDragEls: HTMLElement[] = [];

  private boundHandlers: {
    dragStart: (e: DragEvent) => void;
    dragOver: (e: DragEvent) => void;
    dragEnd: (e: DragEvent) => void;
    drop: (e: DragEvent) => void;
  };

  constructor(app: App, callbacks: DragDropCallbacks) {
    this.app = app;
    this.callbacks = callbacks;

    this.boundHandlers = {
      dragStart: this.onDragStart.bind(this),
      dragOver: this.onDragOver.bind(this),
      dragEnd: this.onDragEnd.bind(this),
      drop: (e: DragEvent) => {
        void this.onDrop(e);
      },
    };
  }

  initBoard(boardEl: HTMLElement): void {
    this.teardownBoard();
    this.boardEl = boardEl;
    boardEl.addEventListener("dragstart", this.boundHandlers.dragStart);
    boardEl.addEventListener("dragover", this.boundHandlers.dragOver);
    boardEl.addEventListener("dragend", this.boundHandlers.dragEnd);
    boardEl.addEventListener("drop", this.boundHandlers.drop);
  }

  destroy(): void {
    this.teardownBoard();
  }

  private teardownBoard(): void {
    if (!this.boardEl) return;
    this.boardEl.removeEventListener("dragstart", this.boundHandlers.dragStart);
    this.boardEl.removeEventListener("dragover", this.boundHandlers.dragOver);
    this.boardEl.removeEventListener("dragend", this.boundHandlers.dragEnd);
    this.boardEl.removeEventListener("drop", this.boundHandlers.drop);
    this.removePlaceholder();
    this.boardEl = null;
  }

  // ---------------------------------------------------------------------------
  //  Drag Start
  // ---------------------------------------------------------------------------

  private onDragStart(e: DragEvent): void {
    if (!e.dataTransfer) return;

    // Check if dragging a column header
    const headerEl = (e.target as HTMLElement).closest(
      ".base-board-column-header",
    );
    if (headerEl) {
      // Don't initiate a column drag when the user clicks interactive children
      // (title span for renaming, count badge, delete button, etc.)
      const target = e.target as HTMLElement;
      const isInteractive = target.closest(
        ".base-board-column-title, .base-board-column-count, .base-board-column-delete, input, button",
      );
      if (isInteractive) return;

      const columnEl = headerEl.closest(".base-board-column");
      if (!(columnEl instanceof HTMLElement)) return;
      this.dragType = "column";
      this.draggedEl = columnEl;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(COLUMN_MIME, columnEl.dataset.columnName ?? "");

      // Use the header itself as drag ghost — much smaller and cleaner than the full column
      const headerRect = (headerEl as HTMLElement).getBoundingClientRect();
      e.dataTransfer.setDragImage(
        headerEl as HTMLElement,
        e.clientX - headerRect.left,
        e.clientY - headerRect.top,
      );

      requestAnimationFrame(() => {
        // Insert placeholder before hiding so layout doesn't shift
        this.placeholderEl = document.createElement("div");
        this.placeholderEl.className = "base-board-column-placeholder";
        columnEl.parentElement?.insertBefore(this.placeholderEl, columnEl);
        columnEl.addClass("base-board-column--dragging");
      });
      return;
    }

    // Otherwise check for card drag
    const cardEl = (e.target as HTMLElement).closest(".base-board-card");
    if (!(cardEl instanceof HTMLElement)) return;
    this.dragType = "card";
    this.draggedEl = cardEl;
    const cardRect = cardEl.getBoundingClientRect();
    this.draggedCardHeight = cardRect.height;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(CARD_MIME, cardEl.dataset.filePath ?? "");

    const selectedCards = this.callbacks.getSelectedCards();
    const filePath = cardEl.dataset.filePath ?? "";
    const isMultiDrag = selectedCards.size > 1 && selectedCards.has(filePath);
    const dragCount = isMultiDrag ? selectedCards.size : 1;

    // Create the drag ghost
    const PAD = 20;
    const ghostWrapper = document.createElement("div");
    ghostWrapper.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      padding: ${PAD}px;
      pointer-events: none;
      z-index: 9999;
    `;

    if (isMultiDrag) {
      // Stacked cards effect: offset shadow cards behind the main card
      const stackContainer = document.createElement("div");
      stackContainer.style.cssText = `
        position: relative;
        width: ${cardRect.width}px;
      `;

      // Read the computed background to use concrete values for the ghost
      const compStyles = getComputedStyle(cardEl);
      const cardBg = compStyles.backgroundColor || "#1e1e2e";
      const borderColor = compStyles.borderColor || "#383850";
      const accentColor =
        getComputedStyle(document.body).getPropertyValue(
          "--interactive-accent",
        ) || "#7c3aed";

      // Shadow layers (bottom-most first) — visible offset behind the main card
      const layerCount = Math.min(dragCount - 1, 2);
      for (let i = layerCount; i >= 1; i--) {
        const layer = document.createElement("div");
        layer.style.cssText = `
          position: absolute;
          top: ${i * 6}px;
          left: ${i * 4}px;
          width: 100%;
          height: ${cardRect.height}px;
          background: ${cardBg};
          border: 1px solid ${borderColor};
          border-radius: 6px;
          opacity: ${0.6 - i * 0.15};
          box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        `;
        stackContainer.appendChild(layer);
      }

      // Top card (the actual dragged card clone)
      const ghost = cardEl.cloneNode(true) as HTMLElement;
      ghost.style.cssText = `
        position: relative;
        width: ${cardRect.width}px;
        transform: rotate(2deg);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
        opacity: 0.95;
        border-radius: 6px;
        background: ${cardBg};
        border: 1px solid ${borderColor};
      `;
      ghost.classList.remove("base-board-card--selected");
      stackContainer.appendChild(ghost);

      // Count badge
      const badge = document.createElement("div");
      badge.textContent = String(dragCount);
      badge.style.cssText = `
        position: absolute;
        top: -10px;
        right: -10px;
        min-width: 24px;
        height: 24px;
        line-height: 24px;
        text-align: center;
        font-size: 13px;
        font-weight: 700;
        color: #fff;
        background: ${accentColor};
        border-radius: 12px;
        padding: 0 6px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        z-index: 1;
      `;
      stackContainer.appendChild(badge);

      ghostWrapper.appendChild(stackContainer);
    } else {
      // Single card: tilted clone
      const ghost = cardEl.cloneNode(true) as HTMLElement;
      ghost.style.cssText = `
        width: ${cardRect.width}px;
        transform: rotate(3deg);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
        opacity: 0.85;
        border-radius: var(--radius-s, 6px);
      `;
      ghostWrapper.appendChild(ghost);
    }

    document.body.appendChild(ghostWrapper);
    e.dataTransfer.setDragImage(
      ghostWrapper,
      e.clientX - cardRect.left + PAD,
      e.clientY - cardRect.top + PAD,
    );

    // Clean up the ghost after the browser captures it, and dim cards
    requestAnimationFrame(() => {
      ghostWrapper.remove();

      // Collapse the dragged card and insert placeholder
      this.placeholderEl = document.createElement("div");
      this.placeholderEl.className = "base-board-card-placeholder";
      this.placeholderEl.style.height = `${this.draggedCardHeight}px`;
      cardEl.parentElement?.insertBefore(this.placeholderEl, cardEl);
      cardEl.addClass("base-board-card--dragging");

      // Dim all other selected cards during multi-drag
      if (isMultiDrag && this.boardEl) {
        this.multiDragEls = Array.from(
          this.boardEl.querySelectorAll<HTMLElement>(".base-board-card"),
        ).filter(
          (el) => el !== cardEl && selectedCards.has(el.dataset.filePath ?? ""),
        );
        for (const el of this.multiDragEls) {
          el.addClass("base-board-card--drag-ghost");
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  //  Drag Over
  // ---------------------------------------------------------------------------

  private onDragOver(e: DragEvent): void {
    e.preventDefault();
    if (!e.dataTransfer) return;
    e.dataTransfer.dropEffect = "move";

    if (this.dragType === "column") {
      this.handleColumnDragOver(e);
    } else if (this.dragType === "card") {
      this.handleCardDragOver(e);
    }
  }

  private handleCardDragOver(e: DragEvent): void {
    // Find the cards container we're hovering over
    const closestCardsContainer = (e.target as HTMLElement).closest(
      ".base-board-cards",
    );
    let cardsContainer =
      closestCardsContainer instanceof HTMLElement
        ? closestCardsContainer
        : null;

    if (!cardsContainer) {
      const columnEl = (e.target as HTMLElement).closest(".base-board-column");
      if (columnEl instanceof HTMLElement) {
        const qc = columnEl.querySelector(".base-board-cards");
        if (qc instanceof HTMLElement) {
          cardsContainer = qc;
        }
      }
    }

    // Update column drag-over highlight
    const hoveredColumn = cardsContainer?.closest(
      ".base-board-column",
    ) as HTMLElement | null;

    if (this.boardEl) {
      const allColumns = this.boardEl.querySelectorAll(".base-board-column");
      allColumns.forEach((col) => {
        if (col === hoveredColumn) {
          col.classList.add("base-board-column--drag-over");
        } else {
          col.classList.remove("base-board-column--drag-over");
        }
      });
    }

    if (!cardsContainer) {
      this.removePlaceholder();
      return;
    }

    if (!this.placeholderEl) {
      this.placeholderEl = document.createElement("div");
      this.placeholderEl.className = "base-board-card-placeholder";
      this.placeholderEl.style.height = `${this.draggedCardHeight}px`;
    }

    const afterElement = this.getDragAfterElement(
      cardsContainer,
      ".base-board-card:not(.base-board-card--dragging)",
      e.clientY,
      "vertical",
    );
    if (afterElement) {
      cardsContainer.insertBefore(this.placeholderEl, afterElement);
    } else {
      cardsContainer.appendChild(this.placeholderEl);
    }
  }

  private handleColumnDragOver(e: DragEvent): void {
    if (!this.boardEl) return;

    if (!this.placeholderEl) {
      this.placeholderEl = document.createElement("div");
      this.placeholderEl.className = "base-board-column-placeholder";
    }

    const afterElement = this.getDragAfterElement(
      this.boardEl,
      ".base-board-column:not(.base-board-column--dragging)",
      e.clientX,
      "horizontal",
    );

    // Skip DOM mutation if placeholder is already in the right spot
    const desiredNext =
      afterElement ??
      this.boardEl.querySelector(".base-board-add-column-btn") ??
      null;
    if (
      this.placeholderEl.nextElementSibling === desiredNext &&
      this.placeholderEl.parentElement === this.boardEl
    ) {
      return;
    }

    if (afterElement) {
      this.boardEl.insertBefore(this.placeholderEl, afterElement);
    } else {
      const addBtn = this.boardEl.querySelector(".base-board-add-column-btn");
      if (addBtn) {
        this.boardEl.insertBefore(this.placeholderEl, addBtn);
      } else {
        this.boardEl.appendChild(this.placeholderEl);
      }
    }
  }

  // ---------------------------------------------------------------------------
  //  Drag End
  // ---------------------------------------------------------------------------

  private onDragEnd(): void {
    // Restore multi-drag ghost cards
    for (const el of this.multiDragEls) {
      el.removeClass("base-board-card--drag-ghost");
    }
    this.multiDragEls = [];

    if (this.cardDropped) {
      // Successful card drop — don't restore the card or remove the placeholder.
      // The re-render will replace the entire DOM with the correct order.
      this.cardDropped = false;
    } else if (this.draggedEl) {
      // Cancelled drag (e.g. dropped outside) — restore original state
      this.draggedEl.removeClass("base-board-card--dragging");
      this.draggedEl.removeClass("base-board-column--dragging");
      this.removePlaceholder();
    }
    this.draggedEl = null;
    // Remove all column drag-over highlights
    if (this.boardEl) {
      this.boardEl
        .querySelectorAll(".base-board-column--drag-over")
        .forEach((col) => col.classList.remove("base-board-column--drag-over"));
    }
    this.dragType = null;
  }

  // ---------------------------------------------------------------------------
  //  Drop
  // ---------------------------------------------------------------------------

  private async onDrop(e: DragEvent): Promise<void> {
    e.preventDefault();

    if (this.dragType === "column") {
      this.handleColumnDrop(e);
      this.onDragEnd();
    } else if (this.dragType === "card") {
      const success = await this.handleCardDrop(e);
      this.cardDropped = success;
      // Don't call onDragEnd here — the browser fires dragend automatically,
      // and our flag ensures we skip visual cleanup on success.
    }
  }

  private handleColumnDrop(e: DragEvent): void {
    if (!this.boardEl) return;
    const draggedColumnName = e.dataTransfer?.getData(COLUMN_MIME);
    if (!draggedColumnName) return;

    // Collect column names in DOM order (placeholder marks the new position)
    const orderedNames: string[] = [];
    for (const child of Array.from(this.boardEl.children)) {
      if (child === this.placeholderEl) {
        orderedNames.push(draggedColumnName);
      } else if (
        child.classList.contains("base-board-column") &&
        !child.classList.contains("base-board-column--dragging")
      ) {
        const name = (child as HTMLElement).dataset.columnName;
        if (name && name !== draggedColumnName) {
          orderedNames.push(name);
        }
      }
    }

    if (!orderedNames.includes(draggedColumnName)) {
      orderedNames.push(draggedColumnName);
    }

    this.callbacks.onColumnReorder(orderedNames);
  }

  private async handleCardDrop(e: DragEvent): Promise<boolean> {
    const filePath = e.dataTransfer?.getData(CARD_MIME);
    if (!filePath) return false;

    const columnEl = (e.target as HTMLElement).closest(".base-board-column");
    if (!(columnEl instanceof HTMLElement)) return false;

    const targetColumnName = columnEl.dataset.columnName;
    if (!targetColumnName) return false;

    const cardsContainer = columnEl.querySelector(".base-board-cards");

    // Build ordered file paths from DOM
    const orderedPaths: string[] = [];
    if (cardsContainer) {
      for (const child of Array.from(cardsContainer.children)) {
        if (child === this.placeholderEl) {
          orderedPaths.push(filePath);
        } else if (
          child.classList.contains("base-board-card") &&
          !child.classList.contains("base-board-card--dragging")
        ) {
          const path = (child as HTMLElement).dataset.filePath;
          if (path && path !== filePath) {
            orderedPaths.push(path);
          }
        }
      }
      if (!orderedPaths.includes(filePath)) {
        orderedPaths.push(filePath);
      }
    }

    await this.callbacks.onCardDrop(filePath, targetColumnName, orderedPaths);
    return true;
  }

  // ---------------------------------------------------------------------------
  //  Utilities
  // ---------------------------------------------------------------------------

  /**
   * Find the child in `container` matching `selector` that the dragged
   * element should be inserted *before*.
   */
  private getDragAfterElement(
    container: HTMLElement,
    selector: string,
    cursorPos: number,
    axis: "vertical" | "horizontal",
  ): HTMLElement | null {
    const els = Array.from(container.querySelectorAll<HTMLElement>(selector));

    let closest: HTMLElement | null = null;
    let closestOffset = Number.NEGATIVE_INFINITY;

    for (const child of els) {
      const box = child.getBoundingClientRect();
      const offset =
        axis === "vertical"
          ? cursorPos - box.top - box.height / 2
          : cursorPos - box.left - box.width / 2;
      if (offset < 0 && offset > closestOffset) {
        closestOffset = offset;
        closest = child;
      }
    }

    return closest;
  }

  private removePlaceholder(): void {
    if (this.placeholderEl) {
      this.placeholderEl.remove();
      this.placeholderEl = null;
    }
  }
}
