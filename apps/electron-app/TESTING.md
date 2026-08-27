# How to Test Run the Electron App

## Prerequisites

1. **Node.js 18+** installed
   - Check: `node --version`
   - Download: https://nodejs.org/

2. **npm** (comes with Node.js)
   - Check: `npm --version`

## Step-by-Step Testing Guide

### 1. Navigate to the Electron App Directory

```bash
cd apps/electron-app
```

### 2. Install Dependencies

```bash
npm install
```

This will install:
- electron
- esbuild
- gray-matter (for YAML frontmatter parsing)
- chokidar (for file watching)
- TypeScript and dev dependencies

**Expected output:**
```
added X packages in Ys
```

### 3. Start the Development Server

```bash
npm run dev
```

This command:
1. Builds the main process (`dist/main/`)
2. Starts esbuild dev server for renderer on `http://localhost:3000`
3. Launches the Electron app automatically

**Expected behavior:**
- A terminal window shows esbuild watching for changes
- An Electron window opens with the Base Board UI
- You should see the "Open Folder" button in the header

### 4. Test with Example Board

1. Click the **"Open Folder"** button in the app header
2. Navigate to: `apps/electron-app/example-board`
3. Select the folder and click "Select Folder"

**Expected result:**
- The board loads with 3 columns: **Todo**, **In Progress**, **Done**
- You should see 3 example cards distributed across the columns
- Filter bar appears at the top (currently empty)

### 5. Test Drag-and-Drop

1. **Move a card**: Click and drag any card to a different position in the same column or a different column
2. **Reorder columns**: Click and drag a column header to reorder columns
3. **Visual feedback**: You should see:
   - Drop indicators showing where the card will land
   - Ghost cards during multi-select
   - Auto-scroll if you drag near the edge

### 6. Test File Watching (Optional)

1. Open the `example-board/tasks/` folder in a file explorer
2. Add a new markdown file: `card-4.md`
3. The board should automatically update to show the new card

## Troubleshooting

### Issue: "Module not found: electron"

**Solution:**
```bash
cd apps/electron-app
npm install
```

### Issue: TypeScript errors during build

**Solution:**
```bash
cd apps/electron-app
npm run typecheck
```

Fix any reported errors before running `npm run dev`.

### Issue: CSS not loading / styles missing

**Solution:**
Make sure you're running `npm run dev` (not just `npm start`). The dev server serves the renderer from `http://localhost:3000`.

### Issue: App won't launch

**Solution:**
1. Check Electron is installed:
   ```bash
   cd apps/electron-app
   npx electron --version
   ```

2. If version doesn't print, reinstall:
   ```bash
   npm install electron --save-dev
   ```

### Issue: Port 3000 already in use

**Solution:**
```bash
# Kill the process using port 3000 (Windows)
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or restart your computer
```

## Production Build Test

To test the production build:

```bash
# Build both processes
npm run build

# Start the app
npm start
```

This will:
1. Compile TypeScript for main process
2. Bundle renderer with esbuild (minified)
3. Launch the app from `dist/` directory

## Verify File Structure

After running `npm run dev`, you should see:

```
apps/electron-app/
├── dist/
│   ├── main/              # Compiled main process
│   │   ├── index.js
│   │   ├── ipc/
│   │   │   ├── channels.js
│   │   │   └── handlers.js
│   │   └── services/
│   │       ├── file-adapter.js
│   │       └── file-watcher.js
│   └── renderer/          # Bundled renderer
│       └── main.js
├── src/                   # Source files (unchanged)
└── ...
```

## Expected Behavior Checklist

After testing, verify:

- [ ] App launches without errors
- [ ] "Open Folder" button works
- [ ] Board loads with 3 columns from example board
- [ ] Cards display with titles and tags
- [ ] Drag-and-drop moves cards between positions
- [ ] Column headers can be dragged to reorder
- [ ] Auto-scroll works when dragging near edges
- [ ] File changes are detected (add/edit/delete cards)
- [ ] UI updates in real-time without refresh

## Next Steps After Testing

1. **Create your own board**:
   - Create a new folder
   - Add a `.base` file with your columns
   - Add markdown files in `tasks/` subfolder

2. **Extend the app**:
   - Implement card detail modal (edit markdown body)
   - Add column context menu (rename, delete)
   - Wire up tag filtering to actual card data

3. **Package for distribution**:
   - Add electron-builder configuration
   - Create app icons
   - Build for Windows/macOS/Linux

## Need Help?

If you encounter issues:

1. Check `STATUS.md` for known limitations
2. Review `README.md` for architecture details
3. Check the Obsidian plugin source for reference implementations
4. Search for similar Electron issues on Stack Overflow

## Quick Command Reference

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Type-check only (no build)
npm run typecheck

# Build for production
npm run build

# Start production app
npm start

# Clean build artifacts
npm run clean
```

---

**You're all set!** The Electron app foundation is complete and ready to test. Follow the steps above to get started.
