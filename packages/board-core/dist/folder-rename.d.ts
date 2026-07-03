/**
 * Rewrite folder/file path references inside a .base file's text after a folder
 * was renamed or moved from `oldPath` to `newPath`.
 *
 * Pure function — text in, text out.  Returns the updated content, or `null`
 * when nothing matched, so the caller can skip writing unchanged files.
 *
 * Matching is conservative and case-sensitive: a quoted argument
 * is only rewritten when it is exactly `oldPath` or a descendant
 * (`oldPath + "/…"`).
 */
export declare function updateBaseFolderReferences(content: string, oldPath: string, newPath: string): string | null;
//# sourceMappingURL=folder-rename.d.ts.map