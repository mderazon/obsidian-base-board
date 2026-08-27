/**
 * BoardState - In-memory board model
 * Manages columns, cards, and their ordering
 */

export interface ColumnConfig {
  id: string;
  name: string;
  color: string;
  wipLimit: number;
  order: number;
}

export interface CardData {
  id: string;
  title: string;
  columnId: string;
  order: number;
  tags: string[];
  properties: Record<string, unknown>;
  filePath: string;
}

export class BoardState {
  columns: ColumnConfig[] = [];
  cards: CardData[] = [];

  /**
   * Load board configuration from a .base file.
   */
  loadFromConfig(config: any): void {
    if (!config || !config.views || config.views.length === 0) {
      throw new Error('Invalid board config');
    }

    const view = config.views[0];
    const boardConfig = view.config;

    // Parse columns
    this.columns = (boardConfig.columns as ColumnConfig[]) || [];
    
    // Sort by order
    this.columns.sort((a, b) => a.order - b.order);

    // TODO: Load cards from tasks directory
    this.cards = [];
  }

  /**
   * Get cards for a specific column.
   */
  getCardsForColumn(columnId: string): CardData[] {
    return this.cards
      .filter((card) => card.columnId === columnId)
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Move a card to a different position.
   */
  moveCard(cardId: string, newColumnId: string, newPosition: number): void {
    const card = this.cards.find((c) => c.id === cardId);
    if (!card) return;

    const oldColumnId = card.columnId;
    card.columnId = newColumnId;
    card.order = this.calculateNewOrder(newColumnId, newPosition);

    // Renormalize orders in the destination column
    this.renormalizeOrders(newColumnId);

    // If moved to a different column, renormalize the old column too
    if (oldColumnId !== newColumnId) {
      this.renormalizeOrders(oldColumnId);
    }
  }

  /**
   * Reorder columns.
   */
  reorderColumns(columnIds: string[]): void {
    columnIds.forEach((id, index) => {
      const column = this.columns.find((c) => c.id === id);
      if (column) {
        column.order = index;
      }
    });
  }

  /**
   * Calculate the new order for a card at a specific position.
   * Uses Trello-style midpoint positioning.
   */
  private calculateNewOrder(columnId: string, position: number): number {
    const cards = this.getCardsForColumn(columnId);
    
    if (cards.length === 0) {
      return 0.5; // Empty column, place in the middle
    }

    if (position === 0) {
      // Before first card
      return cards[0].order / 2;
    }

    if (position === cards.length) {
      // After last card
      const lastCard = cards[cards.length - 1];
      return lastCard.order + 1;
    }

    // Between two cards - use midpoint
    const prevCard = cards[position - 1];
    const nextCard = cards[position];
    return (prevCard.order + nextCard.order) / 2;
  }

  /**
   * Renormalize orders in a column to prevent floating-point precision issues.
   * If the gap between consecutive cards is less than 1.0, reassign sequential orders.
   */
  private renormalizeOrders(columnId: string): void {
    const cards = this.getCardsForColumn(columnId)
      .sort((a, b) => a.order - b.order);

    if (cards.length === 0) return;

    // Check if renormalization is needed
    let needsRenormalize = false;
    for (let i = 1; i < cards.length; i++) {
      if (cards[i].order - cards[i - 1].order < 1.0) {
        needsRenormalize = true;
        break;
      }
    }

    if (!needsRenormalize) return;

    // Reassign sequential orders
    const startOrder = Math.floor(cards[0].order);
    cards.forEach((card, index) => {
      card.order = startOrder + index;
    });
  }
}
