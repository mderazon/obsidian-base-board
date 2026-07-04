# UI Skill — Obsidian Plugin Modals (Gold Standard)

This skill captures the design patterns, CSS architecture, and implementation
conventions used by Base Board's settings modals. Use it as the reference when
building any new modal, settings panel, or configuration dialog in an Obsidian
plugin.

---

## Quick Reference: What Do I Need?

Not every modal needs everything. Here's how to pick what applies to your case:

| Your modal has... | Read these sections | Skip these |
|---|---|---|
| A simple form (name, folder, etc.) | **1** (flex layout), **7** (Setting class), **8** (CSS architecture) | 2, 3, 4, 5, 6 |
| Multiple pages / tabs | **1**, **2** (tab bar), **7**, **8** | 3, 4, 5, 6 |
| A list of items users configure | **1**, **3** (card panel), **7**, **8** | 4, 5, 6 |
| Users pick colors | Section 4 (color swatch) | — |
| Users reorder items by dragging | Section 3 (drag-and-drop in card panel) | — |
| Users switch between config modes | Section 5 (radio mode selector) | — |
| Users pick icons from a grid | Section 6 (icon picker) | — |
| A quick single-field prompt | **7** (simple input modal) | 1, 2, 3, 4, 5, 6 |

Everything below is organized by component. Sections marked **Required** apply
to every modal. Sections marked **Optional** are add-ons for specific use cases.

---

## Design Philosophy

Base Board UIs are built around three principles:

1. **Every pixel respects Obsidian's theme system** — no hardcoded colors,
   only CSS variables (`--background-primary`, `--interactive-accent`, etc.)
   so dark mode, light mode, and custom themes just work.
2. **Unbroken flex layout from outer modal to inner scrollbar** — the most
   common bug is a single level that isn't a flex container, which silently
   breaks scrolling.
3. **Card-based interfaces with micro-interactions** — hover states, transitions,
   drag feedback, and expand/collapse patterns make complex configuration feel
   approachable.

---

## 1. [Required] Flex Layout Pattern

Every modal must maintain an unbroken flex chain from the fixed-height outer
element down to the internally-scrolling content area. **Every level in between
must be `display: flex; flex-direction: column`.** If any link in the chain
is missing, `flex: 1` on inner elements has no effect and scrolling silently
breaks.

### HTML Structure

```html
<div class="modal base-board-<name>-modal">
  <div class="modal-content">
    <div class="base-board-<name>-header">...</div>
    <!-- optional: <div class="base-board-<name>-tabs">...</div> -->
    <div class="base-board-<name>-content">              <!-- scrolling area -->
      <!-- tab content or form fields -->
    </div>
    <div class="modal-footer">                           <!-- fixed bottom bar -->
      <button>Cancel</button>
      <button class="mod-cta">Save</button>
    </div>
  </div>
</div>
```

### Required CSS (copy-paste template)

```css
/* Outer modal — fixed height, flex container */
.base-board-<name>-modal {
  max-width: 720px;
  height: 90vh;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  padding: 0;
}

/* .modal-content — MUST be flex container with min-height: 0 */
.base-board-<name>-modal .modal-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;          /* Critical: lets flex children shrink */
  overflow: hidden;       /* Prevent this level from scrolling */
}

/* Header — never compress */
.base-board-<name>-header {
  flex-shrink: 0;
}

/* Content area — scrolls internally */
.base-board-<name>-content {
  flex: 1;
  min-height: 0;          /* Critical: flex:1 needs this to force overflow */
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* Footer — stays at bottom, never scrolls */
.base-board-<name>-modal .modal-footer {
  flex-shrink: 0;
  border-top: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  padding: 16px 24px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
```

### Mobile adjustment

```css
@media (max-width: 768px) {
  .base-board-<name>-modal {
    height: 95vh;
    max-height: 95vh;
  }
}
```

### The Two Critical Bugs to Avoid

| Bug | Symptom | Fix |
|-----|---------|-----|
| `.modal-content` not a flex container | `flex: 1` on inner elements silently ignored | Add `display: flex; flex-direction: column` to `.modal-content` |
| Missing `min-height: 0` on flex child | Scrolling element grows to fit content instead of scrolling | Add `min-height: 0` to the element with `overflow-y: auto` |

### Obsidian-Specific Gotchas

1. **Inspect `.modal-content` in devtools** — Obsidian's base styles sometimes
   set `overflow-y: auto` on `.modal-content` itself with `!important`. If
   scrolling still happens one level too high, add `overflow: hidden !important`
   as an override.

2. **Use Obsidian's native component API** — Prefer `Setting` class for form
   rows, `Modal` base class for dialogs, `Notice` for transient feedback. Don't
   build custom overlays with manual z-index/backdrop handling.

3. **Scope your CSS** — Prefix all classes with `base-board-` to avoid leaking
   into other plugins or Obsidian's own styles.

4. **Never hardcode colors** — Use Obsidian's CSS variables for full theme
   adaptability (dark mode, light mode, custom themes).

---

## 2. [Optional] Tab Bar Pattern

Use this when your modal has multiple pages of settings that don't fit on one
scrollable screen. If your modal is a single form, skip this entirely — use
Obsidian's `Setting` class directly inside the content area.

### HTML

```html
<div class="base-board-settings-tabs">
  <button class="base-board-settings-tab-item mod-active" data-tab="cover">Cover images</button>
  <button class="base-board-settings-tab-item" data-tab="chips">Chips & borders</button>
  <button class="base-board-settings-tab-item" data-tab="behavior">Behavior</button>
</div>
```

### CSS

```css
.base-board-settings-tabs {
  flex-shrink: 0;
  display: flex;
  padding: 0 24px;
  background-color: transparent;
  border-bottom: 2px solid color-mix(in srgb, var(--interactive-accent) 20%, transparent);
}

.base-board-settings-tab-item {
  background: var(--background-secondary-alt);
  border: none;
  padding: 12px 16px;
  cursor: pointer;
  font-size: var(--font-ui-small);
  color: var(--text-muted);
  border-bottom: 2px solid transparent;
  transition: all 0.15s ease;
  border-radius: var(--radius-s) var(--radius-s) 0 0;
}

.base-board-settings-tab-item:hover {
  color: var(--text-normal);
  background-color: var(--background-secondary);
}

.base-board-settings-tab-item.mod-active {
  color: var(--text-normal);
  border-bottom-color: var(--interactive-accent);
  font-weight: var(--font-semibold);
}
```

### Key design notes

- Active tab gets `border-bottom-color: var(--interactive-accent)` — the accent
  color signals "you are here" without a filled background.
- Tab buttons use `border-radius: var(--radius-s) var(--radius-s) 0 0` so they
  visually connect to the content below while remaining distinct.
- The tab bar sits on a subtle accent-tinted border (`color-mix(...)` at 20%)
  that separates it from content without being heavy.

---

## 3. [Optional] Card-Based Configuration Panel

Use this when you have a **list of configurable items** that users need to
enable/disable, reorder, and expand to configure individually. Examples:
property lists, field mappings, rule sets.

If your modal just has a few form fields (text inputs, dropdowns, toggles),
use Obsidian's `Setting` class directly — don't build cards for three form
fields. Cards add complexity; reserve them for when you have 5+ items or need
per-item configuration.

### Layout Structure

```
chip-config-header (title + description)
├── chip-config-section (Properties)
│   └── chip-property-list (vertical stack, gap: 8px)
│       ├── chip-property-card (expandable)
│       │   ├── chip-card-header (interactive row)
│       │   │   ├── chip-drag-handle (⠿)              ← optional: only if reorder needed
│       │   │   ├── input[type="checkbox"] (enable/disable)
│       │   │   ├── chip-card-label (property name)
│       │   │   └── chip-expand-btn (▸/▾)
│       │   └── chip-property-card-body (expanded editor)
│       │       ├── show label toggle
│       │       ├── mode radio group                  ← optional: only if multiple modes
│       │       ├── fixed color picker                ← optional: only if color config needed
│       │       ├── per-value rows                    ← optional: only if value mapping needed
│       │       └── style rules editor                ← optional: only if conditional rules needed
│       └── (repeat for each property)
└── chip-config-section (Card border)
    └── select dropdown
```

### CSS

```css
/* Card */
.chip-property-card {
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
  background-color: var(--background-primary);
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}

.chip-property-card:hover {
  border-color: var(--background-modifier-border-hover);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

/* Card header (interactive row) */
.chip-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid transparent;
  transition: background-color 0.12s ease;
  border-radius: var(--radius-m) var(--radius-m) 0 0;
}
.chip-card-header:hover { background-color: var(--background-modifier-hover); }

/* Card body (expanded content) */
.chip-property-card-body {
  padding: 12px;
  border-top: 1px solid var(--background-modifier-border);
  background-color: var(--background-secondary);
}
.chip-property-card-body.is-hidden { display: none; height: 0; padding: 0; margin: 0; border: none; }

/* Empty state */
.chip-empty-state {
  color: var(--text-muted);
  text-align: center;
  padding: 24px;
  border: 1px dashed var(--background-modifier-border);
  border-radius: var(--radius-m);
  background-color: var(--background-secondary);
}
```

### Drag-and-drop (only needed when users must reorder items)

The drag handle is the only draggable element. Each card gets drop-target
handlers (`ondragover`, `ondragleave`, `ondrop`). A custom ghost card is
rendered during drag for visual polish:

```typescript
dragHandle.ondragstart = (e) => {
  e.dataTransfer!.setData("text/plain", propertyName);
  card.classList.add("is-dragging");

  // Custom floating ghost card
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    position: fixed; top: ${e.clientY - 12}px; left: ${e.clientX - 12}px;
    transform: rotate(3deg); box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    opacity: 0.85; border-radius: var(--radius-m, 6px);
    pointer-events: none; z-index: 9999;
  `;
  const ghost = card.cloneNode(true) as HTMLElement;
  ghost.style.cssText = `
    width: ${rect.width}px;
    border-radius: var(--radius-m, 6px);
    background-color: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
  `;
  // Hide expanded body in ghost (only show header)
  const ghostBody = ghost.querySelector(".chip-property-card-body");
  if (ghostBody) ghostBody.classList.add("is-hidden");
  wrapper.appendChild(ghost);
  document.body.appendChild(wrapper);
  e.dataTransfer!.setDragImage(wrapper, 12, 12);

  // Clean up after browser captures the ghost
  window.requestAnimationFrame(() => wrapper.remove());
};
```

#### Reordering logic

```typescript
card.ondrop = (e) => {
  e.preventDefault();
  card.classList.remove("chip-drop-target");
  if (!draggedPropertyName) return;

  const fromIndex = propertyOrder.indexOf(draggedPropertyName);
  const toIndex = propertyOrder.indexOf(targetPropertyName);

  if (fromIndex !== -1 && fromIndex !== toIndex) {
    const [moved] = propertyOrder.splice(fromIndex, 1);
    propertyOrder.splice(toIndex, 0, moved);
    renderPropertyList(); // re-render entire list
  }
};
```

#### Drop target highlight (used during drag)

```css
.chip-drop-target {
  border-color: var(--interactive-accent) !important;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 30%, transparent) !important;
}
.chip-property-card.is-dragging { opacity: 0.5; }
.chip-property-card.is-expanded {
  outline: 2px solid color-mix(in srgb, var(--interactive-accent) 20%, transparent);
  outline-offset: -2px;
}
```

---

## 4. [Optional] Color Swatch Pattern

Use this when you need users to pick colors (e.g., mapping values to colors).
Native `<input type="color">` looks different across browsers — this pattern
gives you consistent square swatches.

```css
.base-board-chip-color-swatch {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  padding: 0;
  background: transparent;
}
```

Used inside a mapping row:

```html
<div class="chip-mapping-row-simple">
  <input type="text" class="chip-mapping-value-input" value="Done" />
  <input type="color" class="base-board-chip-color-swatch" value="#4caf50" />
  <button class="chip-icon-picker-btn">🎨</button>
  <button class="base-board-chip-mapping-delete">×</button>
</div>
```

---

## 5. [Optional] Mode Selector (Radio Group)

Use this when a single configuration item has multiple mutually-exclusive modes
(e.g., "one color for all values" vs. "separate color per value" vs. "conditional rules").
If you only have one way to configure something, use a regular checkbox or toggle.

```css
.chip-mode-section {
  display: flex;
  gap: 16px;
  padding: 10px 12px;
  background-color: var(--background-secondary);
  border-radius: 8px;
  border: 1px solid var(--background-modifier-border);
}

.chip-radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: var(--font-ui-small);
  color: var(--text-normal);
  user-select: none;
}
```

Each mode section (fixed color picker, per-value rows, style rules editor) is
shown/hidden via the `is-hidden` class based on the active radio.

---

## 6. [Optional] Icon Picker Modal Pattern

Use this when users need to pick an icon from a large set (50+ options). For
small icon sets (<10), a simple dropdown or grid of buttons is sufficient.

```css
.modal.base-board-icon-picker-modal {
  width: min(560px, calc(100vw - 32px));
  max-height: min(80vh, 640px);
  display: flex;
  flex-direction: column;
}

.icon-picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 6px;
  overflow-y: auto;
  padding-right: 4px;
  flex: 1 1 auto;
  min-height: 0;
}

.icon-picker-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px 4px;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  text-align: center;
}

.icon-picker-tile:hover {
  background-color: var(--background-modifier-hover);
  border-color: var(--background-modifier-border-hover);
}

.icon-picker-tile.is-selected {
  background-color: var(--background-modifier-active-hover);
  border-color: var(--interactive-accent);
}
```

Key implementation detail: use `getIconIds()` from Obsidian API to discover all
available icons dynamically — never hardcode a list. This ensures the picker
always reflects the real, current icon set.

---

## 7. [Required] Simple Input Modal Pattern

For quick single-field inputs (column names, WIP limits, new values), use
Obsidian's native `Setting` class. This is the default approach — only build
custom UI when `Setting` can't express what you need.

```typescript
// Use Obsidian's native Setting class for form rows
new Setting(contentEl).setName("Name").addText((text) => {
  text.setPlaceholder("Enter value");
  text.setValue(initialValue);
  text.onChange((v) => (this.value = v));
  // Auto-focus and Enter-key submit
  window.setTimeout(() => {
    text.inputEl.focus();
    text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.submit();
      }
    });
  }, 50);
});
```

The `Setting` class handles styling, labels, and description text automatically.
Only add custom CSS when you need behavior the native component can't express.

---

## 8. [Required] CSS Architecture

### File Organization

Each modal/panel has its own CSS file in `src/styles/`. Don't put everything in
one giant file — split by concern:

| File | Contents |
|------|----------|
| `settings.css` | Board settings modal (header, tabs, content, footer) |
| `chip-config.css` | Chip config panel (cards, drag handle, mapping rows, mode selector, style rules) |
| `icon-picker.css` | Icon picker modal grid |
| `modals.css` | Card detail modal, tag edit modal, shared modal actions |

### Build Output

Source CSS files are concatenated into a single `styles.css` by the esbuild
build pipeline. Obsidian auto-loads this file from the plugin root. No manual
CSS bundling needed.

### Class Naming Convention

All classes use the `base-board-` prefix:

- Modal containers: `.base-board-settings-modal`, `.base-board-icon-picker-modal`
- Internal structure: `.base-board-settings-header`, `.base-board-settings-tabs`
- Content areas: `.base-board-settings-content`, `.base-board-settings-page`
- Components: `.chip-property-card`, `.chip-mapping-row-simple`

---

## 9. [Required] TypeScript Structure Pattern

### Modal Class

```typescript
export class BoardSettingsModal extends Modal {
  private state: BoardSettingsState;
  private onSubmit: BoardSettingsSubmit;
  private callbacks: BoardSettingsCallbacks;

  // Layout refs (assigned in onOpen)
  private tabContainer!: HTMLElement;
  private contentContainer!: HTMLElement;

  constructor(app, chipManager, state, onSubmit, callbacks = {}) {
    super(app);
    this.state = { ...state };           // shallow clone to avoid mutation
    this.onSubmit = onSubmit;
    this.callbacks = callbacks;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("base-board-settings-modal");

    // Build header → tabs → content → footer in order
    const header = contentEl.createDiv({ cls: "base-board-settings-header" });
    header.createEl("h2", { text: "Board settings" });

    const tabContainer = contentEl.createDiv({ cls: "base-board-settings-tabs" });
    this.renderTabButtons(tabContainer);

    const contentContainer = contentEl.createDiv({ cls: "base-board-settings-content" });
    this.switchTab("cover");

    const footer = contentEl.createDiv({ cls: "modal-footer" });
    footer.createEl("button", { text: "Cancel" }).onclick = () => this.close();
    footer.createEl("button", { text: "Save", cls: "mod-cta" }).onclick = () => this.save();
  }

  save(): void {
    this.close();
    this.onSubmit(collectedConfig);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```

### Configuration Panel Class (optional — only when you have complex inline UI)

The `ChipConfigPanel` is a self-contained component that renders into any
container. It does NOT extend `Modal`. Only create a panel class like this
when you have enough inner complexity (cards, drag-and-drop, mode switching)
to warrant separation from the modal. For simple forms, put everything in the
modal class.

```typescript
export class ChipConfigPanel {
  private availableProps: AvailableProperty[] = [];
  private selectedProperties: string[] = [];
  private propertyOrder: string[] = [];

  renderInto(container: HTMLElement): void {
    container.empty();
    // Build header, sections, and property list
    const header = container.createDiv({ cls: "chip-config-header" });
    header.createEl("h2", { text: "Chip configuration" });
    // ...
  }

  getSnapshot(): ChipConfigSnapshot {
    return { /* current state as plain object */ };
  }
}
```

This separation means the panel can be tested, reused, and rendered independently
of the modal.

---

## 10. [Optional] Quick Reference: Common Patterns

These are copy-paste snippets for common situations. They're optional because
not every modal needs every pattern — use only what applies.

### Setting row with immediate persistence

```typescript
new Setting(page)
  .setName("Cover property name")
  .setDesc("Frontmatter field that holds an image path or URL.")
  .addText((text) => {
    text.setPlaceholder("Cover").setValue(state.coverProperty || "");
    text.inputEl.addEventListener("input", () => {
      state.coverProperty = text.getValue();
      callbacks.onCoverPropertyChange?.(text.getValue());
    });
  });
```

### Dropdown with callback

```typescript
new Setting(page)
  .setName("Open card in")
  .setDesc("How cards open when clicked.")
  .addDropdown((dropdown) => {
    dropdown.addOption("active", "Active pane / tab")
          .addOption("modal", "Floating modal")
          .addOption("split", "Split to the right")
          .addOption("tab", "New tab");
    dropdown.setValue(state.openBehavior);
    dropdown.onChange((value) => {
      state.openBehavior = value as typeof state.openBehavior;
      callbacks.onOpenBehaviorChange?.(state.openBehavior);
    });
  });
```

### Conditional section (show/hide based on radio selection)

```typescript
const setMode = (newMode: Mode) => {
  mode = newMode;
  if (newMode === "fixed") {
    fixedSection.classList.remove("is-hidden");
    perValueSection.classList.add("is-hidden");
    styleRulesSection.classList.add("is-hidden");
  } else if (newMode === "per-value") {
    fixedSection.classList.add("is-hidden");
    perValueSection.classList.add("is-hidden");
    styleRulesSection.classList.remove("is-hidden");
  } else {
    fixedSection.classList.add("is-hidden");
    perValueSection.classList.add("is-hidden");
    styleRulesSection.classList.remove("is-hidden");
  }
};
```

### Adding a dynamic row (before an "Add" button)

```typescript
const addBtn = container.createEl("button", { text: "+ add value", cls: "mod-cta" });

const insertBeforeBtn = (row: HTMLDivElement) => {
  addBtn.parentElement?.insertBefore(row, addBtn);
};

addBtn.onclick = () => {
  const newRow = createNewRow();
  insertBeforeBtn(newRow);
};
```

---

## 11. [Required] Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|-----------|
| Hardcode colors like `#333` or `#fff` | Use `var(--text-normal)`, `var(--background-primary)` |
| Build custom overlay/backdrop | Use Obsidian's `Modal` base class |
| One giant CSS file for everything | One CSS file per modal/panel (`settings.css`, `chip-config.css`) |
| Skip `min-height: 0` on flex children | Always add it when combining `flex: 1` with `overflow-y: auto` |
| Make the modal manage its own state tree | Pass state in via constructor, collect snapshot on save |
| Use `!important` liberally | Only use it as a last resort for Obsidian base style overrides |
| Hardcode icon lists | Use `getIconIds()` to discover icons dynamically |
| Build cards for 2-3 simple form fields | Use `Setting` class directly — cards add complexity |
