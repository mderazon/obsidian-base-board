# Task Management (Obsidian Base Board)

This repository uses the [Base Board](https://github.com/mderazon/obsidian-base-board) Obsidian plugin to manage tasks via Kanban boards. The Kanban board is purely a visual layer on top of standard markdown files and frontmatter.

When instructed to "create a task", "update a task", or "move a task", you must directly create or edit standard Markdown files in the `Tasks/` directory (or the designated tasks folder) and manage their YAML frontmatter.

### Creating a Task

To create a new task:

1. Create a new markdown file named after the task title (`Tasks/Task Title.md`).
2. Include the following YAML frontmatter at the top of the file:

```yaml
---
status: Todo
priority: Medium
order: 1
---
```

3. Add any task details, checklists, or descriptions in the markdown body below the frontmatter.

### Moving a Task / Changing Status

If you are asked to move a task to a different column (e.g., "Move this task to In Progress"):

1. Open the specific task's markdown file.
2. Update the `status` property in the YAML frontmatter to match the new column (e.g., `status: In Progress`, `status: Done`).
3. (Optional) If asked to prioritize it, adjust the `order` property so it appears at the top (lower number = higher up).

### Example

If the user says: "Create a critical task to fix the login bug and set it to In Progress."
You should create `Tasks/Fix the login bug.md`:

```markdown
---
status: In Progress
priority: High
order: 1
---

Investigate the login bug happening on production.
```
