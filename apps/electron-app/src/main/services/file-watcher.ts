import * as chokidar from 'chokidar';
import { EventEmitter } from 'events';
import { parseMarkdown, ParsedMarkdown } from './file-adapter';

export interface FileChange {
  path: string;
  type: 'created' | 'updated' | 'deleted';
}

/**
 * File watcher service using chokidar for cross-platform file watching.
 */
export class FileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private watchedPaths: Set<string> = new Set();

  /**
   * Start watching a directory for changes.
   */
  async watchDirectory(dirPath: string): Promise<void> {
    if (this.watchedPaths.has(dirPath)) {
      return; // Already watching this directory
    }

    try {
      this.watcher = chokidar.watch(dirPath, {
        ignored: /(^|[/\\])\../, // Ignore dotfiles
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 100, // Wait 100ms for writes to complete
          pollInterval: 50,
        },
      });

      this.watcher.on('change', async (filePath) => {
        const parsed = await parseMarkdown(filePath);
        this.emit('change', { path: filePath, type: 'updated' });
        this.emit('card:updated', { path: filePath, data: parsed });
      });

      this.watcher.on('add', async (filePath) => {
        const parsed = await parseMarkdown(filePath);
        this.emit('change', { path: filePath, type: 'created' });
        this.emit('card:created', { path: filePath, data: parsed });
      });

      this.watcher.on('unlink', (filePath) => {
        this.emit('change', { path: filePath, type: 'deleted' });
        this.emit('card:deleted', { path: filePath });
      });

      this.watchedPaths.add(dirPath);
    } catch (error) {
      console.error(`Failed to watch directory ${dirPath}:`, error);
    }
  }

  /**
   * Stop watching a specific directory.
   */
  async unwatchDirectory(dirPath: string): Promise<void> {
    if (this.watcher && this.watchedPaths.has(dirPath)) {
      await this.watcher.unwatch(dirPath);
      this.watchedPaths.delete(dirPath);
    }
  }

  /**
   * Stop all watchers and clean up.
   */
  async close(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.watchedPaths.clear();
    }
  }
}
