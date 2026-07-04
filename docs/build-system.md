# Build System

### board-core

esbuild bundles `src/index.ts` into `dist/index.js` (ESM) and `dist/index.cjs` (CJS). Declarations in `dist/*.d.ts`.

Exports: types (`CardData`, `Column`, `BoardConfig`, `AvailableProperty`), constants (`CONFIG_KEY_*`, `NO_VALUE_COLUMN`, `ORDER_PROPERTY`, `UNSAFE_FILENAME_CHARS`, `sanitizeFilename`), color utilities (`relativeLuminance`), and folder rename helpers (`updateBaseFolderReferences`).

### obsidian-plugin

esbuild bundles `src/main.ts` into a single `main.js` (CJS, ES2018 target). Externalized modules: `obsidian`, `electron`, CodeMirror packages, Lezer packages, Node built-ins. Source maps only in dev mode.

### electron-app

esbuild bundles `main.ts` (Node/CJS) and `renderer/main.ts` (browser/iife) into separate outputs.

## CSS

Source CSS is split into logical modules in `plugins/obsidian-plugin/src/styles/` (9 files, ~35KB total). The build process concatenates them into a single `styles.css` that lives next to `main.js` in the output directory. Obsidian auto-loads `styles.css` from the plugin root. Classes follow the `base-board-*` naming convention. Dark mode is handled via Obsidian's built-in theme variables — no explicit dark-mode media queries.

### Source files (`src/styles/`)

| File | Contents |
|------|----------|
| `board.css` | Container, board layout, placeholder |
| `column.css` | Column styles, drag handle, header, cards container, add column button |
| `card.css` | Card styles, thumbnail, chips, rename, overflow, border, add card button |
| `filter-bar.css` | Toolbar, filter bar, pills, tags, light/dark variants |
| `modals.css` | Card detail modal, tag edit modal, modal actions |
| `chip-properties.css` | On-card chip rendering, show label toggle, icon picker button |
| `chip-config.css` | Chip config panel (card-based layout), mapping editor, mode selector |
| `icon-picker.css` | Icon picker modal grid |
| `settings.css` | Board settings modal (header, tabs, content) |

### Build output

The esbuild config includes a `concat-styles` plugin that reads all `.css` files from `src/styles/`, concatenates them with section headers, and writes the result to `styles.css` in the output directory (next to `main.js`). This means:

- **Dev mode**: `npm run dev:plugin` produces `main.js` + `styles.css` in the current directory (set `PLUGIN_DEV_DIR` to your vault's plugin folder for auto-deploy).
- **Production**: `npm run build` produces `main.js` + `styles.css` in the plugin root.

Electron app has its own minimal styles in `apps/electron-app/renderer/styles.css`.

## Adding a New Package

When adding a new package to the monorepo:

1. Create the directory under `packages/`, `plugins/`, or `apps/`
2. Add a `package.json` with its own dependencies and build scripts
3. Add a `tsconfig.json` if it contains TypeScript
4. If it depends on `board-core`, import via the path alias `@base-board/board-core/*` (configured in tsconfig `paths`)
5. Add a build script to root `package.json` if needed
