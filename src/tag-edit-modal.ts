import { App, Modal, Setting, setIcon } from "obsidian";
import { Tags } from "./tags";
import { relativeLuminance } from "./color-utils";

export class TagEditModal extends Modal {
  private tags: string[];
  private tagsManager: Tags;
  private onSubmit: (tags: string[]) => void;
  private inputContainerEl!: HTMLElement;
  private inputEl!: HTMLInputElement;

  constructor(
    app: App,
    tags: string[],
    tagsManager: Tags,
    onSubmit: (tags: string[]) => void,
  ) {
    super(app);
    this.tags = [...tags]; // Copy
    this.tagsManager = tagsManager;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    this.titleEl.setText("Edit tags");

    this.contentEl.createEl("p", {
      text: "Type a tag and press enter or comma. Press backspace to remove.",
      cls: "setting-item-description",
    });

    // Container acts as the visual "input box"
    this.inputContainerEl = this.contentEl.createDiv({
      cls: "base-board-tag-input-container",
    });

    // The actual text input
    this.inputEl = this.inputContainerEl.createEl("input", {
      type: "text",
      cls: "base-board-tag-input",
      placeholder: "Add tag...",
    });

    // Support focusing input when clicking anywhere inside the faux-input container
    this.inputContainerEl.addEventListener("click", () => {
      this.inputEl.focus();
    });

    this.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const val = this.inputEl.value.trim();
        if (val && !this.tags.includes(val)) {
          this.tags.push(val);
        }
        this.inputEl.value = "";
        this.renderTags();
      } else if (e.key === "Backspace" && this.inputEl.value === "") {
        if (this.tags.length > 0) {
          this.tags.pop();
          this.renderTags();
        }
      }
    });

    this.renderTags();

    const actionsContainer = this.contentEl.createDiv({
      cls: "base-board-modal-actions-right",
    });

    new Setting(actionsContainer).addButton((btn) => {
      btn
        .setButtonText("Save")
        .setCta()
        .onClick(() => {
          // Flush any pending text before save
          const val = this.inputEl.value.trim();
          if (val && !this.tags.includes(val)) {
            this.tags.push(val);
          }
          this.close();
          this.onSubmit(this.tags);
        });
    });

    setTimeout(() => this.inputEl.focus(), 50);
  }

  private renderTags() {
    // Clear all existing tags (but keep the input!)
    const existingTags = this.inputContainerEl.querySelectorAll(
      ".base-board-tag-chip",
    );
    existingTags.forEach((el) => el.remove());

    // Insert new tags BEFORE the input element
    this.tags.forEach((tag) => {
      const chipEl = this.inputContainerEl.createDiv({
        cls: "base-board-tag-chip",
      });
      chipEl.createSpan({ text: tag, cls: "base-board-tag-chip-text" });

      const color = this.tagsManager.getColorForTag(tag);
      if (color) {
        chipEl.style.setProperty("--tag-color", color);
        if (relativeLuminance(color) === "dark") {
          chipEl.addClass("base-board-tag-chip-light");
        } else {
          chipEl.addClass("base-board-tag-chip-dark");
        }
      }

      const removeBtn = chipEl.createSpan({
        cls: "base-board-tag-chip-remove",
      });
      setIcon(removeBtn, "lucide-x");
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.tags = this.tags.filter((t) => t !== tag);
        this.renderTags();
        this.inputEl.focus();
      });

      this.inputContainerEl.insertBefore(chipEl, this.inputEl);
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
