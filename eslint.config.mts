import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-plugin-prettier/recommended";

export default [
  // ── 全局忽略 ──
  { ignores: ["**/dist/**", "**/node_modules/**", "**/src-tauri/**", "**/gen/**", "**/builder/skill/**", "**/scripts/**"] },

  // ── 基础规则（所有 .ts/.tsx）──
  js.configs.recommended,
  reactHooks.configs.flat.recommended,
  prettier,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];
