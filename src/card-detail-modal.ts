import { App, ButtonComponent, Modal, TFile, WorkspaceLeaf } from "obsidian";
import { KanbanView } from "./kanban-view";

export class CardDetailModal extends Modal {
  private file: TFile;
  private view: KanbanView;
  private leaf!: WorkspaceLeaf;

  constructor(app: App, file: TFile, view: KanbanView) {
    super(app);
    this.file = file;
    this.view = view;
  }

  async onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass("base-board-card-modal");

    // Remove the native modal title because the Rogue Leaf has its own inline title
    this.titleEl.empty();

    // Actions Container at the top of the body
    const actionsEl = contentEl.createDiv({
      cls: "base-board-card-modal-actions",
    });

    // Open in Tab Button
    new ButtonComponent(actionsEl)
      .setButtonText("Open in split pane")
      .setIcon("lucide-columns")
      .onClick(() => {
        this.close();
        const leaf = this.app.workspace.getLeaf("split");
        void leaf.openFile(this.file);
      });

    // Open in New Tab Button
    new ButtonComponent(actionsEl)
      .setButtonText("Open in new tab")
      .setIcon("lucide-external-link")
      .onClick(() => {
        this.close();
        const leaf = this.app.workspace.getLeaf("tab");
        void leaf.openFile(this.file);
      });

    // Edit Tags Button
    new ButtonComponent(actionsEl)
      .setButtonText("Edit tags")
      .setIcon("lucide-tags")
      .onClick(() => {
        this.view.tags.promptEditTags(this.file);
      });

    contentEl.createEl("hr", { cls: "base-board-modal-separator" });

    // Markdown Content Container
    const bodyEl = contentEl.createDiv({ cls: "base-board-card-modal-body" });

    // Create a truly orphaned workspace leaf instead of a tracked split/tab
    const LeafClass = WorkspaceLeaf as unknown as new (
      app: App,
    ) => WorkspaceLeaf;
    this.leaf = new LeafClass(this.app);

    // Open out file in that leaf
    await this.leaf.openFile(this.file, { active: false });

    // Reroute the leaf's container element to inside our modal
    bodyEl.appendChild(this.leaf.view.containerEl);

    // Add a class so CSS can control it rather than hardcoding static styles
    this.leaf.view.containerEl.addClass("base-board-rogue-leaf-container");
  }

  onClose() {
    // Gracefully clean up the rogue leaf
    if (this.leaf) {
      this.leaf.detach();
    }
    this.contentEl.empty();
  }
}
