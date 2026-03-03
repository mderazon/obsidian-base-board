/**
 * Tests for core/format.ts
 *
 * Pure functions — no mocking needed.
 * Run: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatBoard,
  formatBoardList,
  formatCreateResult,
  formatMoveResult,
} from "../core/format.js";
import type { Board } from "../core/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_BOARD: Board = {
  name: "My Board",
  groupBy: "status",
  columns: {},
};

const SAMPLE_BOARD: Board = {
  name: "Task Board",
  groupBy: "status",
  columns: {
    Backlog: [
      {
        title: "Fix login bug",
        column: "Backlog",
        properties: {
          status: "Backlog",
          priority: "high",
          tags: ["bug", "backend"],
        },
      },
      {
        title: "Add search",
        column: "Backlog",
        properties: { status: "Backlog" },
      },
    ],
    "In Progress": [
      {
        title: "Card cover images",
        column: "In Progress",
        properties: {
          status: "In Progress",
          priority: "medium",
          due: "2026-03-15",
        },
      },
    ],
    Done: [],
  },
};

// ---------------------------------------------------------------------------
// formatBoard
// ---------------------------------------------------------------------------

describe("formatBoard", () => {
  it("includes the board name and groupBy in the header", () => {
    const out = formatBoard(SAMPLE_BOARD);
    assert.ok(out.includes("Board: Task Board"), "should include board name");
    assert.ok(out.includes("group by: status"), "should include groupBy");
  });

  it("lists each column with its card count", () => {
    const out = formatBoard(SAMPLE_BOARD);
    assert.ok(out.includes("Backlog (2):"), "should show Backlog count");
    assert.ok(
      out.includes("In Progress (1):"),
      "should show In Progress count",
    );
    assert.ok(out.includes("Done (0):"), "should show Done count");
  });

  it("includes each card title", () => {
    const out = formatBoard(SAMPLE_BOARD);
    assert.ok(out.includes("Fix login bug"), "should include first card");
    assert.ok(out.includes("Add search"), "should include second card");
    assert.ok(
      out.includes("Card cover images"),
      "should include In Progress card",
    );
  });

  it("renders property chips for priority and tags", () => {
    const out = formatBoard(SAMPLE_BOARD);
    assert.ok(out.includes("priority:high"), "should show priority chip");
    assert.ok(out.includes("tags:bug,backend"), "should show tags chip");
  });

  it("renders due date chip when present", () => {
    const out = formatBoard(SAMPLE_BOARD);
    assert.ok(out.includes("due:2026-03-15"), "should show due date chip");
  });

  it("shows no chips for cards without optional properties", () => {
    const out = formatBoard(SAMPLE_BOARD);
    // "Add search" has no priority/tags/due — should have no brackets
    const lines = out.split("\n");
    const addSearchLine = lines.find((l) => l.includes("Add search"));
    assert.ok(addSearchLine, "Add search line should exist");
    assert.ok(!addSearchLine.includes("["), "should have no chip brackets");
  });

  it("shows (empty) for columns with no cards", () => {
    const out = formatBoard(SAMPLE_BOARD);
    assert.ok(out.includes("(empty)"), "empty column should show (empty)");
  });

  it("handles a board with no columns", () => {
    const out = formatBoard(EMPTY_BOARD);
    assert.ok(out.includes("Board: My Board"));
    // No columns — just the header and separator
    const lines = out.split("\n").filter(Boolean);
    assert.equal(lines.length, 2);
  });
});

// ---------------------------------------------------------------------------
// formatMoveResult
// ---------------------------------------------------------------------------

describe("formatMoveResult", () => {
  it("shows the card title and both columns", () => {
    const out = formatMoveResult({
      title: "Fix login bug",
      fromColumn: "Backlog",
      toColumn: "In Progress",
    });
    assert.ok(out.includes("Fix login bug"));
    assert.ok(out.includes("Backlog"));
    assert.ok(out.includes("In Progress"));
    assert.ok(out.includes("→"), "should include arrow");
  });
});

// ---------------------------------------------------------------------------
// formatCreateResult
// ---------------------------------------------------------------------------

describe("formatCreateResult", () => {
  it("includes the card title and column", () => {
    const out = formatCreateResult("New task", "Backlog");
    assert.ok(out.includes("New task"));
    assert.ok(out.includes("Backlog"));
  });
});

// ---------------------------------------------------------------------------
// formatBoardList
// ---------------------------------------------------------------------------

describe("formatBoardList", () => {
  it("lists each board on a line", () => {
    const out = formatBoardList(["Task Board", "Personal Board"]);
    assert.ok(out.includes("Task Board"));
    assert.ok(out.includes("Personal Board"));
  });

  it("returns a message when the list is empty", () => {
    const out = formatBoardList([]);
    assert.ok(
      out.toLowerCase().includes("no boards"),
      "should say no boards found",
    );
  });
});
