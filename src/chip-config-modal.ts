import { App, Modal, setIcon } from "obsidian";
import { InputModal } from "./modals";
import { IconPickerModal } from "./icon-picker-modal";
import {
  ChipPropertiesManager,
  AvailableProperty,
  ChipColorMap,
  ChipFixedColorMap,
} from "./chip-properties";

export interface ChipConfigSnapshot {
  properties: string[];
  borderProperty: string;
  colors: Record<string, Record<string, string>>;
  fixedColors: ChipFixedColorMap;
  icons: Record<string, Record<string, string>>;
}

export class ChipConfigModal extends Modal {
  private chipManager: ChipPropertiesManager;
  private onSubmit: (config: ChipConfigSnapshot) => void;

  private availableProps: AvailableProperty[] = [];

  private selectedProperties: Set<string> = new Set();
  private activeProperty: string | null = null;
  private borderProperty: string = "";

  // local edit state so color mappings persist even for properties that are
  // not currently checked in the list.
  private colorState: ChipColorMap = {};
  private fixedColors: ChipFixedColorMap = {};
  private chipIcons: Record<string, Record<string, string>> = {};
  private useFixedColor: boolean = false;

  // layout refs
  private leftEl!: HTMLDivElement;
  private rightEl!: HTMLDivElement;

  private propsContainerEl!: HTMLDivElement;
  private borderSelectEl!: HTMLSelectElement;
  private editorContainerEl!: HTMLDivElement;

  constructor(
    app: App,
    chipManager: ChipPropertiesManager,
    onSubmit: (config: ChipConfigSnapshot) => void,
  ) {
    super(app);
    this.chipManager = chipManager;
    this.onSubmit = onSubmit;

    this.selectedProperties = new Set(chipManager.getChipProperties());
    this.borderProperty = chipManager.getBorderProperty();
    this.colorState = { ...chipManager.getChipColors() };
    this.fixedColors = { ...chipManager.getFixedColors() };
    this.chipIcons = { ...chipManager.getChipIcons() };
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.empty();

    // Add class to allow a wider/taller modal. This must go on `modalEl`
    // (the actual .modal box) rather than `containerEl` (the outer
    // .modal-container overlay) — the CSS rule below is scoped to
    // `.modal.base-board-chip-config-modal`, and adding the class to the
    // wrong element silently falls back to Obsidian's default modal width,
    // squeezing the two-column layout and forcing the right pane to scroll.
    this.modalEl.addClass("base-board-chip-config-modal");

    // root layout (header + two-column grid)
    const root = contentEl.createDiv({ cls: "chip-config-layout" });

    this.buildHeader(root);

    this.leftEl = root.createDiv({ cls: "chip-config-left" });
    this.rightEl = root.createDiv({ cls: "chip-config-right" });
    this.buildLeftPanel();
    this.buildRightPanel();

    // Add save button below the layout
    const footerEl = contentEl.createDiv({ cls: "modal-footer" });
    const saveBtn = footerEl.createEl("button", {
      text: "Save",
      cls: "mod-cta",
    });
    saveBtn.onclick = () => this.submit();

    void this.refreshAndRender();
  }

  // ----------------------------
  // HEADER (future-proof hook)
  // ----------------------------
  private buildHeader(parent: HTMLElement): void {
    const header = parent.createDiv({ cls: "chip-config-header" });

    header.createEl("h2", { text: "Chip configuration" });
    header.createEl("p", {
      text: "Manage chip fields, colors, and display behavior.",
      cls: "setting-item-description",
    });
  }

  // ----------------------------
  // LEFT PANEL (navigation)
  // ----------------------------
  private buildLeftPanel(): void {
    // Properties section
    const propSection = this.leftEl.createDiv({ cls: "chip-config-section" });

    propSection.createEl("h3", { text: "Properties" });

    const refreshBtn = propSection.createEl("button", {
      text: "Refresh",
      cls: "mod-cta",
    });

    refreshBtn.onclick = () => this.refreshAndRender();

    this.propsContainerEl = propSection.createDiv({
      cls: "chip-property-list",
    });

    // Border section
    const borderSection = this.leftEl.createDiv({
      cls: "chip-config-section",
    });

    borderSection.createEl("h3", { text: "Card border" });

    this.borderSelectEl = borderSection.createEl("select");
  }

  // ----------------------------
  // RIGHT PANEL (editor)
  // ----------------------------
  private buildRightPanel(): void {
    this.editorContainerEl = this.rightEl.createDiv({
      cls: "chip-editor-container",
    });

    this.renderEmptyEditor();
  }

  private renderEmptyEditor(): void {
    this.editorContainerEl.empty();

    this.editorContainerEl.createEl("div", {
      text: "Select a property to edit its values.",
      cls: "chip-empty-state",
    });
  }

  // ----------------------------
  // DATA REFRESH
  // ----------------------------
  private async refreshAndRender(): Promise<void> {
    this.availableProps = this.chipManager.discoverAvailableProperties();

    this.renderPropertyList();
    this.renderBorderSelect();
    this.renderEditor();
  }

  // ----------------------------
  // LEFT: properties
  // ----------------------------
  private renderPropertyList(): void {
    this.propsContainerEl.empty();

    if (this.availableProps.length === 0) {
      this.propsContainerEl.createEl("div", {
        text: "No properties found yet.",
        cls: "chip-empty-state",
      });
      return;
    }

    for (const prop of this.availableProps) {
      const row = this.propsContainerEl.createDiv({
        cls: "base-board-chip-property-row",
      });

      const checkbox = row.createEl("input", {
        type: "checkbox",
      });

      checkbox.checked = this.selectedProperties.has(prop.name);

      checkbox.onchange = () => {
        if (checkbox.checked) {
          this.selectedProperties.add(prop.name);
          this.activeProperty = prop.name;
        } else {
          this.selectedProperties.delete(prop.name);

          if (this.activeProperty === prop.name) {
            this.activeProperty = null;
          }
        }

        this.renderPropertyList();
        this.renderEditor();
      };

      const label = row.createEl("span", {
        text: prop.displayName,
        cls: "base-board-chip-property-label",
      });

      label.title = prop.name;

      row.classList.toggle("is-active", this.activeProperty === prop.name);

      row.onclick = (evt) => {
        if (evt.target === checkbox) return;
        this.activeProperty = prop.name;
        this.renderPropertyList();
        this.renderEditor();
      };
    }
  }

  // ----------------------------
  // LEFT: border select
  // ----------------------------
  private renderBorderSelect(): void {
    this.borderSelectEl.empty();

    const noneOpt = this.borderSelectEl.createEl("option", {
      value: "",
      text: "No border",
    });

    if (!this.borderProperty) noneOpt.selected = true;

    for (const prop of this.availableProps) {
      const opt = this.borderSelectEl.createEl("option", {
        value: prop.name,
        text: prop.displayName,
      });

      if (prop.name === this.borderProperty) {
        opt.selected = true;
      }
    }

    this.borderSelectEl.onchange = () => {
      this.borderProperty = this.borderSelectEl.value;
    };
  }

  // ----------------------------
  // RIGHT: editor router
  // ----------------------------
  private renderEditor(): void {
    this.editorContainerEl.empty();

    if (!this.activeProperty) {
      this.renderEmptyEditor();
      return;
    }

    const prop = this.availableProps.find(
      (p) => p.name === this.activeProperty,
    );

    if (!prop) return;

    this.renderPropertyEditor(prop);
  }

  // ----------------------------
  // RIGHT: property editor
  // ----------------------------
  private renderPropertyEditor(prop: AvailableProperty): void {
    const wrapper = this.editorContainerEl.createDiv({
      cls: "chip-property-editor",
    });

    wrapper.createEl("h3", { text: prop.displayName });

    // Show label toggle
    const showLabelWrapper = wrapper.createDiv({
      cls: "chip-show-label-wrapper",
    });
    const showLabelCheckbox = showLabelWrapper.createEl("input", {
      type: "checkbox",
      cls: "chip-show-label-checkbox",
    });
    showLabelCheckbox.checked =
      this.chipManager.getShowLabels()[prop.name] || false;
    showLabelCheckbox.onchange = () => {
      const labels = this.chipManager.getShowLabels();
      labels[prop.name] = showLabelCheckbox.checked;
      this.chipManager.setShowLabels(labels);
    };
    const showLabelSpan = showLabelWrapper.createEl("span", {
      text: "Show label in front of value",
      cls: "chip-show-label-text",
    });
    showLabelWrapper.appendChild(showLabelCheckbox);
    showLabelWrapper.appendChild(showLabelSpan);

    // Mode radio group
    const modeSection = wrapper.createDiv({ cls: "chip-mode-section" });
    const fixedRadio = this.buildRadio(
      modeSection,
      "chipColorMode",
      "fixed",
      "One color for all values",
    );
    const perValueRadio = this.buildRadio(
      modeSection,
      "chipColorMode",
      "per-value",
      "Separate color per value",
    );

    // Fixed color picker (single)
    const fixedSection = wrapper.createDiv({ cls: "chip-fixed-section" });
    const fixedLabel = fixedSection.createEl("label", {
      cls: "chip-fixed-label",
    });
    fixedLabel.createEl("span", { text: "Color: " });
    const fixedColorInput = fixedLabel.createEl("input", {
      type: "color",
      cls: "base-board-chip-color-swatch",
    });
    fixedColorInput.value = this.fixedColors[prop.name] || "#808080";
    fixedColorInput.oninput = () => {
      this.fixedColors[prop.name] = fixedColorInput.value;
    };

    // Per-value editor (value rows + add button)
    const perValueSection = wrapper.createDiv({
      cls: "chip-per-value-section",
    });
    this.renderPerValueRows(perValueSection, prop);

    // Wire radio toggling
    fixedRadio.onchange = () => {
      if (fixedRadio.checked) {
        this.useFixedColor = true;
        fixedSection.classList.remove("is-hidden");
        perValueSection.classList.add("is-hidden");
      }
    };
    perValueRadio.onchange = () => {
      if (perValueRadio.checked) {
        this.useFixedColor = false;
        fixedSection.classList.add("is-hidden");
        perValueSection.classList.remove("is-hidden");
      }
    };

    // Set initial visibility
    const hasFixed = !!this.fixedColors[prop.name];
    const hasPerValue =
      Object.keys(this.colorState[prop.name] || {}).length > 0 ||
      prop.sampleValues.length > 0;

    if (hasFixed) {
      fixedRadio.checked = true;
      this.useFixedColor = true;
    } else if (hasPerValue) {
      perValueRadio.checked = true;
      this.useFixedColor = false;
    } else {
      // Default: show per-value section
      perValueRadio.checked = true;
      this.useFixedColor = false;
    }

    if (this.useFixedColor) {
      fixedSection.classList.remove("is-hidden");
      perValueSection.classList.add("is-hidden");
    } else {
      fixedSection.classList.add("is-hidden");
      perValueSection.classList.remove("is-hidden");
    }
  }

  private buildRadio(
    parent: HTMLElement,
    name: string,
    value: string,
    label: string,
  ): HTMLInputElement {
    const wrapper = parent.createEl("label", { cls: "chip-radio-label" });
    const radio = wrapper.createEl("input", {
      type: "radio",
      attr: { name, value },
    });
    wrapper.createEl("span", { text: label });
    return radio;
  }

  private renderPerValueRows(
    container: HTMLElement,
    prop: AvailableProperty,
  ): void {
    const currentColors = this.colorState[prop.name] || {};

    const values = new Set<string>([
      ...prop.sampleValues.map((v) => String(v)),
      ...Object.keys(currentColors),
    ]);

    for (const value of values) {
      this.createMappingRow(
        container,
        prop.name,
        value,
        currentColors[value] || "",
        this.chipIcons[prop.name]?.[value] || "",
      );
    }

    const addBtn = container.createEl("button", {
      text: "+ add value",
      cls: "mod-cta",
    });

    addBtn.onclick = () => {
      new InputModal(this.app, "New value", "Enter value", (v) => {
        if (!v?.trim()) return;

        this.createMappingRowBefore(
          container,
          addBtn,
          prop.name,
          v.trim(),
          "",
          "",
        );
      }).open();
    };
  }

  // ----------------------------
  // MAPPING ROWS
  // ----------------------------
  private createMappingRow(
    container: HTMLElement,
    propName: string,
    value: string,
    currentColor: string,
    currentIcon: string,
  ): HTMLDivElement {
    return this.createMappingRowInternal(
      container,
      propName,
      value,
      currentColor,
      currentIcon,
      null,
    );
  }

  private createMappingRowBefore(
    container: HTMLElement,
    anchor: HTMLElement,
    propName: string,
    value: string,
    currentColor: string,
    currentIcon: string,
  ): HTMLDivElement {
    return this.createMappingRowInternal(
      container,
      propName,
      value,
      currentColor,
      currentIcon,
      anchor,
    );
  }

  private createMappingRowInternal(
    container: HTMLElement,
    propName: string,
    value: string,
    currentColor: string,
    currentIcon: string,
    anchor: HTMLElement | null,
  ): HTMLDivElement {
    const row = container.createDiv({
      cls: "base-board-chip-mapping-row",
    });

    let currentValue = String(value);

    const valueEl = row.createEl("span", {
      text: currentValue,
      cls: "base-board-chip-mapping-value",
    });
    valueEl.title = currentValue;

    const editBtn = row.createEl("button", {
      text: "Edit",
      cls: "base-board-chip-mapping-edit",
    });

    editBtn.onclick = () => {
      new InputModal(
        this.app,
        "Edit value",
        "Enter value",
        (nextValue) => {
          const trimmed = nextValue?.trim();
          if (!trimmed || trimmed === currentValue) return;

          const colors = this.colorState[propName] || {};
          const currentColorForValue = colors[currentValue] || "";
          const currentIconForValue =
            this.chipIcons[propName]?.[currentValue] || "";

          this.updateMapping(propName, currentValue, "");
          this.updateMapping(propName, trimmed, currentColorForValue);

          this.updateIconMapping(propName, currentValue, "");
          this.updateIconMapping(propName, trimmed, currentIconForValue);

          currentValue = trimmed;
          valueEl.textContent = currentValue;
          valueEl.title = currentValue;
        },
        currentValue,
      ).open();
    };

    const color = row.createEl("input", {
      type: "color",
      cls: "base-board-chip-color-swatch",
    });

    color.value = currentColor || "#808080";

    color.oninput = () => {
      this.updateMapping(propName, currentValue, color.value);
    };

    let currentIconValue = currentIcon;

    const iconPickerBtn = row.createEl("button", {
      cls: "chip-icon-picker-btn",
      attr: { type: "button" },
    });
    const iconPreviewEl = iconPickerBtn.createDiv({
      cls: "chip-icon-picker-preview",
    });
    const iconLabelEl = iconPickerBtn.createEl("span", {
      cls: "chip-icon-picker-label",
    });

    const refreshIconPreview = () => {
      iconPreviewEl.empty();
      if (currentIconValue) {
        setIcon(iconPreviewEl, currentIconValue);
        iconPreviewEl.classList.remove("is-empty");
      } else {
        iconPreviewEl.classList.add("is-empty");
      }
      iconLabelEl.textContent = currentIconValue
        ? currentIconValue
            .replace(/^lucide-/, "")
            .split("-")
            .join(" ")
        : "No icon";
    };
    refreshIconPreview();

    iconPickerBtn.onclick = () => {
      new IconPickerModal(this.app, currentIconValue, (iconId) => {
        currentIconValue = iconId;
        this.updateIconMapping(propName, currentValue, currentIconValue);
        refreshIconPreview();
      }).open();
    };

    const del = row.createEl("button", {
      text: "×",
      cls: "base-board-chip-mapping-delete",
    });

    del.onclick = () => {
      this.updateMapping(propName, currentValue, "");
      this.updateIconMapping(propName, currentValue, "");
      row.remove();
    };

    if (anchor) {
      anchor.before(row);
    }

    return row;
  }

  // ----------------------------
  // STATE UPDATE
  // ----------------------------
  private updateMapping(propName: string, value: string, color: string): void {
    const colors = this.colorState;
    const key = String(value);

    if (!colors[propName]) colors[propName] = {};

    if (color) {
      colors[propName][key] = color;
    } else {
      delete colors[propName][key];

      if (Object.keys(colors[propName]).length === 0) {
        delete colors[propName];
      }
    }
  }

  private updateIconMapping(
    propName: string,
    value: string,
    icon: string,
  ): void {
    const key = String(value);
    if (!this.chipIcons[propName]) this.chipIcons[propName] = {};

    if (icon) {
      this.chipIcons[propName][key] = icon;
    } else {
      delete this.chipIcons[propName][key];

      if (Object.keys(this.chipIcons[propName]).length === 0) {
        delete this.chipIcons[propName];
      }
    }
  }

  // ----------------------------
  // SAVE
  // ----------------------------
  private submit(): void {
    const config: ChipConfigSnapshot = {
      properties: Array.from(this.selectedProperties),
      borderProperty: this.borderProperty,
      colors: this.colorState,
      fixedColors: { ...this.fixedColors },
      icons: { ...this.chipIcons },
    };

    this.close();
    this.onSubmit(config);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
