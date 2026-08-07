import { describe, expect, it } from "vitest";
import {
  deriveTags,
  normalizeDerivedValue,
  parseTagProperties,
} from "../src/derived-tags";

describe("parseTagProperties", () => {
  it("splits a comma-separated list and trims whitespace", () => {
    expect(parseTagProperties("assignee, priority")).toEqual([
      "assignee",
      "priority",
    ]);
  });

  it("strips an optional note. prefix", () => {
    expect(parseTagProperties("note.assignee")).toEqual(["assignee"]);
  });

  it("returns [] for empty or non-string config", () => {
    expect(parseTagProperties("")).toEqual([]);
    expect(parseTagProperties("  ,  ")).toEqual([]);
    expect(parseTagProperties(undefined)).toEqual([]);
    expect(parseTagProperties(42)).toEqual([]);
  });
});

describe("normalizeDerivedValue", () => {
  it("passes plain values through, trimmed", () => {
    expect(normalizeDerivedValue("  high ")).toBe("high");
  });

  it("unwraps wikilinks to their basename", () => {
    expect(normalizeDerivedValue("[[Ada Lovelace]]")).toBe("Ada Lovelace");
    expect(normalizeDerivedValue("[[People/Ada Lovelace.md]]")).toBe(
      "Ada Lovelace",
    );
  });

  it("prefers the wikilink alias when present", () => {
    expect(normalizeDerivedValue("[[People/Ada Lovelace|Ada]]")).toBe("Ada");
  });
});

describe("deriveTags", () => {
  it("derives tags from scalar, wikilink, and list properties", () => {
    const fm = {
      assignee: "[[Ada Lovelace]]",
      priority: "high",
      area: ["ops", "dev"],
    };
    expect(deriveTags(fm, ["assignee", "priority", "area"])).toEqual([
      "Ada Lovelace",
      "high",
      "ops",
      "dev",
    ]);
  });

  it("skips missing, empty, and non-scalar values", () => {
    const fm = { assignee: "", nested: { a: 1 }, flag: true };
    expect(deriveTags(fm, ["assignee", "nested", "flag", "absent"])).toEqual(
      [],
    );
  });

  it("dedupes values across properties", () => {
    const fm = { a: "x", b: "x" };
    expect(deriveTags(fm, ["a", "b"])).toEqual(["x"]);
  });

  it("returns [] without frontmatter or configured properties", () => {
    expect(deriveTags(undefined, ["assignee"])).toEqual([]);
    expect(deriveTags({ assignee: "x" }, [])).toEqual([]);
  });

  it("stringifies numeric values", () => {
    expect(deriveTags({ priority: 1 }, ["priority"])).toEqual(["1"]);
  });
});
