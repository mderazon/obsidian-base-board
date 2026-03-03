/**
 * Tests for core/obsidian.ts — parseQueryResult
 *
 * This is the most fragile part of the codebase: it parses whatever JSON
 * the Obsidian CLI returns into our Board type. Tests here act as a contract
 * that we can update as we learn the real CLI schema.
 *
 * No mocking required — parseQueryResult is a pure function.
 * Run: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseQueryResult } from "../core/obsidian.js";

// ---------------------------------------------------------------------------
// Fixtures — representative samples of what base:query format=json might return
// (Update these once the real CLI schema is confirmed)
// ---------------------------------------------------------------------------

/** Minimal row shape: path + file name + status (confirmed CLI v1.12.4 schema) */
const MINIMAL_ROWS = [
  {
    path: "Tasks/Fix login bug.md",
    "file name": "Fix login bug",
    status: "Backlog",
  },
  { path: "Tasks/Add search.md", "file name": "Add search", status: "Backlog" },
  {
    path: "Tasks/Card cover images.md",
    "file name": "Card cover images",
    status: "In Progress",
  },
];

/** Rows with richer properties */
const RICH_ROWS = [
  {
    path: "Tasks/Fix login bug.md",
    "file name": "Fix login bug",
    status: "Backlog",
    priority: "high",
    tags: ["bug", "backend"],
    due: "2026-03-15",
  },
  {
    path: "Tasks/Write docs.md",
    "file name": "Write docs",
    status: "Done",
    priority: "low",
    tags: [],
  },
];

/** Edge case: only system fields present (no custom properties at all) */
const SYSTEM_FIELDS_ONLY = [{ path: "Tasks/Task A.md", "file name": "Task A" }];

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe("parseQueryResult — error handling", () => {
  it("throws if input is not an array", () => {
    assert.throws(() => parseQueryResult({}, "Board"), /unexpected/i);
    assert.throws(() => parseQueryResult(null, "Board"), /unexpected/i);
    assert.throws(() => parseQueryResult("string", "Board"), /unexpected/i);
  });

  it("handles an empty array without throwing", () => {
    const board = parseQueryResult([], "Empty Board");
    assert.equal(board.name, "Empty Board");
    assert.equal(typeof board.groupBy, "string");
    assert.deepEqual(board.columns, {});
  });
});

// ---------------------------------------------------------------------------
// Board metadata
// ---------------------------------------------------------------------------

describe("parseQueryResult — board metadata", () => {
  it("sets the board name from the parameter", () => {
    const board = parseQueryResult(MINIMAL_ROWS, "My Board");
    assert.equal(board.name, "My Board");
  });

  it("detects 'status' as the groupBy property when present", () => {
    const board = parseQueryResult(MINIMAL_ROWS, "Board");
    assert.equal(board.groupBy, "status");
  });
});

// ---------------------------------------------------------------------------
// Card grouping
// ---------------------------------------------------------------------------

describe("parseQueryResult — card grouping", () => {
  it("groups cards by their status value", () => {
    const board = parseQueryResult(MINIMAL_ROWS, "Board");
    assert.ok("Backlog" in board.columns, "should have Backlog column");
    assert.ok("In Progress" in board.columns, "should have In Progress column");
    assert.equal(board.columns["Backlog"].length, 2);
    assert.equal(board.columns["In Progress"].length, 1);
  });

  it("resolves card title from 'file name' field", () => {
    const board = parseQueryResult(MINIMAL_ROWS, "Board");
    const titles = board.columns["Backlog"].map((c) => c.title);
    assert.ok(titles.includes("Fix login bug"));
    assert.ok(titles.includes("Add search"));
  });

  it("falls back to path stem when 'file name' is absent", () => {
    const rows = [{ path: "Tasks/Fallback card.md", status: "Backlog" }];
    const board = parseQueryResult(rows, "Board");
    assert.equal(board.columns["Backlog"][0].title, "Fallback card");
  });

  it("does not use system fields (path, file name) as groupBy candidate", () => {
    const board = parseQueryResult(SYSTEM_FIELDS_ONLY, "Board");
    // groupBy should not be "path" or "file name"
    assert.notEqual(board.groupBy, "path");
    assert.notEqual(board.groupBy, "file name");
  });

  it("sets the column property on each card", () => {
    const board = parseQueryResult(MINIMAL_ROWS, "Board");
    for (const card of board.columns["Backlog"]) {
      assert.equal(card.column, "Backlog");
    }
  });

  it("preserves all raw properties on the card", () => {
    const board = parseQueryResult(RICH_ROWS, "Board");
    const card = board.columns["Backlog"][0];
    assert.equal(card.properties["priority"], "high");
    assert.deepEqual(card.properties["tags"], ["bug", "backend"]);
    assert.equal(card.properties["due"], "2026-03-15");
  });

  it("does not throw when only system fields are present (no custom props)", () => {
    assert.doesNotThrow(() => parseQueryResult(SYSTEM_FIELDS_ONLY, "Board"));
  });
});
