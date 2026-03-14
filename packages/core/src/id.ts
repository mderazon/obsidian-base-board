/**
 * Stable card ID generation.
 *
 * Format: kebab-case-title-xxxx (e.g. "fix-login-bug-a3f2")
 * - Derived from the card title: readable at a glance
 * - 4-char random suffix: ensures uniqueness even if titles collide
 * - Shell-safe: no spaces or special chars, no quoting needed
 * - Never changes after assignment — title renames don't affect the id
 */

const SUFFIX_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Generate a new stable card id from a title: "fix-login-bug-a3f2". */
export function generateId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Array.from(
    { length: 4 },
    () => SUFFIX_CHARS[Math.floor(Math.random() * SUFFIX_CHARS.length)],
  ).join("");
  return `${slug}-${suffix}`;
}
