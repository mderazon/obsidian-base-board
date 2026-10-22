import { describe, expect, it } from "vitest";
import {
  applyCardMoveProperties,
  buildSwimlaneLayout,
  applyNewCardProperties,
  deleteSwimlaneOperation,
  deleteSwimlaneValue,
  getOrderedSwimlanes,
  getSwimlaneLabel,
  inferSwimlaneValueType,
  moveSwimlane,
  setSwimlaneValue,
  updateFilesFrontmatter,
} from "../src/swimlanes";
import { hasBaseBoardConfig } from "../src/constants";

describe("swimlane ordering", () => {
  it("renders an empty board with configured empty lanes", () => {
    expect(getOrderedSwimlanes([], ["Backlog", "Doing"])).toEqual([
      "Backlog",
      "Doing",
    ]);
    expect(getOrderedSwimlanes([], [])).toEqual([]);
  });

  it("builds empty and populated column/lane render layouts", () => {
    expect(buildSwimlaneLayout(["Todo", "Done"], ["A", "B"], () => [])).toEqual(
      [
        {
          lane: "A",
          cells: [
            { column: "Todo", content: [] },
            { column: "Done", content: [] },
          ],
        },
        {
          lane: "B",
          cells: [
            { column: "Todo", content: [] },
            { column: "Done", content: [] },
          ],
        },
      ],
    );
    const cards = [
      { title: "one", column: "Todo", lane: "A" },
      { title: "two", column: "Done", lane: "B" },
    ];
    const layout = buildSwimlaneLayout(
      ["Todo", "Done"],
      ["A", "B"],
      (column, lane) =>
        cards.filter((card) => card.column === column && card.lane === lane),
    );
    expect(layout[0].cells[0].content.map((card) => card.title)).toEqual([
      "one",
    ]);
    expect(layout[1].cells[1].content.map((card) => card.title)).toEqual([
      "two",
    ]);
  });

  it("derives lanes across columns and includes the no-value lane", () => {
    const labels = ["1", "true", getSwimlaneLabel(null), "1"];
    expect(getOrderedSwimlanes(labels, ["true", "Empty"])).toEqual([
      "true",
      "Empty",
      "1",
      "(No value)",
    ]);
  });

  it("formats scalar, list, and missing frontmatter values for lane labels", () => {
    expect(getSwimlaneLabel(1)).toBe("1");
    expect(getSwimlaneLabel(true)).toBe("true");
    expect(getSwimlaneLabel(["A", 2, false])).toBe("A, 2, false");
    expect(getSwimlaneLabel(undefined)).toBe("(No value)");
  });

  it("prefers a typed match when string and typed values share a lane label", () => {
    expect(inferSwimlaneValueType(["1", 1], "1")).toBe("number");
    expect(inferSwimlaneValueType(["true", true], "true")).toBe("boolean");
    expect(inferSwimlaneValueType(["A, B", ["A", "B"]], "A, B")).toEqual({
      type: "list",
      template: ["A", "B"],
    });
    expect(inferSwimlaneValueType(["1", "Other"], "1")).toBe("other");
  });

  it("deduplicates configured lanes and preserves empty lanes", () => {
    expect(
      getOrderedSwimlanes(["Low", "High", "Low"], ["High", "Old", "High"]),
    ).toEqual(["High", "Old", "Low"]);
  });

  it("moves a lane without creating or losing entries", () => {
    expect(moveSwimlane(["Low", "Medium", "High"], "High", -1)).toEqual([
      "Low",
      "High",
      "Medium",
    ]);
  });

  it("keeps the order unchanged for an invalid move", () => {
    expect(moveSwimlane(["Low", "High"], "Low", -1)).toEqual(["Low", "High"]);
  });
});

describe("swimlane frontmatter updates", () => {
  it("composes defaults, group, order, and target lane for a new card", () => {
    const created: Record<string, unknown> = {};
    applyNewCardProperties(
      created,
      { template: "Task", ignored: "default" },
      "status",
      "Doing",
      (fm, property, column) => {
        fm[property] = column;
      },
      "kanban_order",
      "a0",
      "rank",
      "1",
      "number",
    );
    expect(created.status).toBe("Doing");
    expect(created.template).toBe("Task");
    expect(created.kanban_order).toBe("a0");
    expect(created.rank).toBe(1);
    expect(typeof created.rank).toBe("number");
  });

  it("preserves an existing list-valued lane when moving or creating a card", () => {
    const lane = ["Design", "Research"];
    const listType = { type: "list" as const, template: lane };
    const created: Record<string, unknown> = {};
    applyNewCardProperties(
      created,
      undefined,
      "status",
      "Doing",
      (fm, property, column) => {
        fm[property] = column;
      },
      "kanban_order",
      "a0",
      "areas",
      "Design, Research",
      listType,
    );
    expect(created.areas).toEqual(lane);

    const moved: Record<string, unknown> = { areas: ["Old"] };
    applyCardMoveProperties(
      moved,
      "Doing",
      "Doing",
      "status",
      () => {},
      "areas",
      "Design, Research",
      listType,
    );
    expect(moved.areas).toEqual(lane);
  });

  it("creates and moves cards while preserving numeric and boolean types", () => {
    const created: Record<string, unknown> = {};
    setSwimlaneValue(created, "rank", "1", "number");
    expect(created.rank).toBe(1);
    expect(typeof created.rank).toBe("number");

    const moved: Record<string, unknown> = { rank: 2 };
    setSwimlaneValue(moved, "rank", "3", "number");
    expect(moved.rank).toBe(3);

    const checkbox: Record<string, unknown> = {};
    setSwimlaneValue(checkbox, "active", "false", "boolean");
    expect(checkbox.active).toBe(false);
  });

  it("clears the property for no-value drops and deleted lanes", () => {
    const frontmatter: Record<string, unknown> = { lane: "Doing" };
    setSwimlaneValue(frontmatter, "lane", "(No value)", "other");
    expect(frontmatter).not.toHaveProperty("lane");
    frontmatter.lane = "Doing";
    deleteSwimlaneValue(frontmatter, "lane");
    expect(frontmatter).not.toHaveProperty("lane");
  });

  it("routes a move through mocked frontmatter updates for matching notes", async () => {
    const notes = [
      { status: "Todo", lane: "A" },
      { status: "Todo", lane: "B" },
    ];
    const processFrontMatter = async (
      note: (typeof notes)[number],
      update: (frontmatter: Record<string, unknown>) => void,
    ) => update(note);
    await updateFilesFrontmatter([notes[0]], processFrontMatter, (fm) =>
      applyCardMoveProperties(
        fm,
        "Todo",
        "Done",
        "status",
        (frontmatter, property, column) => {
          frontmatter[property] = column;
        },
        "lane",
        "2",
        "number",
      ),
    );
    expect(notes).toEqual([
      { status: "Done", lane: 2 },
      { status: "Todo", lane: "B" },
    ]);
  });

  it("selects matching files, updates config, and deletes lane values", async () => {
    const notes = [{ lane: "A" }, { lane: "A" }, { lane: "B" }];
    const entries = notes.map((file) => ({ file }));
    const processFrontMatter = async (
      file: (typeof notes)[number],
      update: (frontmatter: Record<string, unknown>) => void,
    ) => update(file);
    let saved: string[] = [];
    await deleteSwimlaneOperation({
      lane: "A",
      property: "lane",
      entries,
      getLane: (entry) => entry.file.lane,
      getFile: (entry) => entry.file,
      configuredLanes: ["A", "B", "Empty"],
      saveLanes: (lanes) => (saved = lanes),
      processFrontMatter,
    });
    expect(saved).toEqual(["B", "Empty"]);
    expect(notes.map((note) => note.lane ?? "(No value)")).toEqual([
      "(No value)",
      "(No value)",
      "B",
    ]);
  });
});

describe("legacy view detection config", () => {
  it("recognizes views configured only with swimlane keys", () => {
    expect(hasBaseBoardConfig({ swimlaneProperty: "priority" })).toBe(true);
    expect(hasBaseBoardConfig({ boardSwimlanes: ["High"] })).toBe(true);
    expect(hasBaseBoardConfig({ unrelatedOption: true })).toBe(false);
  });
});
