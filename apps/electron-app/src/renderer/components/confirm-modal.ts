/**
 * ConfirmModal - Confirmation dialog (Yes/No)
 * Pattern from: plugins/obsidian-plugin/src/modals.ts
 */
import { Modal } from './modal';

export class ConfirmModal extends Modal {
  private message: string;
  private confirmText: string;
  private cancelText: string;
  private onConfirm: () => void;
  private onCancel?: () => void;

  constructor(
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    confirmText = 'Yes',
    cancelText = 'No',
  ) {
    super({ title: 'Confirm', width: 400 });
    this.message = message;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
    this.confirmText = confirmText;
    this.cancelText = cancelText;

    // Override onOpen
    const originalOnOpen = this.onOpen.bind(this);
    this.onOpen = () => {
      originalOnOpen();
      this.renderConfirm();
    };
  }

  onOpen(): void {
    // Base implementation does nothing
  }

  private renderConfirm(): void {
    const body = this.getBody();
    body.innerHTML = '';

    const messageEl = document.createElement('p');
    messageEl.textContent = this.message;
    messageEl.style.cssText = `
      font-size: 14px;
      line-height: 1.5;
      color: var(--text-normal, #ffffff);
      margin-bottom: 20px;
    `;
    body.appendChild(messageEl);

    const footer = this.getFooter();

    // Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = this.cancelText;
    cancelBtn.className = 'base-board-button';
    cancelBtn.style.cssText = `
      padding: 8px 16px;
      background: var(--background-modifier-hover, rgba(255,255,255,0.05));
      color: var(--text-normal, #ffffff);
      border: 1px solid var(--border-color, #3a3a3a);
      border-radius: 4px;
      cursor: pointer;
    `;
    cancelBtn.addEventListener('click', () => {
      this.onCancel?.();
      this.close();
    });
    footer.appendChild(cancelBtn);

    // Confirm button
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = this.confirmText;
    confirmBtn.className = 'base-board-button mod-cta';
    confirmBtn.style.cssText = `
      padding: 8px 16px;
      background: #dc3545;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
    `;
    confirmBtn.addEventListener('click', () => {
      this.onConfirm();
      this.close();
    });
    footer.appendChild(confirmBtn);
  }
}
