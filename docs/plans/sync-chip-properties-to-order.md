# Plan: Sync Chip Properties to `.base` File `order` Array

## Goal
When user saves chip properties in settings, also update the `order` array in the `.base` file so those properties are visible in Bases' native search/filter UI.

## Current State
- Chip properties saved via: `this.config?.set(CONFIG_KEY_CHIP_PROPERTIES, properties)`
- This persists to `.base` file as `chipProperties: [...]`
- The `order` array is currently empty (`order: []`)

## Implementation

### 1. Create helper function in `kanban-view.ts`

```typescript
/** Update the order array with chip properties (prefixed with note.) */
private syncOrderWithChipProperties(): void {
  const chipProps = this.chipProperties.getChipProperties();
  if (!Array.isArray(chipProps)) return;
  
  // Convert plain names to Bases format: "status" → "note.status"
  const order = chipProps.map((prop) => `note.${prop}`);
  
  // Save to config (persists to .base file automatically)
  this.config?.set("order", order);
}
```

### 2. Call after saving chip properties

In the settings modal callback (line 118-132 in `kanban-view.ts`):

```typescript
(chipConfig: ChipConfigSnapshot | null) => {
  if (chipConfig) {
    this.config?.set(CONFIG_KEY_CHIP_PROPERTIES, chipConfig.properties);
    // ... existing config saves ...
    
    // NEW: Sync order array with chip properties
    this.syncOrderWithChipProperties();
  }
  this.scheduleRender();
},
```

### 3. Also sync when border property changes

The border property should also be in the order array if it's a chip property:

```typescript
private syncOrderWithChipProperties(): void {
  const chipProps = this.chipProperties.getChipProperties();
  const borderProp = this.chipProperties.getBorderProperty();
  
  // Ensure all chip properties are in order
  const orderSet = new Set(chipProps.map((p) => `note.${p}`));
  
  // Add border property if it's not already a chip property
  if (borderProp && !chipProps.includes(borderProp)) {
    orderSet.add(`note.${borderProp}`);
  }
  
  this.config?.set("order", Array.from(orderSet));
}
```

### 4. Handle missing `order` key

If the `.base` file doesn't have an `order` key yet, Bases should create it when we call `config.set("order", ...)`. If not, we may need to initialize it:

```typescript
// In kanban-view.ts constructor or init
if (!this.config?.get("order")) {
  this.config?.set("order", []);
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `kanban-view.ts` | Add `syncOrderWithChipProperties()` method, call after saves |

## Testing

1. Open a `.base` file with empty `order: []`
2. Open chip settings, enable some properties
3. Save
4. Verify `order` array now contains those properties (prefixed with `note.`)
5. Verify search/filter in Bases UI shows those properties

## Edge Cases

| Case | Handling |
|------|----------|
| `.base` file has no `order` key | Initialize as empty array first |
| User removes all chip properties | Set `order: []` |
| Border property not in chip properties | Add to order anyway |
| Property renamed in frontmatter | Use current name from chip config |

## Electron Port Path

This implementation uses Bases' `config.set()` API which works in Obsidian. For Electron:
- We'd read/write the `.base` file directly using a file adapter
- Same logic: parse YAML, update `views[].order`, stringify back
- The `yaml` package handles parsing/serialization cross-platform
