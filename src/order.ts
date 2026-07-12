import {
  BASE_62_DIGITS,
  generateKeyBetween,
  generateNKeysBetween,
} from "fractional-indexing";

export type OrderValue = string | number | null;

export function readOrderValue(value: unknown): OrderValue {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

export function compareOrderValues(a: OrderValue, b: OrderValue): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") {
    return a < b ? -1 : 1;
  }

  // Mixed columns only exist transiently while legacy numeric indexes are
  // migrated. Keep their ordering deterministic until the batch completes.
  return typeof a === "number" ? -1 : 1;
}

export function generateOrderKeys(
  before: string | null,
  after: string | null,
  count: number,
): string[] {
  return generateNKeysBetween(before, after, count, BASE_62_DIGITS);
}

export function generateOrderKey(
  before: string | null,
  after: string | null,
): string {
  return generateKeyBetween(before, after, BASE_62_DIGITS);
}

export function isOrderKey(value: OrderValue): value is string {
  if (typeof value !== "string") return false;
  try {
    generateOrderKey(value, null);
    return true;
  } catch {
    return false;
  }
}
