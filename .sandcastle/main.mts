// Sequential Reviewer — implement-then-review loop, stacked on one branch
//
// One worktree/branch is created at the start. Each iteration the implementer
// picks an open issue, commits on the shared branch, closes the issue, then
// the reviewer refines in-place on the same branch. Iteration N+1 starts from
// iteration N's HEAD, so dependent issues can build on prior work.
//
// When the loop ends, the sandbox is torn down and a host-side Claude agent
// merges the shared branch into `main` locally (no push).
//
// Usage:
//   npx tsx .sandcastle/main.mts

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_ITERATIONS = Number(process.env.SANDCASTLE_MAX_ITERATIONS ?? 10);

const hooks = {
  sandbox: { onSandboxReady: [{ command: "pnpm install --frozen-lockfile" }] },
};

const copyToWorktree: string[] = [];

// ---------------------------------------------------------------------------
// Single shared sandbox: one branch, one worktree, stacked commits.
// ---------------------------------------------------------------------------

const branch = `sandcastle/sequential-reviewer/${Date.now()}`;
const sandbox = await sandcastle.createSandbox({
  branch,
  sandbox: docker(),
  hooks,
  copyToWorktree,
});

let totalCommits = 0;

try {
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

    // Snapshot HEAD before the implementer runs so the reviewer can be
    // scoped to *only* this iteration's new commits.
    const headBefore = execSync("git rev-parse HEAD", {
      cwd: sandbox.worktreePath,
      encoding: "utf8",
    }).trim();

    // -----------------------------------------------------------------------
    // Phase 1: Implement — RALPH picks one ready-for-agent issue and commits.
    // -----------------------------------------------------------------------
    const implement = await sandbox.run({
      name: "implementer",
      maxIterations: 100,
      agent: sandcastle.claudeCode("claude-opus-4-7"),
      promptFile: "./.sandcastle/implement-prompt.md",
      promptArgs: { ITERATION: String(iteration) },
    });

    // No commits means RALPH found nothing actionable left — stop the loop
    // (don't continue, or we'd spin on an empty queue).
    if (!implement.commits.length) {
      console.log(
        "Implementer made no commits — no more actionable issues. Stopping loop.",
      );
      break;
    }
    totalCommits += implement.commits.length;
    console.log(`Implementer added ${implement.commits.length} commit(s).`);

    // -----------------------------------------------------------------------
    // Phase 2: Review — only the commits the implementer just added.
    // -----------------------------------------------------------------------
    const review = await sandbox.run({
      name: "reviewer",
      maxIterations: 1,
      agent: sandcastle.claudeCode("claude-opus-4-7"),
      promptFile: "./.sandcastle/review-prompt.md",
      promptArgs: {
        BRANCH: branch,
        SINCE: headBefore,
        ITERATION: String(iteration),
      },
    });
    totalCommits += review.commits.length;
    console.log(`Reviewer added ${review.commits.length} commit(s).`);
  }
} finally {
  await sandbox.close();
}

// ---------------------------------------------------------------------------
// Phase 3: Host-side merge agent.
// ---------------------------------------------------------------------------

if (totalCommits === 0) {
  console.log("\nNothing was committed across all iterations. Skipping merge.");
  process.exit(0);
}

console.log(
  `\nAll iterations complete. ${totalCommits} commit(s) on ${branch}.`,
);
console.log("Spawning host Claude to merge into main...\n");

const mergePrompt = readFileSync("./.sandcastle/merge-prompt.md", "utf8")
  .split("{{BRANCH}}")
  .join(branch);

const proc = spawn(
  "claude",
  [
    "-p",
    mergePrompt,
    "--model",
    "claude-opus-4-7",
    "--dangerously-skip-permissions",
  ],
  { stdio: "inherit", cwd: process.cwd() },
);

const exitCode: number = await new Promise((resolve, reject) => {
  proc.on("exit", (code) => resolve(code ?? 1));
  proc.on("error", reject);
});

if (exitCode !== 0) {
  console.error(`\nMerge agent exited with code ${exitCode}.`);
  process.exit(exitCode);
}

console.log("\nMerge agent complete.");
