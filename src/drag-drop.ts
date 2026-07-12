import { App, Notice } from "obsidian";

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
  /** Height of the dragged card, used to size the placeholder */
  private draggedCardHeight = 0;
  /** Other selected card elements dimmed during multi-drag */
  private multiDragEls: HTMLElement[] = [];
  /** Auto-scroll state */
  private autoScrollRAF: number | null = null;
  private autoScrollSpeed = 0; // horizontal (boardEl)
  private autoScrollVerticalSpeed = 0; // vertical (active cards container)
  private autoScrollVerticalEl: HTMLElement | null = null;
  private lastDragOverColumn: HTMLElement | null = null;
  private dropHighlightEl: HTMLElement | null = null;
  private dropHighlightBoardEl: HTMLElement | null = null;
  private dropHighlightRAF: number | null = null;
  private readonly clearDropHighlightOnPointerMove = (): void => {
    this.clearDropHighlight();
  };

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
    if (this.dropHighlightEl) {
      boardEl.addClass("base-board-board--drop-settling");
      this.dropHighlightBoardEl = boardEl;
    }
    boardEl.addEventListener("dragstart", this.boundHandlers.dragStart);
    boardEl.addEventListener("dragover", this.boundHandlers.dragOver);
    boardEl.addEventListener("dragend", this.boundHandlers.dragEnd);
    boardEl.addEventListener("drop", this.boundHandlers.drop);
  }

  destroy(): void {
    this.clearDropHighlight();
    this.teardownBoard();
  }

  private teardownBoard(): void {
    if (!this.boardEl) return;
    this.boardEl.removeEventListener("dragstart", this.boundHandlers.dragStart);
    this.boardEl.removeEventListener("dragover", this.boundHandlers.dragOver);
    this.boardEl.removeEventListener("dragend", this.boundHandlers.dragEnd);
    this.boardEl.removeEventListener("drop", this.boundHandlers.drop);
    this.boardEl.removeClass("base-board-board--drop-settling");
    if (this.dropHighlightBoardEl === this.boardEl) {
      this.dropHighlightBoardEl = null;
    }
    this.removePlaceholder();
    this.boardEl = null;
  }

  // ---------------------------------------------------------------------------
  //  Drag Start
  // ---------------------------------------------------------------------------

  private onDragStart(e: DragEvent): void {
    if (!e.dataTransfer) return;
    this.clearDropHighlight();

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
        headerEl,
        e.clientX - headerRect.left,
        e.clientY - headerRect.top,
      );

      window.requestAnimationFrame(() => {
        // Insert placeholder before hiding so layout doesn't shift
        this.placeholderEl = this.boardEl!.createDiv();
        this.placeholderEl.className = "base-board-column-placeholder";
        columnEl.parentElement?.insertBefore(this.placeholderEl, columnEl);
        columnEl.addClass("base-board-column--dragging");
        this.boardEl?.addClass("base-board-board--is-dragging");
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

    // Create the drag ghost on boardEl (avoids HierarchyRequestError that
    // hits when creating elements directly on the document), build its
    // content, then move it to the body so it renders correctly for capture.
    const PAD = 20;
    const ghostWrapper = this.boardEl!.createDiv();
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
      const stackContainer = ghostWrapper.createDiv();
      stackContainer.style.cssText = `
        position: relative;
        width: ${cardRect.width}px;
      `;

      // Read the computed background to use concrete values for the ghost
      const compStyles = getComputedStyle(cardEl);
      const cardBg = compStyles.backgroundColor || "#1e1e2e";
      const borderColor = compStyles.borderColor || "#383850";
      const accentColor =
        getComputedStyle(activeDocument.body).getPropertyValue(
          "--interactive-accent",
        ) || "#7c3aed";

      // Shadow layers (bottom-most first) — visible offset behind the main card
      const layerCount = Math.min(dragCount - 1, 2);
      for (let i = layerCount; i >= 1; i--) {
        const layer = stackContainer.createDiv();
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
      const badge = stackContainer.createDiv();
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

    // Move the ghost from boardEl to the body so setDragImage can capture a
    // properly rendered bitmap (elements nested inside overflow containers
    // may not be painted when off-screen).
    ghostWrapper.remove();
    activeDocument.body.appendChild(ghostWrapper);

    // Force layout so the browser paints the ghost before we capture it
    void ghostWrapper.getBoundingClientRect();

    e.dataTransfer.setDragImage(
      ghostWrapper,
      e.clientX - cardRect.left + PAD,
      e.clientY - cardRect.top + PAD,
    );

    // Clean up the ghost after the browser captures it, and dim cards
    window.requestAnimationFrame(() => {
      ghostWrapper.remove();

      // Collapse the dragged card and insert placeholder
      this.placeholderEl = this.boardEl!.createDiv();
      this.placeholderEl.className = "base-board-card-placeholder";
      this.placeholderEl.style.height = `${this.draggedCardHeight}px`;
      cardEl.parentElement?.insertBefore(this.placeholderEl, cardEl);
      cardEl.addClass("base-board-card--dragging");
      this.boardEl?.addClass("base-board-board--is-dragging");

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

    this.updateAutoScroll(e.clientX, e.clientY, e.target as HTMLElement);

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
      const nextColumn =
        hoveredColumn instanceof HTMLElement ? hoveredColumn : null;
      if (nextColumn !== this.lastDragOverColumn) {
        this.lastDragOverColumn?.classList.remove(
          "base-board-column--drag-over",
        );
        nextColumn?.classList.add("base-board-column--drag-over");
        this.lastDragOverColumn = nextColumn;
      }
    }

    if (!cardsContainer) {
      this.removePlaceholder();
      return;
    }

    if (!this.placeholderEl) {
      this.placeholderEl = this.boardEl!.createDiv();
      this.placeholderEl.className = "base-board-card-placeholder";
      this.placeholderEl.style.height = `${this.draggedCardHeight}px`;
    }

    const afterElement = this.getDragAfterElement(
      cardsContainer,
      ".base-board-card:not(.base-board-card--dragging)",
      e.clientY,
      "vertical",
    );

    const desiredParent = cardsContainer;
    const desiredNext = afterElement;
    if (
      this.placeholderEl.parentElement === desiredParent &&
      this.placeholderEl.nextElementSibling === desiredNext
    ) {
      return;
    }

    if (afterElement) {
      cardsContainer.insertBefore(this.placeholderEl, afterElement);
    } else {
      cardsContainer.appendChild(this.placeholderEl);
    }
  }

  private handleColumnDragOver(e: DragEvent): void {
    if (!this.boardEl) return;

    if (!this.placeholderEl) {
      this.placeholderEl = this.boardEl.createDiv();
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

  private updateAutoScroll(
    clientX: number,
    clientY: number,
    target: HTMLElement,
  ): void {
    const H_ZONE = 80;
    const V_ZONE = 60;
    const MAX_SPEED = 12;

    // Horizontal: scroll the board left/right
    if (this.boardEl) {
      const rect = this.boardEl.getBoundingClientRect();
      const relX = clientX - rect.left;
      if (relX < H_ZONE) {
        this.autoScrollSpeed = -MAX_SPEED * (1 - relX / H_ZONE);
      } else if (relX > rect.width - H_ZONE) {
        this.autoScrollSpeed = MAX_SPEED * (1 - (rect.width - relX) / H_ZONE);
      } else {
        this.autoScrollSpeed = 0;
      }
    }

    // Vertical: scroll the hovered column's cards container up/down
    const cardsEl = target.closest<HTMLElement>(".base-board-cards");
    if (cardsEl) {
      const rect = cardsEl.getBoundingClientRect();
      const relY = clientY - rect.top;
      if (relY < V_ZONE) {
        this.autoScrollVerticalSpeed = -MAX_SPEED * (1 - relY / V_ZONE);
        this.autoScrollVerticalEl = cardsEl;
      } else if (relY > rect.height - V_ZONE) {
        this.autoScrollVerticalSpeed =
          MAX_SPEED * (1 - (rect.height - relY) / V_ZONE);
        this.autoScrollVerticalEl = cardsEl;
      } else {
        this.autoScrollVerticalSpeed = 0;
        this.autoScrollVerticalEl = null;
      }
    } else {
      this.autoScrollVerticalSpeed = 0;
      this.autoScrollVerticalEl = null;
    }

    const needsScroll =
      this.autoScrollSpeed !== 0 || this.autoScrollVerticalSpeed !== 0;
    if (needsScroll && this.autoScrollRAF === null) {
      const tick = () => {
        if (this.autoScrollSpeed === 0 && this.autoScrollVerticalSpeed === 0) {
          this.autoScrollRAF = null;
          return;
        }
        if (this.boardEl && this.autoScrollSpeed !== 0) {
          this.boardEl.scrollLeft += this.autoScrollSpeed;
        }
        if (this.autoScrollVerticalEl && this.autoScrollVerticalSpeed !== 0) {
          this.autoScrollVerticalEl.scrollTop += this.autoScrollVerticalSpeed;
        }
        this.autoScrollRAF = window.requestAnimationFrame(tick);
      };
      this.autoScrollRAF = window.requestAnimationFrame(tick);
    } else if (!needsScroll && this.autoScrollRAF !== null) {
      cancelAnimationFrame(this.autoScrollRAF);
      this.autoScrollRAF = null;
    }
  }

  private onDragEnd(): void {
    this.boardEl?.removeClass("base-board-board--is-dragging");

    // Stop any in-progress auto-scroll
    if (this.autoScrollRAF !== null) {
      cancelAnimationFrame(this.autoScrollRAF);
      this.autoScrollRAF = null;
    }
    this.autoScrollSpeed = 0;
    this.autoScrollVerticalSpeed = 0;
    this.autoScrollVerticalEl = null;

    // Restore multi-drag ghost cards
    for (const el of this.multiDragEls) {
      el.removeClass("base-board-card--drag-ghost");
    }
    this.multiDragEls = [];

    if (this.draggedEl) {
      this.draggedEl.removeClass("base-board-card--dragging");
      this.draggedEl.removeClass("base-board-column--dragging");
    }
    this.removePlaceholder();
    this.draggedEl = null;
    // Remove all column drag-over highlights
    if (this.boardEl) {
      this.boardEl
        .querySelectorAll(".base-board-column--drag-over")
        .forEach((col) => col.classList.remove("base-board-column--drag-over"));
    }
    this.lastDragOverColumn = null;
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
      await this.handleCardDrop(e);
    }
  }

  private handleColumnDrop(e: DragEvent): void {
    if (!this.boardEl) return;
    const draggedColumnName = this.draggedEl?.dataset.columnName;
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
    const filePath = this.draggedEl?.dataset.filePath;
    if (!filePath) return;

    const columnEl = (e.target as HTMLElement).closest(".base-board-column");
    if (!(columnEl instanceof HTMLElement)) return;

    const targetColumnName = columnEl.dataset.columnName;
    if (!targetColumnName) return;

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

    const droppedEl = this.draggedEl;
    const placeholderEl = this.placeholderEl;
    const additionalDroppedEls = Array.from(this.callbacks.getSelectedCards())
      .filter((path) => path !== filePath && !orderedPaths.includes(path))
      .map((path) =>
        Array.from(
          this.boardEl?.querySelectorAll<HTMLElement>(".base-board-card") ?? [],
        ).find((el) => el.dataset.filePath === path),
      )
      .filter((el): el is HTMLElement => el instanceof HTMLElement);
    const movedElements = droppedEl
      ? [droppedEl, ...additionalDroppedEls]
      : additionalDroppedEls;
    const originalPositions = movedElements.map((el) => ({
      element: el,
      parent: el.parentElement,
      nextSibling: el.nextElementSibling,
      columnName: el.dataset.columnName,
    }));

    // Commit the user's visual intent before the first asynchronous write.
    // replaceChild moves the existing node, preserving its identity and subtree.
    if (droppedEl && placeholderEl?.parentElement) {
      placeholderEl.parentElement.replaceChild(droppedEl, placeholderEl);
      this.placeholderEl = null;
      droppedEl.dataset.columnName = targetColumnName;
      droppedEl.removeClass("base-board-card--dragging");
      this.showDropHighlight(droppedEl);

      const insertionPoint = droppedEl.nextSibling;
      for (const additionalEl of additionalDroppedEls) {
        droppedEl.parentElement?.insertBefore(additionalEl, insertionPoint);
        additionalEl.dataset.columnName = targetColumnName;
        additionalEl.removeClass("base-board-card--drag-ghost");
      }
    }
    this.onDragEnd();

    try {
      await this.callbacks.onCardDrop(filePath, targetColumnName, orderedPaths);
    } catch (error) {
      this.clearDropHighlight();
      for (const position of originalPositions.reverse()) {
        if (position.parent) {
          const nextSibling =
            position.nextSibling?.parentElement === position.parent
              ? position.nextSibling
              : null;
          position.parent.insertBefore(position.element, nextSibling);
          if (position.columnName) {
            position.element.dataset.columnName = position.columnName;
          }
        }
      }
      new Notice(`Could not move card: ${String(error)}`);
    }
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

  private showDropHighlight(cardEl: HTMLElement): void {
    this.clearDropHighlight();
    this.dropHighlightEl = cardEl;
    this.dropHighlightBoardEl = this.boardEl;
    cardEl.addClass("base-board-card--just-dropped");
    this.boardEl?.addClass("base-board-board--drop-settling");

    // Attach on the next frame so a terminal event from the native drag does
    // not immediately clear the state. The first real pointer move hands the
    // highlight back to the browser's normal :hover calculation.
    this.dropHighlightRAF = window.requestAnimationFrame(() => {
      this.dropHighlightRAF = null;
      activeDocument.addEventListener(
        "pointermove",
        this.clearDropHighlightOnPointerMove,
        { once: true, capture: true },
      );
    });
  }

  private clearDropHighlight(): void {
    if (this.dropHighlightRAF !== null) {
      window.cancelAnimationFrame(this.dropHighlightRAF);
      this.dropHighlightRAF = null;
    }
    activeDocument.removeEventListener(
      "pointermove",
      this.clearDropHighlightOnPointerMove,
      true,
    );
    this.dropHighlightEl?.removeClass("base-board-card--just-dropped");
    this.dropHighlightBoardEl?.removeClass("base-board-board--drop-settling");
    this.dropHighlightEl = null;
    this.dropHighlightBoardEl = null;
  }
}
