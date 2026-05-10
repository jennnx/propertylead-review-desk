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
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

// Path of the per-agent log file sandcastle will append to. Mirrors
// sandcastle's own buildLogFilename so our banner lands in the same file
// the agent writes to (see node_modules/@ai-hero/sandcastle/dist/run.js).
const logDir = join(process.cwd(), ".sandcastle", "logs");
mkdirSync(logDir, { recursive: true });
const sanitizedBranch = branch.replace(/[/\\:*?"<>|]/g, "-");

// Prepend our own banner to the per-agent log so an operator reading the
// file knows which outer iteration this session belongs to. Sandcastle's
// own "Iteration N/M" header still appears below this — but that counter
// is *Claude Code Turns within this session*, not a count of issues.
function writeOuterIterationBanner(
  agentName: "implementer" | "reviewer",
  iteration: number,
) {
  const logPath = join(logDir, `${sanitizedBranch}-${agentName}.log`);
  const banner = [
    "",
    "========================================================================",
    `  Outer iteration ${iteration} of ${MAX_ITERATIONS} — ${agentName}`,
    `  Note: the "Iteration N/M" line below counts Claude Code Turns within`,
    `  this session (bounded by maxIterations on sandbox.run), NOT issues.`,
    "========================================================================",
    "",
  ].join("\n");
  appendFileSync(logPath, banner);
}

let totalCommits = 0;

try {
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    console.log(
      `\n=== Outer iteration ${iteration}/${MAX_ITERATIONS} ===\n`,
    );

    // Snapshot HEAD before the implementer runs so the reviewer can be
    // scoped to *only* this iteration's new commits.
    const headBefore = execSync("git rev-parse HEAD", {
      cwd: sandbox.worktreePath,
      encoding: "utf8",
    }).trim();

    // -----------------------------------------------------------------------
    // Phase 1: Implement — RALPH picks one ready-for-agent issue and commits.
    // -----------------------------------------------------------------------
    writeOuterIterationBanner("implementer", iteration);
    const implement = await sandbox.run({
      name: "implementer",
      maxIterations: 20,
      agent: sandcastle.claudeCode("claude-opus-4-7"),
      promptFile: "./.sandcastle/implement-prompt.md",
      promptArgs: { ITERATION: String(iteration) },
      completionSignal: [
        "<promise>NEXT</promise>",
        "<promise>COMPLETE</promise>",
      ],
    });

    // COMPLETE = no actionable issues left in the queue → end the run.
    // No signal at all = budget exhausted without RALPH deciding → bail
    // defensively rather than spin.
    if (implement.completionSignal !== "<promise>NEXT</promise>") {
      console.log(
        implement.completionSignal === "<promise>COMPLETE</promise>"
          ? "Implementer signaled COMPLETE — no actionable issues remaining. Stopping loop."
          : "Implementer exhausted iteration budget without a completion signal. Stopping loop.",
      );
      break;
    }

    // NEXT with no commits means RALPH picked an issue and got blocked
    // (per the prompt rules, it leaves a comment without closing). Skip
    // the reviewer for this iteration and let the next implementer try.
    if (!implement.commits.length) {
      console.log(
        "Implementer signaled NEXT but produced no commits (likely blocked on the picked issue). Skipping reviewer.",
      );
      continue;
    }
    totalCommits += implement.commits.length;
    console.log(`Implementer added ${implement.commits.length} commit(s).`);

    // -----------------------------------------------------------------------
    // Phase 2: Review — only the commits the implementer just added.
    // -----------------------------------------------------------------------
    writeOuterIterationBanner("reviewer", iteration);
    const review = await sandbox.run({
      name: "reviewer",
      maxIterations: 20,
      agent: sandcastle.claudeCode("claude-opus-4-7"),
      promptFile: "./.sandcastle/review-prompt.md",
      promptArgs: {
        BRANCH: branch,
        SINCE: headBefore,
        ITERATION: String(iteration),
      },
      completionSignal: [
        "<promise>NEXT</promise>",
        "<promise>COMPLETE</promise>",
      ],
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
