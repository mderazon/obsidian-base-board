/* eslint-disable import/no-nodejs-modules */
/**
 * Tests for format.ts — pure formatting functions.
 * No mocking needed.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatBoard,
  formatBoardList,
  formatCreateResult,
  formatMoveResult,
} from "../format.js";
import type { Board } from "../types.js";

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
        id: "amber-wolf-42",
        title: "Fix login bug",
        path: "Tasks/Fix login bug.md",
        column: "Backlog",
        properties: {
          status: "Backlog",
          priority: "high",
          tags: ["bug", "backend"],
        },
      },
      {
        id: undefined,
        title: "Add search",
        path: "Tasks/Add search.md",
        column: "Backlog",
        properties: { status: "Backlog" },
      },
    ],
    "In Progress": [
      {
        id: "swift-pine-07",
        title: "Card cover images",
        path: "Tasks/Card cover images.md",
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

describe("formatBoard", () => {
  it("includes the board name and groupBy in the header", () => {
    const out = formatBoard(SAMPLE_BOARD);
    assert.ok(out.includes("Board: Task Board"));
    assert.ok(out.includes("group by: status"));
  });

  it("lists each column with its card count", () => {
    const out = formatBoard(SAMPLE_BOARD);
    assert.ok(out.includes("Backlog (2):"));
    assert.ok(out.includes("In Progress (1):"));
    assert.ok(out.includes("Done (0):"));
  });

  it("includes each card title", () => {
    const out = formatBoard(SAMPLE_BOARD);
    assert.ok(out.includes("Fix login bug"));
    assert.ok(out.includes("Add search"));
    assert.ok(out.includes("Card cover images"));
  });

  it("shows the id in brackets before the title", () => {
    const out = formatBoard(SAMPLE_BOARD);
    assert.ok(out.includes("[amber-wolf-42]"));
    assert.ok(out.includes("[swift-pine-07]"));
  });

  it("shows [no-id] for cards without an assigned id", () => {
    const out = formatBoard(SAMPLE_BOARD);
    assert.ok(out.includes("[no-id]"));
  });

  it("renders property chips for priority and tags", () => {
    const out = formatBoard(SAMPLE_BOARD);
    assert.ok(out.includes("priority:high"));
    assert.ok(out.includes("tags:bug,backend"));
  });

  it("renders due date chip when present", () => {
    const out = formatBoard(SAMPLE_BOARD);
    assert.ok(out.includes("due:2026-03-15"));
  });

  it("shows (empty) for columns with no cards", () => {
    const out = formatBoard(SAMPLE_BOARD);
    assert.ok(out.includes("(empty)"));
  });

  it("includes a usage footer with available commands", () => {
    const out = formatBoard(SAMPLE_BOARD);
    assert.ok(out.includes("bb card"));
    assert.ok(out.includes("bb move"));
    assert.ok(out.includes("bb update"));
  });

  it("handles a board with no columns", () => {
    const out = formatBoard(EMPTY_BOARD);
    assert.ok(out.includes("Board: My Board"));
  });
});

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
    assert.ok(out.includes("→"));
  });
});

describe("formatCreateResult", () => {
  it("includes the card title, id, and column", () => {
    const out = formatCreateResult("New task", "amber-wolf-42", "Backlog");
    assert.ok(out.includes("New task"));
    assert.ok(out.includes("amber-wolf-42"));
    assert.ok(out.includes("Backlog"));
  });
});

describe("formatBoardList", () => {
  it("lists each board on a line", () => {
    const out = formatBoardList(["Task Board", "Personal Board"]);
    assert.ok(out.includes("Task Board"));
    assert.ok(out.includes("Personal Board"));
  });

  it("returns a message when the list is empty", () => {
    const out = formatBoardList([]);
    assert.ok(out.toLowerCase().includes("no boards"));
  });
});
