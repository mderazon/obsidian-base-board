import { Plugin, Modal, App, Setting, TFolder, Notice } from "obsidian";
import { KanbanView } from "./kanban-view";

/** Per-base column configuration */
export interface ColumnConfig {
  columns: string[];
}

export interface PluginData {
  columnConfigs: Record<string, ColumnConfig>;
}

const DEFAULT_DATA: PluginData = {
  columnConfigs: {},
};

// ---------------------------------------------------------------------------
//  "Create new board" modal
// ---------------------------------------------------------------------------

interface BoardConfig {
  name: string;
  folder: string;
  groupBy: string;
}

class CreateBoardModal extends Modal {
  private config: BoardConfig = {
    name: "",
    folder: "",
    groupBy: "status",
  };
  private onSubmit: (config: BoardConfig) => void;

  constructor(app: App, onSubmit: (config: BoardConfig) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Create new board" });

    // --- Board name ---
    new Setting(contentEl).setName("Board name").addText((text) => {
      text.setPlaceholder("e.g. Project Alpha");
      text.onChange((v) => {
        this.config.name = v;
        // Auto-fill the folder field from the board name
        if (!folderManuallyEdited) {
          folderInput.setValue(v);
          this.config.folder = v;
        }
      });
      setTimeout(() => text.inputEl.focus(), 50);
    });

    // --- Folder ---
    let folderManuallyEdited = false;
    let folderInput: any;
    new Setting(contentEl)
      .setName("Folder")
      .setDesc("Where to create the board and its task files")
      .addText((text) => {
        folderInput = text;
        text.setPlaceholder("e.g. Projects/Alpha");
        text.onChange((v) => {
          this.config.folder = v;
          folderManuallyEdited = true;
        });
      });

    // --- GroupBy property ---
    new Setting(contentEl)
      .setName("Group by property")
      .setDesc("The frontmatter property used for columns")
      .addText((text) => {
        text.setValue("status");
        text.setPlaceholder("status");
        text.onChange((v) => (this.config.groupBy = v || "status"));
      });

    // --- Submit ---
    new Setting(contentEl).addButton((btn) => {
      btn
        .setButtonText("Create")
        .setCta()
        .onClick(() => this.submit());
    });

    // Handle Enter key on the modal
    contentEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.submit();
      }
    });
  }

  private submit(): void {
    const name = this.config.name.trim();
    if (!name) {
      new Notice("Please enter a board name.");
      return;
    }
    this.config.name = name;
    this.config.folder = this.config.folder.trim() || name;
    this.config.groupBy = this.config.groupBy.trim() || "status";
    this.close();
    this.onSubmit(this.config);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
//  Plugin
// ---------------------------------------------------------------------------

export default class BaseBoardPlugin extends Plugin {
  data_: PluginData = DEFAULT_DATA;

  async onload() {
    await this.loadPluginData();

    this.registerBasesView("kanban", {
      name: "Kanban",
      icon: "lucide-kanban",
      factory: (controller: any, containerEl: HTMLElement) =>
        new KanbanView(controller, containerEl, this),
      options: () => KanbanView.getViewOptions(),
    });

    // -- Command: Create new board --------------------------------------------
    this.addCommand({
      id: "create-board",
      name: "Create new board",
      callback: () => {
        new CreateBoardModal(this.app, (config) =>
          this.createBoard(config),
        ).open();
      },
    });
  }

  onunload() {}

  // -- Board scaffolding ------------------------------------------------------

  private async createBoard(config: BoardConfig): Promise<void> {
    const { name, folder, groupBy } = config;
    const vault = this.app.vault;

    // Sanitize folder path
    const safeFolder = folder.replace(/[\\:*?"<>|]/g, "");
    const tasksFolder = `${safeFolder}/Tasks`;

    // 1. Create folder structure
    if (!vault.getAbstractFileByPath(safeFolder)) {
      await vault.createFolder(safeFolder);
    }
    if (!vault.getAbstractFileByPath(tasksFolder)) {
      await vault.createFolder(tasksFolder);
    }

    // 2. Create the .base file
    const basePath = `${safeFolder}/${name}.base`;
    if (vault.getAbstractFileByPath(basePath)) {
      new Notice(`A board already exists at "${basePath}".`);
      return;
    }

    const baseContent = [
      `filters:`,
      `  and:`,
      `    - file.inFolder("${tasksFolder}")`,
      `views:`,
      `  - type: kanban`,
      `    name: ${name}`,
      `    groupBy:`,
      `      property: note.${groupBy}`,
      `      direction: DESC`,
      `    order:`,
      `      - file.name`,
      `      - note.${groupBy}`,
      ``,
    ].join("\n");

    await vault.create(basePath, baseContent);

    // 3. Create sample task files so the board isn't empty on first open
    const sampleTasks = [
      {
        title: "Example task",
        value: "To Do",
        order: 0,
      },
      {
        title: "Getting started",
        value: "In Progress",
        order: 0,
      },
    ];

    for (const task of sampleTasks) {
      const safeName = task.title.replace(/[\\/:*?"<>|]/g, "");
      const taskPath = `${tasksFolder}/${safeName}.md`;
      if (!vault.getAbstractFileByPath(taskPath)) {
        const content = [
          "---",
          `${groupBy}: ${task.value}`,
          `kanban_order: ${task.order}`,
          "---",
          "",
          `# ${task.title}`,
          "",
        ].join("\n");
        await vault.create(taskPath, content);
      }
    }

    // 4. Open the board
    const file = vault.getAbstractFileByPath(basePath);
    if (file) {
      await this.app.workspace.getLeaf(false).openFile(file as any);
      new Notice(`Board "${name}" created!`);
    }
  }

  // -- Column config helpers --------------------------------------------------

  getColumnConfig(baseId: string): ColumnConfig | null {
    return this.data_.columnConfigs[baseId] ?? null;
  }

  async saveColumnConfig(baseId: string, config: ColumnConfig): Promise<void> {
    this.data_.columnConfigs[baseId] = config;
    await this.savePluginData();
  }

  // -- Persistence ------------------------------------------------------------

  async loadPluginData(): Promise<void> {
    const saved = await this.loadData();
    this.data_ = Object.assign({}, DEFAULT_DATA, saved ?? {});
    if (!this.data_.columnConfigs) this.data_.columnConfigs = {};
  }

  async savePluginData(): Promise<void> {
    await this.saveData(this.data_);
  }
}
