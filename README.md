# Base Board for Obsidian

**Base Board** is an interactive, property-driven Kanban board view for [Obsidian Bases](https://obsidian.md). It allows you to organize your notes into visual columns based on any property in your frontmatter, providing a seamless drag-and-drop experience for managing tasks, projects, and structured data.

![Base Board Preview](kanban-base/Pasted%20image%2020260221125626.png)

## Purpose

Standard Kanban plugins often require specialized formatting or keep data locked within a single note. **Base Board** leverages the power of Obsidian's core **Bases** engine to turn _any_ set of notes into a board. Whether you're tracking a reading list, a project's status, or a collection of contacts, Base Board makes your data interactive.

## Key Features

- 🏗️ **Property-Based Columns**: Instantly generate columns from any frontmatter property (e.g., `status`, `priority`, `assignee`).
- 👋 **Intuitive Drag & Drop**: Move cards between columns to update their properties automatically, and reorder cards within a column to set a custom sort order.
- ✏️ **Inline Power**: Rename cards or column titles directly on the board. Renaming a column can optionally batch-update all cards within it.
- 📑 **Rich Cards**: View up to 3 key metadata fields as chips on each card for a quick overview.
- ➕ **One-Click Creation**: Add new notes directly to a specific column without leaving the board view.
- 📱 **Mobile Friendly**: Designed to work across both Desktop and Mobile versions of Obsidian.
- 🔒 **Data First**: All changes are written directly to your Markdown files. No proprietary sidecar files or hidden databases.

## Usage

### 1. Enable Bases

Ensure the **Bases** core plugin is enabled in Obsidian (**Settings > Core plugins > Bases**).

### 2. Set Up a Base

Create a `.base` file or open an existing Base. Bases allow you to define which notes should appear in a view (e.g., all notes in a `Projects` folder).

### 3. Switch to Kanban View

In the layout selector at the top right of the Base view, select **Kanban**.

### 4. Group Your Data

Open the Sort/Group menu and select a property under **"Group by"**. For example, choosing `status` will create a column for every unique status value found in your notes.

### 5. Customize

- **Add Column**: Use the "Add column" button to create a new category.
- **Reorder**: Drag column headers to change their horizontal order.
- **Edit**: Hover over a card and click the pencil icon to rename, open, or delete the note.

### 6. Multiple Boards

Each `.base` file acts as an independent board. Create separate boards for different projects or workflows:

```
My Vault/
  Projects/
    Alpha/
      tasks/
        Design mockups.md
        Build prototype.md
      board.base               ← Board for Project Alpha
    Beta/
      tasks/
        Research competitors.md
      board.base               ← Board for Project Beta
```

Each `board.base` file uses its own filter to scope which files appear:

```yaml
filters:
  and:
    - file.inFolder("tasks")
views:
  - type: kanban
    name: Board
    groupBy:
      property: note.status
```

Column order and board preferences are stored within each `.base` file, so boards are fully portable and independent.

## Installation

### Community Plugins

Search for **Base Board** in the Obsidian Community Plugins browser and click **Install**.

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/mrazon/obsidian-base-board/releases).
2. Create a folder named `obsidian-base-board` in your vault's `.obsidian/plugins/` directory.
3. Move the downloaded files into that folder.
4. Reload Obsidian and enable the plugin in **Settings > Community plugins**.

## Development

1. Clone this repo.
2. Run `npm install`.
3. Run `npm run dev` to start the build process in watch mode.
4. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin folder for testing.

## License

This plugin is licensed under the [MIT License](LICENSE).
