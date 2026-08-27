/**
 * IPC Channel definitions for the Electron main process.
 * All channel names are defined here for consistency.
 */

// File system operations
export const FS_READ_FILE = 'fs:read-file';
export const FS_WRITE_FILE = 'fs:write-file';
export const FS_READ_DIR = 'fs:read-dir';

// Board operations
export const BOARD_LOAD = 'board:load';
export const BOARD_SAVE = 'board:save';

// Card operations
export const CARD_CREATE = 'card:create';
export const CARD_UPDATE = 'card:update';
export const CARD_DELETE = 'card:delete';

// File watcher events
export const FILE_CHANGED_ON_DISK = 'file-changed-on-disk';

// Dialog operations (handled in main/index.ts)
export const DIALOG_OPEN_FOLDER = 'dialog:openFolder';
export const DIALOG_OPEN_FILE = 'dialog:openFile';
export const DIALOG_SAVE_FILE = 'dialog:saveFile';
