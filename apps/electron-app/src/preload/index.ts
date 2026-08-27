import { contextBridge, ipcRenderer } from 'electron';

// Expose protected APIs to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Dialogs
  openFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),
  openFile: (filters?: Record<string, string[]>): Promise<string | null> => 
    ipcRenderer.invoke('dialog:openFile', filters),
  saveFile: (defaultPath?: string): Promise<string | null> => 
    ipcRenderer.invoke('dialog:saveFile', defaultPath),

  // File operations
  readFile: (filePath: string): Promise<string> => 
    ipcRenderer.invoke('fs:read-file', filePath),
  writeFile: (filePath: string, content: string): Promise<void> => 
    ipcRenderer.invoke('fs:write-file', filePath, content),
  readDir: (dirPath: string): Promise<string[]> => 
    ipcRenderer.invoke('fs:read-dir', dirPath),

  // Board operations
  loadBoard: (baseFilePath: string): Promise<unknown> => 
    ipcRenderer.invoke('board:load', baseFilePath),
  saveBoard: (baseFilePath: string, config: unknown): Promise<void> => 
    ipcRenderer.invoke('board:save', baseFilePath, config),

  // Card operations
  createCard: (tasksDir: string, frontmatter: Record<string, unknown>, body: string): Promise<string> => 
    ipcRenderer.invoke('card:create', tasksDir, frontmatter, body),
  updateCard: (filePath: string, frontmatter: Record<string, unknown>, body: string): Promise<void> => 
    ipcRenderer.invoke('card:update', filePath, frontmatter, body),
  deleteCard: (filePath: string): Promise<void> => 
    ipcRenderer.invoke('card:delete', filePath),

  // File watcher events
  onFileChanged: (callback: (data: { path: string; type: string }) => void) => {
    const subscription = (_event: any, data: { path: string; type: string }) => callback(data);
    ipcRenderer.on('file-changed-on-disk', subscription);
    return () => ipcRenderer.removeListener('file-changed-on-disk', subscription);
  },

  // Logger
  logger: {
    log: (...args: any[]) => ipcRenderer.invoke('logger:log', 'INFO', ...args),
    warn: (...args: any[]) => ipcRenderer.invoke('logger:log', 'WARN', ...args),
    error: (...args: any[]) => ipcRenderer.invoke('logger:log', 'ERROR', ...args),
  },
});

// Type declaration for the exposed API
export interface ElectronAPI {
  openFolder(): Promise<string | null>;
  openFile(filters?: Record<string, string[]>): Promise<string | null>;
  saveFile(defaultPath?: string): Promise<string | null>;
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  readDir(dirPath: string): Promise<string[]>;
  loadBoard(baseFilePath: string): Promise<unknown>;
  saveBoard(baseFilePath: string, config: unknown): Promise<void>;
  createCard(tasksDir: string, frontmatter: Record<string, unknown>, body: string): Promise<string>;
  updateCard(filePath: string, frontmatter: Record<string, unknown>, body: string): Promise<void>;
  deleteCard(filePath: string): Promise<void>;
  onFileChanged(callback: (data: { path: string; type: string }) => void): () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
