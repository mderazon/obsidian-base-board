import { describe, expect, it } from "vitest";
import { sanitizeFolderSegment } from "../src/constants";

describe("sanitizeFolderSegment", () => {
  it("leaves a normal folder name untouched", () => {
    expect(sanitizeFolderSegment("Tasks")).toBe("Tasks");
  });

  it("strips characters invalid in file/folder names", () => {
    expect(sanitizeFolderSegment('Ta*sk?s<>"|')).toBe("Tasks");
  });

  it("strips slashes and backslashes rather than treating them as separators", () => {
    expect(sanitizeFolderSegment("cards/here")).toBe("cardshere");
    expect(sanitizeFolderSegment("cards\\here")).toBe("cardshere");
  });

  it("rejects '.' and '..' even though they contain no invalid characters", () => {
    expect(sanitizeFolderSegment(".")).toBe("");
    expect(sanitizeFolderSegment("..")).toBe("");
  });

  it("returns an empty string for empty input", () => {
    expect(sanitizeFolderSegment("")).toBe("");
  });
});
