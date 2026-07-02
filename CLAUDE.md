# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Base Board** is an Obsidian Community Plugin that provides a Kanban board view for [Obsidian Bases](https://obsidian.md). It extends `BasesView` from the Obsidian Bases API to render property-driven columns with drag-and-drop card management. All data changes are written directly to Markdown frontmatter.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Watch-mode build (esbuild) — required during development
npm run build        # Type-check + production build → main.js, styles.css
npm run lint         # tsc -noEmit + eslint on src/**/*.ts
npm run format       # Prettier overwrite on src/**/*.ts
```

There are no tests. The `lint` script is the closest thing to a quality gate — it combines TypeScript type-checking (`tsc -noEmit`) with ESLint. Run `npm run build` before committing; the CI pipeline runs lint then build.

## Architecture

### Entry Points

- **`src/main.ts`** — Plugin class extending `Plugin`. Registers the Kanban view via `registerBasesView()`, handles "Create new board" command, and syncs `.base` file references on folder renames.
- **`src/kanban-view.ts`** — Extends `BasesView` (the Bases API view class). Orchestrates all sub-managers and implements the rendering pipeline. This is the central hub.

### Manager Pattern

`KanbanView` delegates to four managers, each owning a distinct concern:

| Manager | File | Responsibility |
|---------|------|----------------|
| `CardManager` | `src/card.ts` | Card DOM, click/drag/context-menu, inline rename, cover images, multi-select |
| `ColumnManager` | `src/column.ts` | Column headers, drag handles, add/rename/delete WIP limit, color picker |
| `DragDropManager` | `src/drag-drop.ts` | HTML5 native drag-and-drop, auto-scroll, placeholder, multi-drag |
| `Tags` | `src/tags.ts` | Tag extraction from frontmatter, filter bar, color-coded tag pills |

### Data Flow

1. **Bases engine** queries data based on the `.base` file's filters and groups entries by the configured `groupBy` property.
2. `KanbanView.onDataUpdated()` fires → `scheduleRender()` debounces (50ms) → `render()`.
3. `render()` clears the container, iterates columns from `getColumns()`, delegates each to `columnManager.renderColumn()`.
4. Each column renders its cards via `cardManager.renderCard()`.

### Column Config — Dual-Layer Storage

Column order is persisted in two places for compatibility:

1. **Primary**: `BasesViewConfig.set("boardColumns", ...)` → written into the `.base` file as a custom view config key. Portable and version-controlled.
2. **Fallback**: Plugin `data.json` (`columnConfigs` record keyed by board ID). Used for legacy boards created before this dual-layer was added.

`getColumns()` merges both: stored list takes priority, live data columns are appended if missing. This means new columns never silently disappear.

### Card Drop Logic

Dragging a card to a different column updates the frontmatter `groupBy` property via `processFrontMatter()`. Card ordering within a column uses the `kanban_order` frontmatter key. Multi-drag (Alt+click selection) is supported — co-selected cards move together and maintain relative order.

### Folder Rename Sync

When a folder is moved/renamed, `handleFolderRename()` debounces (250ms burst window) and then rewrites path references in all `.base` files via regex matching in `folder-rename.ts`. This keeps board filters functional after vault restructuring.

### Key Constants

- `NO_VALUE_COLUMN = "(No value)"` — column label for entries missing the groupBy property
- `ORDER_PROPERTY = "kanban_order"` — frontmatter key for card ordering
- Config keys are all defined in `src/constants.ts` (`CONFIG_KEY_*`)
  - `CONFIG_KEY_CHIP_FIXED_COLORS = "chipFixedColors"` — persisted fixed color per chip property (one color applied to all values)

### Chip Properties Feature

Custom frontmatter fields can be rendered as colored chips (like tags) on cards:

- **`ChipPropertiesManager`** (`src/chip-properties.ts`) — manages chip property configuration, color mappings, icon overrides, and property discovery
- **`ChipConfigModal`** (`src/chip-config-modal.ts`) — UI for configuring which properties become chips and their color mappings. Uses a two-column grid layout with header at top, radio toggle between "One color for all values" (fixed) and "Separate color per value" modes, and a Save button in the footer.
- **Toolbar Button**: Boards render a persistent `Configure chip properties` button in the board toolbar to open the modal directly from the board UI
- **Command**: `Configure chip properties` remains available as a fallback from the command palette
- **Storage**: `chipProperties` (array of property names), `chipColors` (object of property→value→color mappings), `chipFixedColors` (object of property→single-color mappings), `chipShowLabels` (per-property label toggle), `chipIcons` (per-property icon override), `borderProperty` (which field controls card border color)
- **Rendering**: Chips appear between tags and title on cards. Card borders use the configured field's mapped color. If an icon override is configured, the chip renders the icon instead of the text value using the chip color.
- **Color resolution**: Checks fixed colors first (one color for all values of a property), then per-value mappings, then falls back to deterministic hash (same as tags).
- **Discovery behavior**: Property discovery now includes booleans like `false`, keeps configured properties visible even when they are not currently selected, and preserves color-map edits for unsaved properties until Save is pressed.

### Chip Config Modal Layout

The modal uses a CSS Grid layout:
```
chip-config-layout (grid: auto 1fr / 260px 1fr)
├── chip-config-header (spans both columns)
├── chip-config-left (navigation panel, 260px)
└── chip-config-right (editor panel, 1fr)
```

The header is a grid child (not a sibling), ensuring it appears at the top. The Save button is appended to `contentEl` after the grid as a `modal-footer` div.

## Build Output

esbuild bundles `src/main.ts` into a single `main.js` (CJS, ES2018 target). Externalized modules: `obsidian`, `electron`, CodeMirror packages, Lezer packages, Node built-ins. Source maps only in dev mode.

## CI/CD

GitHub Actions triggers on tag push. Steps: checkout → setup Node 24 → `npm ci` → lint → build → attest provenance → create release with `main.js`, `manifest.json`, `styles.css`.

## CSS

Plugin styles live in `styles.css` (18KB). Classes follow the `base-board-*` naming convention. Dark mode is handled via Obsidian's built-in theme variables — no explicit dark-mode media queries.
