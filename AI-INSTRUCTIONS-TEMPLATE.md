# Task Management (Obsidian Base Board)

This repository uses the [Base Board](https://github.com/mderazon/obsidian-base-board) Obsidian plugin to manage tasks via Kanban boards. The Kanban board is purely a visual layer on top of standard markdown files and frontmatter.

When instructed to "create a task", "update a task", or "move a task", you must directly create or edit standard Markdown files in the designated tasks folder and manage their YAML frontmatter.

### Understanding the Board Schema

Before creating or moving a task, you should **first locate and read the `.base` file** for the active board in this repository.
This configuration file dictates the **exact frontmatter property name** used for columns (e.g., `status`, `stage`) and the **exact string values** allowed for those columns (e.g., `Todo`, `In Progress`, `Done`).

**Never guess the column names, property keys, or status values.** Always use the precise strings defined in the board's `.base` configuration.

### Creating a Task

To create a new task:

1. Create a new markdown file named after the task title (e.g., `Tasks/Task Title.md`).
2. Include the YAML frontmatter at the top of the file, populating the properties according to the exact schema found in the `.base` file:

```yaml
---
status: Todo
order: 1
---
```

3. Add any task details, checklists, or descriptions in the markdown body below the frontmatter.

### Moving a Task / Changing Status

If you are asked to move a task to a different column:

1. Open the specific task's markdown file.
2. Update the appropriate frontmatter property (e.g., `status`) to match the exact exact spelling and casing of the new column as defined in the `.base` configuration.
3. (Optional) If asked to prioritize it, adjust the `order` property so it appears at the top (lower number = higher up).

### Example

If the `.base` file dictates the board is grouped by `status` with available columns `[Todo, In Progress, Done]`, and the user says: "Create a critical task to fix the login bug and set it to In Progress."

You should create the Markdown file:

```markdown
---
status: In Progress
priority: High
order: 1
---

Investigate the login bug happening on production.
```
