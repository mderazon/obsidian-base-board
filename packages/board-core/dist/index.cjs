"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  CONFIG_KEY_BOARD_COVER_PROPERTY: () => CONFIG_KEY_BOARD_COVER_PROPERTY,
  CONFIG_KEY_BOARD_OPEN_BEHAVIOR: () => CONFIG_KEY_BOARD_OPEN_BEHAVIOR,
  CONFIG_KEY_BOARD_USE_FIRST_EMBED: () => CONFIG_KEY_BOARD_USE_FIRST_EMBED,
  CONFIG_KEY_BORDER_PROPERTY: () => CONFIG_KEY_BORDER_PROPERTY,
  CONFIG_KEY_CHIP_COLORS: () => CONFIG_KEY_CHIP_COLORS,
  CONFIG_KEY_CHIP_FIXED_COLORS: () => CONFIG_KEY_CHIP_FIXED_COLORS,
  CONFIG_KEY_CHIP_ICONS: () => CONFIG_KEY_CHIP_ICONS,
  CONFIG_KEY_CHIP_PROPERTIES: () => CONFIG_KEY_CHIP_PROPERTIES,
  CONFIG_KEY_CHIP_SHOW_LABELS: () => CONFIG_KEY_CHIP_SHOW_LABELS,
  CONFIG_KEY_COLUMNS: () => CONFIG_KEY_COLUMNS,
  CONFIG_KEY_COLUMN_COLORS: () => CONFIG_KEY_COLUMN_COLORS,
  CONFIG_KEY_TAG_COLORS: () => CONFIG_KEY_TAG_COLORS,
  CONFIG_KEY_WIP_LIMITS: () => CONFIG_KEY_WIP_LIMITS,
  DEFAULT_BOARD_CONFIG: () => DEFAULT_BOARD_CONFIG,
  NO_VALUE_COLUMN: () => NO_VALUE_COLUMN,
  ORDER_PROPERTY: () => ORDER_PROPERTY,
  UNSAFE_FILENAME_CHARS: () => UNSAFE_FILENAME_CHARS,
  relativeLuminance: () => relativeLuminance,
  sanitizeFilename: () => sanitizeFilename,
  updateBaseFolderReferences: () => updateBaseFolderReferences
});
module.exports = __toCommonJS(index_exports);

// src/constants.ts
var NO_VALUE_COLUMN = "(No value)";
var ORDER_PROPERTY = "kanban_order";
var CONFIG_KEY_COLUMNS = "boardColumns";
var CONFIG_KEY_TAG_COLORS = "tagColors";
var CONFIG_KEY_BOARD_OPEN_BEHAVIOR = "boardOpenBehavior";
var CONFIG_KEY_COLUMN_COLORS = "columnColors";
var CONFIG_KEY_WIP_LIMITS = "wipLimits";
var CONFIG_KEY_BOARD_COVER_PROPERTY = "boardCoverProperty";
var CONFIG_KEY_BOARD_USE_FIRST_EMBED = "boardUseFirstEmbed";
var CONFIG_KEY_CHIP_PROPERTIES = "chipProperties";
var CONFIG_KEY_CHIP_COLORS = "chipColors";
var CONFIG_KEY_CHIP_FIXED_COLORS = "chipFixedColors";
var CONFIG_KEY_CHIP_SHOW_LABELS = "chipShowLabels";
var CONFIG_KEY_CHIP_ICONS = "chipIcons";
var CONFIG_KEY_BORDER_PROPERTY = "borderProperty";
var UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]/g;
function sanitizeFilename(name) {
  return name.replace(UNSAFE_FILENAME_CHARS, "");
}

// src/color-utils.ts
var relativeLuminance = (colorCode) => {
  if (!colorCode) {
    throw new Error("Please provide a hex color code");
  }
  const hexRegex = /^#([A-Fa-f0-9]{3}){1,2}$/;
  const isValidHex = hexRegex.test(colorCode);
  if (!isValidHex) {
    throw new Error("Please provide a valid hex code");
  }
  colorCode = colorCode.length === 4 ? colorCode.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3") : colorCode;
  const hex = colorCode.substring(1);
  const [red, green, blue] = [0, 2, 4].map(
    (startIndex) => Number.parseInt(hex.substring(startIndex, startIndex + 2), 16)
  );
  const lum = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return lum < 0.7 ? "dark" : "light";
};

// src/folder-rename.ts
var FILTER_PATH_ARG_PATTERN = /(\(\s*(["']))(.*?)(\2\s*\))/g;
function updateBaseFolderReferences(content, oldPath, newPath) {
  if (!oldPath || oldPath === newPath) return null;
  let changed = false;
  const updated = content.replace(
    FILTER_PATH_ARG_PATTERN,
    (match, pre, _quote, path, post) => {
      let newInnerPath = null;
      if (path === oldPath) {
        newInnerPath = newPath;
      } else if (path.startsWith(oldPath + "/")) {
        newInnerPath = newPath + path.slice(oldPath.length);
      }
      if (newInnerPath === null) return match;
      changed = true;
      return pre + newInnerPath + post;
    }
  );
  return changed ? updated : null;
}

// src/types.ts
var DEFAULT_BOARD_CONFIG = {
  groupBy: "",
  columns: [],
  columnColors: {},
  wipLimits: {},
  cardOpenBehavior: "active",
  cardCoverProperty: "cover",
  tagColors: {},
  chipProperties: [],
  chipColors: {},
  chipFixedColors: {},
  chipShowLabels: {},
  chipIcons: {},
  borderProperty: ""
};
//# sourceMappingURL=index.cjs.map
