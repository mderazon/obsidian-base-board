# Base Board - Electron App

A standalone Electron application for the Base Board Kanban system. This app replicates the full functionality of the Obsidian plugin without requiring Obsidian.

## Features

- **Folder-based boards**: Select a folder containing `.base` files and `tasks/` directories
- **Identical UI**: Same look and feel as the Obsidian plugin (same CSS classes, same layout)
- **Real-time updates**: File watcher detects external changes and refreshes the UI
- **Drag-and-drop**: Full card and column reordering with midpoint positioning
- **Tag filtering**: Filter cards by tags with color-coded pills
- **Chip properties**: Display configured properties as chips on cards
- **WIP limits**: Visual indicators for column work-in-progress limits
- **Settings modal**: Configure columns, colors, chips, and board behavior

## Architecture

```
apps/electron-app/
├── src/
│   ├── main/                    # Main process (Node.js)
│   │   ├── index.ts            # App lifecycle, window creation
│   │   ├── ipc/
│   │   │   ├── channels.ts     # IPC channel definitions
│   │   │   └── handlers.ts     # All IPC handlers
│   │   ├── services/
│   │   │   ├── file-adapter.ts # fs operations, gray-matter parsing
│   │   │   └── file-watcher.ts # chokidar file watcher
│   │   └── utils/
│   ├── preload/
│   │   └── index.ts            # contextBridge exposure
│   └── renderer/
│       ├── index.html
│       ├── main.ts             # UI entry point
│       ├── components/         # Vanilla DOM components
│       │   ├── kanban-board.ts
│       │   ├── column.ts
│       │   └── filter-bar.ts
│       ├── services/           # Business logic
│       │   └── board-state.ts  # In-memory board model
│       └── styles/             # CSS (replicate Obsidian plugin)
│           └── main.css
├── package.json
├── tsconfig.json
├── tsconfig.main.json
├── tsconfig.renderer.json
└── esbuild.config.js
```

## Data Model

### Board Config (.base file)
```yaml
filters:
  - type: function
    query: "inFolder('my-board')"
views:
  - name: "My Board"
    type: kanban
    config:
      columns:
        - id: "col-1"
          name: "Todo"
          color: "#ff0000"
          wipLimit: 0
          order: 0
      coverProperty: "cover"
      cardTitleProperty: "title"
      firstEmbed: true
      chipProperties:
        - property: "status"
          style: "pill"
          colorMap:
            todo: "#ff0000"
            done: "#00ff00"
      openBehavior: "split"
```

### Card (Markdown file in tasks/)
```markdown
---
kanban_order: 0.5
title: "My Task"
status: todo
tags:
  - urgent
cover: "./assets/image.png"
---

## Body content here

Some task description.
```

## Development

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Install dependencies
npm install

# Build board-core first (dependency)
cd packages/board-core
npm run build
cd ../..

# Install electron-app dependencies
cd apps/electron-app
npm install
```

### Development Mode

```bash
# Start development server (main + renderer)
npm run dev

# Or start separately:
npm run dev:main    # Watch mode for main process
npm run dev:renderer  # esbuild serve for renderer
```

### Production Build

```bash
# Build both processes
npm run build

# Start the app
npm start
```

## Security

- **contextIsolation**: Enabled - renderer cannot access Node.js APIs directly
- **nodeIntegration**: Disabled - no direct access to Electron APIs from renderer
- **sandbox**: Enabled - additional Chromium sandboxing
- **IPC via contextBridge**: Only exposed APIs are available to the renderer

## File I/O Pattern

All file operations happen in the main process and are exposed to the renderer via IPC:

1. User selects folder → Main process shows dialog
2. Read `.base` file → Main process reads with `fs/promises`, parses with gray-matter
3. Parse board state → Extract columns, cards, properties from frontmatter
4. Render UI → Renderer builds DOM from parsed data via `window.electronAPI`
5. User moves card → Renderer calls `window.electronAPI.updateCard()`
6. Write to disk → Main process updates frontmatter, writes file
7. External edit detected → chokidar fires event, main process re-reads and broadcasts to renderer

## Next Steps

- [ ] Implement full drag-and-drop with ghost cards
- [ ] Add card detail modal (open note in split/new tab)
- [ ] Build settings modal (multi-tab: Cover/Chips/Behavior)
- [ ] Implement icon picker (bundled icon set)
- [ ] Add folder rename sync (rewrite `.base` paths)
- [ ] Bundle icon set for Electron (no Obsidian API)
- [ ] Add production packaging with electron-builder

## Troubleshooting

### Module not found: 'electron'
Make sure you've run `npm install` in the `apps/electron-app` directory.

### TypeScript errors
Run `npm run typecheck` to see all type errors without compiling.

### CSS not loading
Check that the `styles/main.css` file is being served correctly. In development, it should be loaded from the source directory.

## License

MIT
