/**
 * ChipConfigPanel - Card-based chip configuration UI
 * 
 * Simplified version of the Obsidian plugin's ChipConfigPanel.
 * Each property is an expandable card with:
 * - Checkbox to enable/disable
 * - Color mapping per value
 * - Style selector (pill/tag/none)
 * 
 * Renders into any container element.
 */

export interface ChipPropertyConfig {
  property: string;
  displayName: string;
  enabled: boolean;
  style: 'pill' | 'tag' | 'none';
  colorMap: Record<string, string>;
  fixedColor?: string;
}

export interface ChipConfigSnapshot {
  properties: ChipPropertyConfig[];
  borderProperty: string;
}

export interface ChipConfigPanelOptions {
  initialProperties: ChipPropertyConfig[];
  availableProperties: Array<{ name: string; displayName: string }>;
  borderProperty: string;
  onSave: (snapshot: ChipConfigSnapshot) => void;
}

export class ChipConfigPanel {
  private properties: ChipPropertyConfig[];
  private availableProperties: Array<{ name: string; displayName: string }>;
  private borderProperty: string;
  private onSave: (snapshot: ChipConfigSnapshot) => void;
  private container: HTMLElement;

  constructor(options: ChipConfigPanelOptions, container: HTMLElement) {
    this.properties = JSON.parse(JSON.stringify(options.initialProperties || []));
    this.availableProperties = options.availableProperties || [];
    this.borderProperty = options.borderProperty || '';
    this.onSave = options.onSave;
    this.container = container;
  }

  render(): void {
    this.container.innerHTML = '';
    this.renderHeader();
    this.renderPropertyList();
    this.renderBorderSection();
    this.renderSaveButton();
  }

  private renderHeader(): void {
    const header = document.createElement('div');
    header.className = 'chip-config-header';
    header.innerHTML = `
      <h2>Chip configuration</h2>
      <p class="setting-item-description">
        Manage which frontmatter fields appear as colored chips on cards.
      </p>
    `;
    this.container.appendChild(header);
  }

  private renderPropertyList(): void {
    const section = document.createElement('div');
    section.className = 'chip-config-section';
    
    const title = document.createElement('h3');
    title.textContent = 'Properties';
    section.appendChild(title);

    const desc = document.createElement('p');
    desc.className = 'setting-item-description';
    desc.textContent = 'Select which fields appear as chips. Click to expand and configure colors.';
    section.appendChild(desc);

    const list = document.createElement('div');
    list.className = 'chip-property-list';

    // Render existing properties
    this.properties.forEach((prop, index) => {
      const card = this.createPropertyCard(prop, index);
      list.appendChild(card);
    });

    // Add new property button
    const addBtn = document.createElement('button');
    addBtn.className = 'chip-add-property-btn';
    addBtn.textContent = '+ Add property';
    addBtn.addEventListener('click', () => this.addProperty());
    list.appendChild(addBtn);

    section.appendChild(list);
    this.container.appendChild(section);
  }

  private createPropertyCard(config: ChipPropertyConfig, index: number): HTMLElement {
    const card = document.createElement('div');
    card.className = 'chip-property-card';
    if (config.enabled) {
      card.classList.add('is-expanded');
    }

    // Header row
    const header = document.createElement('div');
    header.className = 'chip-card-header';

    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = config.enabled;
    checkbox.className = 'chip-property-checkbox';
    checkbox.addEventListener('change', () => {
      config.enabled = checkbox.checked;
      card.classList.toggle('is-expanded', checkbox.checked);
    });
    header.appendChild(checkbox);

    // Property name
    const label = document.createElement('span');
    label.className = 'chip-card-label';
    label.textContent = config.property || '(unnamed)';
    label.title = config.property;
    header.appendChild(label);

    // Expand/collapse button
    const expandBtn = document.createElement('button');
    expandBtn.className = 'chip-expand-btn';
    expandBtn.textContent = config.enabled ? '▾' : '▸';
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      config.enabled = !config.enabled;
      card.classList.toggle('is-expanded', config.enabled);
    });
    header.appendChild(expandBtn);

    card.appendChild(header);

    // Expanded content
    if (config.enabled) {
      const content = document.createElement('div');
      content.className = 'chip-card-content';

      // Style selector
      const styleGroup = this.createSettingGroup('Display style');
      const styleSelect = document.createElement('select');
      styleSelect.className = 'chip-style-select';
      styleSelect.innerHTML = `
        <option value="pill" ${config.style === 'pill' ? 'selected' : ''}>Pill</option>
        <option value="tag" ${config.style === 'tag' ? 'selected' : ''}>Tag</option>
        <option value="none" ${config.style === 'none' ? 'selected' : ''}>None</option>
      `;
      styleSelect.addEventListener('change', () => {
        config.style = styleSelect.value as any;
      });
      styleGroup.appendChild(styleSelect);
      content.appendChild(styleGroup);

      // Color mapping
      const colorGroup = this.createSettingGroup('Color mapping');
      const colorDesc = document.createElement('p');
      colorDesc.className = 'setting-item-description';
      colorDesc.textContent = 'Set custom colors for specific values. Leave empty for auto-colors.';
      colorGroup.appendChild(colorDesc);

      const colorList = document.createElement('div');
      colorList.className = 'chip-color-list';

      // Render existing color mappings
      Object.entries(config.colorMap || {}).forEach(([value, color]) => {
        const row = this.createColorRow(value, color, config);
        colorList.appendChild(row);
      });

      // Add color button
      const addColorBtn = document.createElement('button');
      addColorBtn.className = 'chip-add-color-btn';
      addColorBtn.textContent = '+ Add value color';
      addColorBtn.addEventListener('click', () => {
        config.colorMap = config.colorMap || {};
        config.colorMap['new-value'] = '#808080';
        colorList.innerHTML = '';
        Object.entries(config.colorMap).forEach(([value, color]) => {
          colorList.appendChild(this.createColorRow(value, color, config));
        });
      });
      colorList.appendChild(addColorBtn);

      colorGroup.appendChild(colorList);
      content.appendChild(colorGroup);

      card.appendChild(content);
    }

    return card;
  }

  private createColorRow(value: string, color: string, config: ChipPropertyConfig): HTMLElement {
    const row = document.createElement('div');
    row.className = 'chip-color-row';

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.value = value;
    valueInput.placeholder = 'Value';
    valueInput.className = 'chip-color-value-input';
    valueInput.addEventListener('change', () => {
      const oldKey = value;
      const newKey = valueInput.value;
      if (oldKey !== newKey && config.colorMap) {
        config.colorMap[newKey] = config.colorMap[oldKey] || color;
        delete config.colorMap[oldKey];
      }
    });
    row.appendChild(valueInput);

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = color;
    colorInput.className = 'chip-color-picker';
    colorInput.addEventListener('change', () => {
      if (config.colorMap) {
        config.colorMap[value] = colorInput.value;
      }
    });
    row.appendChild(colorInput);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'chip-remove-btn';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      if (config.colorMap) {
        delete config.colorMap[value];
        row.remove();
      }
    });
    row.appendChild(removeBtn);

    return row;
  }

  private renderBorderSection(): void {
    const section = document.createElement('div');
    section.className = 'chip-config-section';

    const title = document.createElement('h3');
    title.textContent = 'Card border';
    section.appendChild(title);

    const desc = document.createElement('p');
    desc.className = 'setting-item-description';
    desc.textContent = 'Choose a frontmatter field to control card border color.';
    section.appendChild(desc);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = this.borderProperty;
    input.placeholder = 'None';
    input.className = 'chip-border-input';
    input.addEventListener('change', () => {
      this.borderProperty = input.value;
    });
    section.appendChild(input);

    this.container.appendChild(section);
  }

  private renderSaveButton(): void {
    const footer = document.createElement('div');
    footer.className = 'chip-config-footer';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'base-board-button mod-cta';
    saveBtn.textContent = 'Save configuration';
    saveBtn.style.cssText = `
      width: 100%;
      padding: 12px;
      background: var(--accent-color, #7c5cff);
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 20px;
    `;
    saveBtn.addEventListener('click', () => {
      this.onSave({
        properties: this.properties,
        borderProperty: this.borderProperty,
      });
    });
    footer.appendChild(saveBtn);

    this.container.appendChild(footer);
  }

  private createSettingGroup(title: string): HTMLElement {
    const group = document.createElement('div');
    group.className = 'chip-setting-group';
    group.style.marginBottom = '16px';

    const label = document.createElement('label');
    label.textContent = title;
    label.style.cssText = `
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--text-normal, #ffffff);
    `;
    group.appendChild(label);

    return group;
  }

  private addProperty(): void {
    this.properties.push({
      property: '',
      displayName: '',
      enabled: true,
      style: 'pill',
      colorMap: {},
    });
    this.render();
  }

  getSnapshot(): ChipConfigSnapshot {
    return {
      properties: JSON.parse(JSON.stringify(this.properties)),
      borderProperty: this.borderProperty,
    };
  }
}
