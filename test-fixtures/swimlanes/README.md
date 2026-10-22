# Swimlane visual test boards

These fixtures live outside `src/` and are not included in the production bundle. To use this repository copy as a vault, open any `.base` file in Obsidian with the Base Board plugin enabled. Each board filters to its own English-language notes under `Data/`, so the examples do not mix. The boards are intentionally separate so each use case is easy to screenshot.

## Boards

- `01-empty-board.base` — empty board with swimlanes disabled.
- `02-empty-swimlane-board.base` — empty board with configured empty lanes and colored columns.
- `03-single-card.base` — one card and otherwise empty columns.
- `04-multiple-columns.base` — ordinary multi-column board with swimlanes disabled, custom column colors, colored tags, and overlapping tags for filter checks.
- `05-swimlane-matrix.base` — cards distributed across three columns and three lanes, plus missing swimlane values; custom column and tag colors are enabled.
- `06-empty-cells.base` — empty columns, empty cells, and lanes with no cards.
- `07-missing-properties.base` — missing status, missing priority, and both missing; tags and custom colors remain visible across unassigned cards.
- `08-numeric-swimlanes.base` — numeric frontmatter values.
- `09-boolean-swimlanes.base` — true, false, and missing boolean values.
- `10-list-valued-swimlanes.base` — list-valued priority metadata.
- `11-collapsed-column.base` — swimlanes with the In Progress column initially collapsed.

On the populated boards, also try adding a card, dragging one card between lanes and columns, reordering lanes with the arrow buttons, deleting a lane, clicking multiple tag pills to combine filters, clearing the filters, and right-clicking a tag pill to change its color. Compare the colored column headers on the regular board and the swimlane matrix. These actions modify only the fixture notes and that board's local view configuration.
