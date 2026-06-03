import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Default environment is node. The handful of component tests that
    // need a DOM opt in per-file with a `// @vitest-environment jsdom`
    // docblock at the top of the file. Vitest 4 removed the
    // `environmentMatchGlobs` option we previously used to map
    // `*.test.tsx` → jsdom by glob; the per-file directive is the
    // supported replacement and keeps node as the fast default for
    // the majority (pure-logic) tests.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["tests/e2e/**", "tests/rls/**", "node_modules", ".next"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
});
