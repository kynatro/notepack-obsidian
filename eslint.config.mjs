import globals from 'globals';
import tsparser from "@typescript-eslint/parser";
import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  globalIgnores([
    "src/__tests__/**",
    "src/__mocks__/**",
    "*.config.mjs",
    "*.config.js",
    "scripts/*.js",
    "main.js"
  ]),
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        ...globals.browser,
        ...globals.nodeBuiltin,
      }
    },

    // You can add your own configuration to override or add rules
    rules: {

    },
  },
]);
