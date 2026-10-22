import { coerceColumnValue, GroupByValueType } from "./value-utils";

export const NO_VALUE_LANE = "(No value)";
export type SwimlaneValueType =
  GroupByValueType | { type: "list"; template: unknown[] };

/** Infer a lane's storage type, preferring typed matches over string labels. */
export function inferSwimlaneValueType(
  values: Iterable<unknown>,
  targetLane?: string,
): SwimlaneValueType {
  for (const value of values) {
    if (targetLane !== undefined && getSwimlaneLabel(value) !== targetLane) {
      continue;
    }
    if (Array.isArray(value)) return { type: "list", template: value };
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "number") return "number";
  }
  return "other";
}

/** Convert a frontmatter value to the label used by the swimlane UI. */
export function getSwimlaneLabel(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return NO_VALUE_LANE;
  if (Array.isArray(raw)) {
    return raw
      .map((value: unknown) =>
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value),
      )
      .join(", ");
  }
  if (
    typeof raw === "string" ||
    typeof raw === "number" ||
    typeof raw === "boolean"
  ) {
    return String(raw);
  }
  return JSON.stringify(raw) ?? NO_VALUE_LANE;
}

/** Apply a lane drop/create to frontmatter while preserving scalar type. */
export function setSwimlaneValue(
  frontmatter: Record<string, unknown>,
  property: string,
  lane: string,
  type: SwimlaneValueType,
): void {
  if (lane === NO_VALUE_LANE) delete frontmatter[property];
  else if (typeof type === "object") {
    frontmatter[property] =
      getSwimlaneLabel(type.template) === lane ? [...type.template] : [lane];
  } else frontmatter[property] = coerceColumnValue(lane, type);
}

/** Apply defaults and the selected lane/order to a newly-created card. */
export function applyNewCardProperties(
  frontmatter: Record<string, unknown>,
  defaults: Record<string, unknown> | undefined,
  groupByProperty: string,
  column: string,
  applyGroupBy: (
    frontmatter: Record<string, unknown>,
    property: string,
    column: string,
  ) => void,
  orderProperty: string,
  order: unknown,
  swimlaneProperty: string | null,
  lane: string | null,
  laneType: SwimlaneValueType,
): void {
  if (defaults) {
    for (const key of Object.keys(defaults)) {
      if (key !== "__proto__" && key !== "constructor") {
        frontmatter[key] = defaults[key];
      }
    }
  }
  applyGroupBy(frontmatter, groupByProperty, column);
  if (swimlaneProperty && lane !== null) {
    setSwimlaneValue(frontmatter, swimlaneProperty, lane, laneType);
  }
  frontmatter[orderProperty] = order;
}

/** Compose the frontmatter changes for a card dropped in a new column/lane. */
export function applyCardMoveProperties(
  frontmatter: Record<string, unknown>,
  sourceColumn: string | null,
  targetColumn: string,
  groupByProperty: string,
  applyGroupBy: (
    frontmatter: Record<string, unknown>,
    property: string,
    column: string,
  ) => void,
  swimlaneProperty: string | null,
  targetLane: string,
  laneType: SwimlaneValueType,
): void {
  if (sourceColumn !== targetColumn) {
    applyGroupBy(frontmatter, groupByProperty, targetColumn);
  }
  if (swimlaneProperty) {
    setSwimlaneValue(frontmatter, swimlaneProperty, targetLane, laneType);
  }
}

/** Select matching entries, remove the configured lane, and clear file values. */
export async function deleteSwimlaneOperation<TEntry, TFile>(args: {
  lane: string;
  property: string;
  entries: readonly TEntry[];
  getLane: (entry: TEntry) => string;
  getFile: (entry: TEntry) => TFile | null;
  configuredLanes: readonly string[];
  saveLanes: (lanes: string[]) => void;
  processFrontMatter: (
    file: TFile,
    update: (frontmatter: Record<string, unknown>) => void,
  ) => Promise<unknown>;
}): Promise<void> {
  const files = args.entries
    .filter((entry) => args.getLane(entry) === args.lane)
    .map(args.getFile)
    .filter((file): file is TFile => file !== null);
  args.saveLanes(args.configuredLanes.filter((lane) => lane !== args.lane));
  await updateFilesFrontmatter(files, args.processFrontMatter, (frontmatter) =>
    deleteSwimlaneValue(frontmatter, args.property),
  );
}

/** Remove a lane property when a swimlane is deleted. */
export function deleteSwimlaneValue(
  frontmatter: Record<string, unknown>,
  property: string,
): void {
  delete frontmatter[property];
}

/** Build the row/cell structure used by the swimlane board renderer. */
export function buildSwimlaneLayout<T>(
  columns: readonly string[],
  lanes: readonly string[],
  getCell: (column: string, lane: string) => T,
): Array<{ lane: string; cells: Array<{ column: string; content: T }> }> {
  return lanes.map((lane) => ({
    lane,
    cells: columns.map((column) => ({
      column,
      content: getCell(column, lane),
    })),
  }));
}

/** Apply one frontmatter update to each file through a file-manager boundary. */
export async function updateFilesFrontmatter<T>(
  files: readonly T[],
  processFrontMatter: (
    file: T,
    update: (frontmatter: Record<string, unknown>) => void,
  ) => Promise<unknown>,
  update: (frontmatter: Record<string, unknown>) => void,
): Promise<void> {
  await Promise.all(files.map((file) => processFrontMatter(file, update)));
}

/** Build a unique lane list, preserving configured empty lanes before new ones. */
export function getOrderedSwimlanes(
  values: Iterable<string>,
  configured: readonly string[] = [],
): string[] {
  // The no-value lane reflects current cards; it must never persist as an
  // explicitly configured empty lane.
  const ordered = Array.from(
    new Set(configured.filter((lane) => lane !== NO_VALUE_LANE)),
  );
  for (const lane of new Set(values)) {
    if (!ordered.includes(lane)) ordered.push(lane);
  }
  return ordered;
}

/** Return a reordered copy; unknown lanes and out-of-range moves are no-ops. */
export function moveSwimlane(
  lanes: readonly string[],
  lane: string,
  delta: -1 | 1,
): string[] {
  const reordered = [...new Set(lanes)];
  const index = reordered.indexOf(lane);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= reordered.length) return reordered;
  [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
  return reordered;
}
