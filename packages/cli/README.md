# base-board-cli (beta)

Command-line interface for [Base Board](https://github.com/mderazon/obsidian-base-board) — manage your Obsidian kanban board from the terminal or from AI coding agents.

> This package is in beta. The API may change between releases.

## Requirements

- Node.js 18+
- Obsidian running with CLI enabled (Settings > General > Advanced > Command line interface)

## Usage

```
npx base-board-cli <command> [options]
```

## Commands

| Command | Description |
|---------|-------------|
| `board` | Show the board with all cards grouped by column |
| `card <id>` | Show the full content of a card |
| `move <id> <column>` | Move a card to a different column |
| `create <title>` | Create a new card |
| `update <id> --set <key=value>` | Update a frontmatter property |
| `list` | List all boards in the vault |
| `assign-ids` | Assign stable ids to cards that don't have one yet |

## Card IDs

Every card has a stable `id` frontmatter property in the format `kebab-case-title-xxxx` (e.g. `fix-login-bug-a3f2`). IDs are assigned automatically when a card is created via the plugin or CLI. For existing cards without an id, run `assign-ids` once.

## Configuration

Set these environment variables to avoid passing flags every time:

| Variable | Description |
|----------|-------------|
| `BB_VAULT` | Vault name to target (defaults to active vault) |
| `BB_BOARD` | Board file to use (defaults to first `.base` file found) |

## Examples

```sh
# Show the board
BB_BOARD="Task Board.base" npx base-board-cli board

# Move a card
npx base-board-cli move fix-login-bug-a3f2 Done

# Create a card with properties
npx base-board-cli create "Fix login bug" --column Backlog --set priority=high

# Update a property
npx base-board-cli update fix-login-bug-a3f2 --set due=2026-04-01

# Read a card's full content
npx base-board-cli card fix-login-bug-a3f2
```

## For AI agents

Run `npx base-board-cli board` to get the current board state and available card ids. Every board response includes a usage footer with the most common follow-up commands.
