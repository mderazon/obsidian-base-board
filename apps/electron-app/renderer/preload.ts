// Preload script — exposes a minimal API from main process to renderer.
// Extend this as the data adapter grows.
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // Placeholder: will be replaced with actual IPC channels
  getVersion: () => ipcRenderer.invoke("app:get-version"),
});
