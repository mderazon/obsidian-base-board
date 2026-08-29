import type { Column } from "@base-board/board-core/types";

/**
 * Single source of truth for in-flight / recent column renames.
 *
 * Renaming a column rewrites the groupBy value on every card; Bases
 * re-queries asynchronously in waves, so between the writes and the final
 * consistent state the DOM and the query data can disagree:
 *
 *   - the query may still report the OLD name while the config has the NEW
 *     one (stale extra column),
 *   - mid-regroup waves may report the column as empty or partial
 *     (card reflow, count → 0),
 *   - a fast settle can race ahead of the reconciler pass that claims the
 *     old DOM element (column flashes out/in).
 *
 * The tracker records each rename once and answers every question the
 * reconciler (and render's scroll restore) need until the entry expires.
 */
export interface ColumnRenameEntry {
  oldName: string;
  newName: string;
  /** Card count of the column at rename time — settlement needs >= this. */
  expectedCount: number;
  /** Hard cap after which shielding is lifted regardless of data state. */
  expires: number;
  /** True once a wave proved propagation completed. */
  settled: boolean;
}

export interface ColumnRenameTrackerOptions {
  /** How long entries are kept (claims, scrubbing, freeze). */
  ttlMs?: number;
  /** Called once when an entry first settles (scrub stored config). */
  onSettled?: (oldName: string, newName: string) => void;
}

export class ColumnRenameTracker {
  /** Keyed by oldName. Insertion order = rename order (chain walks). */
  private entries = new Map<string, ColumnRenameEntry>();
  private ttlMs: number;
  private onSettled?: (oldName: string, newName: string) => void;

  constructor(options: ColumnRenameTrackerOptions = {}) {
    this.ttlMs = options.ttlMs ?? 30_000;
    this.onSettled = options.onSettled;
  }

  /** Record a rename. Overwrites any previous entry for the same old name. */
  public register(oldName: string, newName: string, expectedCount = 0): void {
    this.entries.set(oldName, {
      oldName,
      newName,
      expectedCount,
      expires: Date.now() + this.ttlMs,
      settled: false,
    });
  }

  /**
   * Re-evaluate settle state against fresh query data. An entry settles
   * when the new name is fully present, the old name is gone, and the new
   * group holds at least the expected card count — or when the hard cap
   * expires. Settled entries are kept until expiry (claims still need
   * them) and `onSettled` fires exactly once.
   */
  public refresh(names: string[], groupSizes: Map<string, number>): void {
    const now = Date.now();
    for (const [oldName, info] of this.entries) {
      if (info.settled) continue;
      const settled =
        names.includes(info.newName) &&
        !names.includes(oldName) &&
        (groupSizes.get(info.newName) ?? 0) >= info.expectedCount;
      if (settled || info.expires < now) {
        info.settled = true;
        this.onSettled?.(oldName, info.newName);
      }
    }
  }

  /** The still-unsettled entry, if any (there is at most one in practice). */
  public getUnsettled(): ColumnRenameEntry | null {
    for (const info of this.entries.values()) {
      if (!info.settled) return info;
    }
    return null;
  }

  /**
   * Remove stale pre-rename names from a column list: mid-propagation
   * waves can list BOTH names at once (the old one arriving via stale
   * query data that getColumns() appends as an unknown column).
   */
  public suppressFromColumns(columns: string[], names: string[]): void {
    for (const info of this.entries.values()) {
      if (names.includes(info.newName) || columns.includes(info.newName)) {
        const idx = columns.indexOf(info.oldName);
        if (idx !== -1) columns.splice(idx, 1);
      }
    }
  }

  /**
   * While a rename is unsettled, the old group holds the complete card
   * set; carry it over to the new name so the column renders its full
   * content instead of the partial mid-wave group.
   */
  public carryGroups(groupMap: Map<string, Column | null>): void {
    for (const info of this.entries.values()) {
      if (info.settled) continue;
      const oldGroup = groupMap.get(info.oldName);
      if (oldGroup) {
        groupMap.set(info.newName, { ...oldGroup, name: info.newName });
      }
    }
  }

  /**
   * Claim the existing DOM element for a renamed column. Walks the whole
   * rename chain backwards (C→B→A) so back-to-back renames find the
   * element even while it still carries an earlier name.
   */
  public claimElement(
    name: string,
    colEls: Map<string, HTMLElement>,
  ): HTMLElement | undefined {
    let probe = name;
    const seen = new Set<string>([probe]);
    let found = colEls.get(probe);
    if (found) return found;
    let progressed = true;
    while (progressed && !found) {
      progressed = false;
      for (const info of this.entries.values()) {
        if (info.newName === probe && !seen.has(info.oldName)) {
          seen.add(info.oldName);
          probe = info.oldName;
          progressed = true;
          found = colEls.get(probe);
          if (found) break;
        }
      }
    }
    return found;
  }

  /** True while a rename targeting `name` is still propagating. */
  public isFrozen(name: string): boolean {
    for (const info of this.entries.values()) {
      if (info.newName === name && !info.settled) return true;
    }
    return false;
  }

  /** True if `name` is the old or new side of any tracked rename. */
  public isRenameInvolved(name: string): boolean {
    for (const info of this.entries.values()) {
      if (info.oldName === name || info.newName === name) return true;
    }
    return false;
  }

  /** The name a column had before its most recent rename (scroll restore). */
  public previousNameOf(newName: string): string | undefined {
    for (const info of this.entries.values()) {
      if (info.newName === newName) return info.oldName;
    }
    return undefined;
  }
}
