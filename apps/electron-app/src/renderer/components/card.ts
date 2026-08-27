/**
 * Card - Renders a single Kanban card
 * Displays: title, cover image, chips, border property, action menu
 */

import { CardData } from '../services/board-state';
import { InputModal } from './input-modal';
import { ConfirmModal } from './confirm-modal';
import { CardCallbacks } from './kanban-board';

export interface CardOptions {
  showChips?: boolean;
  showCover?: boolean;
  showActions?: boolean;
}

export class Card {
  private data: CardData;
  private options: CardOptions;
  private callbacks: CardCallbacks;
  element: HTMLElement;

  constructor(data: CardData, callbacks: CardCallbacks, options: CardOptions = {}) {
    this.data = data;
    this.options = {
      showChips: true,
      showCover: false,
      showActions: true,
      ...options,
    };
    this.callbacks = callbacks;
    this.element = this.createCardElement();
  }

  private createCardElement(): HTMLElement {
    const cardEl = document.createElement('div');
    cardEl.className = 'base-board-card';
    cardEl.dataset.cardId = this.data.id;
    cardEl.draggable = true;

    // Cover image (if configured)
    if (this.options.showCover && this.data.properties.cover) {
      const coverEl = document.createElement('img');
      coverEl.className = 'base-board-card__cover';
      coverEl.src = this.data.properties.cover as string;
      coverEl.alt = '';
      cardEl.appendChild(coverEl);
    }

    // Title
    const titleEl = document.createElement('div');
    titleEl.className = 'base-board-card__title';
    titleEl.textContent = this.data.title || 'Untitled';
    cardEl.appendChild(titleEl);

    // Chips (if configured)
    if (this.options.showChips && this.data.tags.length > 0) {
      const chipsEl = document.createElement('div');
      chipsEl.className = 'base-board-card__chips';
      
      this.data.tags.forEach(tag => {
        const chipEl = document.createElement('span');
        chipEl.className = 'base-board-card__chip';
        chipEl.textContent = tag;
        chipsEl.appendChild(chipEl);
      });
      
      cardEl.appendChild(chipsEl);
    }

    // Action menu (if configured)
    if (this.options.showActions) {
      const actionsEl = document.createElement('div');
      actionsEl.className = 'base-board-card__actions';

      // Rename button
      const renameBtn = this.createActionButton('✏️', 'Rename', () => {
        this.handleRename();
      });
      actionsEl.appendChild(renameBtn);

      // Delete button
      const deleteBtn = this.createActionButton('🗑️', 'Delete', () => {
        this.handleDelete();
      });
      actionsEl.appendChild(deleteBtn);

      // Open button (opens in editor)
      const openBtn = this.createActionButton('📂', 'Open', () => {
        this.handleOpen();
      });
      actionsEl.appendChild(openBtn);

      cardEl.appendChild(actionsEl);
    }

    return cardEl;
  }

  private createActionButton(icon: string, title: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'base-board-card__action-btn';
    btn.textContent = icon;
    btn.title = title;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  private handleRename(): void {
    new InputModal(
      'Rename card',
      'Enter new title',
      async (newTitle: string) => {
        if (newTitle.trim()) {
          await this.callbacks.onRename(this.data.id, newTitle.trim());
        }
      },
      this.data.title,
    );
  }

  private handleDelete(): void {
    new ConfirmModal(
      `Delete card "${this.data.title}"?`,
      async () => {
        await this.callbacks.onDelete(this.data.id);
      },
    );
  }

  private handleOpen(): void {
    this.callbacks.onOpen(this.data.id);
  }
}
