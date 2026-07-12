# Plan: Fixed chip color per property

## Context

Currently each chip property only supports per-value colors (`{ property: { value: color } }`). The user wants the option to set a single fixed color for all values of a property — choosing one mode or the other per property.

## Changes

### 1. `src/constants.ts`
Add a new config key alongside `CONFIG_KEY_CHIP_COLORS`:
```ts
export const CONFIG_KEY_CHIP_FIXED_COLORS = "chipFixedColors";
```
Type: `Record<string, string>` — property name → single hex color.

### 2. `src/chip-properties.ts`
- Add `getFixedColors()` / `setFixedColors()` methods (same pattern as existing `getChipColors()` / `setChipColors()`).
- Update `getColorForValue(propName, value)`: check fixed color first → if set, return it; otherwise fall through to per-value mapping → deterministic hash.

### 3. `src/chip-config-modal.ts`
- Add a `fixedColors: Record<string, string>` field tracking the current fixed-color state.
- In `ChipConfigSnapshot`, add `fixedColors: Record<string, string>`.
- In `renderPropertyEditor()`, add a radio group above the values:
  - **Radio A**: "One color for all values" — when selected, show only a single color picker (read from fixed colors map). Do NOT show value rows.
  - **Radio B**: "Separate color per value" — when selected, show existing per-value rows + add button. No color picker.
- On mode switch, toggle between the two sections (hide one, show the other).
- On save, include `fixedColors` in the snapshot.

### 4. `src/kanban-view.ts`
Update the chip config submit callback to also persist fixed colors:
```ts
this.config?.set(CONFIG_KEY_CHIP_FIXED_COLORS, config.fixedColors);
```

## Data model

```
chipFixedColors: { "team": "#ff0000" }   // one color per property (optional)
chipColors:     { "team": { "Alice": "#00ff00" } }  // per-value (optional)
```

Resolution order in `getColorForValue`:
1. `chipFixedColors[propName]` → return that color (applies to all values of prop).
2. `chipColors[propName][value]` → return mapped color.
3. Deterministic hash fallback.

If both fixed and per-value are set for a property, fixed takes precedence (fixed means "I want one color regardless of value").

## Verification

- Open chip config modal, select a property, toggle between the two modes.
- Set a fixed color, save, reopen — verify the radio selection persists and the color picker shows the saved color.
- Set per-value colors, save, reopen — verify rows persist.
- Build: `npm run build` should pass.
