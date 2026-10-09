import {
  App,
  Modal,
  Notice,
  Setting,
  TFile,
  parseYaml,
  stringifyYaml,
} from "obsidian";
import {
  BASE_BOARD_CONFIG_KEYS,
  LEGACY_VIEW_TYPE,
  VIEW_TYPE,
} from "./constants";

/**
 * One legacy view found in a `.base` file: which file, its index in the
 * `views` array, its display name, and whether it carries Base Board-specific
 * config (which makes it a confident match vs. a possibly-native Kanban).
 */
interface LegacyView {
  file: TFile;
  viewIndex: number;
  name: string;
  confident: boolean;
}

type BaseDoc = { views?: Array<Record<string, unknown>> };

/** Find every `type: kanban` view across all `.base` files. */
async function findLegacyViews(app: App): Promise<LegacyView[]> {
  const found: LegacyView[] = [];
  const baseFiles = app.vault.getFiles().filter((f) => f.extension === "base");
  for (const file of baseFiles) {
    let doc: BaseDoc;
    try {
      doc = (parseYaml(await app.vault.read(file)) ?? {}) as BaseDoc;
    } catch {
      continue; // unparseable — leave it alone
    }
    const views = Array.isArray(doc.views) ? doc.views : [];
    views.forEach((view, viewIndex) => {
      if (!view || view.type !== LEGACY_VIEW_TYPE) return;
      const confident = BASE_BOARD_CONFIG_KEYS.some((k) =>
        Object.prototype.hasOwnProperty.call(view, k),
      );
      found.push({
        file,
        viewIndex,
        name: typeof view.name === "string" ? view.name : "(unnamed)",
        confident,
      });
    });
  }
  return found;
}

/** Rewrite the chosen views' `type` to VIEW_TYPE, preserving everything else. */
async function migrateViews(app: App, chosen: LegacyView[]): Promise<number> {
  // Group by file so each file is read/written once.
  const byFile = new Map<TFile, Set<number>>();
  for (const v of chosen) {
    const set = byFile.get(v.file) ?? new Set<number>();
    set.add(v.viewIndex);
    byFile.set(v.file, set);
  }
  let migrated = 0;
  for (const [file, indices] of byFile) {
    let doc: BaseDoc;
    try {
      doc = (parseYaml(await app.vault.read(file)) ?? {}) as BaseDoc;
    } catch {
      continue;
    }
    const views = Array.isArray(doc.views) ? doc.views : [];
    let changed = false;
    indices.forEach((i) => {
      // Re-check the index still holds a legacy view (file may have changed).
      if (views[i] && views[i].type === LEGACY_VIEW_TYPE) {
        views[i].type = VIEW_TYPE;
        changed = true;
        migrated++;
      }
    });
    if (changed) await app.vault.modify(file, stringifyYaml(doc));
  }
  return migrated;
}

/** Entry point: scan, present a confirm/selection modal, migrate on confirm. */
export async function runLegacyViewMigration(app: App): Promise<void> {
  const legacy = await findLegacyViews(app);
  if (!legacy.length) {
    new Notice("No legacy “type: kanban” views found.");
    return;
  }
  new MigrateModal(app, legacy).open();
}

class MigrateModal extends Modal {
  private legacy: LegacyView[];
  /** Which legacy views the user has ticked to migrate. */
  private selected: Set<LegacyView>;

  constructor(app: App, legacy: LegacyView[]) {
    super(app);
    this.legacy = legacy;
    // Pre-select the confident matches (they carry Base Board config); leave
    // the ambiguous ones for the user to opt in.
    this.selected = new Set(legacy.filter((v) => v.confident));
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Migrate legacy views" });
    contentEl.createEl("p", {
      text:
        `Found ${this.legacy.length} view(s) using the old "type: kanban" id. ` +
        `Obsidian 1.14 uses that id for its native Kanban, so these will only ` +
        `render as Base Board once changed to "type: base-board". ` +
        `Ticked views will be migrated; untick any that should stay a native ` +
        `Bases Kanban.`,
    });

    for (const v of this.legacy) {
      const setting = new Setting(contentEl)
        .setName(`${v.name} — ${v.file.path}`)
        .setDesc(
          v.confident
            ? "Has Base Board settings — almost certainly a Base Board board."
            : "No Base Board settings found — could be a native Kanban. Verify before migrating.",
        );
      setting.addToggle((t) =>
        t.setValue(this.selected.has(v)).onChange((on) => {
          if (on) this.selected.add(v);
          else this.selected.delete(v);
        }),
      );
    }

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Migrate selected")
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            const chosen = this.legacy.filter((v) => this.selected.has(v));
            if (!chosen.length) {
              new Notice("Nothing selected.");
              btn.setDisabled(false);
              return;
            }
            const n = await migrateViews(this.app, chosen);
            new Notice(
              `Migrated ${n} view(s) to "type: base-board". Reopen affected boards to see them.`,
            );
            this.close();
          }),
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => this.close()),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
