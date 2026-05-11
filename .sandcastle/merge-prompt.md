# TASK

A sandcastle sequential-reviewer run just finished. All of its work is stacked on branch `{{BRANCH}}` (forked from `main`, possibly multiple commits across multiple issues). Merge that branch into `main` **locally**. Do not push.

# Steps

1. Inspect state:
   - `git status` — confirm you are on `main` and the working tree is clean. If not on `main`, run `git checkout main`. If the tree is dirty, stop and report.
   - `git log main..{{BRANCH}} --oneline` and `git diff main...{{BRANCH}} --stat` to see what is about to land.

2. Merge with an explicit merge commit so the run is identifiable in history:

   ```
   git merge --no-ff {{BRANCH}} -m "Merge {{BRANCH}}: sandcastle sequential reviewer run"
   ```

3. If conflicts occur, resolve them so that:
   - Functionality from both sides is preserved
   - Project conventions (`CLAUDE.md`, surrounding code) are respected
   - The result builds and lints cleanly
   After resolving, `git add` the resolved files and `git commit` (no `-m`; let git compose the default merge-conflict message).

4. Run the project's verification commands per `AGENTS.md` / `CLAUDE.md`:
   - `pnpm install`
   - `pnpm lint`
   - `pnpm exec tsc --noEmit`

5. If any verification step fails:
   - If the fix is small and obvious, fix it in a follow-up commit on `main` and re-run verification.
   - If it's not, stop, leave `main` in its current state, report the failure clearly, and do **not** run cleanup.

6. If the merge and verification are good, clean up the Sandcastle branch and worktree yourself.

   Procedure:
   - Run `git worktree list --porcelain` and find any linked worktree whose `branch` is `refs/heads/{{BRANCH}}`.
   - For each matching linked worktree, run `git worktree remove <path>`.
   - If removal fails only because of generated, disposable local files (for example `.pnpm-store/`, `node_modules/`, `.next/`, `dist/`, `coverage/`, or other clearly reproducible build/cache output), you may run `git worktree remove --force <path>`.
   - If removal fails for tracked changes, source files, config changes, credentials, or anything you are less than 90% confident is disposable, stop and ask the user for permission before forcing removal.
   - Run `git worktree prune` to clear stale metadata.
   - Run `git branch -d {{BRANCH}}`.
   - If `git branch -d` refuses because the branch is not merged, stop and report; do not use `-D` unless the user explicitly approves it.
   - Do not print branch or worktree cleanup commands for the user to run. Perform this cleanup yourself and report the result.

7. Check whether any parent PRD is now ready to close.

   In this repo, parent PRDs are open GitHub issues with the `prd` label. Their children declare parenthood by including the text `Parent PRD: #<N>` somewhere in the child issue body (see `docs/agents/issue-tracker.md` for the issue-tracker conventions).

   A PRD is "ready to close" when it has the `prd` label, is still open, and has **zero open child issues** still referencing it.

   Procedure:
   - List every open `prd`-labeled issue (`gh issue list --label prd --state open --json number,title`).
   - For each such PRD number `N`, count open issues whose body contains `Parent PRD: #N`. **Match the number with a word boundary** so PRD `#1` does not accidentally count children of PRD `#10`, `#11`, etc. A `jq` regex like `test("Parent PRD: #N\\b")` works.
   - Any PRD with zero matching open issues is a candidate for closure.

   **Do not close any PRD yourself.** This step is read-only — the user decides.

# Rules

- **DO NOT push.** No `git push`, no `gh pr create`. Local merge only.
- **DO delete the source branch `{{BRANCH}}` after the merge and verification have succeeded.**
- **DO NOT amend or rewrite any existing commits.** Only add new commits if needed for conflict resolution or post-merge fixes.
- **DO NOT close any PRDs yourself**, even if they look ready. The user decides.
- **DO NOT delete reusable Sandcastle prompt templates** such as `.sandcastle/merge-prompt.md`; cleanup means linked worktrees, stale worktree metadata, and the merged local branch.

# Output

When done, print a short summary:
- Number of commits merged
- Whether there were conflicts (and what you did about them)
- Verification result (pass / which step failed)
- Cleanup result (worktree removed/pruned, branch deleted, or why cleanup stopped)
- PRDs ready to close (if any), with the issue numbers and titles

If step 7 found any PRDs ready to close, finish with a clearly labeled optional block listing one `gh issue close` line per ready PRD:

```
--------------------------------------------------------------------
PRDs whose child issues are all closed (optional):

  gh issue close <PRD#> --comment "All child issues complete; closing per sandcastle run."
  gh issue close <PRD#> --comment "All child issues complete; closing per sandcastle run."
--------------------------------------------------------------------
```

If no PRDs are ready to close, omit that second block entirely (do not print an empty one).

Do not run `gh issue close` yourself. Leave PRD closure for the user.
