# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Base Board** is a monorepo containing:

1. **`packages/board-core`** — Pure Kanban board logic (types, constants, utilities). Zero Obsidian dependencies. Consumed by both the Obsidian plugin and Electron app.
2. **`plugins/obsidian-plugin`** — Obsidian Community Plugin that provides a Kanban board view for [Obsidian Bases](https://obsidian.md). Extends `BasesView` to render property-driven columns with drag-and-drop card management. All data changes are written directly to Markdown frontmatter.
3. **`apps/electron-app`** — Standalone Electron app (work in progress). Will consume `board-core` with a custom data adapter for local markdown files.

### Stack

TypeScript, Obsidian Plugin API, esbuild build pipeline. `board-core` is framework-agnostic (vanilla DOM, no framework).

### Obsidian API

Obsidian's API changes frequently and is not fully up to date in training data.
Always verify API signatures against https://docs.obsidian.md/ (via researcher subagent
or direct webfetch) before writing code that depends on them.

## Code Intelligence (tree-sitter-analyzer)

TSA is the primary tool for understanding and modifying code in this repo.
Use it proactively — don't wait for structural questions to arise.

### Before editing any file

1. **`tsa_edit action=safe`** — is this file safe to modify right now? Returns SAFE/UNSAFE verdict + risk factors.
2. **`tsa_edit action=impact`** — what breaks if I touch this symbol/file? Shows affected files and must-run tests.

### When refactoring or adding features

3. **`tsa_nav action=caller_tree`** / **`action=callee_tree`** — full blast radius in one call. Don't loop through grep + read.
4. **`tsa_search action=symbol`** — "where is X defined?" (fast BM25 lookup).
5. **`tsa_structure action=signatures`** — method directory of a file without reading the body.

### After editing

6. **`tsa_edit action=impact`** — verify nothing unexpected broke.
7. Run `npm run build` and `npm run lint` to catch type errors.

### Anti-patterns (DO NOT)

- Don't grep for imports then manually trace callers — use `tsa_nav action=callers`.
- Don't read a 900-line file to find one function — use `tsa_structure action=signatures` first.
- Don't edit without checking blast radius — even small changes can have hidden coupling.
- Don't skip TSA for "obvious" changes — you'll miss co-change risks that git-history reveals.

TSA skill files in `.claude/skills/` have detailed workflows for each capability. The 2-call chain (`action=context` → `action=callee_tree`) answers most "how does X work" questions.

## Commands

```bash
npm install          # Install root dependencies
npm run format       # Prettier across all packages
npm run lint         # Type-check core + lint plugin
npm run build        # Build core → plugin (full chain)
npm run dev:plugin   # Watch-mode build for Obsidian dev vault
npm run dev:electron # Launch Electron app
```

There are no tests. The `lint` script is the closest thing to a quality gate — it combines TypeScript type-checking (`tsc -noEmit`) with ESLint. Run `npm run build` before committing.

### Registered Commands

Only one command is registered in `main.ts`:

- **`create-board`** ("Create new board") — opens `CreateBoardModal`, creates a `.base` file with sample tasks, and opens it.

## Detailed Documentation

For in-depth reference on specific topics, see the `docs/` directory:

- **[Architecture](docs/architecture.md)** — Entry points, types, manager pattern, data flow, card drop logic, chip properties, settings modal, constants.
- **[Build System](docs/build-system.md)** — Build output per package, CSS organization, adding new packages to the monorepo.
