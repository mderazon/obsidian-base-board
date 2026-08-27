/**
 * DragAndDrop - Full drag-and-drop engine for cards and columns
 * Implements: card multi-drag, column header drag, auto-scroll, drop position calculation
 */

import { BoardState, CardData, ColumnConfig } from '../services/board-state';

export interface DragState {
  type: 'card' | 'column';
  cardId?: string;
  cardIds?: string[]; // For multi-drag
  columnId?: string;
  sourceColumnId: string;
  startX: number;
  startY: number;
  isDragging: boolean;
}

export class DragAndDrop {
  private boardState: BoardState;
  private container: HTMLElement;
  private onCardMoved?: (cardId: string, oldColumnId: string, newColumnId: string) => void;
  private onDragComplete?: () => void;
  private dragState: DragState | null = null;
  private ghostCards: HTMLElement[] = [];
  private autoScrollTimer: number | null = null;
  private scrollSpeed: { x: number; y: number } = { x: 0, y: 0 };

  constructor(container: HTMLElement, boardState: BoardState, onCardMoved?: (cardId: string, oldColumnId: string, newColumnId: string) => void, onDragComplete?: () => void) {
    this.container = container;
    this.boardState = boardState;
    this.onCardMoved = onCardMoved;
    this.onDragComplete = onDragComplete;
    this.init();
  }

  private init(): void {
    // Enable drag-and-drop on the board
    this.container.addEventListener('dragstart', this.handleDragStart.bind(this));
    this.container.addEventListener('dragover', this.handleDragOver.bind(this));
    this.container.addEventListener('drop', this.handleDrop.bind(this));
    this.container.addEventListener('dragend', this.handleDragEnd.bind(this));
  }

  private handleDragStart(e: DragEvent): void {
    const target = e.target as HTMLElement;
    
    // Handle card drag
    if (target.closest('.base-board-card')) {
      const cardEl = target.closest('.base-board-card') as HTMLElement;
      const cardId = cardEl.dataset.cardId!;
      const columnEl = cardEl.closest('.base-board-column') as HTMLElement;
      const columnId = columnEl.dataset.columnId!;
      
      this.dragState = {
        type: 'card',
        cardId,
        sourceColumnId: columnId,
        startX: e.clientX,
        startY: e.clientY,
        isDragging: true,
      };

      // Set drag data
      e.dataTransfer!.setData('text/plain', cardId);
      e.dataTransfer!.effectAllowed = 'move';
      
      // Add dragging classes
      cardEl.classList.add('base-board-card--dragging');
      if (columnEl) {
        columnEl.classList.add('base-board-column--dragging');
      }
    }

    // Handle column header drag (for reordering columns)
    if (target.closest('.base-board-column__header')) {
      const headerEl = target.closest('.base-board-column__header') as HTMLElement;
      const columnEl = headerEl.closest('.base-board-column') as HTMLElement;
      const columnId = columnEl.dataset.columnId!;
      
      this.dragState = {
        type: 'column',
        columnId,
        sourceColumnId: columnId,
        startX: e.clientX,
        startY: e.clientY,
        isDragging: true,
      };

      e.dataTransfer!.setData('text/plain', `column:${columnId}`);
      e.dataTransfer!.effectAllowed = 'move';
    }
  }

  private handleDragOver(e: DragEvent): void {
    if (!this.dragState) return;

    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';

    // Handle card drop position calculation
    if (this.dragState.type === 'card') {
      // Find the column element by walking up from the event target
      const target = e.target as HTMLElement;
      const columnEl = target.closest('.base-board-column') as HTMLElement;
      if (!columnEl) return;

      const cardsContainer = columnEl.querySelector('.base-board-column__cards');
      if (!cardsContainer) return;

      const cards = Array.from(cardsContainer.querySelectorAll('.base-board-card')) as HTMLElement[];
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      // Find the closest card to drop before/after
      let dropIndex = cards.length;
      let dropPosition: 'before' | 'after' | 'none' = 'none';
      
      for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        
        if (mouseY < midY) {
          dropIndex = i;
          dropPosition = 'before';
          break;
        } else if (i === cards.length - 1) {
          // Past the last card - drop after it
          dropIndex = i + 1;
          dropPosition = 'after';
        }
      }

      console.log('[DragDrop] Drop target:', dropIndex, dropPosition, 'column:', columnEl.dataset.columnId);

      // Update drop indicators
      this.updateDropIndicators(cards, dropIndex, dropPosition);
      
      // Start auto-scroll if near edge
      this.startAutoScroll(e);
    }

    // Handle column reorder
    if (this.dragState.type === 'column') {
      const target = e.target as HTMLElement;
      const columnEl = target.closest('.base-board-column') as HTMLElement;
      if (columnEl) {
        columnEl.classList.add('base-board-column--drag-over');
      }
    }
  }

  private handleDrop(e: DragEvent): void {
    if (!this.dragState) return;

    e.preventDefault();

    console.log('[DragDrop] Drop event, type:', this.dragState.type);

    if (this.dragState.type === 'card') {
      // Find the column element by walking up from the event target
      const target = e.target as HTMLElement;
      console.log('[DragDrop] Event target:', target.tagName, target.className);
      const columnEl = target.closest('.base-board-column') as HTMLElement;
      console.log('[DragDrop] Found column:', !!columnEl, columnEl?.dataset.columnId);
      if (!columnEl) return;

      const newColumnId = (columnEl as any).dataset.columnId;
      
      // Calculate drop position
      const cardsContainer = columnEl.querySelector('.base-board-column__cards');
      if (!cardsContainer) return;

      const cards = Array.from(cardsContainer.querySelectorAll('.base-board-card')) as HTMLElement[];
      const mouseY = e.clientY;

      let dropIndex = cards.length;
      for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (mouseY < midY) {
          dropIndex = i;
          break;
        }
      }

      console.log('[DragDrop] Moving card', this.dragState.cardId, 'to column', newColumnId, 'at index', dropIndex);

      // Execute the move
      if (this.dragState.cardId) {
        const oldColumnId = this.dragState.sourceColumnId;
        this.boardState.moveCard(this.dragState.cardId, newColumnId, dropIndex);
        
        console.log('[DragDrop] State updated, old column:', oldColumnId, 'new column:', newColumnId);

        // Physically move the DOM element
        this.moveCardElementDOM(this.dragState.cardId, newColumnId, dropIndex);

        // Notify that card was moved (for persisting status field)
        if (this.onCardMoved && oldColumnId !== newColumnId) {
          this.onCardMoved(this.dragState.cardId, oldColumnId, newColumnId).then(() => {
            console.log('[DragDrop] Card move callback completed');
          });
        }
      }
    }

    if (this.dragState.type === 'column') {
      const columnEl = e.currentTarget as HTMLElement;
      if (columnEl.classList.contains('base-board-column')) {
        const newOrder = Array.from(this.container.querySelectorAll('.base-board-column')).map(
          col => (col as any).dataset.columnId
        );
        
        if (this.dragState.columnId) {
          this.boardState.reorderColumns(newOrder);
          if (this.onDragComplete) {
            this.onDragComplete();
          }
        }
      }
    }

    // Clean up
    this.cleanupDrag();
  }

  private handleDragEnd(e: DragEvent): void {
    this.cleanupDrag();
  }

  /**
   * Physically move a card element in the DOM to its new position.
   */
  private moveCardElementDOM(cardId: string, newColumnId: string, dropIndex: number): void {
    // Find the existing card element in the DOM
    const cardEl = this.container.querySelector(`[data-card-id="${cardId}"]`) as HTMLElement;
    if (!cardEl) {
      console.log('[DragDrop] Card element not found for:', cardId);
      return;
    }

    // Find the target column's card container
    const targetColumn = this.container.querySelector(
      `[data-column-id="${newColumnId}"] .base-board-column__cards`
    ) as HTMLElement;
    if (!targetColumn) {
      console.log('[DragDrop] Target column not found for:', newColumnId);
      return;
    }

    // Get all current cards in that target column (excluding the card being moved)
    const existingCards = Array.from(
      targetColumn.querySelectorAll('.base-board-card')
    ).filter(el => el !== cardEl) as HTMLElement[];

    console.log('[DragDrop] Moving card element to index', dropIndex, 'in column', newColumnId);

    // Insert the element at the correct visual index
    if (dropIndex < existingCards.length) {
      // Insert before the card at dropIndex
      targetColumn.insertBefore(cardEl, existingCards[dropIndex]);
    } else {
      // Append to end of column
      targetColumn.appendChild(cardEl);
    }
  }

  private updateDropIndicators(cards: HTMLElement[], dropIndex: number, position: 'before' | 'after'): void {
    // Remove all indicators first
    cards.forEach(card => {
      card.classList.remove('base-board-card--drop-before', 'base-board-card--drop-after');
    });

    // Add appropriate indicator
    if (position === 'before' && dropIndex < cards.length) {
      cards[dropIndex].classList.add('base-board-card--drop-before');
    } else if (position === 'after' && dropIndex > 0) {
      cards[dropIndex - 1].classList.add('base-board-card--drop-after');
    }
  }

  private startAutoScroll(e: DragEvent): void {
    const scrollThreshold = 50;
    const scrollSpeedMultiplier = 10;

    this.autoScrollTimer = window.setInterval(() => {
      const rect = this.container.getBoundingClientRect();
      const mouseY = e.clientY;
      const mouseX = e.clientX;

      // Calculate scroll speed based on distance from edge
      const distFromBottom = rect.bottom - mouseY;
      const distFromTop = mouseY - rect.top;
      const distFromRight = rect.right - mouseX;
      const distFromLeft = mouseX - rect.left;

      this.scrollSpeed.y = distFromBottom < scrollThreshold ? scrollSpeedMultiplier : 
                           distFromTop < scrollThreshold ? -scrollSpeedMultiplier : 0;
      this.scrollSpeed.x = distFromRight < scrollThreshold ? scrollSpeedMultiplier : 
                          distFromLeft < scrollThreshold ? -scrollSpeedMultiplier : 0;

      // Apply scroll
      this.container.scrollBy(0, this.scrollSpeed.y);
      this.container.scrollLeft += this.scrollSpeed.x;
    }, 16); // ~60fps
  }

  private cleanupDrag(): void {
    if (this.autoScrollTimer) {
      clearInterval(this.autoScrollTimer);
      this.autoScrollTimer = null;
    }

    // Remove all drag-related classes
    this.container.querySelectorAll('.base-board-card--dragging').forEach(el => {
      el.classList.remove('base-board-card--dragging');
    });
    this.container.querySelectorAll('.base-board-card--drop-before').forEach(el => {
      el.classList.remove('base-board-card--drop-before');
    });
    this.container.querySelectorAll('.base-board-card--drop-after').forEach(el => {
      el.classList.remove('base-board-card--drop-after');
    });
    this.container.querySelectorAll('.base-board-column--drag-over').forEach(el => {
      el.classList.remove('base-board-column--drag-over');
    });
    this.container.querySelectorAll('.base-board-column--dragging').forEach(el => {
      el.classList.remove('base-board-column--dragging');
    });

    // Remove ghost cards
    this.ghostCards.forEach(card => card.remove());
    this.ghostCards = [];

    this.dragState = null;
  }
}
