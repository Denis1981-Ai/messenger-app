import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".next-tauri*/**",
    ".next-tauri /**",
    "**/.next-tauri*/**",
    "**/.next-tauri /**",
    "out/**",
    "build/**",
    "**/src-tauri/target/**",
    "src-tauri/target/**",
    "next-env.d.ts",
    ".codex-artifacts/**",
    "test-results/**",
    "tests/**",
  ]),
]);

export default eslintConfig;
