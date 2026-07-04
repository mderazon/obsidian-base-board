# UI Skill — Obsidian Settings File

## Settings Modal Layout Pattern

When building settings modals for Obsidian plugins, the flex layout must be **unbroken** from the fixed-height modal down to the scrolling content area. The most common mistake is only setting `display: flex` on the outermost element without ensuring every level in between is also a flex container.

### HTML Structure
```html
<div class="modal base-board-settings-modal">
  <div class="modal-content">           ← MUST be flex container
    <div class="base-board-settings-header">...</div>
    <div class="base-board-settings-tabs">...</div>
    <div class="base-board-settings-content">  ← scrolling area
      <!-- tab content -->
    </div>
    <div class="modal-footer">          ← Cancel/Save buttons
      <button>Cancel</button>
      <button>Save</button>
    </div>
  </div>
</div>
```

### Required CSS (Working Pattern)
```css
/* Outer modal — fixed height, flex container */
.base-board-settings-modal {
  max-width: 720px;
  height: 90vh;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  padding: 0; /* Obsidian often adds padding that steals space */
}

/* .modal-content — MUST be flex container with min-height: 0 */
.base-board-settings-modal .modal-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;      /* Critical: lets flex children shrink below content size */
  overflow: hidden;   /* Prevent this level from scrolling */
}

/* Header and tabs — don't compress */
.base-board-settings-header,
.base-board-settings-tabs {
  flex-shrink: 0;
}

/* Content area — scrolls internally */
.base-board-settings-content {
  flex: 1;
  min-height: 0;       /* Critical: without this, flex:1 won't force overflow-scroll */
  overflow-y: auto;
}

/* Footer — stays at bottom, doesn't scroll */
.base-board-settings-modal .modal-footer {
  flex-shrink: 0;
  border-top: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
}
```

### The Two Critical Bugs to Avoid

1. **`.modal-content` was never made a flex container**
   - Every level between the fixed-height box and the scrolling content needs `display: flex; flex-direction: column`
   - Only setting it on the outermost element means `flex: 1` on inner elements has no effect

2. **Missing `min-height: 0` on flex children**
   - By default, flex items get `min-height: auto`, which means they refuse to shrink smaller than their content
   - Without `min-height: 0`, the combination of `flex: 1` + `overflow-y: auto` is silently ignored and the box just grows to fit content instead of scrolling

### Mobile Considerations
```css
@media (max-width: 768px) {
  .base-board-settings-modal {
    height: 95vh; /* Slightly taller on mobile for smaller screens */
    max-height: 95vh;
  }
}
```

### Common Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Modal gets external scrollbar | Content area not constrained | Add `overflow: hidden` to `.modal-content` |
| Buttons pushed out of view | Footer not in flex flow | Add `flex-shrink: 0` to footer |
| Content flows through footer | Footer absolutely positioned | Use flex layout instead of absolute positioning |
| No scrollbar on content | Missing `min-height: 0` | Add `min-height: 0` to scrolling container |

### Obsidian-Specific Gotchas

1. **Inspect `.modal-content` in devtools** — Obsidian's base styles sometimes set `overflow-y: auto` on `.modal-content` itself with `!important` in some themes/versions. If scroll is still happening one level too high after the fix, add `overflow: hidden !important` there as an override.

2. **Use Obsidian's native component API** — Prefer `Setting` class for settings rows, `Modal` base class for dialogs, `Notice` for transient feedback. Don't build custom overlays with manual z-index/backdrop handling.

3. **Never hardcode colors** — Use Obsidian's CSS variables (`--background-primary`, `--interactive-accent`, etc.) for theme adaptability.

4. **Scope your CSS** — Prefix all classes with your plugin name to avoid leaking into other plugins or notes.
