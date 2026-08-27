import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { registerIpcHandlers } from './ipc/handlers';
import { FileWatcher } from './services/file-watcher';

// Simple file logger for debugging
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const logFile = path.join(logDir, 'debug.log');

function log(level: string, ...args: any[]): void {
  const timestamp = new Date().toISOString();
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  const line = `[${timestamp}] [${level}] ${message}\n`;
  
  // Write to file
  fs.appendFileSync(logFile, line);
  
  // Also log to console for main process
  if (level === 'ERROR') {
    console.error(line.trim());
  } else {
    console.log(line.trim());
  }
}

// Expose logger to renderer via IPC
ipcMain.handle('logger:log', (_event, level: string, ...args: any[]) => {
  log(level, ...args);
});

// Disable GPU acceleration for better compatibility
app.disableHardwareAcceleration();

// IPC Handlers - Register before creating window
ipcMain.handle('dialog:openFolder', async (_event) => {
  console.log('[Main] dialog:openFolder called');
  
  if (!mainWindow) {
    console.log('[Main] No main window available');
    return null;
  }
  
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Board Folder',
    });

    console.log('[Main] Dialog result:', result);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const folderPath = result.filePaths[0];
    console.log('[Main] Selected folder:', folderPath);
    return folderPath;
  } catch (error) {
    console.error('[Main] Error showing dialog:', error);
    return null;
  }
});

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox: true,  // Disabled for debugging
    },
    title: 'Base Board',
  });

  // Load the renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // Production mode - load built files
    const distPath = path.join(__dirname, '../renderer/index.html');
    
    if (require('fs').existsSync(distPath)) {
      mainWindow.loadFile(distPath);
    } else {
      console.error('Renderer HTML not found at', distPath);
    }
  }
  
  // TEMP: Force DevTools open for debugging (remove before production)
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  // Create file watcher for live updates
  const fileWatcher = new FileWatcher();
  
  // Register all IPC handlers
  registerIpcHandlers(fileWatcher);
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('dialog:openFile', async (_event, filters = {}) => {
  if (!mainWindow) return null;
  
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: Object.keys(filters).length > 0 ? filters : [{ name: 'All Files', extensions: ['*'] }],
    title: 'Open File',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (_event, defaultPath = '') => {
  if (!mainWindow) return null;
  
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    title: 'Save File',
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return result.filePath;
});

// Cleanup on quit
app.on('before-quit', () => {
  // Close any file watchers here
});
