import { ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import { FileWatcher } from '../services/file-watcher';
import {
  FS_READ_FILE,
  FS_WRITE_FILE,
  FS_READ_DIR,
  BOARD_LOAD,
  BOARD_SAVE,
  CARD_CREATE,
  CARD_UPDATE,
  CARD_DELETE,
  FILE_CHANGED_ON_DISK,
} from './channels';

/**
 * Register all IPC handlers for the main process.
 */
export function registerIpcHandlers(watcher: FileWatcher): void {
  // File system operations
  ipcMain.handle(FS_READ_FILE, async (_event, filePath: string) => {
    return await fs.readFile(filePath, 'utf-8');
  });

  ipcMain.handle(FS_WRITE_FILE, async (_event, filePath: string, content: string) => {
    await fs.writeFile(filePath, content, 'utf-8');
  });

  ipcMain.handle(FS_READ_DIR, async (_event, dirPath: string) => {
    const entries = await fs.readdir(dirPath);
    return entries;
  });

  // Board operations
  ipcMain.handle(BOARD_LOAD, async (_event, baseFilePath: string) => {
    const content = await fs.readFile(baseFilePath, 'utf-8');
    const parsed = matter(content);
    
    if (!parsed.data || typeof parsed.data !== 'object') {
      throw new Error('Invalid board config');
    }

    return {
      filters: (parsed.data.filters as any[]) || [],
      views: (parsed.data.views as any[]) || [],
    };
  });

  ipcMain.handle(BOARD_SAVE, async (_event, baseFilePath: string, config: any) => {
    const serialized = matter.stringify('', config);
    await fs.writeFile(baseFilePath, serialized, 'utf-8');
  });

  // Card operations
  ipcMain.handle(CARD_CREATE, async (_event, tasksDir: string, frontmatter: Record<string, any>, body: string) => {
    const timestamp = Date.now();
    const filename = `card-${timestamp}.md`;
    const filePath = path.join(tasksDir, filename);
    
    const serialized = matter.stringify(body, frontmatter);
    await fs.writeFile(filePath, serialized, 'utf-8');
    
    return filePath;
  });

  ipcMain.handle(CARD_UPDATE, async (_event, filePath: string, frontmatter: Record<string, any>, body: string) => {
    const serialized = matter.stringify(body, frontmatter);
    await fs.writeFile(filePath, serialized, 'utf-8');
  });

  ipcMain.handle(CARD_DELETE, async (_event, filePath: string) => {
    await fs.unlink(filePath);
  });

  // Broadcast file changes to renderer
  watcher.on('change', (data: { path: string; type: string }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(FILE_CHANGED_ON_DISK, data);
    }
  });
}
