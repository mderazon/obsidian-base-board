// Simple logger that writes to file via IPC
export const logger = {
  info(...args: any[]): void {
    (window as any).electronAPI.logger.log('INFO', ...args);
  },
  warn(...args: any[]): void {
    (window as any).electronAPI.logger.warn(...args);
  },
  error(...args: any[]): void {
    (window as any).electronAPI.logger.error(...args);
  }
};
