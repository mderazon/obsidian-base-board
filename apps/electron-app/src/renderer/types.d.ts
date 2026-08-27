/**
 * Type declarations for Electron API exposed via contextBridge
 */

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
