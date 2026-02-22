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
      drop: this.onDrop.bind(this),
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

    // Check if dragging a column header (via the drag handle)
    const handle = (e.target as HTMLElement).closest(
      ".base-board-column-drag-handle",
    );
    if (handle) {
      const columnEl = handle.closest(
        ".base-board-column",
      ) as HTMLElement | null;
      if (!columnEl) return;
      this.dragType = "column";
      this.draggedEl = columnEl;
      columnEl.addClass("base-board-column--dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(COLUMN_MIME, columnEl.dataset.columnName ?? "");
      return;
    }

    // Otherwise check for card drag
    const cardEl = (e.target as HTMLElement).closest(
      ".base-board-card",
    ) as HTMLElement | null;
    if (!cardEl) return;
    this.dragType = "card";
    this.draggedEl = cardEl;
    const cardRect = cardEl.getBoundingClientRect();
    this.draggedCardHeight = cardRect.height;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(CARD_MIME, cardEl.dataset.filePath ?? "");

    // Create a tilted clone for the drag ghost
    const PAD = 20; // extra space so rotation isn't clipped
    const ghostWrapper = document.createElement("div");
    ghostWrapper.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      padding: ${PAD}px;
      pointer-events: none;
      z-index: 9999;
    `;
    const ghost = cardEl.cloneNode(true) as HTMLElement;
    ghost.style.cssText = `
      width: ${cardRect.width}px;
      transform: rotate(3deg);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
      opacity: 0.85;
      border-radius: var(--radius-s);
    `;
    ghostWrapper.appendChild(ghost);
    document.body.appendChild(ghostWrapper);
    // Offset accounts for the padding so cursor stays at grab point
    e.dataTransfer.setDragImage(
      ghostWrapper,
      e.clientX - cardRect.left + PAD,
      e.clientY - cardRect.top + PAD,
    );
    // Clean up the ghost after the browser has captured it
    requestAnimationFrame(() => {
      ghostWrapper.remove();
      // Collapse the card and insert placeholder in the same frame
      this.placeholderEl = document.createElement("div");
      this.placeholderEl.className = "base-board-card-placeholder";
      this.placeholderEl.style.height = `${this.draggedCardHeight}px`;
      cardEl.parentElement?.insertBefore(this.placeholderEl, cardEl);
      cardEl.addClass("base-board-card--dragging");
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
    let cardsContainer = (e.target as HTMLElement).closest(
      ".base-board-cards",
    ) as HTMLElement | null;

    if (!cardsContainer) {
      const columnEl = (e.target as HTMLElement).closest(
        ".base-board-column",
      ) as HTMLElement | null;
      if (columnEl) {
        cardsContainer = columnEl.querySelector(".base-board-cards");
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
    if (afterElement) {
      this.boardEl.insertBefore(this.placeholderEl, afterElement);
    } else {
      // Insert before the add-column button (last child)
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

  private onDragEnd(_e: DragEvent): void {
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
      this.onDragEnd(e);
    } else if (this.dragType === "card") {
      this.cardDropped = true;
      await this.handleCardDrop(e);
      // Don't call onDragEnd here — the browser fires dragend automatically,
      // and our flag ensures we skip visual cleanup.
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

  private async handleCardDrop(e: DragEvent): Promise<void> {
    const filePath = e.dataTransfer?.getData(CARD_MIME);
    if (!filePath) return;

    const columnEl = (e.target as HTMLElement).closest(
      ".base-board-column",
    ) as HTMLElement | null;
    if (!columnEl) return;

    const targetColumnName = columnEl.dataset.columnName;
    if (!targetColumnName) return;

    let cardsContainer = columnEl.querySelector(
      ".base-board-cards",
    ) as HTMLElement | null;

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
    const els = Array.from(
      container.querySelectorAll(selector),
    ) as HTMLElement[];

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
