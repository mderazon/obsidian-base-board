import { KanbanView } from "./kanban-view";
import { CONFIG_KEY_TAG_COLORS } from "./constants";
import { App, Modal, TFile, setIcon, setTooltip, Setting } from "obsidian";
import { TagEditModal } from "./tag-edit-modal";
import { relativeLuminance } from "./color-utils";

export class Tags {
  private view: KanbanView;
  public activeFilters: Set<string> = new Set();

  constructor(view: KanbanView) {
    this.view = view;
  }

  public getColors(): Record<string, string> {
    const raw = this.view.config?.get(CONFIG_KEY_TAG_COLORS);
    return raw && typeof raw === "object"
      ? (raw as Record<string, string>)
      : {};
  }

  public getDeterministicColor(tag: string): string {
    const DEFAULT_COLORS = [
      "#f87168", // Red
      "#fbbc04", // Orange
      "#fcc934", // Yellow
      "#34a853", // Green
      "#4285f4", // Blue
      "#a142f4", // Purple
      "#f442a1", // Pink
      "#20c997", // Teal
      "#fd7e14", // Orange
      "#6f42c1", // Indigo
    ];
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    return (
      DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length] ||
      DEFAULT_COLORS[0]
    );
  }

  public getColorForTag(tag: string): string {
    const customColors = this.getColors();
    return customColors[tag] || this.getDeterministicColor(tag);
  }

  public setColor(tag: string, color: string): void {
    const colors = this.getColors();
    if (color) {
      colors[tag] = color;
    } else {
      delete colors[tag];
    }
    this.view.config?.set(CONFIG_KEY_TAG_COLORS, colors);
    this.view.scheduleRender();
  }

  public extractTagsFromFile(file: TFile): string[] {
    const cache = this.view.app.metadataCache.getFileCache(file);
    const tags = (cache?.frontmatter?.tags ??
      cache?.frontmatter?.tag) as unknown;
    let fileTags: string[] = [];
    if (Array.isArray(tags)) {
      fileTags = tags.filter((t) => typeof t === "string");
    } else if (typeof tags === "string") {
      fileTags = tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t);
    }
    return fileTags;
  }

  public promptEditTags(file: TFile): void {
    const currentTags = this.extractTagsFromFile(file);
    new TagEditModal(this.view.app, currentTags, this, (newTags: string[]) => {
      void this.view.app.fileManager.processFrontMatter(
        file,
        (fm: Record<string, unknown>) => {
          if (newTags.length === 0) {
            delete fm.tags;
            delete fm.tag;
          } else {
            fm.tags = newTags;
          }
        },
      );
    }).open();
  }

  public renderFilterBar(container: HTMLElement): void {
    const allTags = new Set<string>();

    for (const group of this.view.currentGroups) {
      for (const entry of group.entries) {
        if (entry.file instanceof TFile) {
          const fileTags = this.extractTagsFromFile(entry.file);
          fileTags.forEach((t) => allTags.add(t));
        }
      }
    }

    if (allTags.size === 0 && this.activeFilters.size === 0) {
      return;
    }

    // Insert before the board
    const boardEl = container.querySelector(".base-board-board");
    if (!boardEl) return;

    const barEl = container.createDiv({ cls: "base-board-filter-bar" });
    container.insertBefore(barEl, boardEl);

    const titleEl = barEl.createSpan({
      cls: "base-board-filter-title",
      text: "Filters:",
    });
    setIcon(titleEl, "lucide-filter");

    const tagsArray = Array.from(allTags).sort();

    // Also include any active filters that might not be in the current cards
    for (const activeTag of this.activeFilters) {
      if (!allTags.has(activeTag)) tagsArray.push(activeTag);
    }

    for (const tag of tagsArray) {
      const pill = barEl.createSpan({ cls: "base-board-filter-pill" });
      pill.textContent = tag;

      const tagColor = this.getColorForTag(tag);
      if (tagColor) {
        pill.style.setProperty("--tag-color", tagColor);
        if (relativeLuminance(tagColor) === "dark") {
          pill.addClass("base-board-filter-pill-light");
        } else {
          pill.addClass("base-board-filter-pill-dark");
        }
      }

      if (this.activeFilters.has(tag)) {
        pill.addClass("is-active");
      }

      setTooltip(pill, "Click to filter · Right-click to change color");

      pill.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        new ColorPickerModal(this.view.app, tag, tagColor, (color) =>
          this.setColor(tag, color),
        ).open();
      });

      pill.addEventListener("click", () => {
        if (this.activeFilters.has(tag)) {
          this.activeFilters.delete(tag);
        } else {
          this.activeFilters.add(tag);
        }
        this.view.scheduleRender();
      });
    }

    if (this.activeFilters.size > 0) {
      const clearBtn = barEl.createSpan({
        cls: "base-board-filter-clear",
        text: "Clear",
      });
      clearBtn.addEventListener("click", () => {
        this.activeFilters.clear();
        this.view.scheduleRender();
      });
    }
  }
}

// ---------------------------------------------------------------------------
//  Color picker modal — uses Obsidian Modal for proper focus/Escape handling
// ---------------------------------------------------------------------------

export class ColorPickerModal extends Modal {
  private tag: string;
  private currentColor: string;
  private onChange: (color: string) => void;

  constructor(
    app: App,
    tag: string,
    currentColor: string,
    onChange: (color: string) => void,
  ) {
    super(app);
    this.tag = tag;
    this.currentColor = currentColor;
    this.onChange = onChange;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: `Color for "${this.tag}"` });

    new Setting(contentEl).setName("Tag color").addColorPicker((color) => {
      color.setValue(this.currentColor);
      color.onChange((value) => {
        this.currentColor = value;
        this.onChange(value);
      });
    });

    new Setting(contentEl).addButton((btn) => {
      btn
        .setButtonText("Done")
        .setCta()
        .onClick(() => this.close());
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
