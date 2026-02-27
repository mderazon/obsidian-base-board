import { Modal, App, Setting, Notice, TextComponent } from "obsidian";

// ---------------------------------------------------------------------------
//  Simple input modal (for column names, etc.)
// ---------------------------------------------------------------------------

export class InputModal extends Modal {
  private value = "";
  private onSubmit: (value: string) => void;
  private title: string;
  private placeholder: string;

  constructor(
    app: App,
    title: string,
    placeholder: string,
    onSubmit: (value: string) => void,
  ) {
    super(app);
    this.title = title;
    this.placeholder = placeholder;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });

    new Setting(contentEl).setName("Name").addText((text) => {
      text.setPlaceholder(this.placeholder);
      text.onChange((v) => (this.value = v));
      // Focus and handle Enter key
      setTimeout(() => {
        text.inputEl.focus();
        text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.submit();
          }
        });
      }, 50);
    });

    new Setting(contentEl).addButton((btn) => {
      btn
        .setButtonText("Add")
        .setCta()
        .onClick(() => this.submit());
    });
  }

  private submit(): void {
    const trimmed = this.value.trim();
    if (trimmed) {
      this.onSubmit(trimmed);
    }
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
//  "Create new board" modal
// ---------------------------------------------------------------------------

export interface BoardConfig {
  name: string;
  folder: string;
  groupBy: string;
}

export class CreateBoardModal extends Modal {
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
      text.setPlaceholder("My new board");
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
    let folderInput: TextComponent;
    new Setting(contentEl)
      .setName("Folder")
      .setDesc("Where to create the board and its task files")
      .addText((text) => {
        folderInput = text;
        text.setPlaceholder("Projects/alpha");
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
        text.setPlaceholder("Status");
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
