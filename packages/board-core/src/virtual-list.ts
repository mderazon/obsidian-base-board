/**
 * LazyList — placeholder-based lazy hydration for long card lists.
 *
 * The caller creates lightweight shell elements (one per item, carrying any
 * data attributes needed by event delegation) and registers them here along
 * with a hydrate callback. Shells are hydrated via IntersectionObserver once
 * they approach the scroll container's viewport, so a 300-card column only
 * ever builds full DOM for the cards the user actually scrolls near.
 *
 * Framework-agnostic: works with any scroll container.
 */

export interface LazyListOptions {
  /** Extra margin (px) around the viewport in which cards get hydrated. */
  rootMargin?: string;
}

export class LazyList {
  private root: HTMLElement;
  private rootMargin: string;
  private observer: IntersectionObserver | null = null;
  private pending = new Map<HTMLElement, () => void>();

  constructor(root: HTMLElement, options: LazyListOptions = {}) {
    this.root = root;
    this.rootMargin = options.rootMargin ?? "1000px";
  }

  /**
   * Register a shell element. `hydrate` is invoked at most once, when the
   * element comes within the root margin of the scroll container's viewport.
   */
  public register(el: HTMLElement, hydrate: () => void): void {
    if (!this.observer) {
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const el = entry.target as HTMLElement;
            const callback = this.pending.get(el);
            if (!callback) continue;
            this.pending.delete(el);
            this.observer?.unobserve(el);
            callback();
          }
        },
        { root: this.root, rootMargin: this.rootMargin },
      );
    }
    this.pending.set(el, hydrate);
    this.observer.observe(el);
  }

  /**
   * Hydrate a registered shell immediately instead of waiting for the
   * observer. Used for cards created while visible (e.g. reconciliation)
   * so they never paint as hidden placeholders.
   */
  public hydrateNow(el: HTMLElement): void {
    const callback = this.pending.get(el);
    if (!callback) return;
    this.pending.delete(el);
    this.observer?.unobserve(el);
    callback();
  }

  /** Hydrate every remaining shell immediately (e.g. before teardown). */
  public flush(): void {
    for (const callback of this.pending.values()) callback();
    this.pending.clear();
    this.observer?.disconnect();
    this.observer = null;
  }

  /** Disconnect the observer. Unhydrated shells stay as shells. */
  public destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.pending.clear();
  }
}
