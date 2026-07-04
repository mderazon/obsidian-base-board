# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Base Board** is a monorepo containing:

1. **`packages/board-core`** — Pure Kanban board logic (types, constants, utilities). Zero Obsidian dependencies. Consumed by both the Obsidian plugin and Electron app.
2. **`plugins/obsidian-plugin`** — Obsidian Community Plugin that provides a Kanban board view for [Obsidian Bases](https://obsidian.md). Extends `BasesView` to render property-driven columns with drag-and-drop card management. All data changes are written directly to Markdown frontmatter.
3. **`apps/electron-app`** — Standalone Electron app (work in progress). Will consume `board-core` with a custom data adapter for local markdown files.

### Stack
TypeScript, Obsidian Plugin API, esbuild build pipeline. `board-core` is framework-agnostic (vanilla DOM, no framework).

### Obsidian API
Obsidian's API changes frequently and is not fully up to date in training data.
Always verify API signatures against https://docs.obsidian.md/ (via researcher subagent
or direct webfetch) before writing code that depends on them.

## Code Intelligence (tree-sitter-analyzer)

TSA is the primary tool for understanding and modifying code in this repo.
Use it proactively — don't wait for structural questions to arise.

### Before editing any file

1. **`tsa_edit action=safe`** — is this file safe to modify right now? Returns SAFE/UNSAFE verdict + risk factors.
2. **`tsa_edit action=impact`** — what breaks if I touch this symbol/file? Shows affected files and must-run tests.

### When refactoring or adding features

3. **`tsa_nav action=caller_tree`** / **`action=callee_tree`** — full blast radius in one call. Don't loop through grep + read.
4. **`tsa_search action=symbol`** — "where is X defined?" (fast BM25 lookup).
5. **`tsa_structure action=signatures`** — method directory of a file without reading the body.

### After editing

6. **`tsa_edit action=impact`** — verify nothing unexpected broke.
7. Run `npm run build` and `npm run lint` to catch type errors.

### Anti-patterns (DO NOT)

- Don't grep for imports then manually trace callers — use `tsa_nav action=callers`.
- Don't read a 900-line file to find one function — use `tsa_structure action=signatures` first.
- Don't edit without checking blast radius — even small changes can have hidden coupling.
- Don't skip TSA for "obvious" changes — you'll miss co-change risks that git-history reveals.

TSA skill files in `.claude/skills/` have detailed workflows for each capability. The 2-call chain (`action=context` → `action=callee_tree`) answers most "how does X work" questions.

## Commands

```bash
npm install          # Install root dependencies
npm run build        # Build core → plugin (full chain)
npm run dev:plugin   # Watch-mode build for Obsidian dev vault
npm run dev:electron # Launch Electron app
npm run lint         # Type-check core + lint plugin
npm run format       # Prettier across all packages
```

There are no tests. The `lint` script is the closest thing to a quality gate — it combines TypeScript type-checking (`tsc -noEmit`) with ESLint. Run `npm run build` before committing.

### Registered Commands

Only one command is registered in `main.ts`:

- **`create-board`** ("Create new board") — opens `CreateBoardModal`, creates a `.base` file with sample tasks, and opens it.

## Architecture

### Monorepo Structure

```
packages/board-core/        Pure types & utilities, builds to dist/
plugins/obsidian-plugin/    Obsidian plugin (adapter layer on top of board-core)
apps/electron-app/          Standalone Electron app (skeleton)
```

### Entry Points

- **`plugins/obsidian-plugin/src/main.ts`** — Plugin class extending `Plugin`. Registers the Kanban view via `registerBasesView()`, handles "Create new board" command, and syncs `.base` file references on folder renames. Only one command is registered: "Create new board".
- **`plugins/obsidian-plugin/src/kanban-view.ts`** — Extends `BasesView` (the Bases API view class). Acts as the adapter layer: maps Obsidian's `BasesEntry`/`BasesEntryGroup` → board-core's `CardData`/`Column`. Orchestrates all sub-managers and implements the rendering pipeline.
- **`plugins/obsidian-plugin/src/board-settings-modal.ts`** — Multi-page settings modal (Cover images, Chips & borders, Behavior). Opened via the gear icon button rendered in the KanbanView's filter bar. No separate command registration needed.

### Board-Core Types (`packages/board-core/src/types.ts`)

```typescript
interface CardData {
  filePath: string;                    // Absolute vault path (e.g. "Notes/My Task.md")
  displayName: string;                 // Display name shown as card title (usually file basename)
  properties: Record<string, unknown>; // Frontmatter key→value pairs
}

interface Column {
  name: string;
  cards: CardData[];
  color?: string | null;               // Optional accent color for column header
  wipLimit?: number | null;            // null = unlimited
}

interface BoardConfig {
  groupBy: string;                     // Property used to group cards into columns
  columns: string[];                   // Ordered list of column names (configured + discovered)
  columnColors: Record<string, string>; // Per-column accent colors
  wipLimits: Record<string, number | null>; // Per-column WIP limits
  cardOpenBehavior: "active" | "modal" | "split" | "tab";
  defaultColumn?: string;              // Column to create new cards in by default
  cardTitleProperty?: string;          // Frontmatter property for card title (empty = filename)
  cardCoverProperty: string;           // Frontmatter property containing cover image path/URL
  tagColors: Record<string, string>;   // Custom tag colors (tag → hex)
  chipProperties: string[];            // Frontmatter fields rendered as colored chips
  chipColors: Record<string, Record<string, string>>; // Per-property, per-value color overrides
  chipFixedColors: Record<string, string>; // Single fixed color per property (one color for all values)
  chipShowLabels: Record<string, boolean>; // Whether to show property label on chip pills
  chipIcons: Record<string, Record<string, string>>; // Icon overrides for chip values
  borderProperty: string;              // Property controlling card border color (empty = none)
}

// Default config values (used when no .base file exists yet)
const DEFAULT_BOARD_CONFIG: BoardConfig = {
  groupBy: "",
  columns: [],
  columnColors: {},
  wipLimits: {},
  cardOpenBehavior: "active",
  cardCoverProperty: "cover",
  tagColors: {},
  chipProperties: [],
  chipColors: {},
  chipFixedColors: {},
  chipShowLabels: {},
  chipIcons: {},
  borderProperty: "",
};

// Discovered frontmatter property with sample values
interface AvailableProperty {
  name: string;
  displayName: string;
  isConfigured: boolean;
  sampleValues: string[];
}
```

### Manager Pattern

`KanbanView` delegates to five managers, each owning a distinct concern:

| Manager | File | Responsibility |
|---------|------|----------------|
| `CardManager` | `src/card.ts` | Card DOM, click/drag/context-menu, inline rename, cover images, multi-select |
| `ColumnManager` | `src/column.ts` | Column headers, drag handles, add/rename/delete WIP limit, color picker |
| `DragDropManager` | `src/drag-drop.ts` | HTML5 native drag-and-drop, auto-scroll, placeholder, multi-drag |
| `Tags` | `src/tags.ts` | Tag extraction from frontmatter, filter bar, color-coded tag pills |
| `ChipPropertiesManager` | `src/chip-properties.ts` | Chip property config, color mappings, icon overrides, property discovery |

All managers accept `CardData` (not `BasesEntry`) and access Obsidian-specific operations (vault, metadataCache, modals) via the `KanbanView` instance passed to their constructors.

### Modals

- **`IconPickerModal`** (`src/icon-picker-modal.ts`) — Searchable grid over every icon Obsidian knows about. Each tile rendered with `setIcon()` for pixel-accurate previews. Used when configuring chip icon overrides.
- **`ChipConfigModal`** (`src/chip-config-modal.ts`) — Legacy standalone chip config modal (kept for backward compat, no longer used). Replaced by `BoardSettingsModal`.
- **`TagEditModal`** (`src/tag-edit-modal.ts`) — Modal for editing tags on a single file. Opens via right-click on tag pills in the filter bar.
- **`InputModal` / `WipLimitModal`** (`src/modals.ts`) — Generic input modals for column names, WIP limits, etc.

### Layout

The main board container (`base-board-container`) is positioned to fill available space in the Obsidian workspace. This ensures the Kanban board properly occupies the view area regardless of sidebar state or other UI elements.

### Data Flow

1. **Bases engine** queries data based on the `.base` file's filters and groups entries by the configured `groupBy` property.
2. `KanbanView.onDataUpdated()` fires → `scheduleRender()` debounces (50ms) → `render()`.
3. Inside `render()`, raw `BasesEntryGroup[]` is mapped to `Column[]` via `toColumn()` adapter.
4. `render()` clears the container, iterates columns from `getColumns()`, delegates each to `columnManager.renderColumn()`.
5. Each column renders its cards via `cardManager.renderCard()`.

### Column Config — Single-Layer Storage

Column order is persisted in one place:

1. **Primary**: `BasesViewConfig.set("boardColumns", ...)` → written into the `.base` file as a custom view config key. Portable and version-controlled.

`getColumns()` reads only from `BasesViewConfig`. Legacy `data.json` column configs are intentionally not migrated — boards lose column ordering on first render after upgrade, columns regenerate in discovery order.

### Card Drop Logic

Dragging a card to a different column updates the frontmatter `groupBy` property via `processFrontMatter()`. Card ordering within a column uses the `kanban_order` frontmatter key. Multi-drag (Alt+click selection) is supported — co-selected cards move together and maintain relative order.

### Folder Rename Sync

When a folder is moved/renamed, `handleFolderRename()` debounces (250ms burst window) and then rewrites path references in all `.base` files via regex matching in `folder-rename.ts`. This keeps board filters functional after vault restructuring.

### Key Constants

- `NO_VALUE_COLUMN = "(No value)"` — column label for entries missing the groupBy property
- `ORDER_PROPERTY = "kanban_order"` — frontmatter key for card ordering
- `UNSAFE_FILENAME_CHARS` / `sanitizeFilename()` — regex + helper for stripping invalid file name characters
- Config keys are all defined in `packages/board-core/src/constants.ts` (`CONFIG_KEY_*`)
  - `CONFIG_KEY_COLUMNS = "boardColumns"` — persisted column order
  - `CONFIG_KEY_TAG_COLORS = "tagColors"` — custom tag color overrides (tag → hex)
  - `CONFIG_KEY_COLUMN_COLORS = "columnColors"` — per-column accent colors
  - `CONFIG_KEY_WIP_LIMITS = "wipLimits"` — per-column WIP limits
  - `CONFIG_KEY_BOARD_OPEN_BEHAVIOR = "boardOpenBehavior"` — card open behavior (active/modal/split/tab)
  - `CONFIG_KEY_BOARD_COVER_PROPERTY = "boardCoverProperty"` — frontmatter field holding cover image path/URL
  - `CONFIG_KEY_BOARD_USE_FIRST_EMBED = "boardUseFirstEmbed"` — use first `![[image]]` as cover fallback
  - `CONFIG_KEY_CHIP_PROPERTIES = "chipProperties"` — selected chip property names
  - `CONFIG_KEY_CHIP_COLORS = "chipColors"` — per-property, per-value color overrides
  - `CONFIG_KEY_CHIP_FIXED_COLORS = "chipFixedColors"` — persisted fixed color per chip property (one color applied to all values)
  - `CONFIG_KEY_CHIP_SHOW_LABELS = "chipShowLabels"` — per-property label toggle
  - `CONFIG_KEY_CHIP_ICONS = "chipIcons"` — per-property value→icon mappings
  - `CONFIG_KEY_BORDER_PROPERTY = "borderProperty"` — which field controls card border color

### Chip Properties Feature

Custom frontmatter fields can be rendered as colored chips (like tags) on cards:

- **`ChipPropertiesManager`** (`src/chip-properties.ts`) — manages chip property configuration, color mappings, icon overrides, and property discovery
- **`BoardSettingsModal`** (`src/board-settings-modal.ts`) — multi-page settings modal with tabs: Cover images, Chips & borders, Behavior. Replaces standalone `ChipConfigModal`.
- **`ChipConfigPanel`** (`src/board-settings-modal.ts`) — reusable two-panel chip configuration UI extracted from `ChipConfigModal`. Renders inside the Settings modal's Chips tab.
- **`ChipConfigModal`** (`src/chip-config-modal.ts`) — legacy standalone chip config modal (kept for backward compat, no longer used).
- **`IconPickerModal`** (`src/icon-picker-modal.ts`) — Searchable grid of all Obsidian icons. Used when configuring icon overrides for chip properties. Each tile uses `setIcon()` for pixel-accurate previews.
- **Toolbar Button**: Boards render a persistent `Settings` button (gear icon) in the filter bar to open the multi-page settings modal directly from the board UI
- **Storage**: All settings persisted in `.base` file via `BasesViewConfig`: `boardCoverProperty`, `boardUseFirstEmbed`, `boardOpenBehavior`, `chipProperties`, `chipColors`, `chipFixedColors`, `chipShowLabels`, `chipIcons`, `borderProperty`
- **Rendering**: Chips appear between tags and title on cards. Card borders use the configured field's mapped color. The border property is excluded from chip rendering logic to prevent it from appearing as a visible chip. If an icon override is configured, the chip renders the icon instead of the text value using the chip color.
- **Color resolution**: Checks fixed colors first (one color for all values of a property), then per-value mappings, then falls back to deterministic hash (same as tags).
- **Discovery behavior**: Property discovery now includes booleans like `false`, keeps configured properties visible even when they are not currently selected, and preserves color-map edits for unsaved properties until Save is pressed.

### Chip Config Panel Layout

The chip config panel (used inside BoardSettingsModal) uses a CSS Grid layout:
```
chip-config-layout (grid: auto 1fr / 260px 1fr)
├── chip-config-header (spans both columns)
├── chip-config-left (navigation panel, 260px)
└── chip-config-right (editor panel, 1fr)
```

The header is a grid child (not a sibling), ensuring it appears at the top. The ChipConfigPanel renders into any container element and does not manage its own modal lifecycle.

### Board Settings Modal

Multi-page modal with three tabs:
1. **Cover images** — cover property name input, first-embed toggle
2. **Chips & borders** — ChipConfigPanel (two-panel master-detail)
3. **Behavior** — open behavior dropdown (active/modal/split/tab)

Settings persist immediately via callbacks to `KanbanView.config.set()`. No separate "Save" action needed — changes are written as the user types.

## Build Output

### board-core
esbuild bundles `src/index.ts` into `dist/index.js` (ESM) and `dist/index.cjs` (CJS). Declarations in `dist/*.d.ts`.

Exports: types (`CardData`, `Column`, `BoardConfig`, `AvailableProperty`), constants (`CONFIG_KEY_*`, `NO_VALUE_COLUMN`, `ORDER_PROPERTY`, `UNSAFE_FILENAME_CHARS`, `sanitizeFilename`), color utilities (`relativeLuminance`), and folder rename helpers (`updateBaseFolderReferences`).

### obsidian-plugin
esbuild bundles `src/main.ts` into a single `main.js` (CJS, ES2018 target). Externalized modules: `obsidian`, `electron`, CodeMirror packages, Lezer packages, Node built-ins. Source maps only in dev mode.

### electron-app
esbuild bundles `main.ts` (Node/CJS) and `renderer/main.ts` (browser/iife) into separate outputs.

## CSS

Plugin styles live in `plugins/obsidian-plugin/styles.css` (~35KB). Classes follow the `base-board-*` naming convention. Dark mode is handled via Obsidian's built-in theme variables — no explicit dark-mode media queries. Electron app has its own minimal styles in `apps/electron-app/renderer/styles.css`.

## Adding a New Package

When adding a new package to the monorepo:

1. Create the directory under `packages/`, `plugins/`, or `apps/`
2. Add a `package.json` with its own dependencies and build scripts
3. Add a `tsconfig.json` if it contains TypeScript
4. If it depends on `board-core`, import via the path alias `@base-board/board-core/*` (configured in tsconfig `paths`)
5. Add a build script to root `package.json` if needed
