/** The inferred JS type of a groupBy property, used to store typed values. */
export type GroupByValueType = "boolean" | "number" | "other";

/**
 * Coerce a (string) column name into the correctly-typed value to write into
 * the groupBy frontmatter property.
 *
 * Column names are always strings, but the underlying property may be a
 * boolean (a checkbox) or a number. Writing the string "false" into a checkbox
 * property corrupts it — a non-empty string is truthy and Bases groups it
 * separately from the boolean `false` — so we only coerce when the column name
 * maps cleanly onto the property's inferred type. Anything else (including
 * custom string columns literally named "true"/"false"/"3") is left as a
 * string.
 */
export function coerceColumnValue(
  columnName: string,
  type: GroupByValueType,
): boolean | number | string {
  if (type === "boolean") {
    if (columnName === "true") return true;
    if (columnName === "false") return false;
  } else if (type === "number") {
    const n = Number(columnName);
    // Require a canonical round-trip so we never coerce "03", "1e5", " 5 ",
    // etc. into a number the user did not literally type as the column name.
    if (
      columnName.trim() !== "" &&
      !Number.isNaN(n) &&
      String(n) === columnName
    ) {
      return n;
    }
  }
  return columnName;
}

// Chip values that are a single URL (any scheme with an authority part, e.g.
// https:// or a custom protocol like obsidian://) can render as clickable
// links instead of plain text. The whole value must be the URL — no
// whitespace anywhere — so flattened lists ("https://a.com, b") or prose
// with a URL prefix stay plain text. Scheme matching is case-insensitive
// per RFC 3986.
const URL_VALUE_REGEX = /^([a-z][a-z0-9+.-]*):\/\/\S+$/i;

// Schemes that must never become clickable. Frontmatter is not necessarily
// authored by the vault owner (shared or downloaded vaults), so treat it as
// untrusted: block script execution (javascript/vbscript/data), local file
// and UNC access (file/smb), and Windows protocol handlers with known RCE
// history (ms-msdt/search-ms/ms-officecmd). Other custom schemes stay
// linkable on purpose — deep links into other apps are the point of the
// feature, the chip always displays the raw URL it opens, and Obsidian
// itself already renders arbitrary-scheme markdown links in note bodies.
const UNSAFE_URL_SCHEMES = new Set([
  "javascript",
  "vbscript",
  "data",
  "file",
  "smb",
  "ms-msdt",
  "search-ms",
  "ms-officecmd",
]);

/**
 * Whether a chip value should render as a clickable external link.
 *
 * True only when the entire value is a URI with a "://" authority marker and
 * its scheme is not in the unsafe set — e.g. `javascript://%0Aalert(1)`
 * matches the URL shape but must stay plain text.
 */
export function isLinkableUrlValue(value: string): boolean {
  const match = URL_VALUE_REGEX.exec(value);
  return match !== null && !UNSAFE_URL_SCHEMES.has(match[1].toLowerCase());
}
