import { describe, expect, it } from "vitest";
import { coerceColumnValue, isLinkableUrlValue } from "../src/value-utils";

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

describe("isLinkableUrlValue", () => {
  it("accepts http(s) URLs", () => {
    expect(isLinkableUrlValue("https://example.com")).toBe(true);
    expect(isLinkableUrlValue("http://localhost:8080")).toBe(true);
  });

  it("accepts URLs with non-trivial path, query, and fragment", () => {
    expect(
      isLinkableUrlValue("https://example.com/a/b?c=d&e=f%20g#frag"),
    ).toBe(true);
  });

  it("accepts custom schemes so app deep links work from the board", () => {
    expect(isLinkableUrlValue("obsidian://open?vault=main")).toBe(true);
    expect(isLinkableUrlValue("vscode://file/some/path")).toBe(true);
  });

  it("accepts multi-char schemes with digits, '+', '.', and '-'", () => {
    expect(isLinkableUrlValue("claude-board://session/abc")).toBe(true);
    expect(isLinkableUrlValue("web+app://thing")).toBe(true);
    expect(isLinkableUrlValue("iris.beep://x")).toBe(true);
    expect(isLinkableUrlValue("h264://stream")).toBe(true);
  });

  it("matches schemes case-insensitively (RFC 3986)", () => {
    expect(isLinkableUrlValue("HTTPS://example.com")).toBe(true);
    expect(isLinkableUrlValue("Obsidian://open")).toBe(true);
  });

  it("leaves non-URL values as plain text", () => {
    expect(isLinkableUrlValue("Done")).toBe(false);
    expect(isLinkableUrlValue("example.com")).toBe(false);
    expect(isLinkableUrlValue("not a url: really")).toBe(false);
    expect(isLinkableUrlValue("[[Some Note]]")).toBe(false);
    expect(isLinkableUrlValue("")).toBe(false);
    expect(isLinkableUrlValue("   ")).toBe(false);
  });

  it("requires a full '://' authority marker", () => {
    // Deliberate: scheme-only URIs (mailto:, tel:) stay plain text — too
    // many false positives with prose like "note: remember this".
    expect(isLinkableUrlValue("mailto:a@b.com")).toBe(false);
    expect(isLinkableUrlValue("http:/x")).toBe(false);
    expect(isLinkableUrlValue("http:x")).toBe(false);
    expect(isLinkableUrlValue("://no-scheme")).toBe(false);
  });

  it("requires the scheme at the very start (no leading whitespace)", () => {
    expect(isLinkableUrlValue(" https://example.com")).toBe(false);
    expect(isLinkableUrlValue("see https://example.com")).toBe(false);
    expect(isLinkableUrlValue("1https://example.com")).toBe(false);
  });

  it("requires the entire value to be one URL (no trailing text)", () => {
    // A ListValue is flattened to "a, b" before the chip renders; a list
    // whose first item is a URL must not become one malformed link.
    expect(isLinkableUrlValue("https://example.com, second value")).toBe(
      false,
    );
    expect(isLinkableUrlValue("https://example.com and more")).toBe(false);
    expect(isLinkableUrlValue("https://example.com\ttab")).toBe(false);
    // A scheme with an empty remainder is not a usable URL either.
    expect(isLinkableUrlValue("https://")).toBe(false);
  });

  it("never links script-executing or local-file schemes", () => {
    expect(isLinkableUrlValue("javascript://%0Aalert(1)")).toBe(false);
    expect(isLinkableUrlValue("JaVaScRiPt://%0Aalert(1)")).toBe(false);
    expect(isLinkableUrlValue("vbscript://msgbox(1)")).toBe(false);
    expect(isLinkableUrlValue("VBScript://msgbox(1)")).toBe(false);
    expect(isLinkableUrlValue("data://text/html,x")).toBe(false);
    expect(isLinkableUrlValue("DATA://text/html,x")).toBe(false);
    expect(isLinkableUrlValue("file:///etc/passwd")).toBe(false);
    expect(isLinkableUrlValue("File:///etc/passwd")).toBe(false);
    expect(isLinkableUrlValue("smb://server/share")).toBe(false);
  });

  it("never links Windows protocol handlers with known RCE history", () => {
    expect(isLinkableUrlValue("ms-msdt://id/PCWDiagnostic")).toBe(false);
    expect(isLinkableUrlValue("MS-MSDT://id/PCWDiagnostic")).toBe(false);
    expect(isLinkableUrlValue("search-ms://query=x&crumb=evil")).toBe(false);
    expect(isLinkableUrlValue("ms-officecmd://x")).toBe(false);
  });

  it("does not treat lookalike schemes as unsafe", () => {
    // Only exact scheme matches are blocked; e.g. a hypothetical
    // "javascript-app" scheme is a different scheme.
    expect(isLinkableUrlValue("javascript-app://open")).toBe(true);
    expect(isLinkableUrlValue("filesync://start")).toBe(true);
  });
});
