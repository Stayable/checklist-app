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
  test: {
    // Agent worktrees live at .claude/worktrees/<id>/ and are complete copies of
    // the repo on their own branches. Without this exclude a root `vitest run`
    // sweeps every agent's in-progress tests as if they were ours, so unfinished
    // work on another branch reports as a failure on this one. Seen 2026-08-31:
    // 55 test files became 167 and a half-written helper failed the suite.
    exclude: [...defaultExclude, "**/.claude/worktrees/**"],
  },
});
