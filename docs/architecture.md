# Architecture

### Monorepo Structure

```
packages/board-core/        Pure types & utilities, builds to dist/
plugins/obsidian-plugin/    Obsidian plugin (adapter layer on top of board-core)
apps/electron-app/          Standalone Electron app (skeleton)
```

### Entry Points

- **`plugins/obsidian-plugin/src/main.ts`** — Plugin class extending `Plugin`. Registers the Kanban view via `registerBasesView()`, handles "Create new board" command, and syncs `.base` file references on folder renames. Only one command is registered: "Create new board".
- **`plugins/obsidian-plugin/src/kanban-view.ts`** — Extends `BasesView` (the Bases API view class). Acts as the adapter layer: maps Obsidian's `BasesEntry`/`BasesEntryGroup` → board-core's `CardData`/`Column`. Orchestrates all sub-managers, implements the rendering pipeline, and provides `getFileOrder()` — the Obsidian adapter for the `PositionContext` interface used by `src/order.ts`.
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

type StyleRuleOperator = "contains" | "equals" | "starts-with" | "ends-with";

interface ChipStyleRule {
  id: string;              // unique identifier
  operator: StyleRuleOperator;
  pattern: string;         // text to match against
  color: string;           // hex color to apply when rule matches
}

type ChipStyleRulesMap = Record<string, ChipStyleRule[]>;

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
  chipStyleRules: ChipStyleRulesMap;   // Per-property conditional style rules
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
  chipStyleRules: {},
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
| `ChipPropertiesManager` | `src/chip-properties.ts` | Chip property config, color mappings, icon overrides, conditional style rules, property discovery. Methods: `getStyleRules()`, `setStyleRules()`, `getStyleRulesForProperty()`, `addStyleRule()`, `updateStyleRule()`, `removeStyleRule()` |

All managers accept `CardData` (not `BasesEntry`) and access Obsidian-specific operations (vault, metadataCache, modals) via the `KanbanView` instance passed to their constructors.

### Modals

- **`IconPickerModal`** (`src/icon-picker-modal.ts`) — Searchable grid over every icon Obsidian knows about. Each tile rendered with `setIcon()` for pixel-accurate previews. Used when configuring chip icon overrides.
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

Dragging a card to a different column updates the frontmatter `groupBy` property via `processFrontMatter()`. Card ordering within a column uses Trello-style **float positioning** via the `kanban_order` frontmatter key (stored as a JS `number` — IEEE 754 double).

Position scheme (in `src/order.ts`):
- **First card**: `prev / 2` (or `-1_000_000` if prepending before a legacy card at position 0)
- **Between two cards**: `(prev + next) / 2` — midpoints, e.g. `(100_000 + 200_000) / 2 = 150_000`
- **Last card**: `last + 1_000_000`

Only the dropped card(s) get frontmatter writes — no column-wide renumbering. Repeated midpoint insertions halve the gap each time (`1M → 500k → 250k → ...`), so a **re-index safeguard** (`REINDEX_THRESHOLD = 1.0`) renormalizes the column back to clean multiples of 1_000_000 whenever adjacent gaps shrink below 1.0 (typically after ~20 midpoints in the same slot).

Multi-drag (Alt+click selection) is supported — co-selected cards move together and maintain relative order.

#### The `order.ts` module

Pure positioning logic, separated from Obsidian concerns:

| Export | Purpose |
|--------|---------|
| `ORDER_PROPERTY` | Re-export of `"kanban_order"` from `constants.ts` |
| `REINDEX_THRESHOLD` | Gap threshold (1.0) triggering renormalization |
| `PositionContext` | Interface: `{ getFileOrder(filePath): number }` — abstracts the Obsidian adapter |
| `getDropPosition()` | Computes float position for a dropped card given `index`, `orderedPaths`, `allCards`, and a `PositionContext` |
| `renormalizeColumn()` | Renumber all cards in a column with fresh multiples of 1_000_000 |

`KanbanView.getFileOrder()` is the Obsidian adapter that implements `PositionContext.getFileOrder` by reading frontmatter via `metadataCache`. It stays in `kanban-view.ts` since it depends on `app.vault` and `app.metadataCache`.

### Folder Rename Sync

When a folder is moved/renamed, `handleFolderRename()` debounces (250ms burst window) and then rewrites path references in all `.base` files via regex matching in `folder-rename.ts`. This keeps board filters functional after vault restructuring.

### Key Constants

- `NO_VALUE_COLUMN = "(No value)"` — column label for entries missing the groupBy property
- `ORDER_PROPERTY = "kanban_order"` — frontmatter key for card ordering (re-exported from `src/order.ts`)
- `REINDEX_THRESHOLD = 1.0` — gap threshold triggering column renormalization (`src/order.ts`)
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
  - `CONFIG_KEY_CHIP_STYLERULES = "chipStyleRules"` — per-property conditional style rules map
  - `CONFIG_KEY_CHIP_PROPERTY_MODES = "chipPropertyModes"` — per-property active mode (fixed/per-value/style-rules)
  - `CONFIG_KEY_BORDER_PROPERTY = "borderProperty"` — which field controls card border color

### Chip Properties Feature

Custom frontmatter fields can be rendered as colored chips (like tags) on cards:

- **`ChipPropertiesManager`** (`src/chip-properties.ts`) — manages chip property configuration, color mappings, icon overrides, conditional style rules, per-property mode tracking, and property discovery. Exposes `getStyleRules()`, `setStyleRules()`, `getStyleRulesForProperty()`, `addStyleRule()`, `updateStyleRule()`, `removeStyleRule()`, `getPropertyModes()`, `setPropertyMode()`.
- **`BoardSettingsModal`** (`src/board-settings-modal.ts`) — multi-page settings modal with tabs: Cover images, Chips & borders, Behavior. Replaces standalone `ChipConfigModal`.
- **`ChipConfigPanel`** (`src/board-settings-modal.ts`) — card-based chip configuration UI with drag-and-drop reordering. Renders inside the Settings modal's Chips tab. Each property is an expandable card with drag handle, checkbox, and editor section.
- **Mode selector**: Three radio options — "Fixed color", "Per-value mapping", and "Conditional style rules". Selecting "Conditional style rules" reveals a rule editor below the mode group: each rule row has an operator dropdown (`contains` / `equals` / `starts-with` / `ends-with`), a pattern text input, a color swatch picker, and a delete button. A "+ add rule" button appends new rows. Rules are evaluated top-to-bottom; the first matching rule's color is applied.
- **`IconPickerModal`** (`src/icon-picker-modal.ts`) — Searchable grid of all Obsidian icons. Used when configuring icon overrides for chip properties. Each tile uses `setIcon()` for pixel-accurate previews.
- **Toolbar Button**: Boards render a persistent `Settings` button (gear icon) in the filter bar to open the multi-page settings modal directly from the board UI
- **Storage**: All settings persisted in `.base` file via `BasesViewConfig`: `boardCoverProperty`, `boardUseFirstEmbed`, `boardOpenBehavior`, `chipProperties`, `chipColors`, `chipFixedColors`, `chipStyleRules`, `chipShowLabels`, `chipIcons`, `chipPropertyModes`, `borderProperty`. Cover/behavior changes persist immediately on input; chip config and mode selections persist on Save button press.
- **Order sync**: When chip properties are saved, `KanbanView.syncOrderToBaseFile()` directly modifies the `.base` file YAML to update the view's `order` array with all chip property names prefixed as `note.<property>`. The border property is also included if not already a chip property. This makes chip properties visible in Bases' native search/filter UI. Uses `parseYaml`/`stringifyYaml` from Obsidian API for safe YAML manipulation.
- **Rendering**: Chips appear between tags and title on cards. Card borders use the configured field's mapped color. The border property is excluded from chip rendering logic to prevent it from appearing as a visible chip. If an icon override is configured, the chip renders the icon instead of the text value using the chip color.
- **Color resolution** is driven by the per-property mode (`chipPropertyModes`):
  - `fixed` — uses `chipFixedColors` only (one color for all values)
  - `style-rules` — evaluates `chipStyleRules` first (first matching rule wins; operator can be `contains`, `equals`, `starts-with`, or `ends-with`), falls back to `chipColors`
  - `per-value` — uses `chipColors` (explicit value → hex override), falls back to `chipFixedColors`
  - Only the active mode's data is consulted; old data for other modes is retained in the `.base` file but ignored.
  - Unmapped values render without custom color.
- **Discovery behavior**: Property discovery now includes booleans like `false`, keeps configured properties visible even when they are not currently selected, and preserves color-map edits for unsaved properties until Save is pressed.

### Chip Config Panel Layout

The chip config panel (used inside BoardSettingsModal) uses a card-based layout:
```
chip-config-header (title + description)
├── chip-config-section (Properties)
│   ├── Refresh button
│   └── chip-property-list (vertical stack of cards)
│       ├── chip-property-card (draggable)
│       │   ├── chip-drag-handle (⠿)
│       │   ├── checkbox (enable/disable)
│       │   ├── chip-card-label (property name)
│       │   ├── chip-expand-btn (▸/▾)
│       │   └── chip-property-card-body (expanded editor)
│       │       ├── show label toggle
│       │       ├── mode radio group (fixed/per-value/conditional style rules)
│       │       ├── fixed color picker (if fixed mode)
│       │       ├── per-value mapping rows (if per-value mode)
│       │       └── style-rules editor (if conditional style rules mode)
│       │           ├── rule row: operator dropdown | pattern input | color swatch | delete button
│       │           └── "+ add rule" button
└── chip-config-section (Card border)
    └── select dropdown
```

Each property card is draggable for reordering. The card body expands/collapses to show/hide the editor. The ChipConfigPanel renders into any container element and does not manage its own modal lifecycle.

### Board Settings Modal

Multi-page modal with three tabs:
1. **Cover images** — cover property name input, first-embed toggle
2. **Chips & borders** — ChipConfigPanel (card-based with drag-and-drop)
3. **Behavior** — open behavior dropdown (active/modal/split/tab)

**Persistence model**: Cover images and behavior settings persist immediately via callbacks to `KanbanView.config.set()` as the user types. Chip configuration (including property reorder, colors, icons, border property, and per-property mode) persists when the user presses Save — the modal collects a `ChipConfigSnapshot` from the panel and submits it through `onSubmit`. Mode changes are also persisted immediately as the user switches radios. No separate "Save" action for cover/behavior changes; chip config requires explicit Save.
