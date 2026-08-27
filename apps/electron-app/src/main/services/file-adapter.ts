import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import { ORDER_PROPERTY, updateBaseFolderReferences } from '@base-board/board-core';

export interface ParsedMarkdown {
  data: Record<string, unknown>;
  content: string;
}

/**
 * Parse markdown file with YAML frontmatter.
 */
export async function parseMarkdown(filePath: string): Promise<ParsedMarkdown> {
  const content = await fs.readFile(filePath, 'utf-8');
  return matter(content);
}

/**
 * Write markdown file with YAML frontmatter.
 */
export async function writeMarkdown(
  filePath: string,
  data: Record<string, unknown>,
  content: string
): Promise<void> {
  const serialized = matter.stringify(content, data);
  await fs.writeFile(filePath, serialized, 'utf-8');
}

/**
 * Read board configuration from a .base file.
 */
export async function loadBoardConfig(baseFilePath: string): Promise<BoardConfig> {
  const content = await fs.readFile(baseFilePath, 'utf-8');
  const parsed = matter(content);
  
  if (!parsed.data || typeof parsed.data !== 'object') {
    throw new Error(`Invalid board config in ${baseFilePath}`);
  }

  return {
    filters: (parsed.data.filters as Filter[]) || [],
    views: (parsed.data.views as View[]) || [],
  };
}

/**
 * Save board configuration to a .base file.
 */
export async function saveBoardConfig(
  baseFilePath: string,
  config: BoardConfig
): Promise<void> {
  const serialized = matter.stringify('', config);
  await fs.writeFile(baseFilePath, serialized, 'utf-8');
}

/**
 * Scan tasks directory for markdown files.
 */
export async function scanTasksDir(tasksDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(tasksDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => path.join(tasksDir, entry.name));
  } catch (error) {
    // Directory doesn't exist or can't be read
    return [];
  }
}

/**
 * Get board tasks directory from base file path.
 * Convention: <base-file-dir>/<base-file-name>/tasks/
 */
export function getTasksDir(baseFilePath: string): string {
  const baseName = path.basename(baseFilePath, '.base');
  const baseDir = path.dirname(baseFilePath);
  return path.join(baseDir, baseName, 'tasks');
}

/**
 * Validate that a directory contains a valid board structure.
 */
export async function validateBoardStructure(dirPath: string): Promise<{
  valid: boolean;
  baseFile?: string;
  tasksDir?: string;
  error?: string;
}> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    // Look for .base files
    const baseFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.base'));
    
    if (baseFiles.length === 0) {
      return { valid: false, error: 'No .base file found in directory' };
    }

    const baseFilePath = path.join(dirPath, baseFiles[0].name);
    const baseName = path.basename(baseFilePath, '.base');
    const tasksDir = path.join(dirPath, baseName, 'tasks');

    // Check if tasks directory exists
    try {
      await fs.access(tasksDir);
    } catch {
      return { valid: false, baseFile: baseFilePath, error: 'Tasks directory not found' };
    }

    return { valid: true, baseFile: baseFilePath, tasksDir };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}

// Type definitions for board config
export interface Filter {
  type: string;
  query: string;
}

export interface View {
  name: string;
  type: string;
  config: Record<string, unknown>;
}

export interface BoardConfig {
  filters: Filter[];
  views: View[];
}

/**
 * Rewrite path references inside a .base file after the board folder was moved.
 * Uses board-core's pure text transformer.
 *
 * @returns true if the file was changed and saved, false if nothing matched
 */
export async function updateFolderReferences(
  baseFilePath: string,
  oldPath: string,
  newPath: string,
): Promise<boolean> {
  if (!oldPath || oldPath === newPath) return false;

  const content = await fs.readFile(baseFilePath, 'utf-8');
  const updated = updateBaseFolderReferences(content, oldPath, newPath);

  if (updated === null) return false; // nothing changed

  await fs.writeFile(baseFilePath, updated, 'utf-8');
  return true;
}
