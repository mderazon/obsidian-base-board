/**
 * Column - Renders a single Kanban column
 */

import { ColumnConfig, CardData } from '../services/board-state';
import { CardCallbacks } from './kanban-board';

export class Column {
  private config: ColumnConfig;
  private callbacks: CardCallbacks;
  element: HTMLElement;

  constructor(config: ColumnConfig, callbacks: CardCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    this.element = this.createColumnElement();
  }

  private createColumnElement(): HTMLElement {
    const columnEl = document.createElement('div');
    columnEl.className = 'base-board-column';
    columnEl.dataset.columnId = this.config.id;

    // Column header
    const headerEl = this.createHeader();
    columnEl.appendChild(headerEl);

    // Cards container
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'base-board-column__cards';
    cardsContainer.dataset.columnId = this.config.id;
    columnEl.appendChild(cardsContainer);

    // Add card button
    const addCardBtn = this.createAddCardButton();
    columnEl.appendChild(addCardBtn);

    return columnEl;
  }

  private createHeader(): HTMLElement {
    const headerEl = document.createElement('div');
    headerEl.className = 'base-board-column__header';
    headerEl.style.borderTopColor = this.config.color;

    // Column name
    const nameEl = document.createElement('h3');
    nameEl.className = 'base-board-column__name';
    nameEl.textContent = this.config.name;
    headerEl.appendChild(nameEl);

    // Card count
    const countEl = document.createElement('span');
    countEl.className = 'base-board-column__count';
    countEl.textContent = '0';
    headerEl.appendChild(countEl);

    // WIP limit indicator
    if (this.config.wipLimit > 0) {
      const wipEl = document.createElement('div');
      wipEl.className = 'base-board-column__wip-limit';
      wipEl.textContent = `${this.config.wipLimit} max`;
      headerEl.appendChild(wipEl);
    }

    // Context menu button
    const menuBtn = document.createElement('button');
    menuBtn.className = 'base-board-column__menu-btn';
    menuBtn.innerHTML = '&#8942;';
    menuBtn.title = 'Column options';
    headerEl.appendChild(menuBtn);

    return headerEl;
  }

  private createAddCardButton(): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'base-board-column__add-card-btn';
    btn.textContent = '+ Add card';
    btn.addEventListener('click', () => {
      this.callbacks.onCreateCard(this.config.id);
    });
    return btn;
  }
}
