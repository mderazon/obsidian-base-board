/**
 * Matches a quoted path passed as a function argument, splitting it into parts
 * so the path can be swapped without disturbing surrounding whitespace/quotes:
 *
 *   group 1 — the opening "(", any whitespace, and the opening quote
 *   group 2 — the quote character (single or double), reused via \2
 *   group 3 — the quoted path itself
 *   group 4 — the closing quote, any whitespace, and the closing ")"
 *
 * Function-name agnostic: it matches `inFolder("…")`, `hasLink("…")`,
 * `path.startsWith("…")`, `linksTo("…")`, ...
 * The "must be inside (...)" shape keeps us away from YAML scalars (view names,
 * property names) and `==` comparisons, which we do not want to touch.
 */
const FILTER_PATH_ARG_PATTERN = /(\(\s*(["']))(.*?)(\2\s*\))/g;

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
export function updateBaseFolderReferences(
  content: string,
  oldPath: string,
  newPath: string,
): string | null {
  if (!oldPath || oldPath === newPath) return null;

  let changed = false;

  const updated = content.replace(
    FILTER_PATH_ARG_PATTERN,
    (
      match: string,
      pre: string,
      _quote: string,
      path: string,
      post: string,
    ) => {
      let newInnerPath: string | null = null;

      if (path === oldPath) {
        // Exact match: the argument targets the renamed folder/file itself.
        newInnerPath = newPath;
      } else if (path.startsWith(oldPath + "/")) {
        // Descendant: keep everything after the renamed segment intact.
        newInnerPath = newPath + path.slice(oldPath.length);
      }

      if (newInnerPath === null) return match; // not a match — leave untouched
      changed = true;
      return pre + newInnerPath + post;
    },
  );

  return changed ? updated : null;
}
