import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Not application code — reference material that is never imported by src/**:
    // the Claude Design handoff bundle and the original standalone prototypes
    // that the Next.js implementation was ported from.
    "src/design/**",
    "spirograph-renderer.js",
    "dimension-prompt.js",
  ]),
]);

export default eslintConfig;
