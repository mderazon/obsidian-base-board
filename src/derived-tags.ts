/**
 * Derived (virtual) tags — pure helpers.
 *
 * A board can be configured (via the "Derive tags from properties" view
 * option) with a comma-separated list of frontmatter properties whose
 * values are surfaced as tags in the filter bar and on cards.  Derived
 * tags behave like normal tags for filtering and coloring, but are never
 * written back to the note's `tags` frontmatter — the source property
 * stays the single source of truth.
 */

/** Parse the raw "tagProperties" config value into property names. */
export function parseTagProperties(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((p) => p.trim().replace(/^note\./, ""))
    .filter((p) => p);
}

/** Reduce a raw frontmatter value to a display tag (unwrap wikilinks). */
export function normalizeDerivedValue(value: string): string {
  const match = value.match(/^\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]$/);
  if (match) {
    if (match[2]) return match[2].trim();
    const target = match[1].trim();
    return (target.split("/").pop() ?? target).replace(/\.md$/, "");
  }
  return value.trim();
}

/**
 * Derive virtual tags from the given frontmatter.
 *
 * Each property in `props` contributes its value(s) as tags: list
 * properties contribute one tag per item, and wikilink values
 * ("[[Some Person]]" or "[[path/Some Person|Alias]]") are reduced to
 * their display name.  Empty and non-scalar values are skipped.
 */
export function deriveTags(
  frontmatter: Record<string, unknown> | undefined,
  props: string[],
): string[] {
  if (!frontmatter || props.length === 0) return [];

  const derived: string[] = [];
  for (const prop of props) {
    const raw = frontmatter[prop];
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      if (typeof value !== "string" && typeof value !== "number") continue;
      const tag = normalizeDerivedValue(String(value));
      if (tag && !derived.includes(tag)) derived.push(tag);
    }
  }
  return derived;
}
