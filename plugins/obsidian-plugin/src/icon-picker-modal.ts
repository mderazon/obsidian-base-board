import { App, Modal, setIcon, getIconIds } from "obsidian";

// ---------------------------------------------------------------------------
//  Icon picker modal — searchable grid over every icon Obsidian knows about,
//  each tile rendered with the real setIcon() so previews are pixel-accurate
//  (not a hardcoded shortlist).
// ---------------------------------------------------------------------------

export class IconPickerModal extends Modal {
  private currentIcon: string;
  private onSubmit: (iconId: string) => void;

  private allIcons: string[] = [];
  private gridEl!: HTMLDivElement;
  private searchInput!: HTMLInputElement;

  constructor(
    app: App,
    currentIcon: string,
    onSubmit: (iconId: string) => void,
  ) {
    super(app);
    this.currentIcon = currentIcon || "";
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("base-board-icon-picker-modal");

    contentEl.createEl("h3", { text: "Choose an icon" });

    // Search box
    this.searchInput = contentEl.createEl("input", {
      type: "text",
      placeholder: "Search icons…",
      cls: "icon-picker-search",
    });
    this.searchInput.addEventListener("input", () => this.renderGrid());
    window.setTimeout(() => this.searchInput.focus(), 30);

    this.gridEl = contentEl.createDiv({ cls: "icon-picker-grid" });

    // getIconIds() returns every icon registered with Obsidian (lucide-*
    // plus any custom-registered icons), so this always reflects the
    // real, current icon set rather than a hardcoded list.
    this.allIcons = getIconIds().sort();

    this.renderGrid();
  }

  private renderGrid(): void {
    this.gridEl.empty();

    const query = this.searchInput.value.trim().toLowerCase();

    // "No icon" tile always shown first, unaffected by search
    const noneTile = this.gridEl.createDiv({ cls: "icon-picker-tile" });
    noneTile.createDiv({ cls: "icon-picker-tile-glyph icon-picker-none" });
    noneTile.createEl("span", { text: "None", cls: "icon-picker-tile-label" });
    noneTile.classList.toggle("is-selected", !this.currentIcon);
    noneTile.onclick = () => this.choose("");

    const matches = query
      ? this.allIcons.filter((id) => id.toLowerCase().includes(query))
      : this.allIcons;

    if (matches.length === 0) {
      this.gridEl.createDiv({
        cls: "icon-picker-empty",
        text: "No icons match your search.",
      });
      return;
    }

    for (const iconId of matches) {
      const tile = this.gridEl.createDiv({ cls: "icon-picker-tile" });
      const glyph = tile.createDiv({ cls: "icon-picker-tile-glyph" });
      setIcon(glyph, iconId);

      const label = this.cleanLabel(iconId);
      tile.createEl("span", { text: label, cls: "icon-picker-tile-label" });
      tile.title = iconId;

      tile.classList.toggle("is-selected", iconId === this.currentIcon);
      tile.onclick = () => this.choose(iconId);
    }
  }

  private cleanLabel(iconId: string): string {
    return iconId
      .replace(/^lucide-/, "")
      .split("-")
      .join(" ");
  }

  private choose(iconId: string): void {
    this.currentIcon = iconId;
    this.onSubmit(iconId);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
