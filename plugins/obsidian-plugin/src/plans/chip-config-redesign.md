# Chip Config Panel Redesign — Implementation Plan

## Current State
- `ChipConfigPanel` in `board-settings-modal.ts` uses a two-panel grid layout (260px sidebar + editor)
- Mapping rows are 5 columns wide (value, edit, color, icon, delete) — too dense for mobile
- Reorder uses ▲/▼ buttons (10px text, tiny touch targets)
- Legacy `chip-config-modal.ts` deleted, `ChipConfigSnapshot` migrated to `board-settings-modal.ts`

## Goal
Replace two-panel layout with single-column card-based design that works on desktop and mobile.

---

## Step 1: Rewrite ChipConfigPanel class (board-settings-modal.ts)

Replace the entire `ChipConfigPanel` class (lines 226-833) with a card-based implementation:

### New structure:
```typescript
class ChipConfigPanel {
  // State management stays the same
  private availableProps: AvailableProperty[] = [];
  private selectedProperties: string[] = [];
  private activeProperty: string | null = null;
  private borderProperty: string = "";
  private colorState: Record<string, Record<string, string>> = {};
  private fixedColors: Record<string, string> = {};
  private chipIcons: Record<string, Record<string, string>> = {};
  private useFixedColor: boolean = false;

  // Layout refs
  private containerEl!: HTMLDivElement;
  private propsContainerEl!: HTMLDivElement;
  private borderSelectEl!: HTMLSelectElement;

  // New: drag state
  private draggedPropertyIndex: number | null = null;

  renderInto(container: HTMLElement): void { ... }
  
  // Build header + property list with drag handles
  buildLeftPanel(parent: HTMLElement): void { ... }
  
  // Render each property as an expandable card
  renderPropertyCard(prop: AvailableProperty, index: number): HTMLDivElement { ... }
  
  // Expand/collapse section for a property
  renderPropertyEditor(prop: AvailableProperty): void { ... }
  
  // Simplified mapping rows (color swatch + delete only by default)
  renderPerValueRows(container: HTMLElement, prop: AvailableProperty): void { ... }
  
  // Drag handlers
  handleDragStart(e: DragEvent, index: number): void { ... }
  handleDragOver(e: DragEvent): void { ... }
  handleDrop(e: DragEvent): void { ... }
}
```

### Key changes:
1. **Single column layout** — properties stack vertically, each as a card
2. **Drag handle** (⠿) on each card for reordering
3. **Expandable sections** — click card header to expand/collapse editor
4. **Simplified default view** — show checkbox + color swatch only; hide icon/rename behind expand
5. **Mobile-friendly** — no fixed-width sidebar, cards stack naturally

---

## Step 2: Update CSS for card-based layout

Replace chip-config CSS section (lines 1098-1393 in styles.css) with new classes:

```css
/* Card-based property list */
.chip-property-card {
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
  margin-bottom: 8px;
  background-color: var(--background-primary);
}

.chip-property-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid transparent;
}

.chip-property-card-header:hover {
  background-color: var(--background-modifier-hover);
}

.chip-property-card-header.is-expanded {
  border-bottom-color: var(--background-modifier-border);
}

/* Drag handle */
.chip-drag-handle {
  cursor: grab;
  color: var(--text-faint);
  font-size: 14px;
  line-height: 1;
  padding: 2px;
}

.chip-drag-handle:active {
  cursor: grabbing;
}

/* Card body (expanded content) */
.chip-property-card-body {
  padding: 12px;
  display: none;
}

.chip-property-card.is-expanded .chip-property-card-body {
  display: block;
}

/* Simplified mapping row (color + delete only) */
.chip-mapping-row-simple {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}

/* Full mapping row (with rename + icon) */
.chip-mapping-row-full {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 8px;
  align-items: center;
  padding: 6px 0;
}
```

---

## Step 3: Add drag-and-drop to property list

Implement HTML5 drag-and-drop for reordering:

1. Each card header gets `draggable="true"`
2. Drag handle (⠿) is the visual indicator
3. On drag start: store property name in dataTransfer
4. On drag over: show drop indicator between cards
5. On drop: reorder `selectedProperties` array, re-render

This uses the same pattern as column/card dragging already in the codebase.

---

## Step 4: Verify and test

1. Run `npm run build` to check for type errors
2. Run `npm run lint` to verify no linting issues
3. Test in Obsidian dev vault:
   - Open settings → Chips & borders tab
   - Verify cards render correctly
   - Test drag-and-drop reordering
   - Test expand/collapse
   - Test on mobile (if possible)

---

## Files to modify:
1. `plugins/obsidian-plugin/src/board-settings-modal.ts` — rewrite ChipConfigPanel class (~400 lines)
2. `plugins/obsidian-plugin/styles.css` — replace chip-config CSS section (~300 lines)

## Files already modified:
- `plugins/obsidian-plugin/src/board-settings-modal.ts` — added ChipConfigSnapshot type (Step 0)
- `plugins/obsidian-plugin/src/kanban-view.ts` — updated import (Step 0)
- `plugins/obsidian-plugin/src/chip-config-modal.ts` — deleted (Step 0)
