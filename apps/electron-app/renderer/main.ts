/**
 * Electron renderer entry point.
 *
 * This is where board-core will be mounted once a data adapter is implemented.
 * Currently shows a placeholder so the app has something to display.
 */

const container = document.getElementById("board-container");
if (container) {
  // TODO: Wire up board-core here once the data adapter is ready.
  // Example:
  //   import { Board } from "@base-board/board-core";
  //   const board = new Board({ container, dataAdapter: new MarkdownDataAdapter() });
  //   board.render();
}
