# Electron App — Run & Debug Guide

## Prerequisites

```bash
npm install
```

## Development Mode (with hot reload)

```bash
cd apps/electron-app
npm run dev:all
```

This starts:
- esbuild dev server on `http://localhost:3000` (renderer)
- TypeScript compiler in watch mode (main process)
- Electron app with DevTools auto-opened

## Production Mode (bundled)

```bash
cd apps/electron-app
npm run build
npx electron dist/main/index.js
```

Or with logging enabled:

```bash
$env:ELECTRON_ENABLE_LOGGING="1"
$env:ELECTRON_ENABLE_STACK_DUMP="1"
npx electron dist/main/index.js
```

## Debugging

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `NODE_ENV=development` | Loads from `localhost:3000` instead of built files |
| `ELECTRON_ENABLE_LOGGING=1` | Prints renderer console logs to terminal |
| `ELECTRON_ENABLE_STACK_DUMP=1` | Includes stack traces in logs |

### Viewing Logs

**Main process logs:** Always visible in terminal with `[Main]` prefix.

**Renderer logs:** Only visible when:
- Running with `ELECTRON_ENABLE_LOGGING=1`
- DevTools is open (F12)
- Using the logger utility (see below)

### Logger Utility

For persistent logging that survives app restarts:

```typescript
import { logger } from './utils/logger';

logger.info('Board loaded', boardConfig);
logger.warn('Card missing title', card.id);
logger.error('Failed to save', error);
```

Logs are written to `apps/electron-app/logs/debug.log` and also appear in terminal.

### DevTools

DevTools opens automatically in development mode. To force it open in production:

```typescript
// In src/main/index.ts, add after mainWindow creation:
mainWindow.webContents.openDevTools();
```

**Note:** Remove this before production builds.

## Common Issues

### esbuild dev server stops immediately

The dev server requires stdin to stay open. Use `npm run dev:all` which manages both processes.

### Preload script not found

Ensure you've built the preload:
```bash
npm run build:preload
```

### ERR_CONNECTION_REFUSED on localhost:3000

The esbuild dev server isn't running. Check that `npm run dev:renderer` is active.

## Folder Structure

```
apps/electron-app/
├── src/
│   ├── main/index.ts          # Main process entry
│   ├── preload/index.ts       # Preload script (contextBridge)
│   └── renderer/
│       ├── main.ts            # Renderer entry
│       ├── components/        # UI components
│       ├── services/          # Board state, drag-drop, etc.
│       ├── utils/logger.ts    # File-based logger
│       └── styles/main.css    # App styles
├── dist/                      # Built output
├── logs/debug.log             # Logger output
└── example-board/             # Example board for testing
```

## IPC API

The renderer accesses main process via `window.electronAPI`:

```typescript
// Dialogs
electronAPI.openFolder()
electronAPI.openFile(filters)
electronAPI.saveFile(defaultPath)

// File operations
electronAPI.readFile(path)
electronAPI.writeFile(path, content)
electronAPI.readDir(dirPath)

// Board operations
electronAPI.loadBoard(baseFilePath)
electronAPI.saveBoard(baseFilePath, config)

// Card operations
electronAPI.createCard(tasksDir, frontmatter, body)
electronAPI.updateCard(filePath, frontmatter, body)
electronAPI.deleteCard(filePath)

// File watcher
electronAPI.onFileChanged(callback)

// Logger
electronAPI.logger.log(...args)
electronAPI.logger.warn(...args)
electronAPI.logger.error(...args)
```
