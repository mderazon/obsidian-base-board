/**
 * IconPickerModal - Searchable icon grid for selecting icons
 * Bundles a set of icons since Electron doesn't have Obsidian's getIconIds()
 */

import { Modal } from './modal';

// Bundled icon set (simplified version)
const ICONS = [
  'home', 'folder', 'file', 'edit', 'delete', 'copy', 'paste', 'search',
  'filter', 'sort', 'arrow-up', 'arrow-down', 'arrow-left', 'arrow-right',
  'check', 'x', 'plus', 'minus', 'star', 'heart', 'flag', 'bell',
  'settings', 'user', 'lock', 'unlock', 'eye', 'eye-off', 'zoom-in', 'zoom-out',
  'link', 'external-link', 'download', 'upload', 'cloud', 'database',
  'calendar', 'clock', 'tag', 'bookmark', 'share', 'more-horizontal', 'more-vertical',
];

export class IconPickerModal extends Modal {
  private selectedIcon: string | null = null;
  private onIconSelected: (icon: string) => void;

  constructor(onIconSelected: (icon: string) => void) {
    super({
      title: 'Pick an Icon',
      width: 400,
      height: 500,
      closable: true,
    });
    this.onIconSelected = onIconSelected;
    this.init();
  }

  private init(): void {
    const body = this.getBody();

    // Search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search icons...';
    searchInput.style.width = '100%';
    searchInput.style.padding = '8px 12px';
    searchInput.style.marginBottom = '16px';
    searchInput.style.backgroundColor = 'var(--background-primary)';
    searchInput.style.border = '1px solid var(--border-color)';
    searchInput.style.borderRadius = '4px';
    searchInput.style.color = 'var(--text-normal)';
    body.appendChild(searchInput);

    // Icon grid
    const iconGrid = document.createElement('div');
    iconGrid.className = 'base-board-icon-grid';
    body.appendChild(iconGrid);

    // Render all icons
    this.renderIcons(ICONS, iconGrid);

    // Search filter
    searchInput.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value.toLowerCase();
      const filtered = ICONS.filter(icon => icon.includes(query));
      iconGrid.innerHTML = '';
      this.renderIcons(filtered, iconGrid);
    });
  }

  private renderIcons(icons: string[], container: HTMLElement): void {
    icons.forEach(icon => {
      const iconBtn = document.createElement('button');
      iconBtn.className = 'base-board-icon-grid__item';
      iconBtn.innerHTML = `
        <div class="base-board-icon-grid__icon">${this.getIconSVG(icon)}</div>
        <span class="base-board-icon-grid__label">${icon}</span>
      `;
      iconBtn.addEventListener('click', () => {
        this.selectedIcon = icon;
        this.onIconSelected(icon);
        this.close();
      });
      container.appendChild(iconBtn);
    });
  }

  private getIconSVG(name: string): string {
    // Simplified SVG icons (in production, use a proper icon library)
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
    </svg>`;
  }
}
