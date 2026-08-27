/**
 * TagEditModal - Modal for editing tags on a card or board
 * Features: enter/comma to add, backspace to remove, color display
 */

import { Modal } from './modal';

export class TagEditModal extends Modal {
  private tags: string[];
  private inputEl!: HTMLInputElement;
  private tagListEl!: HTMLElement;
  private onTagsChanged: (tags: string[]) => void;

  constructor(tags: string[], onTagsChanged: (tags: string[]) => void) {
    super({
      title: 'Edit Tags',
      width: 400,
      closable: true,
    });
    this.tags = [...tags];
    this.onTagsChanged = onTagsChanged;
    this.init();
  }

  private init(): void {
    const body = this.getBody();

    // Tag list container
    this.tagListEl = document.createElement('div');
    this.tagListEl.className = 'base-board-tag-edit__list';
    body.appendChild(this.tagListEl);

    // Render existing tags
    this.renderTags();

    // Input field
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'base-board-tag-edit__input-wrapper';

    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.placeholder = 'Type a tag and press Enter...';
    this.inputEl.style.width = '100%';
    this.inputEl.style.padding = '8px 12px';
    this.inputEl.style.backgroundColor = 'var(--background-primary)';
    this.inputEl.style.border = '1px solid var(--border-color)';
    this.inputEl.style.borderRadius = '4px';
    this.inputEl.style.color = 'var(--text-normal)';

    // Enter or comma to add tag
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        this.addTag(this.inputEl.value.trim());
        this.inputEl.value = '';
      }
      
      // Backspace to remove last tag
      if (e.key === 'Backspace' && this.inputEl.value === '' && this.tags.length > 0) {
        this.removeTag(this.tags[this.tags.length - 1]);
      }
    });

    inputWrapper.appendChild(this.inputEl);
    body.appendChild(inputWrapper);
  }

  private renderTags(): void {
    this.tagListEl.innerHTML = '';
    
    this.tags.forEach(tag => {
      const tagEl = document.createElement('span');
      tagEl.className = 'base-board-tag-edit__tag';
      tagEl.textContent = tag;
      
      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.className = 'base-board-tag-edit__tag-remove';
      removeBtn.innerHTML = '&times;';
      removeBtn.addEventListener('click', () => {
        this.removeTag(tag);
      });
      
      tagEl.appendChild(removeBtn);
      this.tagListEl.appendChild(tagEl);
    });
  }

  private addTag(tag: string): void {
    if (!tag || this.tags.includes(tag)) return;
    
    this.tags.push(tag);
    this.renderTags();
    this.onTagsChanged(this.tags);
  }

  private removeTag(tag: string): void {
    const index = this.tags.indexOf(tag);
    if (index > -1) {
      this.tags.splice(index, 1);
      this.renderTags();
      this.onTagsChanged(this.tags);
    }
  }
}
