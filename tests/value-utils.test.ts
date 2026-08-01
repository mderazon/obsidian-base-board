import { describe, expect, it } from "vitest";
import { coerceColumnValue } from "../src/value-utils";

describe("coerceColumnValue", () => {
  it("keeps a real boolean type for checkbox columns", () => {
    expect(coerceColumnValue("true", "boolean")).toBe(true);
    expect(coerceColumnValue("false", "boolean")).toBe(false);
  });

  it("does not corrupt a boolean `false` into the string 'false'", () => {
    const value = coerceColumnValue("false", "boolean");
    expect(typeof value).toBe("boolean");
    expect(value).toBe(false);
  });

  it("leaves non-boolean-looking names as strings for boolean properties", () => {
    expect(coerceColumnValue("maybe", "boolean")).toBe("maybe");
    expect(coerceColumnValue("(No value)", "boolean")).toBe("(No value)");
  });

  it("coerces canonical numbers for numeric properties", () => {
    expect(coerceColumnValue("3", "number")).toBe(3);
    expect(coerceColumnValue("-2", "number")).toBe(-2);
    expect(coerceColumnValue("3.5", "number")).toBe(3.5);
  });

  it("does not coerce non-canonical numeric strings", () => {
    // Preserve the user's literal column name in ambiguous cases.
    expect(coerceColumnValue("03", "number")).toBe("03");
    expect(coerceColumnValue("1e5", "number")).toBe("1e5");
    expect(coerceColumnValue(" 5 ", "number")).toBe(" 5 ");
    expect(coerceColumnValue("", "number")).toBe("");
    expect(coerceColumnValue("NaN", "number")).toBe("NaN");
  });

  it("never coerces when the property type is a plain string", () => {
    expect(coerceColumnValue("true", "other")).toBe("true");
    expect(coerceColumnValue("false", "other")).toBe("false");
    expect(coerceColumnValue("3", "other")).toBe("3");
    expect(coerceColumnValue("Done", "other")).toBe("Done");
  });
});
