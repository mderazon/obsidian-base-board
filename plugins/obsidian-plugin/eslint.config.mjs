import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";

export default defineConfig([
  {
    ignores: ["**/dist/**", "main.js"],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },

  ...tseslint.configs.recommendedTypeChecked,
  ...(obsidianmd.configs?.recommendedWithLocalesEn || []),
  eslintPluginPrettierRecommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
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
]);
