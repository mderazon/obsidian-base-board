import { App, Modal, Setting } from "obsidian";
import { InputModal } from "./modals";
import { ChipPropertiesManager, AvailableProperty } from "./chip-properties";

/** Saved configuration snapshot for the modal. */
export interface ChipConfigSnapshot {
  properties: string[];
  borderProperty: string;
  colors: Record<string, Record<string, string>>;
}

export class ChipConfigModal extends Modal {
  private chipManager: ChipPropertiesManager;
  private onSubmit: (config: ChipConfigSnapshot) => void;
  private availableProps: AvailableProperty[] = [];
  /** Current in-modal state — not persisted until save. */
  private selectedProperties: Set<string> = new Set();
  private borderProperty: string = "";

  constructor(
    app: App,
    chipManager: ChipPropertiesManager,
    onSubmit: (config: ChipConfigSnapshot) => void,
  ) {
    super(app);
    this.chipManager = chipManager;
    this.onSubmit = onSubmit;
    // Initialize from current config
    this.selectedProperties = new Set(chipManager.getChipProperties());
    this.borderProperty = chipManager.getBorderProperty();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Configure chip properties" });

    contentEl.createEl("p", {
      cls: "base-board-chip-config-desc",
      text: "Select which frontmatter fields render as colored chips on cards. Each chip shows only the value. You can also assign specific colors to specific values.",
    });

    // --- Section A: Chip Properties ---
    const sectionA = contentEl.createDiv({
      cls: "base-board-chip-config-section",
    });
    sectionA.createEl("h3", { text: "Chip properties" });
    sectionA.createEl("p", {
      cls: "setting-item-description",
      text: "These fields will appear as colored pills on each card.",
    });

    const refreshBtn = sectionA.createEl("button", {
      cls: "base-board-chip-refresh-btn mod-cta",
      text: "Refresh property list",
    });
    refreshBtn.addEventListener("click", () => {
      void this.refreshAndRender();
    });

    this.propsContainerEl = sectionA.createDiv({
      cls: "base-board-chip-properties-list",
    });

    // --- Section B: Card Border Property ---
    const sectionB = contentEl.createDiv({
      cls: "base-board-chip-config-section",
    });
    sectionB.createEl("h3", { text: "Card border" });
    sectionB.createEl("p", {
      cls: "setting-item-description",
      text: "Pick a field whose mapped color becomes the card's left border.",
    });

    const borderSelect = sectionB.createEl("select", {
      cls: "base-board-chip-border-select",
    });
    borderSelect.createEl("option", { value: "", text: "No border" });
    this.borderSelectEl = borderSelect;

    // --- Section C: Color Mapping Editor ---
    this.colorEditorContainer = contentEl.createDiv({
      cls: "base-board-chip-config-section",
    });
    this.colorEditorContainer.createEl("h3", { text: "Color mappings" });
    this.colorEditorContainer.createEl("p", {
      cls: "setting-item-description",
      text: "Define which color each value should use. Leave empty for auto-assigned colors.",
    });
    this.mappingContainer = this.colorEditorContainer.createDiv({
      cls: "base-board-chip-mapping-container",
    });

    // --- Action buttons ---
    const actionsContainer = contentEl.createDiv({
      cls: "base-board-modal-actions-right",
    });
    new Setting(actionsContainer)
      .addButton((btn) => {
        btn.setButtonText("Cancel").onClick(() => this.close());
      })
      .addButton((btn) => {
        btn
          .setButtonText("Save")
          .setCta()
          .onClick(() => this.submit());
      });

    // Initial render
    void this.refreshAndRender();
  }

  private propsContainerEl!: HTMLDivElement;
  private borderSelectEl!: HTMLSelectElement;
  private colorEditorContainer!: HTMLDivElement;
  private mappingContainer!: HTMLDivElement;

  private async refreshAndRender(): Promise<void> {
    this.availableProps = this.chipManager.discoverAvailableProperties();
    this.renderCheckboxes();
    this.renderBorderSelect();
    this.renderColorMappings();
  }

  private renderCheckboxes(): void {
    this.propsContainerEl.empty();

    if (this.availableProps.length === 0) {
      this.propsContainerEl.createEl("p", {
        cls: "base-board-chip-properties-empty",
        text: "No properties found. Add frontmatter fields to your cards, then click 'refresh property list'.",
      });
      return;
    }

    for (const prop of this.availableProps) {
      const row = this.propsContainerEl.createDiv({
        cls: "base-board-chip-property-row",
      });

      const checkbox = activeDocument.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = this.selectedProperties.has(prop.name);
      checkbox.dataset.propName = prop.name;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.selectedProperties.add(prop.name);
        } else {
          this.selectedProperties.delete(prop.name);
        }
        // Re-render color mappings when selection changes
        this.renderColorMappings();
      });
      row.appendChild(checkbox);

      const label = row.createEl("span", {
        cls: "base-board-chip-property-label",
        text: prop.displayName,
      });
      label.title = prop.name;

      if (prop.sampleValues.length > 0) {
        row.createEl("span", {
          cls: "base-board-chip-property-samples",
          text: `Values: ${prop.sampleValues.join(", ")}`,
        });
      }
    }
  }

  private renderBorderSelect(): void {
    // Clear existing options except the first
    while (this.borderSelectEl.options.length > 1) {
      this.borderSelectEl.remove(1);
    }

    for (const prop of this.availableProps) {
      const option = this.borderSelectEl.createEl("option", {
        value: prop.name,
        text: prop.displayName,
      });
      if (prop.name === this.borderProperty) {
        option.selected = true;
      }
    }

    this.borderSelectEl.addEventListener("change", () => {
      this.borderProperty = this.borderSelectEl.value;
    });
  }

  private renderColorMappings(): void {
    this.mappingContainer.empty();

    const selectedList = Array.from(this.selectedProperties);
    if (selectedList.length === 0) {
      this.mappingContainer.createEl("p", {
        cls: "base-board-chip-properties-empty",
        text: "Select at least one chip property above to configure color mappings.",
      });
      return;
    }

    const currentColors = this.chipManager.getChipColors();

    for (const propName of selectedList) {
      const prop = this.availableProps.find((p) => p.name === propName);
      if (!prop) continue;

      const mappingSection = this.mappingContainer.createDiv({
        cls: "base-board-chip-mapping-section",
      });
      mappingSection.createEl("h4", { text: prop.displayName });

      const propColors = currentColors[propName] || {};
      const values = new Set<string>([...Object.keys(propColors)]);

      // Also add discovered sample values
      for (const sample of prop.sampleValues) {
        values.add(sample);
      }

      // Render existing mappings
      for (const value of values) {
        // If this value has no mapping and isn't a sample, skip (only show mapped + discovered)
        if (!propColors[value] && !prop.sampleValues.includes(value)) continue;
        this.createMappingRow(
          mappingSection,
          propName,
          value,
          propColors[value] || "",
        );
      }

      // Add button for new mappings
      const addBtn = mappingSection.createEl("button", {
        cls: "base-board-chip-add-mapping-btn",
        text: "+ add value",
      });
      addBtn.addEventListener("click", () => {
        new InputModal(
          this.app,
          "New value",
          "Enter value name",
          (newValue) => {
            if (newValue && newValue.trim()) {
              this.addMappingRow(mappingSection, propName, newValue.trim(), "");
            }
          },
        ).open();
      });
    }
  }

  private createMappingRow(
    container: HTMLElement,
    propName: string,
    value: string,
    currentColor: string,
  ): HTMLDivElement {
    const row = container.createDiv({ cls: "base-board-chip-mapping-row" });

    row.createEl("span", {
      cls: "base-board-chip-mapping-value",
      text: value,
    });

    // Color swatch (clickable to change)
    const swatch = row.createEl("input", {
      type: "color",
      cls: "base-board-chip-color-swatch",
    });
    swatch.value = currentColor || "#808080";
    swatch.dataset.propName = propName;
    swatch.dataset.value = value;

    swatch.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      this.updateMapping(propName, value, target.value);
    });

    // Preview swatch background
    if (currentColor) {
      swatch.style.backgroundColor = currentColor;
    }

    // Delete button
    const deleteBtn = row.createEl("button", {
      cls: "base-board-chip-mapping-delete",
      text: "×",
    });
    deleteBtn.title = "Remove mapping";
    deleteBtn.addEventListener("click", () => {
      this.updateMapping(propName, value, "");
      row.remove();
    });

    return row;
  }

  private addMappingRow(
    container: HTMLElement,
    propName: string,
    value: string,
    color: string,
  ): HTMLDivElement {
    return this.createMappingRow(container, propName, value, color);
  }

  private updateMapping(propName: string, value: string, color: string): void {
    const currentColors = this.chipManager.getChipColors();
    if (!currentColors[propName]) currentColors[propName] = {};
    if (color) {
      currentColors[propName][value] = color;
    } else {
      delete currentColors[propName][value];
      if (Object.keys(currentColors[propName]).length === 0) {
        delete currentColors[propName];
      }
    }
    // Don't trigger full render here — only on save
  }

  private submit(): void {
    const config: ChipConfigSnapshot = {
      properties: Array.from(this.selectedProperties),
      borderProperty: this.borderSelectEl.value,
      colors: this.chipManager.getChipColors(),
    };
    this.close();
    this.onSubmit(config);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
