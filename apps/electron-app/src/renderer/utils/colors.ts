/**
 * Color utilities from board-core.
 */
import { relativeLuminance } from '@base-board/board-core';

/**
 * Determine if text on a given background should be dark or light.
 */
export function getTextContrastColor(bgHex: string): 'dark' | 'light' {
  return relativeLuminance(bgHex);
}

export { relativeLuminance };
