import { App, Modal, Setting } from "obsidian";
import { ChipPropertiesManager, AvailableProperty } from "./chip-properties";
import { InputModal } from "./modals";

type TabId = "cover" | "chips" | "behavior";

export interface BoardSettingsState {
  coverProperty: string;
  useFirstEmbed: boolean;
  openBehavior: "active" | "modal" | "split" | "tab";
}

/** Snapshot of chip configuration state, returned when the user saves. */
export interface ChipConfigSnapshot {
  properties: string[];
  borderProperty: string;
  colors: Record<string, Record<string, string>>;
  fixedColors: Record<string, string>;
  icons: Record<string, Record<string, string>>;
}

export interface BoardSettingsCallbacks {
  onChipConfigSave?: (config: ChipConfigSnapshot) => void;
  onCoverPropertyChange?: (property: string) => void;
  onUseFirstEmbedChange?: (useFirstEmbed: boolean) => void;
  onOpenBehaviorChange?: (
    behavior: "active" | "modal" | "split" | "tab",
  ) => void;
}

export type BoardSettingsSubmit = (
  chipConfig: ChipConfigSnapshot | null,
) => void;

export class BoardSettingsModal extends Modal {
  private chipManager: ChipPropertiesManager;
  private state: BoardSettingsState;
  private callbacks: BoardSettingsCallbacks;
  private onSubmit: BoardSettingsSubmit;

  private tabContainer!: HTMLElement;
  private contentContainer!: HTMLElement;
  private chipPanel: ChipConfigPanel | null = null;

  constructor(
    app: App,
    chipManager: ChipPropertiesManager,
    state: BoardSettingsState,
    onSubmit: BoardSettingsSubmit,
    callbacks: BoardSettingsCallbacks = {},
  ) {
    super(app);
    this.chipManager = chipManager;
    this.state = { ...state };
    this.onSubmit = onSubmit;
    this.callbacks = callbacks;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("base-board-settings-modal");

    const header = contentEl.createDiv({ cls: "base-board-settings-header" });
    header.createEl("h2", { text: "Board settings" });

    const tabContainer = contentEl.createDiv({
      cls: "base-board-settings-tabs",
    });
    this.tabContainer = tabContainer;

    const contentContainer = contentEl.createDiv({
      cls: "base-board-settings-content",
    });
    this.contentContainer = contentContainer;

    this.renderTabButtons();
    this.switchTab("cover");

    const footer = contentEl.createDiv({ cls: "modal-footer" });

    const cancelBtn = footer.createEl("button", { text: "Cancel" });
    cancelBtn.onclick = () => this.close();

    const saveBtn = footer.createEl("button", {
      text: "Save",
      cls: "mod-cta",
    });
    saveBtn.onclick = () => this.save();
  }

  private renderTabButtons(): void {
    const tabs: { id: TabId; label: string }[] = [
      { id: "cover", label: "Cover images" },
      { id: "chips", label: "Chips & borders" },
      { id: "behavior", label: "Behavior" },
    ];

    for (const tab of tabs) {
      const btn = this.tabContainer.createEl("button", {
        cls: "base-board-settings-tab-item",
        text: tab.label,
      });
      btn.setAttr("data-tab", tab.id);
      btn.onclick = () => this.switchTab(tab.id);
    }
  }

  private switchTab(tab: TabId): void {
    for (const id of ["cover", "chips", "behavior"] as const) {
      const tabEl = this.tabContainer.querySelector(`[data-tab="${id}"]`);
      if (tabEl) {
        tabEl.classList.toggle("mod-active", id === tab);
      }
    }
    this.renderTab(tab);
  }

  private renderTab(tab: TabId): void {
    this.contentContainer.empty();

    switch (tab) {
      case "cover":
        this.renderCoverTab();
        break;
      case "chips":
        this.renderChipsTab();
        break;
      case "behavior":
        this.renderBehaviorTab();
        break;
    }
  }

  private renderCoverTab(): void {
    const page = this.contentContainer.createDiv({
      cls: "base-board-settings-page",
    });

    new Setting(page)
      .setName("Cover property name")
      .setDesc(
        "Frontmatter field that holds an image path or URL. Leave empty to disable cover images.",
      )
      .addText((text) => {
        text.setPlaceholder("Cover").setValue(this.state.coverProperty || "");
        text.inputEl.addClass("base-board-settings-cover-input");
        text.inputEl.addEventListener("input", () => {
          this.state.coverProperty = text.getValue();
          this.callbacks.onCoverPropertyChange?.(text.getValue());
        });
      });

    new Setting(page)
      .setName("Use first embed as cover")
      .setDesc(
        "If no cover property is set, use the first image embedded in the note (e.g. ![[image]]).",
      )
      .addToggle((toggle) => {
        toggle.setValue(this.state.useFirstEmbed);
        toggle.onChange((value) => {
          this.state.useFirstEmbed = value;
          this.callbacks.onUseFirstEmbedChange?.(value);
        });
      });
  }

  private renderChipsTab(): void {
    const page = this.contentContainer.createDiv({
      cls: "base-board-settings-page",
    });

    this.chipPanel = new ChipConfigPanel(
      this.app,
      this.chipManager,
      (config: ChipConfigSnapshot) => {
        this.onSubmit(config);
      },
    );
    this.chipPanel.renderInto(page);
  }

  private renderBehaviorTab(): void {
    const page = this.contentContainer.createDiv({
      cls: "base-board-settings-page",
    });

    new Setting(page)
      .setName("Open card in")
      .setDesc("How cards open when clicked.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("active", "Active pane / tab")
          .addOption("modal", "Floating modal")
          .addOption("split", "Split to the right")
          .addOption("tab", "New tab")
          .setValue(this.state.openBehavior);
        dropdown.selectEl.addClass("base-board-settings-behavior-select");
        dropdown.onChange((value) => {
          this.state.openBehavior = value as
            | "active"
            | "modal"
            | "split"
            | "tab";
          this.callbacks.onOpenBehaviorChange?.(
            value as "active" | "modal" | "split" | "tab",
          );
        });
      });
  }

  private save(): void {
    // Collect chip config snapshot from the panel (if chips tab was rendered).
    let chipConfig: ChipConfigSnapshot | null = null;
    if (this.chipPanel) {
      chipConfig = this.chipPanel.getSnapshot();
    }

    this.close();
    this.onSubmit(chipConfig);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
//  Chip Config Panel (card-based layout with drag-and-drop reordering)
// ---------------------------------------------------------------------------

/**
 * Card-based chip configuration UI.
 *
 * Each property is an expandable card with:
 * - Drag handle for reordering
 * - Checkbox to enable/disable
 * - Expandable section for color/icon configuration
 *
 * Renders into any container element; does not manage its own modal lifecycle.
 */
export class ChipConfigPanel {
  private app: App;
  private chipManager: ChipPropertiesManager;
  private onSave: (config: ChipConfigSnapshot) => void;

  private availableProps: AvailableProperty[] = [];

  private selectedProperties: string[] = [];
  private activeProperty: string | null = null;
  private borderProperty: string = "";

  private colorState: Record<string, Record<string, string>> = {};
  private fixedColors: Record<string, string> = {};
  private chipIcons: Record<string, Record<string, string>> = {};
  private useFixedColor: boolean = false;

  // Layout refs
  private propsContainerEl!: HTMLDivElement;
  private borderSelectEl!: HTMLSelectElement;

  // Drag state
  private draggedPropertyIndex: number | null = null;

  constructor(
    app: App,
    chipManager: ChipPropertiesManager,
    onSave: (config: ChipConfigSnapshot) => void,
  ) {
    this.app = app;
    this.chipManager = chipManager;
    this.onSave = onSave;

    this.selectedProperties = [...chipManager.getChipProperties()];
    this.borderProperty = chipManager.getBorderProperty();
    this.colorState = { ...chipManager.getChipColors() };
    this.fixedColors = { ...chipManager.getFixedColors() };
    this.chipIcons = { ...chipManager.getChipIcons() };
  }

  renderInto(container: HTMLElement): void {
    container.empty();

    const header = container.createDiv({ cls: "chip-config-header" });
    header.createEl("h2", { text: "Chip configuration" });
    header.createEl("p", {
      text: "Manage chip fields, colors, and display behavior.",
      cls: "setting-item-description",
    });

    const propSection = container.createDiv({ cls: "chip-config-section" });
    propSection.createEl("h3", { text: "Properties" });

    const refreshBtn = propSection.createEl("button", {
      text: "Refresh",
      cls: "mod-cta",
    });
    refreshBtn.onclick = () => this.refreshAndRender();

    this.propsContainerEl = propSection.createDiv({
      cls: "chip-property-list",
    });

    const borderSection = container.createDiv({ cls: "chip-config-section" });
    borderSection.createEl("h3", { text: "Card border" });

    this.borderSelectEl = borderSection.createEl("select");

    void this.refreshAndRender();
  }

  /** Collect current config state for persistence. */
  getSnapshot(): ChipConfigSnapshot {
    return {
      properties: [...this.selectedProperties],
      borderProperty: this.borderProperty,
      colors: { ...this.colorState },
      fixedColors: { ...this.fixedColors },
      icons: { ...this.chipIcons },
    };
  }

  // ----------------------------
  // DATA REFRESH
  // ----------------------------
  private async refreshAndRender(): Promise<void> {
    this.availableProps = this.chipManager.discoverAvailableProperties();
    this.renderPropertyList();
    this.renderBorderSelect();
  }

  // -- Property list (card-based) --------------------------------------------
  private renderPropertyList(): void {
    if (!this.propsContainerEl) return;
    this.propsContainerEl.empty();

    if (this.availableProps.length === 0) {
      this.propsContainerEl.createEl("div", {
        text: "No properties found yet.",
        cls: "chip-empty-state",
      });
      return;
    }

    const orderedProps = [
      ...this.selectedProperties.map((name) =>
        this.availableProps.find((p) => p.name === name),
      ),
      ...this.availableProps.filter(
        (p) => !this.selectedProperties.includes(p.name),
      ),
    ].filter(Boolean) as AvailableProperty[];

    for (let i = 0; i < orderedProps.length; i++) {
      const prop = orderedProps[i];
      if (!prop) continue;
      const card = this.renderPropertyCard(prop, i);
      this.propsContainerEl.appendChild(card);
    }
  }

  private renderPropertyCard(
    prop: AvailableProperty,
    index: number,
  ): HTMLDivElement {
    const card = this.propsContainerEl.createDiv({
      cls: "chip-property-card",
    });
    card.draggable = true;

    // Header row (drag handle, checkbox, label, expand button)
    const header = card.createDiv({ cls: "chip-card-header" });

    // Drag handle
    const dragHandle = header.createDiv({ cls: "chip-drag-handle" });
    dragHandle.textContent = "⠿";
    dragHandle.title = "Drag to reorder";

    // Checkbox
    const checkbox = header.createEl("input", { type: "checkbox" });
    checkbox.checked = this.selectedProperties.includes(prop.name);
    checkbox.onchange = () => {
      if (checkbox.checked) {
        if (!this.selectedProperties.includes(prop.name)) {
          this.selectedProperties.push(prop.name);
        }
        this.activeProperty = prop.name;
      } else {
        this.selectedProperties = this.selectedProperties.filter(
          (p) => p !== prop.name,
        );
        if (this.activeProperty === prop.name) {
          this.activeProperty = null;
        }
      }
      this.renderPropertyList();
    };

    // Label
    const label = header.createEl("span", {
      text: prop.displayName,
      cls: "chip-card-label",
    });
    label.title = prop.name;

    // Expand toggle
    const expandBtn = header.createEl("button", {
      text: this.activeProperty === prop.name ? "▾" : "▸",
      cls: "chip-expand-btn",
    });
    expandBtn.onclick = (e) => {
      e.stopPropagation();
      if (this.activeProperty === prop.name) {
        this.activeProperty = null;
      } else {
        this.activeProperty = prop.name;
      }
      this.renderPropertyList();
    };

    // Body (expanded content)
    const body = card.createDiv({ cls: "chip-property-card-body" });
    if (this.activeProperty === prop.name) {
      this.renderPropertyEditor(body, prop);
    } else {
      body.classList.add("is-hidden");
    }

    // Drag handlers
    card.ondragstart = (e) => {
      this.draggedPropertyIndex = index;
      e.dataTransfer?.setData("text/plain", prop.name);
      card.classList.add("is-dragging");
    };
    card.ondragend = () => {
      this.draggedPropertyIndex = null;
      card.classList.remove("is-dragging");
    };
    card.ondragover = (e) => {
      e.preventDefault();
      card.classList.add("chip-drop-target");
    };
    card.ondragleave = () => {
      card.classList.remove("chip-drop-target");
    };
    card.ondrop = (e) => {
      e.preventDefault();
      card.classList.remove("chip-drop-target");
      if (this.draggedPropertyIndex === null) return;

      const fromIndex = this.draggedPropertyIndex;
      const toIndex = index;

      if (fromIndex !== toIndex) {
        const [moved] = this.selectedProperties.splice(fromIndex, 1);
        this.selectedProperties.splice(toIndex, 0, moved);
        this.renderPropertyList();
      }
    };

    return card;
  }

  // -- Border select ---------------------------------------------------------
  private renderBorderSelect(): void {
    if (!this.borderSelectEl) return;
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
      if (prop.name === this.borderProperty) opt.selected = true;
    }

    this.borderSelectEl.onchange = () => {
      this.borderProperty = this.borderSelectEl.value;
    };
  }

  // -- Property editor (expanded card body) ----------------------------------
  private renderPropertyEditor(
    container: HTMLElement,
    prop: AvailableProperty,
  ): void {
    const wrapper = container.createDiv({ cls: "chip-property-editor" });

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

    // Fixed color picker
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

    // Per-value editor
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
        perValueSection.classList.remove("is-hidden");
        fixedSection.classList.add("is-hidden");
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

  // -- Per-value rows (simplified) -------------------------------------------
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
      this.createSimplifiedMappingRow(
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
        this.createSimplifiedMappingRow(container, prop.name, v.trim(), "", "");
      }).open();
    };
  }

  private createSimplifiedMappingRow(
    container: HTMLElement,
    propName: string,
    value: string,
    currentColor: string,
    currentIcon: string,
  ): HTMLDivElement {
    const row = container.createDiv({
      cls: "chip-mapping-row-simple",
    });

    let currentValue = String(value);

    // Value display
    const valueEl = row.createEl("span", {
      text: currentValue,
      cls: "chip-mapping-value",
    });
    valueEl.title = currentValue;

    // Color swatch
    const color = row.createEl("input", {
      type: "color",
      cls: "base-board-chip-color-swatch",
    });
    color.value = currentColor || "#808080";
    color.oninput = () => {
      this.updateMapping(propName, currentValue, color.value);
    };

    // Delete button
    const del = row.createEl("button", {
      text: "×",
      cls: "base-board-chip-mapping-delete",
    });
    del.onclick = () => {
      this.updateMapping(propName, currentValue, "");
      this.updateIconMapping(propName, currentValue, "");
      row.remove();
    };

    return row;
  }

  // -- State updates ---------------------------------------------------------
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
}
