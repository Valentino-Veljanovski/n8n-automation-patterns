import js from "@eslint/js";

const nodeGlobals = {
  Buffer: "readonly",
  console: "readonly",
  process: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  TextEncoder: "readonly",
  TextDecoder: "readonly",
  URL: "readonly",
};

// Globals that n8n injects into a Code node. Only files under nodes/ may use them.
const n8nGlobals = {
  $input: "readonly",
  $json: "readonly",
  $: "readonly",
  $env: "readonly",
  $now: "readonly",
  items: "readonly",
};

export default [
  { ignores: ["node_modules/", "dist/"] },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: nodeGlobals,
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["nodes/**/*.js"],
    languageOptions: { globals: { ...nodeGlobals, ...n8nGlobals } },
  },
];
