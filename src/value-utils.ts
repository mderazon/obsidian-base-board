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
