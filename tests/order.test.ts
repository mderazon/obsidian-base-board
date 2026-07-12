import { describe, expect, it } from "vitest";
import {
  compareOrderValues,
  generateOrderKey,
  generateOrderKeys,
  isOrderKey,
  readOrderValue,
} from "../src/order";

describe("fractional card ordering", () => {
  it("generates keys before, between, and after existing keys", () => {
    const first = generateOrderKey(null, null);
    const before = generateOrderKey(null, first);
    const after = generateOrderKey(first, null);
    const middle = generateOrderKey(first, after);

    expect(before < first).toBe(true);
    expect(first < middle).toBe(true);
    expect(middle < after).toBe(true);
  });

  it("generates ordered keys for multi-card moves", () => {
    const [lower, upper] = generateOrderKeys(null, null, 2);
    const inserted = generateOrderKeys(lower, upper, 20);

    expect(inserted).toHaveLength(20);
    expect([...inserted].sort()).toEqual(inserted);
    expect(inserted.every((key) => lower < key && key < upper)).toBe(true);
  });

  it("does not exhaust precision under repeated insertion", () => {
    const lower = generateOrderKey(null, null);
    let upper = generateOrderKey(lower, null);

    for (let index = 0; index < 2_000; index += 1) {
      upper = generateOrderKey(lower, upper);
      expect(lower < upper).toBe(true);
    }
  });

  it("retains legacy numeric order and puts missing values last", () => {
    expect(compareOrderValues(10, 20)).toBeLessThan(0);
    expect(compareOrderValues("a", "b")).toBeLessThan(0);
    expect(compareOrderValues(null, "a")).toBeGreaterThan(0);
    expect(readOrderValue(Number.POSITIVE_INFINITY)).toBeNull();
    expect(readOrderValue(12)).toBe(12);
    expect(readOrderValue("a0")).toBe("a0");
    expect(isOrderKey(generateOrderKey(null, null))).toBe(true);
    expect(isOrderKey("not a generated key")).toBe(false);
  });
});
