# Card Thumbnails

Base Board can optionally show a thumbnail at the top of each Kanban card.

![Configure view toggle](assets/kanban-card-thumbnails-setting.png)

Enable it per Kanban view:

1. Open the board.
2. Open **Configure view**.
3. Expand **Display**.
4. Turn on **Show card thumbnails**.

![Example cards with thumbnails](assets/kanban-card-thumbnails-example.png)

## How it works

- Thumbnails are off by default.
- The setting is saved with the Kanban view configuration in the `.base` file.
- When enabled, Base Board uses the first image found in the note body.
- It supports both Obsidian embeds like `![[photo.png]]` and standard Markdown images like `![alt](photo.png)`.
- Internal vault images are resolved through Obsidian link resolution, and external image URLs are also supported.
