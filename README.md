<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="logo-dark.svg">
    <img alt="Base Board Logo" src="logo-light.svg">
  </picture>
</p>

# Kanban Plugin For Obsidian

**Base Board** is an interactive, property-driven Kanban board view for [Obsidian Bases](https://obsidian.md). It allows you to organize your notes into visual columns based on any property in your frontmatter, providing a seamless drag-and-drop experience for managing tasks and structured data.

<p align="center">
  [demo.webm](https://github.com/user-attachments/assets/9ae6e1b7-729f-4891-b853-d1f5d2ebe755)
</p>

## Key Features

- **Property-Based Columns**: Instantly generate columns from any frontmatter property.
- **Intuitive Drag & Drop**: Move cards between columns to update their properties automatically, and reorder cards within a column.
- **Inline Power**: Rename cards or column titles directly on the board.
- **Rich Cards**: View key metadata fields as chips on each card for a quick overview.
- **One-Click Creation**: Add new notes directly to a specific column without leaving the board view.
- **Data First**: All changes are written directly to your Markdown files.

## Usage

Open the **Command palette** (`Ctrl/Cmd + P`) and run **"Base Board: Create new board"**. Enter a name, choose a folder, and the plugin will scaffold everything for you — a `.base` file, a tasks folder, and sample task notes. The board opens automatically.

## Installation

Search for **Base Board** in the Obsidian Community Plugins browser and click **Install**.

## Development

1. Clone this repo.
2. Run `npm install`.
3. Run `npm run dev` to start the build process in watch mode.

## License

This plugin is licensed under the [MIT License](LICENSE).
