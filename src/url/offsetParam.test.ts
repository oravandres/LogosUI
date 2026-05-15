import { describe, expect, it } from "vitest";
import { parseOffsetParam } from "./offsetParam";

describe("parseOffsetParam", () => {
  it("returns 0 when the param is null", () => {
    expect(parseOffsetParam(null)).toBe(0);
  });

  it("parses non-negative integers", () => {
    expect(parseOffsetParam("0")).toBe(0);
    expect(parseOffsetParam("20")).toBe(20);
    expect(parseOffsetParam("12345")).toBe(12345);
  });

  it.each([
    ["-1", "negative integer"],
    ["20foo", "trailing garbage"],
    ["foo20", "leading garbage"],
    ["3.14", "decimal"],
    ["1e2", "scientific notation"],
    ["+5", "explicit sign"],
    [" 20 ", "whitespace"],
    ["", "empty string"],
    ["0x10", "hex literal"],
    ["NaN", "non-numeric word"],
  ])("rejects %j (%s) and clamps to 0", (raw) => {
    expect(parseOffsetParam(raw)).toBe(0);
  });
});
