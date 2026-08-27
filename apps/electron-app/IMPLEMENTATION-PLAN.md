# Electron App Implementation Plan

## Architecture Overview

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
│   │       └── board-loader.ts # Board config loading
│   ├── preload/
│   │   └── index.ts            # contextBridge exposure
│   └── renderer/
│       ├── index.html
│       ├── main.ts             # UI entry point
│       ├── components/         # Vanilla DOM components
│       │   ├── kanban-board.ts
│       │   ├── column.ts
│       │   ├── card.ts
│       │   └── filter-bar.ts
│       ├── services/           # Business logic
│       │   ├── board-state.ts  # In-memory board model
│       │   └── file-adapter.ts # IPC wrapper for main process
│       ├── styles/             # CSS (replicate Obsidian plugin)
│       │   └── main.css
│       └── types.ts            # Shared interfaces
├── package.json
├── tsconfig.json
└── tsconfig.main.json
```

## Data Model

### Board Config (`.base` file)
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

### Card (Markdown file in `tasks/`)
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

## Implementation Chunks

### Chunk 0: Project Setup
- [ ] Initialize `apps/electron-app/package.json` with dependencies
- [ ] Create TypeScript configs (`tsconfig.json`, `tsconfig.main.json`)
- [ ] Set up esbuild pipeline for main + preload + renderer
- [ ] Configure monorepo linking to `board-core`
- [ ] Create initial directory structure
- [ ] Add npm scripts (dev, build, start)

### Chunk 1: Main Process Foundation
- [ ] Create `src/main/index.ts` with Electron app lifecycle
- [ ] Implement window creation with security settings
- [ ] Set up contextBridge in preload script
- [ ] Define IPC channel types and handlers
- [ ] Implement basic file reading/writing via IPC

### Chunk 2: File Adapter Layer
- [ ] Create `file-adapter.ts` for markdown file operations
- [ ] Implement YAML frontmatter parsing with gray-matter
- [ ] Build board config loader (`.base` file parser)
- [ ] Implement card CRUD operations
- [ ] Add folder scanning for `tasks/` directory

### Chunk 3: Board State Management
- [ ] Create in-memory board model using board-core types
- [ ] Implement reactive state updates
- [ ] Build positioning algorithm (Trello-style midpoint)
- [ ] Add column reordering logic
- [ ] Implement card drag-and-drop state management

### Chunk 4: Renderer Entry Point & CSS
- [ ] Create `index.html` with board container
- [ ] Set up renderer entry point (`main.ts`)
- [ ] Port Obsidian plugin CSS classes to `styles/main.css`
- [ ] Adapt CSS for Electron context (fallback theme variables)
- [ ] Implement initial board rendering

### Chunk 5: Column Rendering
- [ ] Build column component with header
- [ ] Implement column colors and WIP limit display
- [ ] Add context menu (rename, color picker, WIP limit, delete)
- [ ] Implement drag-to-reorder columns via header
- [ ] Add add-card inline input

### Chunk 6: Card Rendering
- [ ] Build card component with title from property or basename
- [ ] Implement cover image display from frontmatter
- [ ] Add chip display for configured properties
- [ ] Show border property if configured
- [ ] Implement card action menu (edit tags, rename, delete, open)

### Chunk 7: Drag-and-Drop Engine
- [ ] Implement card drag with ghost cards for multi-select
- [ ] Build drop position calculation (midpoint algorithm)
- [ ] Add auto-scroll during drag
- [ ] Implement column reorder via header drag
- [ ] Add visual feedback (drop indicators, highlight states)

### Chunk 8: Tag Filtering
- [ ] Build filter bar with tag pills
- [ ] Implement tag color management
- [ ] Add toggle filters functionality
- [ ] Filter cards by active tag membership
- [ ] Show filter count and clear button

### Chunk 9: Settings Modals
- [ ] Create board settings modal (multi-tab)
- [ ] Implement chip configuration panel
- [ ] Build color picker for columns and chips
- [ ] Add WIP limit input with validation
- [ ] Create tag edit modal (enter/comma to add, backspace to remove)

### Chunk 10: Icon Picker & Advanced Features
- [ ] Bundle icon set for Electron (no Obsidian API)
- [ ] Build searchable icon grid modal
- [ ] Implement folder rename sync (rewrite `.base` paths)
- [ ] Add card detail modal (open note in split/new tab)
- [ ] Implement cover image management

### Chunk 11: File Watcher & Live Updates
- [ ] Set up chokidar file watcher
- [ ] Detect external file changes
- [ ] Broadcast updates to renderer via IPC
- [ ] Refresh board UI on data changes
- [ ] Handle concurrent edit conflicts

### Chunk 12: Build Pipeline & Polish
- [ ] Configure esbuild for production build
- [ ] Add source maps for debugging
- [ ] Implement hot reload for development
- [ ] Test all features against Obsidian plugin behavior
- [ ] Fix edge cases (empty boards, missing frontmatter, special chars)

## Key Technical Decisions

1. **Use gray-matter** for YAML frontmatter parsing (battle-tested, 10k+ stars)
2. **Use chokidar** for file watching (cross-platform, handles edge cases)
3. **Vanilla DOM** in renderer (no framework, matches board-core approach)
4. **IPC via contextBridge** with strict type safety
5. **Reactive state** using simple event emitter pattern
6. **CSS replication** using exact same class names as Obsidian plugin

## Success Criteria

- [ ] User can select a folder containing `.base` files and `tasks/` directories
- [ ] Board renders identically to Obsidian plugin (same CSS, same layout)
- [ ] Cards can be created, renamed, deleted, moved between columns
- [ ] Column colors, WIP limits, chip properties all work
- [ ] Tag filtering functions correctly
- [ ] Drag-and-drop works smoothly with auto-scroll
- [ ] Settings modal allows full board configuration
- [ ] File changes detected and reflected in real-time
- [ ] No Obsidian API dependencies (pure Electron)
