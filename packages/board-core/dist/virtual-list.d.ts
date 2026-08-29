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
export declare class LazyList {
    private root;
    private rootMargin;
    private observer;
    private pending;
    constructor(root: HTMLElement, options?: LazyListOptions);
    /**
     * Register a shell element. `hydrate` is invoked at most once, when the
     * element comes within the root margin of the scroll container's viewport.
     */
    register(el: HTMLElement, hydrate: () => void): void;
    /**
     * Hydrate a registered shell immediately instead of waiting for the
     * observer. Used for cards created while visible (e.g. reconciliation)
     * so they never paint as hidden placeholders.
     */
    hydrateNow(el: HTMLElement): void;
    /** Hydrate every remaining shell immediately (e.g. before teardown). */
    flush(): void;
    /** Disconnect the observer. Unhydrated shells stay as shells. */
    destroy(): void;
}
//# sourceMappingURL=virtual-list.d.ts.map