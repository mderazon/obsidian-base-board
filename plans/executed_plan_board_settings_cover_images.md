# Plan: Multi-Page Board Settings + Simplified Cover Images

## Context

After the monorepo migration, cover images using `formula.cover` stopped working because the cover resolution logic was refactored to use `CardData` (frontmatter-only properties) instead of the original `BasesEntry` object. The fix would require threading `BasesEntry` through multiple layers — coupling the cover logic to Obsidian-specific Bases API types.

**Decision**: Replace the Bases formula-based cover with a simpler approach that works identically in Electron:
1. Frontmatter field (configurable property name)
2. Optional: first `![[image]]` embed in the note

Also consolidate all board settings into a single multi-page modal, stored entirely in `.base` files (no more `data.json`).

---

## Design Direction

- **Platform**: Obsidian plugin UI — use native `Setting` API rows, `.tabs` / `.tab-item` / `.mod-active` classes, CSS variables. No hardcoded colors.
- **Modal layout**: Wide modal with tab bar navigation. Three tabs: Cover images, Chips & borders, Behavior.
- **Chip config tab**: Reuses the existing two-panel master-detail layout (left: property list, right: color/icon editor) as an inline panel.
- **Cover/Behavior tabs**: Simple `Setting`-row layouts.

---

## Data Shape (all in `.base` via `BasesViewConfig`)

```typescript
// .base file — new keys alongside existing chip keys
{
  boardCoverProperty: string;       // "" = disabled (default)
  boardUseFirstEmbed: boolean;      // opt-in toggle (default false)
  boardOpenBehavior: "active"|"modal"|"split"|"tab";  // default "active"
  boardColumns: string[];           // already exists — column ordering
  chipProperties: string[];         // already exists
  chipColors: Record<string, Record<string, string>>;  // already exists
  chipFixedColors: Record<string, string>;               // already exists
  chipShowLabels: Record<string, boolean>;               // already exists
  chipIcons: Record<string, Record<string, string>>;     // already exists
  borderProperty: string;           // already exists
  tagColors: Record<string, string>;// already exists
}
```

## Dropped: `data.json`

- Remove `PluginData`, `loadPluginData()`, `savePluginData()` entirely.
- Remove dual-layer column fallback (`getColumns()` reads only from `BasesViewConfig`).
- Legacy boards lose column ordering on first render after upgrade — columns regenerate in discovery order. One-time, non-destructive.

---

## First Embed Detection

Regex: `!?\[\[([^\]|]+)` — matches `![[image]]`, `![[image|400]]`, `![[path/to/image#anchor|alias]]`. Captures only the file path (before first `|`). Resolves via `metadataCache.getFirstLinkpathDest()` and checks against `IMAGE_EXTENSIONS`.

---

## File Changes

### NEW: `plugins/obsidian-plugin/src/board-settings-modal.ts`

`BoardSettingsModal extends Modal` with tab navigation.

**Tab 1 — Cover images:**
```
Setting: "Cover property name"
  Text input (placeholder: "cover")
  Desc: "Frontmatter field holding an image path or URL. Leave empty to disable."

Setting: "Use first embed as cover"
  Toggle
  Desc: "If no cover property is set, use the first image in the note."
```

**Tab 2 — Chips & borders:**
Reuses existing two-panel chip config layout as an inline panel. Accepts `onSave` callback.

**Tab 3 — Behavior:**
```
Setting: "Open card in"
  Dropdown: Active pane / Floating modal / Split to right / New tab
  Desc: "How cards open when clicked."
```

Footer: Cancel / Save buttons.

### MODIFIED: `plugins/obsidian-plugin/src/main.ts`

- Remove `PluginData`, `loadPluginData()`, `savePluginData()`, `saveColumnConfig()`.
- Register "Board settings" command → opens `BoardSettingsModal`.
- Pass settings callback to KanbanView.

### MODIFIED: `plugins/obsidian-plugin/src/kanban-view.ts`

- Remove `CONFIG_KEY_COVER_PROPERTY` and `CONFIG_KEY_OPEN_BEHAVIOR` from `getViewOptions()`.
- Add `getCoverProperty()` — reads `this.config?.get("boardCoverProperty")`.
- Add `shouldUseFirstEmbed()` — reads `this.config?.get("boardUseFirstEmbed")`.
- Add `getOpenBehavior()` — reads `this.config?.get("boardOpenBehavior")`.
- Simplify `getColumns()` — remove data.json fallback, read only from `BasesViewConfig`.
- Wire gear icon button into filter bar → opens `BoardSettingsModal`.

### MODIFIED: `plugins/obsidian-plugin/src/card.ts`

- Simplify `getCardCoverSrc(file, card)` — drop `entry` parameter.
- Priority: frontmatter cover property → first embed → null.
- Add `extractFirstEmbed(file: TFile): string | null` using the regex above.
- Remove `resolvePropertyValue()` helper (no longer needed).

### MODIFIED: `plugins/obsidian-plugin/src/tags.ts`

- Replace chip-config callback with board-settings callback.
- Change button: gear icon + "Settings" text, remove `mod-cta` class.

### MODIFIED: `plugins/obsidian-plugin/src/chip-config-modal.ts`

- Extract two-panel layout into reusable `ChipConfigPanel` component.
- Panel accepts `onSave` callback, renders inside settings modal tab.
- Keep standalone export for backward compat.

### MODIFIED: `plugins/obsidian-plugin/src/constants.ts` (+ `packages/board-core/...`)

- Remove `CONFIG_KEY_COVER_PROPERTY`, `CONFIG_KEY_OPEN_BEHAVIOR`.
- Add `CONFIG_KEY_BOARD_COVER_PROPERTY`, `CONFIG_KEY_BOARD_USE_FIRST_EMBED`, `CONFIG_KEY_BOARD_OPEN_BEHAVIOR`.

### MODIFIED: `plugins/obsidian-plugin/styles.css`

- Tab bar styles (`.board-settings-tabs`, `.board-settings-tab-item`, `.mod-active`).
- Modal width class for wider settings modal.
- Cover page and behavior page setting row styles.
- Remove unused toolbar styles.

---

## Execution Order (Completed)

1. ✅ `constants.ts` — add new config keys, remove old ones (both packages)
2. ✅ `board-settings-modal.ts` — new modal with tab shell + Cover + Behavior pages
3. ✅ Extract `ChipConfigPanel` from `chip-config-modal.ts` (integrated into board-settings-modal.ts)
4. ✅ Wire chip config tab into the modal
5. ✅ `card.ts` — simplify cover logic, add `extractFirstEmbed()`, keep `resolvePropertyValue()` for border/title lookups
6. ✅ `kanban-view.ts` — remove Bases dropdown keys, add plugin-data getters, simplify `getColumns()`
7. ✅ `tags.ts` — gear button → settings modal callback
8. ✅ `main.ts` — remove data.json logic (PluginData, ColumnConfig, loadPluginData, savePluginData, saveColumnConfig, getColumnConfig)
9. ✅ CSS — tab bar, modal width, new page styles
10. ✅ Build + lint — clean

---

## Migration Note

Legacy boards with `data.json` column configs will lose column ordering on first render after upgrade. Columns regenerate in discovery order. This is one-time and non-destructive to card data.

---

## Remaining Work

- **Persist cover/behavior settings**: The BoardSettingsModal currently doesn't save the cover property, use-first-embed, and open behavior values back to BasesViewConfig. The `save()` method needs to call `view.config.set()` for each changed value before closing.
- **Wire save callback in kanban-view.ts**: The `onSubmit` callback in the chip config tab should also persist cover/behavior changes when they're edited in their respective tabs.
- **Test**: Verify the modal opens, tabs switch, and settings persist correctly in a live Obsidian instance.
