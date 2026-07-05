import { App, Modal, Setting, setIcon } from "obsidian";
import {
  ChipPropertiesManager,
  AvailableProperty,
  ChipStyleRule,
} from "./chip-properties";
import { InputModal } from "./modals";
import { IconPickerModal } from "./icon-picker-modal";
import { CHIP_NEWLINE_SENTINEL } from "./constants";

type TabId = "cover" | "chips" | "behavior";

export interface BoardSettingsState {
  coverProperty: string;
  useFirstEmbed: boolean;
  openBehavior: "active" | "modal" | "split" | "tab";
  cardTitleProperty: string;
}

/** Snapshot of chip configuration state, returned when the user saves. */
export interface ChipConfigSnapshot {
  properties: string[];
  borderProperty: string;
  colors: Record<string, Record<string, string>>;
  fixedColors: Record<string, string>;
  icons: Record<string, Record<string, string>>;
  styleRules: Record<string, ChipStyleRule[]>;
}

export interface BoardSettingsCallbacks {
  onChipConfigSave?: (config: ChipConfigSnapshot) => void;
  onCoverPropertyChange?: (property: string) => void;
  onUseFirstEmbedChange?: (useFirstEmbed: boolean) => void;
  onOpenBehaviorChange?: (
    behavior: "active" | "modal" | "split" | "tab",
  ) => void;
  onCardTitlePropertyChange?: (property: string) => void;
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

    if (!this.chipPanel) {
      this.chipPanel = new ChipConfigPanel(
        this.app,
        this.chipManager,
        (config: ChipConfigSnapshot) => {
          this.onSubmit(config);
        },
      );
    }
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

    new Setting(page)
      .setName("Card title property")
      .setDesc(
        "Frontmatter field to use as the card heading instead of the filename. Leave empty to use the filename.",
      )
      .addText((text) => {
        text
          .setPlaceholder("Title")
          .setValue(this.state.cardTitleProperty || "");
        text.inputEl.addClass("base-board-settings-card-title-input");
        text.inputEl.addEventListener("input", () => {
          this.state.cardTitleProperty = text.getValue();
          this.callbacks.onCardTitlePropertyChange?.(text.getValue());
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

  private styleRulesState: Record<string, ChipStyleRule[]> = {};
  private propertyModes: Record<string, "fixed" | "per-value" | "style-rules"> =
    {};

  // Layout refs
  private propsContainerEl!: HTMLDivElement;
  private borderSelectEl!: HTMLSelectElement;

  // Drag state
  private propertyOrder: string[] = [];
  private draggedPropertyName: string | null = null;

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
    this.styleRulesState = JSON.parse(
      JSON.stringify(this.chipManager.getStyleRules()),
    ) as Record<string, ChipStyleRule[]>;
    const savedModes = chipManager.getPropertyModes();
    for (const [key, value] of Object.entries(savedModes)) {
      if (
        value === "fixed" ||
        value === "per-value" ||
        value === "style-rules"
      ) {
        this.propertyModes[key] = value;
      }
    }
    // Initialize property order from selected properties, inserting newlines
    // at their persisted positions.
    const newlinePositions = chipManager.getNewlinePositions();
    this.propertyOrder = [...this.selectedProperties];
    // Insert sentinels in reverse so earlier indices stay valid.
    for (const pos of newlinePositions.sort((a, b) => b - a)) {
      if (pos >= 0 && pos <= this.propertyOrder.length) {
        this.propertyOrder.splice(pos, 0, CHIP_NEWLINE_SENTINEL);
      }
    }
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
    propSection.createEl("p", {
      text: "Select which frontmatter fields appear as colored chips on cards. Drag to reorder. Add line breaks to group chips visually.",
      cls: "setting-item-description",
    });

    this.propsContainerEl = propSection.createDiv({
      cls: "chip-property-list",
    });

    const borderSection = container.createDiv({ cls: "chip-config-section" });
    borderSection.createEl("h3", { text: "Card border" });
    borderSection.createEl("p", {
      text: "Choose a frontmatter field to control card border color.",
      cls: "setting-item-description",
    });

    this.borderSelectEl = borderSection.createEl("select");

    void this.refreshAndRender();
  }

  /** Collect current config state for persistence. */
  getSnapshot(): ChipConfigSnapshot {
    // Preserve order from propertyOrder, filtered to only selected properties
    // (newlines are structural markers and must not be persisted as properties)
    const properties = this.propertyOrder.filter(
      (name) =>
        name !== CHIP_NEWLINE_SENTINEL &&
        this.selectedProperties.includes(name),
    );

    // Compute newline positions: indices into the filtered property list where
    // newlines should appear. We count newlines that come before each property.
    const newlinePositions: number[] = [];
    let newlineCount = 0;
    for (let i = 0; i < this.propertyOrder.length; i++) {
      if (this.propertyOrder[i] === CHIP_NEWLINE_SENTINEL) {
        newlinePositions.push(newlineCount);
      } else if (
        !this.propertyOrder[i].startsWith(CHIP_NEWLINE_SENTINEL) &&
        this.selectedProperties.includes(this.propertyOrder[i])
      ) {
        newlineCount++;
      }
    }

    // Persist newline positions via the chip manager.
    this.chipManager.setNewlinePositions(newlinePositions);

    return {
      properties,
      borderProperty: this.borderProperty,
      colors: { ...this.colorState },
      fixedColors: { ...this.fixedColors },
      icons: { ...this.chipIcons },
      styleRules: JSON.parse(JSON.stringify(this.styleRulesState)) as Record<
        string,
        ChipStyleRule[]
      >,
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

    // Build ordered list from propertyOrder, adding any new available props at the end
    const orderedNames = [...this.propertyOrder];
    for (const prop of this.availableProps) {
      if (!orderedNames.includes(prop.name)) {
        orderedNames.push(prop.name);
      }
    }

    // If nothing at all (no properties, no newlines), show empty state
    if (
      orderedNames.length === 0 ||
      (orderedNames.length === 1 &&
        !this.availableProps.find((p) => p.name === orderedNames[0]))
    ) {
      this.propsContainerEl.createEl("div", {
        text: "No properties found yet.",
        cls: "chip-empty-state",
      });
      return;
    }

    for (const name of orderedNames) {
      if (name === CHIP_NEWLINE_SENTINEL) {
        const card = this.renderNewlineCard();
        this.propsContainerEl.appendChild(card);
      } else {
        const prop = this.availableProps.find((p) => p.name === name);
        if (!prop) continue;
        const index = orderedNames.indexOf(name);
        const card = this.renderPropertyCard(prop, index);
        this.propsContainerEl.appendChild(card);
      }
    }

    // Add "add line break" button at the bottom
    const addNewlineBtn = this.propsContainerEl.createEl("button", {
      text: "+ add line break",
      cls: "chip-add-newline-btn",
    });
    addNewlineBtn.onclick = () => this.addNewline();
  }

  private renderPropertyCard(
    prop: AvailableProperty,
    index: number,
  ): HTMLDivElement {
    const card = this.propsContainerEl.createDiv({
      cls:
        "chip-property-card" +
        (this.activeProperty === prop.name ? " is-expanded" : ""),
    });

    // Header row (drag handle, checkbox, label, expand button)
    const header = card.createDiv({ cls: "chip-card-header" });

    // Drag handle (only drag handle is draggable, only when selected)
    const dragHandle = header.createDiv({ cls: "chip-drag-handle" });
    dragHandle.textContent = "⠿";
    dragHandle.title = "Drag to reorder";
    dragHandle.draggable = this.selectedProperties.includes(prop.name);
    if (!this.selectedProperties.includes(prop.name)) {
      dragHandle.addClass("is-hidden");
    }
    dragHandle.onclick = (e) => e.stopPropagation();

    // Checkbox
    const checkbox = header.createEl("input", { type: "checkbox" });
    checkbox.checked = this.selectedProperties.includes(prop.name);
    checkbox.onchange = () => {
      if (checkbox.checked) {
        if (!this.selectedProperties.includes(prop.name)) {
          this.selectedProperties.push(prop.name);
          // Also add to property order if not already there
          if (!this.propertyOrder.includes(prop.name)) {
            this.propertyOrder.push(prop.name);
          }
          this.activeProperty = prop.name;
        }
      } else {
        this.selectedProperties = this.selectedProperties.filter(
          (p) => p !== prop.name,
        );
        // Remove from property order
        this.propertyOrder = this.propertyOrder.filter((n) => n !== prop.name);
        if (this.activeProperty === prop.name) {
          this.activeProperty = null;
        }
      }
      this.renderPropertyList();
    };
    checkbox.onclick = (e) => e.stopPropagation();

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

    // Click on header to toggle expanded/collapsed
    header.onclick = () => {
      this.activeProperty =
        this.activeProperty === prop.name ? null : prop.name;
      this.renderPropertyList();
    };

    // Body (expanded content)
    const body = card.createDiv({ cls: "chip-property-card-body" });
    if (this.activeProperty === prop.name) {
      this.renderPropertyEditor(body, prop);
    } else {
      body.classList.add("is-hidden");
    }

    // Drag handlers — only on the drag handle
    dragHandle.ondragstart = (e) => {
      this.draggedPropertyName = prop.name;
      e.dataTransfer!.setData("text/plain", prop.name);
      card.classList.add("is-dragging");

      // Custom floating ghost card
      const rect = card.getBoundingClientRect();
      const wrapper = activeDocument.createElement("div");
      wrapper.style.cssText = `
        position: fixed;
        top: ${e.clientY - 12}px;
        left: ${e.clientX - 12}px;
        transform: rotate(3deg);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
        opacity: 0.85;
        border-radius: var(--radius-m, 6px);
        pointer-events: none;
        z-index: 9999;
      `;

      // Clone the card content (header + body) into the ghost
      const ghost = card.cloneNode(true) as HTMLElement;
      ghost.style.cssText = `
        width: ${rect.width}px;
        border-radius: var(--radius-m, 6px);
        background-color: var(--background-primary);
        border: 1px solid var(--background-modifier-border);
      `;
      // Hide the expanded body in the ghost (just show the header row)
      const ghostBody = ghost.querySelector(".chip-property-card-body");
      if (ghostBody) ghostBody.classList.add("is-hidden");
      wrapper.appendChild(ghost);
      activeDocument.body.appendChild(wrapper);

      e.dataTransfer!.setDragImage(wrapper, 12, 12);
      e.dataTransfer!.effectAllowed = "move";

      // Clean up ghost after browser captures it
      window.requestAnimationFrame(() => wrapper.remove());
    };
    dragHandle.ondragend = () => {
      this.draggedPropertyName = null;
      card.classList.remove("is-dragging");
    };

    // Drop target handlers on card
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
      if (!this.draggedPropertyName) return;

      const fromIndex = this.propertyOrder.indexOf(this.draggedPropertyName);
      const toIndex = this.propertyOrder.indexOf(prop.name);

      if (fromIndex !== -1 && fromIndex !== toIndex) {
        const [moved] = this.propertyOrder.splice(fromIndex, 1);
        this.propertyOrder.splice(toIndex, 0, moved);
        this.renderPropertyList();
      }
    };

    return card;
  }

  // -- Newline (line break) card ---------------------------------------------
  private addNewline(): void {
    this.propertyOrder.push(CHIP_NEWLINE_SENTINEL);
    this.renderPropertyList();
  }

  private removeNewline(): void {
    this.propertyOrder = this.propertyOrder.filter(
      (name) => name !== CHIP_NEWLINE_SENTINEL,
    );
    this.renderPropertyList();
  }

  private renderNewlineCard(): HTMLDivElement {
    const card = this.propsContainerEl.createDiv({
      cls: "chip-newline-card",
    });

    // Header row (drag handle, icon, label, remove button)
    const header = card.createDiv({ cls: "chip-card-header" });

    // Drag handle — always enabled for newlines
    const dragHandle = header.createDiv({ cls: "chip-drag-handle" });
    dragHandle.textContent = "⠿";
    dragHandle.title = "Drag to reorder";
    dragHandle.draggable = true;
    dragHandle.onclick = (e) => e.stopPropagation();

    // Line break icon
    header.createEl("span", {
      text: "↲",
      cls: "chip-newline-icon",
    });

    // Label
    const label = header.createEl("span", {
      text: "Line break",
      cls: "chip-card-label chip-newline-label",
    });
    label.title = "Inserts a line break between chip rows on the card";

    // Remove button
    const removeBtn = header.createEl("button", {
      text: "×",
      cls: "chip-newline-remove-btn",
    });
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      this.removeNewline();
    };

    // Drag handlers — newlines are draggable to reorder
    dragHandle.ondragstart = (e) => {
      this.draggedPropertyName = CHIP_NEWLINE_SENTINEL;
      e.dataTransfer!.setData("text/plain", CHIP_NEWLINE_SENTINEL);
      card.classList.add("is-dragging");

      // Custom floating ghost card
      const rect = card.getBoundingClientRect();
      const wrapper = activeDocument.createElement("div");
      wrapper.style.cssText = `
        position: fixed;
        top: ${e.clientY - 12}px;
        left: ${e.clientX - 12}px;
        transform: rotate(3deg);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
        opacity: 0.85;
        border-radius: var(--radius-m, 6px);
        pointer-events: none;
        z-index: 9999;
      `;

      const ghost = card.cloneNode(true) as HTMLElement;
      ghost.style.cssText = `
        width: ${rect.width}px;
        border-radius: var(--radius-m, 6px);
        background-color: var(--background-primary);
        border: 1px solid var(--background-modifier-border);
      `;
      wrapper.appendChild(ghost);
      activeDocument.body.appendChild(wrapper);

      e.dataTransfer!.setDragImage(wrapper, 12, 12);
      e.dataTransfer!.effectAllowed = "move";

      window.requestAnimationFrame(() => wrapper.remove());
    };
    dragHandle.ondragend = () => {
      this.draggedPropertyName = null;
      card.classList.remove("is-dragging");
    };

    // Drop target handlers on card
    card.ondragover = (e) => {
      e.preventDefault();
      card.classList.add("chip-drop-target", "is-newline-drop");
    };
    card.ondragleave = () => {
      card.classList.remove("chip-drop-target", "is-newline-drop");
    };
    card.ondrop = (e) => {
      e.preventDefault();
      card.classList.remove("chip-drop-target", "is-newline-drop");
      if (!this.draggedPropertyName) return;

      const fromIndex = this.propertyOrder.indexOf(this.draggedPropertyName);
      const toIndex = this.propertyOrder.indexOf(CHIP_NEWLINE_SENTINEL);

      if (fromIndex !== -1 && fromIndex !== toIndex) {
        const [moved] = this.propertyOrder.splice(fromIndex, 1);
        this.propertyOrder.splice(toIndex, 0, moved);
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

    // Show label in front of icon toggle
    const showIconLabelWrapper = wrapper.createDiv({
      cls: "chip-show-label-wrapper",
    });
    const showIconLabelCheckbox = showIconLabelWrapper.createEl("input", {
      type: "checkbox",
      cls: "chip-show-label-checkbox",
    });
    showIconLabelCheckbox.checked =
      this.chipManager.getIconShowLabels()[prop.name] || false;
    showIconLabelCheckbox.onchange = () => {
      const labels = this.chipManager.getIconShowLabels();
      labels[prop.name] = showIconLabelCheckbox.checked;
      this.chipManager.setIconShowLabels(labels);
    };
    const showIconLabelSpan = showIconLabelWrapper.createEl("span", {
      text: "Show label in front of icon",
      cls: "chip-show-label-text",
    });
    showIconLabelWrapper.appendChild(showIconLabelCheckbox);
    showIconLabelWrapper.appendChild(showIconLabelSpan);

    // Mode radio group
    const modeSection = wrapper.createDiv({ cls: "chip-mode-section" });
    const radioName = `chipColorMode-${prop.name}`;
    const fixedRadio = this.buildRadio(
      modeSection,
      radioName,
      "fixed",
      "One color for all values",
    );
    const perValueRadio = this.buildRadio(
      modeSection,
      radioName,
      "per-value",
      "Separate color per value",
    );
    const styleRulesRadio = this.buildRadio(
      modeSection,
      radioName,
      "style-rules",
      "Conditional style rules",
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
    const initialFixedColor = this.fixedColors[prop.name] || "#808080";
    fixedColorInput.value = initialFixedColor;
    if (!this.fixedColors[prop.name]) {
      this.fixedColors[prop.name] = initialFixedColor;
    }
    fixedColorInput.oninput = () => {
      this.fixedColors[prop.name] = fixedColorInput.value;
    };

    // Per-value editor
    const perValueSection = wrapper.createDiv({
      cls: "chip-per-value-section",
    });
    this.renderPerValueRows(perValueSection, prop);

    // Style rules editor
    const styleRulesSection = wrapper.createDiv({
      cls: "chip-style-rules-section",
    });
    this.renderStyleRulesEditor(styleRulesSection, prop);

    // Wire radio toggling (per-property mode stored in closure)
    let mode: "fixed" | "per-value" | "style-rules" =
      this.propertyModes[prop.name] ?? "style-rules";
    const setMode = (newMode: "fixed" | "per-value" | "style-rules") => {
      mode = newMode;
      this.propertyModes[prop.name] = newMode;
      this.chipManager.setPropertyMode(prop.name, newMode);
      if (newMode === "fixed") {
        fixedSection.classList.remove("is-hidden");
        perValueSection.classList.add("is-hidden");
        styleRulesSection.classList.add("is-hidden");
      } else if (newMode === "per-value") {
        delete this.fixedColors[prop.name];
        fixedSection.classList.add("is-hidden");
        perValueSection.classList.remove("is-hidden");
        styleRulesSection.classList.add("is-hidden");
      } else {
        delete this.fixedColors[prop.name];
        fixedSection.classList.add("is-hidden");
        perValueSection.classList.add("is-hidden");
        styleRulesSection.classList.remove("is-hidden");
      }
    };
    fixedRadio.onchange = () => {
      if (fixedRadio.checked) setMode("fixed");
    };
    perValueRadio.onchange = () => {
      if (perValueRadio.checked) setMode("per-value");
    };
    styleRulesRadio.onchange = () => {
      if (styleRulesRadio.checked) setMode("style-rules");
    };

    // Apply saved mode
    if (mode === "fixed") {
      fixedRadio.checked = true;
    } else if (mode === "per-value") {
      perValueRadio.checked = true;
    } else {
      styleRulesRadio.checked = true;
    }
    setMode(mode);
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

    const insertBeforeBtn = (row: HTMLDivElement) => {
      addBtn.parentElement?.insertBefore(row, addBtn);
    };

    addBtn.onclick = () => {
      new InputModal(this.app, "New value", "Enter value", (v) => {
        if (!v?.trim()) return;
        const newRow = this.createSimplifiedMappingRow(
          container,
          prop.name,
          v.trim(),
          "",
          "",
        );
        insertBeforeBtn(newRow);
      }).open();
    };
  }

  // -- Style rules editor ----------------------------------------------------
  private renderStyleRulesEditor(
    container: HTMLElement,
    prop: AvailableProperty,
  ): void {
    const rules = this.styleRulesState[prop.name] || [];

    for (const rule of rules) {
      this.createStyleRuleRow(container, prop.name, rule);
    }

    const addBtn = container.createEl("button", {
      text: "+ add rule",
      cls: "mod-cta",
    });

    const insertBeforeBtn = (row: HTMLDivElement) => {
      addBtn.parentElement?.insertBefore(row, addBtn);
    };

    addBtn.onclick = () => {
      const newRule = this.createNewRule(prop.name);
      if (!this.styleRulesState[prop.name])
        this.styleRulesState[prop.name] = [];
      this.styleRulesState[prop.name] = [
        ...this.styleRulesState[prop.name],
        newRule,
      ];
      const newRow = this.createStyleRuleRow(container, prop.name, newRule);
      insertBeforeBtn(newRow);
    };
  }

  private createNewRule(propName: string): ChipStyleRule {
    return {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      operator: "contains",
      pattern: "",
      color: "#808080",
      icon: "",
    };
  }

  private createStyleRuleRow(
    container: HTMLElement,
    propName: string,
    rule: ChipStyleRule,
  ): HTMLDivElement {
    const row = container.createDiv({ cls: "chip-style-rule-row" });

    // Operator select
    const operatorSelect = row.createEl("select", {
      cls: "chip-style-rule-operator",
    });
    const operators: Array<{ value: string; label: string }> = [
      { value: "contains", label: "contains" },
      { value: "equals", label: "equals" },
      { value: "starts-with", label: "starts with" },
      { value: "ends-with", label: "ends with" },
    ];
    for (const op of operators) {
      const opt = operatorSelect.createEl("option", {
        value: op.value,
        text: op.label,
      });
      if (op.value === rule.operator) opt.selected = true;
    }
    operatorSelect.onchange = () => {
      this.styleRulesState[propName] = (
        this.styleRulesState[propName] || []
      ).map((r) =>
        r.id === rule.id
          ? {
              ...r,
              operator: operatorSelect.value as ChipStyleRule["operator"],
            }
          : r,
      );
    };

    // Pattern input
    const patternInput = row.createEl("input", {
      type: "text",
      cls: "chip-style-rule-pattern",
      placeholder: "e.g. P07",
    });
    patternInput.value = rule.pattern;
    patternInput.oninput = () => {
      this.styleRulesState[propName] = (
        this.styleRulesState[propName] || []
      ).map((r) =>
        r.id === rule.id ? { ...r, pattern: patternInput.value } : r,
      );
    };

    // Color swatch
    const color = row.createEl("input", {
      type: "color",
      cls: "base-board-chip-color-swatch",
    });
    color.value = rule.color || "#808080";
    color.oninput = () => {
      this.styleRulesState[propName] = (
        this.styleRulesState[propName] || []
      ).map((r) => (r.id === rule.id ? { ...r, color: color.value } : r));
    };

    // Icon picker button
    const iconBtn = row.createEl("button", {
      cls: "chip-icon-picker-btn",
    });
    if (rule.icon) {
      setIcon(iconBtn, rule.icon);
      iconBtn.title = `Icon: ${rule.icon}`;
    } else {
      iconBtn.textContent = "🎨";
      iconBtn.title = "Choose icon";
    }
    iconBtn.onclick = () => {
      new IconPickerModal(this.app, rule.icon || "", (iconId: string) => {
        this.styleRulesState[propName] = (
          this.styleRulesState[propName] || []
        ).map((r) => (r.id === rule.id ? { ...r, icon: iconId } : r));
        // Update button display
        if (iconId) {
          setIcon(iconBtn, iconId);
          iconBtn.title = `Icon: ${iconId}`;
        } else {
          iconBtn.textContent = "🎨";
          iconBtn.title = "Choose icon";
        }
      }).open();
    };

    // Delete button
    const del = row.createEl("button", {
      text: "×",
      cls: "base-board-chip-mapping-delete",
    });
    del.onclick = () => {
      this.styleRulesState[propName] = (
        this.styleRulesState[propName] || []
      ).filter((r) => r.id !== rule.id);
      if (this.styleRulesState[propName].length === 0) {
        delete this.styleRulesState[propName];
      }
      row.remove();
    };

    return row;
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

    // Value input (editable)
    const valueInput = row.createEl("input", {
      type: "text",
      cls: "chip-mapping-value-input",
    });
    valueInput.value = currentValue;
    valueInput.placeholder = "Value";
    valueInput.oninput = () => {
      const newValue = valueInput.value.trim();
      if (newValue !== currentValue) {
        // Update the mapping with new value
        this.updateMapping(propName, currentValue, "");
        this.updateIconMapping(propName, currentValue, "");
        this.updateMapping(propName, newValue, color.value || "#808080");
        this.updateIconMapping(propName, newValue, currentIcon);
        currentValue = newValue;
      }
    };

    // Color swatch
    const color = row.createEl("input", {
      type: "color",
      cls: "base-board-chip-color-swatch",
    });
    color.value = currentColor || "#808080";
    color.oninput = () => {
      this.updateMapping(propName, currentValue, color.value);
    };

    // Icon picker button
    const iconBtn = row.createEl("button", {
      cls: "chip-icon-picker-btn",
    });
    if (currentIcon) {
      setIcon(iconBtn, currentIcon);
      iconBtn.title = `Icon: ${currentIcon}`;
    } else {
      iconBtn.textContent = "🎨";
      iconBtn.title = "Choose icon to override shown value";
    }
    iconBtn.onclick = () => {
      new IconPickerModal(this.app, currentIcon || "", (iconId: string) => {
        this.updateIconMapping(propName, currentValue, iconId);
        // Update button display
        if (iconId) {
          setIcon(iconBtn, iconId);
          iconBtn.title = `Icon: ${iconId}`;
        } else {
          iconBtn.textContent = "🎨";
          iconBtn.title = "Choose icon to override shown value";
        }
      }).open();
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
