// Board-core: pure Kanban logic, zero Obsidian dependencies.
export * from "./constants.js";
export * from "./color-utils.js";
export * from "./folder-rename.js";
export type {
  CardData,
  Column,
  BoardConfig,
  ChipColorMap,
  ChipFixedColorMap,
  AvailableProperty,
} from "./types.js";
export { DEFAULT_BOARD_CONFIG } from "./types.js";
