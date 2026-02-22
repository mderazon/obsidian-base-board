<p align="center">
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" fill="none" viewBox="0 0 400 100"><defs><clipPath id="b"><use href="#a"/></clipPath><rect id="a" width="60" height="60" x="20" y="20" rx="14" transform="rotate(45 50 50)"/></defs><g clip-path="url(#b)"><path fill="#7e1dfb" d="M0 0h38v100H0z"/><path fill="#c4b5fd" d="M38 0h24v100H38z"/><path fill="#9ca3af" d="M62 0h50v100H62z"/></g><text x="110" y="66" fill="#fff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, Ubuntu, sans-serif" font-size="42">
    <tspan fill="#a882ff" font-weight="800">Base</tspan>
    <tspan fill="#dadada" font-weight="400"> Board</tspan>
  </text></svg>
</p>

# Kanban Plugin For Obsidian

**Base Board** is an interactive, property-driven Kanban board view for [Obsidian Bases](https://obsidian.md). It allows you to organize your notes into visual columns based on any property in your frontmatter, providing a seamless drag-and-drop experience for managing tasks and structured data.

<p align="center">
  <video src="demo.webm" width="100%" controls autoplay loop muted playsinline></video>
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
