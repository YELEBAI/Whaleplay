import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";

export default [
  // ── 全局忽略 ──
  { ignores: ["**/dist/**", "**/node_modules/**", "**/src-tauri/**", "**/gen/**"] },

  // ── 基础规则（所有 .ts/.tsx）──
  js.configs.recommended,
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

  // ── React 规则（仅 .tsx）──
  {
    files: ["**/*.tsx"],
    ...pluginReact.configs.flat.recommended,
    plugins: {
      "react-hooks": pluginReactHooks,
    },
    settings: {
      // 和 .eslintrc 里写的位置一模一样，不是嵌套在 rules 里
      react: { version: "detect" },
    },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
