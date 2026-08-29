<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/mderazon/obsidian-base-board/HEAD/logo-dark.svg">
    <img alt="Base Board Logo" src="https://raw.githubusercontent.com/mderazon/obsidian-base-board/HEAD/logo-light.svg">
  </picture>
</p>

# Base Board

> **Fork:** This repository is a fork of [mderazon/obsidian-base-board](https://github.com/mderazon/obsidian-base-board) by Michael DeRazon (MIT). It is maintained at [bjornclauw/obsidian-base-board](https://github.com/bjornclauw/obsidian-base-board) and adds the enhancements documented below. Upstream remains the source of truth for the base feature set.

**Base Board** is an interactive, property-driven Kanban board view for [Obsidian Bases](https://obsidian.md). It allows you to organize your notes into visual columns based on any property in your frontmatter, providing a seamless drag-and-drop experience for managing tasks and structured data.

![Base Board demo](demo.gif)

## Key Features

- **Property-Based Columns**: Instantly generate columns from any frontmatter property.
- **Intuitive Drag & Drop**: Move cards between columns to update their properties automatically, and reorder cards within a column.
- **Inline Power**: Rename cards or column titles directly on the board.
- **Native Editing Modal**: Open any card into a fully-functional Obsidian editor floating directly over your workspace.
- **Rich Cards**: View key metadata fields as chips on each card for a quick overview.
- **Chip Properties**: Use the board toolbar to map frontmatter fields into colored chip badges, optionally set one property as a card border color, and even render a configured icon instead of the text value.
- **Configurable Card Title**: Set `cardTitleProperty: note.title` in your `.base` file to use a frontmatter property (e.g. `title`) as the card heading instead of the filename.
- **Tags**: Color-coded tag chips on cards with a clickable filter bar to narrow the board by tag.
- **Hover Preview**: Native note previews on hover (uses the **Page preview** core plugin).
- **One-Click Creation**: Add new notes directly to a specific column without leaving the board view.
- **WIP Limits**: Set per-column work-in-progress limits via the column header context menu. Columns that exceed their limit are highlighted in red.
- **Card Cover Images**: Display cover images at the top of cards by specifying an image frontmatter property (e.g., `cover: "[[image.png]]"` or a web URL). Configure the property name and enable first-embed fallback in board settings.
- **Data First**: All changes are written directly to your Markdown files.

## Enhancements in this fork

All fixes below are validated on a 300-card board with cover images. Behavior is Trello-like: data updates patch the DOM in place — no full-board teardown, no scroll jumps.

### Performance (large boards)

- **Per-column virtualization** — `packages/board-core/src/virtual-list.ts` (`LazyList`, `IntersectionObserver` with 1000px margin). Only shells render for offscreen cards; `hydrateNow` fills moved cards immediately so they never blink.
- **`content-visibility: auto` + `contain-intrinsic-size: auto 120px`** on `src/styles/card.css:574` and `card-cover.ts:137` per-card `containIntrinsicSize` estimates; `scrollbar-gutter: stable` on `src/styles/column.css:246` prevents horizontal shift when scrollbars appear.
- **Single-pass render context** — `src/render-context.ts:12` snapshots `kanban_order`, chip config, and tag colors once per render; `column.ts:399` and `reconciler.ts:82` reuse it. Removes hundreds of `config.get()` and `metadataCache` lookups per render.
- **Delegated card events + lazy edit icon** — `CardManager.attachCardContainerListeners` in `card.ts:373` replaces ~7 listeners per card with one set per column; edit pencil SVG is injected on first hover.

### Correctness / drag & order

- Fixed dead property-chip loop (`card.ts:318`, `chips.length >= 0` always broke) — overflow `+N more` now renders.
- `column.ts:399` sort maps missing `kanban_order` to `MAX_SAFE_INTEGER` (stable sort; avoids `Infinity - Infinity = NaN` scrambling).
- `order.ts:37` — `getDropPosition` handles missing orders via `maxFinite` fallback; append case guarded for non-finite `prevPos`.
- **Batch move** (`card-selection.ts:1043`) appends at `maxExisting + n·1_000_000` instead of `1M, 2M…` which collided with existing orders.
- **Renormalize** — `kanban-view.ts:renormalizeIfNeeded` runs on the final DOM order (not stale `currentGroups`), and multi-move positions are computed sequentially with overrides so co-moved cards see each other's new values.

### Incremental updates (no full rebuild)

- **BoardReconciler** (`src/reconciler.ts:12`, `src/kanban-view.ts:88`) diffs columns/cards by identity (`data-column-name`, `data-file-path`), reorders with `insertBefore`, rebuilds filter bar only when `computeFilterBarFingerprint` changes, and rebuilds a card's content only when `computeFingerprint` changes (excludes `kanban_order` and groupBy unless they affect chips/border).
- **Card fingerprint** (`reconciler.ts:314`) includes `displayName`, filtered `properties`, tag colors, and first-embed links; `kanban_order` and groupBy are stripped to avoid flash on moves/renames/renormalizes.
- Placeholder and drag-state cleanup (`reconciler.ts:58`, `drag-drop.ts:533`) — optimistic `cardDropped`, `hydrateNow`, and stale placeholder removal prevent snap-back and pulsing artifacts.

### Column rename lifecycle (Trello-like)

- **Single source of truth** — `src/column-rename-tracker.ts:12` (`ColumnRenameTracker`) replaces three overlapping structures. Register via `kanban-view.ts:672` with `expectedCount`; claim walks the full rename chain (`A→B→C`).
- Stale-name suppression and stored-config scrub, plus complete-group carry-over while Bases re-queries in waves (bases can list both old and new names or partial groups).
- **Frozen column** for ~30s or until settlement — card DOM, count badge, and scroll are untouched until the new group is fully present (`reconciler.ts:freezeCards`).
- Live header-element resolution — `column.ts:290` (`startColumnRename`) and `column.ts:196` (`showColumnMenu`) resolve current DOM elements by `data-column-name` instead of stale render closures; `card.ts:852` (`startInlineCardCreation`) and `column-rename-tracker.ts` fix third-rename flashes.
- Optimistic header input restore and **per-column config migration** (`kanban-view.ts:648`, `column.ts:338`) — colors and WIP limits follow the rename; merge semantics when renaming onto an existing column.

### Code hygiene

- `card.ts:574` (was 1051) split per `src/plans/card-ts-split.md` into `card-cover.ts:137` (`CardCoverRenderer`), `card-actions.ts:225` (`CardActionManager`), `card-selection.ts:138` (`CardSelectionManager`).
- Deleted duplicate `src/color-utils.ts` and `src/folder-rename.ts` (byte-identical to `board-core`); imports now via `@base-board/board-core` (`tags.ts:5`, `main.ts:12`).
- `FILE_PROPS_TO_SKIP` unified via `chip-properties.ts:70`; dead `existingCards` param threading removed (`card.ts:852`, `column.ts:109`).

## Usage

Open the **Command palette** (`Ctrl/Cmd + P`) and run **"Base Board: Create new board"**. Enter a name, choose a folder, and the plugin will scaffold everything for you — a `.base` file, a tasks folder, and sample task notes. The board opens automatically.

### Card Navigation & Selection

By default, card interaction respects native Obsidian conventions:

* **Click:** Open the card's note in the active tab / pane.
* **Ctrl/Cmd + Click:** Open the note in a new tab.
* **Ctrl/Cmd + Alt + Click** (or **Cmd + Option + Click** on macOS): Open the note to the side in a split pane.
* **Alt / Option + Click:** Toggle selection of a card (for bulk actions or dragging).
* **Shift + Click:** Select a range of cards.

You can customize the default click behavior (e.g. to always open in a floating modal, split pane, or new tab) via the board toolbar under the view options menu.

To configure chip properties, open any board and click the gear icon in the filter bar to open Board Settings. The "Chips & borders" tab lets you select frontmatter fields, assign colors, choose a border-color property, and optionally define an icon override for a chip.

## Installation

### From Obsidian Community Plugins

Search for **Base Board** in the Obsidian Community Plugins browser and click **Install**, or view the plugin directly on the [Obsidian Community Plugins directory](https://community.obsidian.md/plugins/base-board).

### Using BRAT

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin.
2. Go to **Settings → BRAT → Add Beta Plugin**.
3. For upstream: enter `mderazon/obsidian-base-board` and click **Add Plugin**.
4. For this fork: enter `bjornclauw/obsidian-base-board` and click **Add Plugin**.

## Development

This is a monorepo with three packages:

```
packages/board-core/     — Pure Kanban types & utilities (zero Obsidian deps)
plugins/obsidian-plugin/ — Obsidian Community Plugin
apps/electron-app/       — Standalone Electron app (work in progress)
```

### Quick Start

1. Clone this repo.
2. Run `npm install` at the root.
3. Run `npm run dev:plugin` to start watch-mode build for the Obsidian plugin.

### Available Scripts

```bash
npm run build            # Build core → plugin (full chain)
npm run build:core       # Build board-core only
npm run build:plugin     # Build obsidian plugin only
npm run build:electron   # Build electron app
npm run dev:plugin       # Watch-mode build for Obsidian dev vault
npm run dev:electron     # Launch Electron app
npm run lint             # Type-check core + lint plugin
npm run format           # Prettier across all packages
npm run clean            # Remove all build outputs
```

### Architecture

- **`packages/board-core`** defines the domain types (`CardData`, `Column`, `BoardConfig`) and pure utilities — now also `LazyList` (`virtual-list.ts`) and re-exported `color-utils` / `folder-rename`. Both the Obsidian plugin and Electron app consume this package.
- **`plugins/obsidian-plugin`** extends `BasesView` from the Obsidian Bases API. The `KanbanView` class acts as an adapter, mapping Obsidian's `BasesEntry`/`BasesEntryGroup` types to board-core's `CardData`/`Column`. Rendering is split:
  - `KanbanView` (`kanban-view.ts:642`) — full render (config changes, first paint, placeholder).
  - `BoardReconciler` (`reconciler.ts:12`) — incremental update for data changes.
  - `RenderContext` (`render-context.ts:12`) — per-render snapshot (cover, chip config, order, tag colors).
  - `ColumnRenameTracker` (`column-rename-tracker.ts:12`) — rename element claiming and mid-propagation shielding.
  - `CardManager` (`card.ts:574`) orchestrates `CardCoverRenderer`, `CardActionManager`, and `CardSelectionManager`.
- **`apps/electron-app`** is a standalone Electron app with a data adapter layer that reads markdown files directly (no Obsidian API required). Currently a skeleton ready for implementation.

## License

This plugin is licensed under the [MIT License](LICENSE).
