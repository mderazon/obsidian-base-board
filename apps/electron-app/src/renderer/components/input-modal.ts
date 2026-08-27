/**
 * InputModal - Simple text input modal
 * Pattern from: plugins/obsidian-plugin/src/modals.ts (InputModal)
 */
import { Modal } from './modal';

export class InputModal extends Modal {
  private value: string;
  private onSubmit: (value: string) => void;
  private placeholder: string;

  constructor(
    title: string,
    placeholder: string,
    onSubmit: (value: string) => void,
    initialValue?: string,
  ) {
    super({ title, width: 400 });
    this.onSubmit = onSubmit;
    this.placeholder = placeholder;
    this.value = initialValue || '';
  }

  /**
   * Called by base class constructor via prototype lookup.
   * Subclass methods on the prototype are resolved before super() runs,
   * so this override is correctly dispatched even from within super().
   */
  onOpen(): void {
    this.renderInput();
  }

  private renderInput(): void {
    const body = this.getBody();

    console.log('[InputModal] Rendering with value:', this.value, 'placeholder:', this.placeholder);

    // Label
    const label = document.createElement('label');
    label.textContent = 'Name';
    label.style.cssText = `
      display: block;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--text-muted, #888888);
    `;
    body.appendChild(label);

    // Input
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = this.placeholder;
    if (this.value) {
      input.value = this.value;
    }
    console.log('[InputModal] Input value set to:', input.value);
    input.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      background: var(--background-primary, #1e1e1e);
      border: 1px solid var(--border-color, #3a3a3a);
      border-radius: 4px;
      color: var(--text-normal, #ffffff);
      font-size: 14px;
      outline: none;
    `;
    input.addEventListener('focus', () => {
      input.style.borderColor = 'var(--accent-color, #7c5cff)';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = 'var(--border-color, #3a3a3a)';
    });
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        this.submit();
      }
    });
    body.appendChild(input);

    // Focus input after render
    setTimeout(() => input.focus(), 50);

    // Submit button
    const footer = this.getFooter();
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Add';
    submitBtn.className = 'base-board-button mod-cta';
    submitBtn.style.cssText = `
      padding: 8px 16px;
      background: var(--accent-color, #7c5cff);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
    `;
    submitBtn.addEventListener('click', () => this.submit());
    footer.appendChild(submitBtn);
  }

  private submit(): void {
    const body = this.getBody();
    const input = body.querySelector('input') as HTMLInputElement;
    const trimmed = input?.value?.trim() || this.value.trim();
    if (trimmed) {
      this.onSubmit(trimmed);
    }
    this.close();
  }
}
