# Quick Start Guide

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

## Installation

```bash
# Navigate to the electron-app directory
cd apps/electron-app

# Install dependencies
npm install
```

## Development Mode

Start the development server:

```bash
npm run dev
```

This will:
1. Build the main process (`dist/main/`)
2. Start esbuild dev server for the renderer on `http://localhost:3000`
3. Launch the Electron app

## Testing with Example Board

1. Run the app in development mode (see above)
2. Click the **"Open Folder"** button in the header
3. Navigate to and select: `apps/electron-app/example-board`
4. The board should load with:
   - 3 columns: Todo, In Progress, Done
   - 3 example cards distributed across columns
   - Filter bar at the top (currently empty)

## Project Structure

```
apps/electron-app/
├── src/
│   ├── main/              # Main process (Node.js)
│   │   ├── index.ts       # App entry point
│   │   ├── ipc/           # IPC handlers
│   │   └── services/      # File adapter, file watcher
│   ├── preload/           # Security bridge
│   └── renderer/          # UI (vanilla DOM)
│       ├── components/    # Kanban board, columns, cards
│       ├── services/      # Board state, drag-drop
│       └── styles/        # CSS (replicates Obsidian plugin)
├── example-board/         # Example board for testing
│   ├── example-board.base
│   └── tasks/             # Card markdown files
└── package.json
```

## Key Features Implemented

### ✅ Core Functionality
- Folder selection via native dialog
- Board config loading from `.base` files
- Column rendering with colors and WIP limits
- Card rendering with titles, covers, chips
- Drag-and-drop for cards and columns
- File watcher for real-time updates

### ✅ UI Components
- Kanban board container
- Column headers with context menu buttons
- Card action menus (rename, delete, open)
- Filter bar with tag pills
- Settings modal (multi-tab)
- Icon picker modal
- Tag edit modal

### ✅ Security
- contextIsolation enabled
- nodeIntegration disabled
- sandbox enabled
- IPC via contextBridge only

## Troubleshooting

### Module not found errors
```bash
cd apps/electron-app
npm install
```

### TypeScript errors
```bash
cd apps/electron-app
npm run typecheck
```

### CSS not loading
Make sure you're running `npm run dev` which starts the esbuild dev server on port 3000.

### App won't launch
Check that Electron is installed:
```bash
cd apps/electron-app
npx electron --version
```

## Next Steps

1. **Test the current implementation** with the example board
2. **Create your own board**:
   - Create a new folder
   - Add a `.base` file with column configuration
   - Add markdown files in a `tasks/` subfolder
3. **Extend the app** by implementing remaining features (see STATUS.md)

## Documentation

- [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) - Detailed plan with all chunks
- [STATUS.md](./STATUS.md) - Current implementation status and next steps
- [README.md](./README.md) - Full architecture and API documentation

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review STATUS.md for known limitations
3. Check the Obsidian plugin source for reference implementations
