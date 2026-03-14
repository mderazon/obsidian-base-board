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
  //   src/                  → tsconfig.json (root)
  //   packages/*/src/       → packages/*/tsconfig.json
  //   packages/core/src/    → packages/core/tsconfig.json
  // ---------------------------------------------------------------------------
  ...tseslint.configs.recommendedTypeChecked,
  // Obsidian plugin linting — checks Obsidian API patterns.
  // Safe to run on mcp-server too: the rules only fire when Obsidian APIs are used.
  ...(obsidianmd.configs?.recommendedWithLocalesEn || []),
  eslintPluginPrettierRecommended,
  {
    files: ["src/**/*.ts", "packages/*/src/**/*.ts"],
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
  // packages/cli, packages/mcp, packages/core — Node.js packages, not Obsidian plugin
  // ---------------------------------------------------------------------------
  {
    // packages/* are pure Node.js — importing built-in modules is correct and
    // expected. The obsidianmd rules target plugin code only.
    files: ["packages/*/src/**/*.ts"],
    rules: {
      "obsidianmd/hardcoded-config-path": "off",
    },
  },
  {
    // node:test's describe() and it() return Promises managed by the test runner.
    files: ["packages/*/src/tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
]);
