import { TFile } from "obsidian";
import type { CardData } from "@base-board/board-core/types";
import type { KanbanView } from "./kanban-view";
import type { RenderContext } from "./render-context";

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

/**
 * Extract the first image embed path from a TFile's markdown source.
 *
 * Matches `![[path]]` wiki-links, capturing only the file path before any
 * size modifier (e.g. `![[image|400]]`). Resolves via metadataCache and
 * checks against IMAGE_EXTENSIONS.
 */
function extractFirstEmbed(view: KanbanView, file: TFile): string | null {
  const cache = view.app.metadataCache.getFileCache(file);
  const links = cache?.links ?? [];

  // Try wikilinks first ([[...]])
  for (const link of links) {
    const resolved = view.app.metadataCache.getFirstLinkpathDest(
      link.link,
      file.path,
    );
    if (
      resolved instanceof TFile &&
      IMAGE_EXTENSIONS.has(resolved.extension.toLowerCase())
    ) {
      return view.app.vault.getResourcePath(resolved);
    }
  }

  // Try embeds (![[...]]) — Obsidian stores these separately from wikilinks
  const embeds = cache?.embeds ?? [];
  for (const embed of embeds) {
    if (!embed?.link) continue;
    const resolved = view.app.metadataCache.getFirstLinkpathDest(
      embed.link,
      file.path,
    );
    if (
      resolved instanceof TFile &&
      IMAGE_EXTENSIONS.has(resolved.extension.toLowerCase())
    ) {
      return view.app.vault.getResourcePath(resolved);
    }
  }

  return null;
}

/**
 * Cover image resolution + thumbnail rendering for cards.
 * Extracted from CardManager to keep card.ts focused on rendering/laziness.
 */
export class CardCoverRenderer {
  private view: KanbanView;

  constructor(view: KanbanView) {
    this.view = view;
  }

  public getCoverSrc(
    file: TFile,
    card: CardData,
    ctx: RenderContext,
  ): string | null {
    // Guard against prototype pollution keys even if coverProperty is set
    const coverPropName = ctx.coverProperty;
    if (coverPropName === "__proto__" || coverPropName === "constructor")
      return null;

    // 1. Try frontmatter first (only if a property name is configured)
    if (coverPropName) {
      const cache = this.view.app.metadataCache.getFileCache(file);
      const rawValue: unknown = cache?.frontmatter?.[coverPropName];
      if (
        rawValue &&
        (typeof rawValue === "string" || typeof rawValue === "number")
      ) {
        const src = this.resolveCoverString(String(rawValue), file);
        if (src) return src;
      }
    }

    // 2. Try first embed if enabled
    if (ctx.useFirstEmbed) {
      const embedSrc = extractFirstEmbed(this.view, file);
      if (embedSrc) return embedSrc;
    }

    return null;
  }

  private resolveCoverString(rawValue: string, file: TFile): string | null {
    if (!rawValue) return null;

    if (/^https?:\/\//i.test(rawValue)) return rawValue;

    const cleanPath = rawValue
      .replace(/^!?\[\[(.*?)\]\]$/, "$1")
      .split("|")[0]
      .split("#")[0]
      .trim();

    if (!cleanPath) return null;

    const resolved = this.view.app.metadataCache.getFirstLinkpathDest(
      cleanPath,
      file.path,
    );

    if (
      resolved instanceof TFile &&
      IMAGE_EXTENSIONS.has(resolved.extension.toLowerCase())
    ) {
      return this.view.app.vault.getResourcePath(resolved);
    }

    return null;
  }

  public renderThumbnail(cardEl: HTMLElement, src: string): void {
    const thumbEl = activeDocument.createElement("div");
    thumbEl.className = "base-board-card-thumbnail";
    const thumbImg = thumbEl.createEl("img", {
      cls: "base-board-card-thumbnail-img",
      attr: {
        src,
        loading: "lazy",
        decoding: "async",
        fetchpriority: "low",
        draggable: "false",
      },
    });
    thumbImg.addEventListener("error", () => {
      thumbEl.remove();
      cardEl.removeClass("base-board-card--has-thumbnail");
    });
    cardEl.prepend(thumbEl);
    cardEl.addClass("base-board-card--has-thumbnail");
  }
}
