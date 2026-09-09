import { fileURLToPath } from "node:url";
import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors tsconfig's `"@/*": ["./*"]`. Without it a test can only reach
  // project modules by relative path, and any real (unmocked) `@/...` import
  // inside the module under test fails to resolve — which is how
  // app/forgot-password/actions.test.ts first failed. Added 2026-09-08.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  // Transform JSX in .tsx modules under test. Vite 8 runs on rolldown/oxc, and
  // oxc follows tsconfig's `"jsx": "preserve"` — correct for `next build`,
  // which does its own JSX transform, but it means a test that imports any
  // .tsx module dies at parse time on the first `<Tag />`. No test needed one
  // until the PDF route's authorization rule had to be pinned, and that rule
  // lives in a route.tsx. Automatic runtime, matching what Next compiles to.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    // Agent worktrees live at .claude/worktrees/<id>/ and are complete copies of
    // the repo on their own branches. Without this exclude a root `vitest run`
    // sweeps every agent's in-progress tests as if they were ours, so unfinished
    // work on another branch reports as a failure on this one. Seen 2026-08-31:
    // 55 test files became 167 and a half-written helper failed the suite.
    exclude: [...defaultExclude, "**/.claude/worktrees/**"],
  },
});
