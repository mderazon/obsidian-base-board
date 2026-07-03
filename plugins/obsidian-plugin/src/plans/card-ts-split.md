# card.ts Refactoring Plan

## Current State

| Metric | Value |
|---|---|
| Lines | **899** |
| Methods | 23 |
| Classes | 2 (CardManager + ChipDescriptor) |
| Most complex method | `renderCard` — complexity 57, spans 290 lines (86–375) |

For comparison: column.ts = 321 lines / 9 methods, drag-drop.ts = 626 lines / 15 methods.

## Proposed Split

```
card.ts             → CardManager.renderCard() only (~250 lines), the orchestrator
chips.ts            → ChipDescriptor, chip rendering, chip context menu
card-actions.ts     → Context menu, rename, inline card creation, new card
selection.ts        → Multi-select, clear selection, batch move
covers.ts           → Cover image resolution and thumbnail rendering
card-helpers.ts     → isValuePresent, formatValueForChip, resolvePropertyValue
```

## Natural Method Groupings

| Cluster | Methods | Lines | Concern |
|---|---|---|---|
| Chip rendering | `renderChip`, `renderChipProperties`, `renderChipProperty`, `showChipContextMenu` | 378–492 | Displaying chip properties on cards |
| Card actions | `showCardActionMenu`, `startCardRename`, `startInlineCardCreation`, `createNewCard` | 494–697 | Context menus, rename, card creation |
| Selection & batch | `handleCardSelect`, `clearSelection`, `showBatchMoveMenu`, `moveBatchToColumn` | 710–826 | Multi-select and batch operations |
| Cover images | `getCardCoverSrc`, `resolveCoverString`, `renderCardThumbnail`, `renderCard` (cover section) | 250–375, 828–898 | Cover image loading & rendering |

## Execution Order

1. **Extract chip rendering** — clearest boundaries, lowest risk.
2. **Extract cover image logic** — self-contained, no cross-dependencies.
3. **Extract selection/batch** — independent concern.
4. **Extract card actions** — context menu, rename, inline creation.
5. **Move helpers** to `card-helpers.ts`.

Each step keeps CardManager's public API unchanged — safe incremental refactors.

## Caveats

- Circular imports between chips and card.ts must be resolved (chips currently import from card).
- CardManager remains the orchestrator; sub-files only house implementations.
- Biggest immediate win: collapse `renderCard` from 290 lines → ~80 lines of delegation calls.
