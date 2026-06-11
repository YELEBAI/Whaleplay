import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  // ── 全局忽略 ──
  { ignores: ["**/dist/**", "**/node_modules/**", "**/src-tauri/**", "**/gen/**", "**/src/features/character/builder/skill/**"] },

  // ── 基础规则（所有 .ts/.tsx）──
  js.configs.recommended,
  reactHooks.configs.flat.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];
