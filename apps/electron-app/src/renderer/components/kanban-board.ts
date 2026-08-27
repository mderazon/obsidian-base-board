/**
 * KanbanBoard - Main board component
 * Renders columns, cards, and handles drag-and-drop
 */

import { matter } from 'gray-matter-es';
import { ORDER_PROPERTY, DEFAULT_BOARD_CONFIG } from '@base-board/board-core';
import { BoardState, CardData } from '../services/board-state';
import { Column } from './column';
import { Card } from './card';
import { FilterBar } from './filter-bar';
import { DragAndDrop } from '../services/drag-drop';

// Simple path joining for renderer (cross-platform)
function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\\/g, '/').replace(/\/+/g, '/');
}

export interface CardCallbacks {
  onRename: (cardId: string, newTitle: string) => Promise<void>;
  onDelete: (cardId: string) => Promise<void>;
  onOpen: (cardId: string) => Promise<void>;
  onCreateCard: (columnId: string) => Promise<void>;
  onCardMove?: (cardId: string, oldColumnId: string, newColumnId: string) => Promise<void>;
}

export class KanbanBoard {
  private container: HTMLElement;
  private boardState: BoardState;
  private filterBar: FilterBar | null = null;
  private dragAndDrop: DragAndDrop | null = null;
  private callbacks: CardCallbacks;
  private baseFilePath: string | null = null;

  constructor(container: HTMLElement, callbacks: CardCallbacks) {
    this.container = container;
    this.boardState = new BoardState();
    this.callbacks = callbacks;
    this.init();
  }

  private init(): void {
    // Create filter bar at the top
    this.filterBar = new FilterBar();
    this.container.appendChild(this.filterBar.element);

    // Render board
    this.render();
  }

  /**
   * Set the base file path and initialize drag-and-drop.
   */
  setBaseFilePath(basePath: string): void {
    this.baseFilePath = basePath;
    
    // Initialize drag-and-drop after board is rendered
    const boardEl = this.container.querySelector('.base-board-board');
    if (boardEl) {
      this.dragAndDrop = new DragAndDrop(
        boardEl, 
        this.boardState, 
        async (cardId: string, oldColumnId: string, newColumnId: string) => {
          if (this.callbacks.onCardMove) {
            await this.callbacks.onCardMove(cardId, oldColumnId, newColumnId);
          }
        },
        () => {
          // Refresh after drag completes
          this.refresh();
        }
      );
    }
  }

  /**
   * Get the tasks directory path for the current board.
   */
  private getTasksDir(): string | null {
    if (!this.baseFilePath) return null;
    const dir = this.baseFilePath.substring(0, this.baseFilePath.lastIndexOf('/')) || 
                this.baseFilePath.substring(0, this.baseFilePath.lastIndexOf('\\'));
    // Tasks folder is typically <base-name>/tasks/
    const baseName = this.baseFilePath.split(/[\\/]/).pop()?.replace('.base', '') || '';
    return joinPath(dir, baseName, 'tasks');
  }

  private render(): void {
    // Clear existing content (except filter bar)
    const columnsContainer = this.container.querySelector('.base-board-board');
    if (columnsContainer) {
      columnsContainer.remove();
    }

    // Create board container
    const boardEl = document.createElement('div');
    boardEl.className = 'base-board-board';

    // Render columns with cards
    for (const column of this.boardState.columns) {
      const columnEl = new Column(column, this.callbacks);
      const cardsContainer = columnEl.element.querySelector('.base-board-column__cards') as HTMLElement;
      
      // Get and render cards for this column
      const cards = this.boardState.getCardsForColumn(column.id);
      console.log(`[Board] Rendering ${cards.length} cards for column "${column.name}" (id: ${column.id})`);
      
      for (const card of cards) {
        const cardEl = new Card(card, this.callbacks).element;
        cardsContainer.appendChild(cardEl);
      }
      
      boardEl.appendChild(columnEl.element);
    }

    this.container.appendChild(boardEl);
  }

  /**
   * Load board data from a .base file.
   */
  async loadBoard(baseFilePath: string): Promise<void> {
    try {
      console.log('[Board] Loading board from:', baseFilePath);
      const rawConfig = await window.electronAPI.loadBoard(baseFilePath);
      
      // Merge with defaults so unknown/missing keys get sensible fallbacks
      const config = rawConfig
        ? this.mergeWithDefaults(rawConfig)
        : DEFAULT_BOARD_CONFIG;
      
      console.log('[Board] Config loaded:', config);
      this.boardState.loadFromConfig(config);
      
      // Load cards from tasks directory
      await this.loadCardsFromFileSystem(baseFilePath);
      
      console.log('[Board] Board state loaded, columns:', this.boardState.columns.length, 'cards:', this.boardState.cards.length);
      this.render();
      
      // Set base file path for card operations (after render so board element exists)
      this.setBaseFilePath(baseFilePath);
      
      console.log('[Board] Render complete');
    } catch (error) {
      console.error('[Board] Failed to load board:', error);
    }
  }

  private async loadCardsFromFileSystem(baseFilePath: string): Promise<void> {
    try {
      // Tasks folder is in the same directory as the .base file
      const baseDir = baseFilePath.substring(0, baseFilePath.lastIndexOf('/')) || baseFilePath.substring(0, baseFilePath.lastIndexOf('\\'));
      const tasksDir = joinPath(baseDir, 'tasks');
      
      console.log('[Board] Scanning tasks directory:', tasksDir);
      const entries = await window.electronAPI.readDir(tasksDir);
      const cardFiles = entries.filter(entry => entry.endsWith('.md'));
      
      console.log('[Board] Found card files:', cardFiles);
      
      for (const file of cardFiles) {
        const filePath = joinPath(tasksDir, file);
        try {
          const content = await window.electronAPI.readFile(filePath);
          const parsed = matter(content);
          
          const card: CardData = {
            id: file.replace('.md', ''),
            title: (parsed.data.title as string) || file.replace('.md', ''),
            columnId: this.getColumnIdByValue(parsed.data.status as string) || this.boardState.columns[0]?.id || '',
            order: (parsed.data[ORDER_PROPERTY] as number) || 0,
            tags: parsed.data.tags as string[] || [],
            properties: parsed.data as any,
            filePath,
          };
          
          this.boardState.cards.push(card);
        } catch (error) {
          console.error('[Board] Error loading card:', file, error);
        }
      }
      
      console.log('[Board] Loaded', this.boardState.cards.length, 'cards from disk');
    } catch (error) {
      console.error('[Board] Error scanning tasks directory:', error);
    }
  }

  /**
   * Deep-merge loaded config with defaults so missing keys get sensible values.
   */
  private mergeWithDefaults(raw: any): any {
    const merged = { ...DEFAULT_BOARD_CONFIG, ...raw };
    if (raw?.coverProperty) merged.coverProperty = raw.coverProperty;
    if (raw?.cardTitleProperty) merged.cardTitleProperty = raw.cardTitleProperty;
    if (raw?.firstEmbed !== undefined) merged.firstEmbed = raw.firstEmbed;
    if (raw?.chipProperties) merged.chipProperties = raw.chipProperties;
    if (raw?.openBehavior) merged.openBehavior = raw.openBehavior;
    return merged;
  }

  private getColumnIdByValue(value: string): string | undefined {
    const column = this.boardState.columns.find(col => 
      col.name.toLowerCase() === value?.toLowerCase()
    );
    return column?.id;
  }

  /**
   * Update the board when data changes.
   */
  refresh(): void {
    console.log('[Board] Refresh called, columns:', this.boardState.columns.length, 'cards:', this.boardState.cards.length);
    this.render();
    
    // Reinitialize drag-and-drop after re-render
    if (this.baseFilePath) {
      const boardEl = this.container.querySelector('.base-board-board');
      if (boardEl) {
        this.dragAndDrop = new DragAndDrop(
          boardEl, 
          this.boardState, 
          async (cardId: string, oldColumnId: string, newColumnId: string) => {
            if (this.callbacks.onCardMove) {
              await this.callbacks.onCardMove(cardId, oldColumnId, newColumnId);
            }
          },
          () => {
            // Refresh after drag completes
            this.refresh();
          }
        );
      }
    }
  }
}
