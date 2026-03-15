import { App, TFile } from "obsidian";

const IMAGE_EXTENSIONS = new Set([
  "apng",
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);

const IMAGE_EMBED_RE = /!\[\[([^\]\n]+?)\]\]|!\[[^\]]*]\((.+?)\)/g;

interface ThumbnailCacheEntry {
  mtime: number;
  src: string | null;
}

export class CardThumbnailResolver {
  private app: App;
  private cache = new Map<string, ThumbnailCacheEntry>();

  constructor(app: App) {
    this.app = app;
  }

  public attach(cardEl: HTMLElement, file: TFile): void {
    const cached = this.cache.get(file.path);
    const mtime = file.stat.mtime;

    if (cached && cached.mtime === mtime) {
      if (cached.src) this.render(cardEl, cached.src);
      return;
    }

    void this.loadAndAttach(cardEl, file, mtime);
  }

  private async loadAndAttach(
    cardEl: HTMLElement,
    file: TFile,
    mtime: number,
  ): Promise<void> {
    const src = await this.resolve(file);
    this.cache.set(file.path, { mtime, src });

    if (!src) return;
    if (!cardEl.isConnected) return;
    if (cardEl.dataset.filePath !== file.path) return;

    this.render(cardEl, src);
  }

  private render(cardEl: HTMLElement, src: string): void {
    if (cardEl.querySelector(".base-board-card-thumbnail")) return;

    const thumbEl = document.createElement("div");
    thumbEl.className = "base-board-card-thumbnail";

    const imgEl = document.createElement("img");
    imgEl.className = "base-board-card-thumbnail-img";
    imgEl.alt = "";
    imgEl.loading = "lazy";
    imgEl.decoding = "async";
    imgEl.src = src;
    imgEl.addEventListener("error", () => {
      thumbEl.remove();
      cardEl.removeClass("base-board-card--has-thumbnail");
    });

    thumbEl.appendChild(imgEl);
    cardEl.prepend(thumbEl);
    cardEl.addClass("base-board-card--has-thumbnail");
  }

  private async resolve(file: TFile): Promise<string | null> {
    const markdown = await this.app.vault.cachedRead(file);
    const candidates = this.extractImageCandidates(markdown);

    for (const candidate of candidates) {
      const src = this.resolveImageSource(candidate, file);
      if (src) return src;
    }

    return null;
  }

  private extractImageCandidates(markdown: string): string[] {
    const matches: string[] = [];

    for (const match of markdown.matchAll(IMAGE_EMBED_RE)) {
      const wikiTarget = match[1]?.trim();
      if (wikiTarget) {
        matches.push(wikiTarget);
        continue;
      }

      const markdownTarget = match[2]?.trim();
      if (markdownTarget) matches.push(markdownTarget);
    }

    return matches;
  }

  private resolveImageSource(
    rawTarget: string,
    sourceFile: TFile,
  ): string | null {
    const target = this.normalizeTarget(rawTarget);
    if (!target) return null;

    if (this.isExternalImage(target)) return target;

    const resolved = this.app.metadataCache.getFirstLinkpathDest(
      target,
      sourceFile.path,
    );
    if (!(resolved instanceof TFile)) return null;
    if (!this.isImageFile(resolved)) return null;

    return this.app.vault.getResourcePath(resolved);
  }

  private normalizeTarget(rawTarget: string): string {
    const withoutAlias = rawTarget.split("|")[0]?.trim() ?? "";
    const withoutHeader = withoutAlias.split("#")[0]?.trim() ?? "";

    if (withoutHeader.startsWith("<")) {
      const closing = withoutHeader.indexOf(">");
      if (closing !== -1) {
        return withoutHeader.slice(1, closing).trim();
      }
    }

    const titleMatch =
      /^(.*?)(?:\s+["'][^"']*["'])?$/.exec(withoutHeader)?.[1] ?? withoutHeader;
    return titleMatch.trim();
  }

  private isExternalImage(target: string): boolean {
    return /^https?:\/\//i.test(target) || /^data:image\//i.test(target);
  }

  private isImageFile(file: TFile): boolean {
    return IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
  }
}
