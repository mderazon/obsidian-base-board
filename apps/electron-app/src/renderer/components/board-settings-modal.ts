/**
 * BoardSettingsModal - Multi-tab settings modal for board configuration
 * Tabs: Cover images, Chips & borders, Behavior
 */

import { Modal } from './modal';
import { ChipConfigPanel } from './chip-config-panel';
import { ColumnConfig } from '../services/board-state';

export interface BoardSettings {
  coverProperty: string;
  cardTitleProperty: string;
  firstEmbed: boolean;
  chipProperties: ChipPropertyConfig[];
  openBehavior: 'split' | 'new-tab' | 'inline';
}

export interface ChipPropertyConfig {
  property: string;
  displayName?: string;
  enabled?: boolean;
  style: 'pill' | 'tag' | 'none';
  colorMap: Record<string, string>;
  fixedColor?: string;
}

export class BoardSettingsModal extends Modal {
  private settings: BoardSettings;
  private columns: ColumnConfig[];
  private activeTab: string = 'cover';

  constructor(settings: BoardSettings, columns: ColumnConfig[]) {
    super({
      title: 'Board Settings',
      width: 600,
      height: 500,
      closable: true,
    });
    this.settings = settings;
    this.columns = columns;
    this.initTabs();
  }

  private initTabs(): void {
    const header = this.getHeader();

    // Tab buttons — use Obsidian plugin class names for consistent styling
    const tabContainer = document.createElement('div');
    tabContainer.className = 'base-board-settings-tabs';

    const tabs = [
      { id: 'cover', label: 'Cover images' },
      { id: 'chips', label: 'Chips & borders' },
      { id: 'behavior', label: 'Behavior' },
    ];

    tabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.className = `base-board-settings-tab-item ${tab.id === this.activeTab ? 'mod-active' : ''}`;
      btn.textContent = tab.label;
      btn.addEventListener('click', () => this.switchTab(tab.id));
      tabContainer.appendChild(btn);
    });

    header.appendChild(tabContainer);

    // Show initial tab content
    this.showTabContent(this.activeTab);
  }

  private switchTab(tabId: string): void {
    this.activeTab = tabId;
    
    // Update tab buttons
    const tabs = this.getHeader().querySelectorAll('.base-board-modal__tab');
    tabs.forEach(tab => {
      if ((tab as HTMLElement).textContent?.includes(this.getTabLabel(tabId))) {
        (tab as HTMLElement).classList.add('active');
      } else {
        (tab as HTMLElement).classList.remove('active');
      }
    });

    // Show tab content
    this.showTabContent(tabId);
  }

  private getTabLabel(tabId: string): string {
    switch (tabId) {
      case 'cover': return 'Cover images';
      case 'chips': return 'Chips & borders';
      case 'behavior': return 'Behavior';
      default: return '';
    }
  }

  private showTabContent(tabId: string): void {
    const body = this.getBody();
    body.innerHTML = ''; // Clear previous content

    switch (tabId) {
      case 'cover':
        this.renderCoverTab(body);
        break;
      case 'chips':
        this.renderChipsTab(body);
        break;
      case 'behavior':
        this.renderBehaviorTab(body);
        break;
    }
  }

  private renderCoverTab(container: HTMLElement): void {
    // Cover property selector
    const coverGroup = this.createSettingGroup('Cover Image Property');
    
    const coverLabel = document.createElement('label');
    coverLabel.textContent = 'Property name for cover images:';
    coverGroup.appendChild(coverLabel);

    const coverInput = document.createElement('input');
    coverInput.type = 'text';
    coverInput.value = this.settings.coverProperty || '';
    coverInput.placeholder = 'e.g., cover, image';
    coverGroup.appendChild(coverInput);

    container.appendChild(coverGroup);

    // First embed toggle
    const embedGroup = this.createSettingGroup('First Embed');
    
    const embedLabel = document.createElement('label');
    embedLabel.textContent = 'Use first embed as cover if no cover property is set:';
    embedGroup.appendChild(embedLabel);

    const embedToggle = document.createElement('input');
    embedToggle.type = 'checkbox';
    embedToggle.checked = this.settings.firstEmbed;
    embedGroup.appendChild(embedToggle);

    container.appendChild(embedGroup);
  }

  private renderChipsTab(container: HTMLElement): void {
    // Use ChipConfigPanel for the chips tab
    const chipContainer = document.createElement('div');
    chipContainer.className = 'chip-config-container';
    
    const panel = new ChipConfigPanel({
      initialProperties: this.settings.chipProperties,
      availableProperties: [], // Will be populated from actual board data in real usage
      borderProperty: '', // Will be loaded from config
      onSave: (snapshot) => {
        this.settings.chipProperties = snapshot.properties;
        // Could also save border property here if needed
        console.log('[Settings] Chip configuration saved:', snapshot);
      },
    }, chipContainer);
    
    panel.render();
    container.appendChild(chipContainer);
  }

 

  private renderBehaviorTab(container: HTMLElement): void {
    // Open behavior selector
    const behaviorGroup = this.createSettingGroup('Card Opening Behavior');
    
    const behaviorLabel = document.createElement('label');
    behaviorLabel.textContent = 'How to open cards:';
    behaviorGroup.appendChild(behaviorLabel);

    const behaviorSelect = document.createElement('select');
    behaviorSelect.innerHTML = `
      <option value="split" ${this.settings.openBehavior === 'split' ? 'selected' : ''}>Split editor</option>
      <option value="new-tab" ${this.settings.openBehavior === 'new-tab' ? 'selected' : ''}>New tab</option>
      <option value="inline" ${this.settings.openBehavior === 'inline' ? 'selected' : ''}>Inline preview</option>
    `;
    behaviorSelect.addEventListener('change', () => {
      this.settings.openBehavior = behaviorSelect.value as any;
    });
    behaviorGroup.appendChild(behaviorSelect);

    container.appendChild(behaviorGroup);
  }

  private createSettingGroup(title: string): HTMLElement {
    const group = document.createElement('div');
    group.className = 'base-board-settings__group';

    const groupTitle = document.createElement('h3');
    groupTitle.className = 'base-board-settings__group-title';
    groupTitle.textContent = title;
    group.appendChild(groupTitle);

    return group;
  }

  /**
   * Get the updated settings.
   */
  getSettings(): BoardSettings {
    return this.settings;
  }
}
