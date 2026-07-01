# Plan: Chip Properties — Colored Frontmatter Field Chips

## Context

The user wants to use Base Board as a project planner with columns representing days and cards representing work items. They need custom frontmatter fields (`team`, `urgency`) rendered as colored chips on each card — similar to how `tags:` are currently rendered, but for arbitrary frontmatter properties chosen by the user.

Two specific requirements:
1. **Per-value color mapping**: For numeric fields like `urgency`, define value→color mappings (e.g., 1=red, 2=orange, 3=green). Each chip shows the mapped color for its card's value.
2. **Card border from a field**: Pick one frontmatter field whose mapped color becomes the card's border color. urgency=1 on a card → red border on that card.

Field selection (which properties become chips) is user-configurable via a command/modal.

## Implementation

### 1. Add config key constants (`src/constants.ts`)

```ts
export const CONFIG_KEY_CHIP_PROPERTIES = "chipProperties";
export const CONFIG_KEY_CHIP_COLORS = "chipColors";
export const CONFIG_KEY_BORDER_PROPERTY = "borderProperty";
```

- `chipProperties`: array of property names (e.g. `["team", "urgency"]`)
- `chipColors`: object keyed by property name, each containing value→color mapping:
  ```json
  { "urgency": { "1": "#ef4444", "2": "#f97316", "3": "#22c55e" }, "team": { "Engineering": "#3b82f6" } }
  ```
- `borderProperty`: single property name (e.g. `"urgency"`) or empty string for no border

### 2. Create `src/chip-properties.ts` — `ChipPropertiesManager`

New module following the `Tags` class pattern. Responsibilities:

- **Config**: get/set selected property names from view config
- **Border config**: get/set which property controls card border color
- **Color resolution**: look up value→color mapping for a property, fall back to deterministic hash (same algorithm as `Tags.getDeterministicColor()`)
- **Discovery**: scan `view.currentGroups` entries' frontmatter to find available properties (skip: groupBy prop, `kanban_order`, file props, empty values)
- **Rendering helper**: method to produce chip HTML for an entry

Key methods:
```ts
getChipProperties(): string[]
setChipProperties(props: string[]): void
getBorderProperty(): string
setBorderProperty(name: string): void
getColorsForProperty(propName: string): Record<string, string>
getColorForValue(propName: string, value: string): string  // mapped or deterministic fallback
discoverAvailableProperties(): AvailableProperty[]
```

### 3. Create `src/chip-config-modal.ts` — Configuration Modal

Modal for configuring chip properties. Pattern similar to `TagEditModal`:

**Section A — Chip Properties**: Checkboxes for all discovered properties from current board data. Each row shows property name, formatted display name, and sample values. "Refresh" button to re-scan.

**Section B — Card Border Property**: Dropdown/select of discovered properties. User picks which field's mapped color becomes the card border. Shows a live preview swatch.

**Section C — Per-Property Color Mapping Editor**: For each selected chip property, show an editor where users can define value→color mappings:
```
Property: urgency
  Value 1 → [color picker] [delete]
  Value 2 → [color picker] [delete]
  Value 3 → [color picker] [delete]
  [+ Add mapping]
```
Auto-discovers existing values from current entries. Users can add mappings for values not yet seen.

### 4. Update `src/card.ts` — Add chip rendering + border

In `CardManager.renderCard()`, insert chip rendering **between** the tag container (line 255) and the title element (line 257):

```
Current order: cover → tags → title → edit btn → property chips
New order:     cover → tags → CHIP PROPS → title → edit btn → property chips
```

Add new container div with class `base-board-chip-property-container` and a `renderChipProperties()` method that:
1. Reads configured chip properties from `view.chipProperties.getChipProperties()`
2. For each property, gets the value via `entry.getValue('note.<prop>')`
3. Formats it with `formatValueForChip()`
4. Resolves color via `view.chipProperties.getColorForValue(propName, display)` — uses mapped color if defined, falls back to deterministic hash
5. Renders as a colored pill using `--chip-color` CSS variable + light/dark text class

**Card border**: After building the card element, check `getBorderProperty()`. If set and the card has a value for that property, resolve its mapped color and apply it:
```ts
const borderProp = this.view.chipProperties.getBorderProperty();
if (borderProp) {
  const borderVal = entry.getValue(`note.${borderProp}`);
  if (borderVal && !(borderVal instanceof NullValue) && borderVal.isTruthy()) {
    const display = formatValueForChip(borderVal);
    const color = this.view.chipProperties.getColorForValue(borderProp, display);
    if (color) cardEl.style.setProperty("--card-border-color", color);
  }
}
```

### 5. Add chip right-click context menu

Right-click on a chip value opens a small context menu:
- "Edit color for this value" → opens inline color picker or the property editor modal
- "Reset to default" → removes custom mapping, falls back to deterministic hash

### 6. Wire up in `KanbanView` (`src/kanban-view.ts`)

- Instantiate `ChipPropertiesManager` in constructor
- Expose it as `public chipProperties: ChipPropertiesManager`

### 7. Add commands in `main.ts`

```ts
// Command to open the configuration modal
this.addCommand({
  id: "configure-chip-properties",
  name: "Configure chip properties",
  callback: () => {
    const view = this.app.workspace.getActiveViewOfType(KanbanView);
    if (view) {
      new ChipConfigModal(this.app, view.chipProperties, (config) => {
        view.config?.set(CONFIG_KEY_CHIP_PROPERTIES, config.properties);
        view.config?.set(CONFIG_KEY_BORDER_PROPERTY, config.borderProperty);
        view.config?.set(CONFIG_KEY_CHIP_COLORS, config.colors);
        view.scheduleRender();
      }).open();
    }
  },
});
```

### 8. Add CSS (`styles.css`)

```css
/* Chip property container */
.base-board-chip-property-container {
  display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;
}
.base-board-chip-property {
  font-size: 10px; padding: 2px 6px; border-radius: 4px;
  background-color: var(--chip-color); color: var(--text-normal);
  font-weight: var(--font-medium); cursor: default; user-select: none;
}
.base-board-chip-property:hover { opacity: 0.85; }
.base-board-chip-property-light { color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.3); }
.base-board-chip-property-dark { color: #1c212b; text-shadow: none; }

/* Card border via CSS variable */
.base-board-card {
  border-left: 3px solid var(--card-border-color, transparent);
}

/* Config modal styles */
.base-board-chip-config-section { margin-bottom: 20px; }
.base-board-chip-mapping-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.base-board-chip-mapping-value { font-weight: var(--font-medium); min-width: 60px; }
.base-board-chip-color-swatch { width: 28px; height: 28px; border-radius: 4px; border: 1px solid var(--background-modifier-border); cursor: pointer; }
```

## Files Summary

| File | Action |
|------|--------|
| `src/constants.ts` | Add `CONFIG_KEY_CHIP_PROPERTIES`, `CONFIG_KEY_CHIP_COLORS`, `CONFIG_KEY_BORDER_PROPERTY` |
| `src/chip-properties.ts` | **New** — `ChipPropertiesManager` class (config, colors, discovery) |
| `src/chip-config-modal.ts` | **New** — full configuration modal (property selection, border field, color mapping editor) |
| `src/card.ts` | Insert chip rendering between tags and title; apply card border color |
| `src/kanban-view.ts` | Instantiate and expose `ChipPropertiesManager` |
| `src/main.ts` | Add "Configure chip properties" command |
| `styles.css` | Add chip container, chip pill, card border, and modal styles |

## Rendering Order on Card (top to bottom)

```
1. Cover image (if configured) — card has --card-border-color CSS var applied
2. Tags (existing tag pills from frontmatter `tags:`)
3. Chip properties (NEW — colored value pills for selected frontmatter fields)
4. Card title
5. Edit button
6. Property chips (existing "Label: Value" rich cards)
```

## Data Storage Shape

```json
// Stored in .base file via BasesViewConfig
{
  "chipProperties": ["team", "urgency"],
  "borderProperty": "urgency",
  "chipColors": {
    "urgency": { "1": "#ef4444", "2": "#f97316", "3": "#22c55e" },
    "team": { "Engineering": "#3b82f6", "Design": "#a855f7" }
  }
}
```

## Color Resolution Logic

For a given property and value:
1. Check `chipColors[propertyName][value]` — if user-defined mapping exists, use it
2. Fallback: deterministic hash of the **value string** (same algorithm as `Tags.getDeterministicColor()`) — gives consistent colors without configuration

This means unconfigured fields still get colored chips, just with auto-assigned colors. Configured numeric fields get explicit value→color mappings.

## Verification

1. Run `npm run build` — should compile cleanly with no type errors
2. Create a new board, add `team:` and `urgency:` frontmatter to task files with values like "Engineering", "Design" and 1, 2, 3
3. Run "Configure chip properties" command → verify modal opens with property checkboxes and color mapping editor
4. Select `team` and `urgency` as chip properties, set `urgency` as border property
5. Define urgency mappings: 1=red, 2=orange, 3=green
6. Verify colored pills appear on cards between tags and title
7. Verify card borders reflect urgency value (red for 1, orange for 2, green for 3)
8. Right-click a chip → verify context menu appears
9. Run `npm run lint` — no errors
