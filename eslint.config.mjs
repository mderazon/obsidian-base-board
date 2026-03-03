import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";

export default defineConfig([
  // ---------------------------------------------------------------------------
  // Global ignores — never lint build outputs
  // ---------------------------------------------------------------------------
  {
    ignores: ["**/dist/**", "main.js"],
  },

  // ---------------------------------------------------------------------------
  // Shared: TypeScript type-checked rules + Prettier — all TS source files
  // projectService auto-discovers the correct tsconfig.json per file:
  //   src/            → tsconfig.json (root)
  //   mcp-server/src/ → mcp-server/tsconfig.json
  // ---------------------------------------------------------------------------
  ...tseslint.configs.recommendedTypeChecked,
  // Obsidian plugin linting — checks Obsidian API patterns.
  // Safe to run on mcp-server too: the rules only fire when Obsidian APIs are used.
  ...(obsidianmd.configs?.recommendedWithLocalesEn || []),
  eslintPluginPrettierRecommended,
  {
    files: ["src/**/*.ts", "mcp-server/src/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parser: tsparser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-deprecated": "error",
    },
  },

  // ---------------------------------------------------------------------------
  // MCP server — Node.js package, not Obsidian plugin
  // ---------------------------------------------------------------------------
  {
    // The MCP server is pure Node.js — importing built-in modules is correct.
    // The `import/no-nodejs-modules` rule is from eslint-plugin-obsidianmd
    // which targets Obsidian plugin code (browser/Electron context).
    files: ["mcp-server/src/**/*.ts"],
    rules: {
      "import/no-nodejs-modules": "off",
      // Rule targets Obsidian plugin code using Vault#configDir;
      // the MCP server handles XDG/snap paths for the CLI subprocess.
      "obsidianmd/hardcoded-config-path": "off",
    },
  },
  {
    // node:test's describe() and it() return Promises managed by the test runner.
    // Awaiting them is not idiomatic and causes issues; suppress the warning.
    files: ["mcp-server/src/tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
]);
