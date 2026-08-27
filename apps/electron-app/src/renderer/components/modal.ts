/**
 * Modal base class for Electron app
 * Follows the same pattern as Obsidian plugin's Modal class
 */
export interface ModalOptions {
  title: string;
  width?: number;
  height?: number;
  closable?: boolean;
}

export abstract class Modal {
  protected modalEl: HTMLElement;
  protected contentEl: HTMLElement;
  protected options: ModalOptions;

  constructor(options: ModalOptions) {
    this.options = {
      closable: true,
      ...options,
    };

    // Create modal overlay
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'base-board-modal';
    this.modalEl.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    // Create modal content
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'base-board-modal__content';
    this.contentEl.style.cssText = `
      background: var(--background-secondary, #252526);
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      min-width: ${options.width || 400}px;
      max-width: 90vw;
      max-height: 90vh;
      overflow: auto;
    `;

    this.modalEl.appendChild(this.contentEl);
    document.body.appendChild(this.modalEl);

    // Close on overlay click
    if (options.closable !== false) {
      this.modalEl.addEventListener('click', (e) => {
        if (e.target === this.modalEl) {
          this.close();
        }
      });
    }

    // Close on Escape key
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Call onOpen immediately - subclasses override this to render content
    queueMicrotask(() => this.onOpen());
  }

  abstract onOpen(): void;

  close(): void {
    this.onClose();
    if (this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }
  }

  onClose(): void {
    this.contentEl.empty?.();
  }

  getHeader(): HTMLElement {
    let header = this.contentEl.querySelector('.base-board-modal__header');
    if (!header) {
      header = document.createElement('div');
      header.className = 'base-board-modal__header';
      header.style.cssText = `
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-color, #3a3a3a);
        display: flex;
        align-items: center;
        justify-content: space-between;
      `;
      this.contentEl.insertBefore(header, this.contentEl.firstChild);
    }
    return header;
  }

  getBody(): HTMLElement {
    let body = this.contentEl.querySelector('.base-board-modal__body');
    if (!body) {
      body = document.createElement('div');
      body.className = 'base-board-modal__body';
      body.style.padding = '20px';
      this.contentEl.appendChild(body);
    }
    return body;
  }

  getFooter(): HTMLElement {
    let footer = this.contentEl.querySelector('.base-board-modal__footer');
    if (!footer) {
      footer = document.createElement('div');
      footer.className = 'base-board-modal__footer';
      footer.style.cssText = `
        padding: 12px 20px;
        border-top: 1px solid var(--border-color, #3a3a3a);
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      `;
      this.contentEl.appendChild(footer);
    }
    return footer;
  }

  /**
   * Helper to create a Setting-like component (label + control)
   */
  protected createSettingGroup(title: string): HTMLElement {
    const group = document.createElement('div');
    group.className = 'base-board-settings__group';
    group.style.marginBottom = '20px';

    const groupTitle = document.createElement('h3');
    groupTitle.className = 'base-board-settings__group-title';
    groupTitle.textContent = title;
    groupTitle.style.cssText = `
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text-normal, #ffffff);
    `;
    group.appendChild(groupTitle);

    return group;
  }
}
