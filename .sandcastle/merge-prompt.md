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

4. Run the project's verification commands per `CLAUDE.md`:
   - `pnpm install`
   - `pnpm lint`
   - `pnpm exec tsc --noEmit`

5. If any verification step fails:
   - If the fix is small and obvious, fix it in a follow-up commit on `main` and re-run verification.
   - If it's not, stop, leave `main` in its current state, and report the failure clearly.

6. Check whether any parent PRD is now ready to close.

   In this repo, parent PRDs are open GitHub issues with the `prd` label. Their children declare parenthood by including the text `Parent PRD: #<N>` somewhere in the child issue body (see `docs/agents/issue-tracker.md` for the issue-tracker conventions).

   A PRD is "ready to close" when it has the `prd` label, is still open, and has **zero open child issues** still referencing it.

   Procedure:
   - List every open `prd`-labeled issue (`gh issue list --label prd --state open --json number,title`).
   - For each such PRD number `N`, count open issues whose body contains `Parent PRD: #N`. **Match the number with a word boundary** so PRD `#1` does not accidentally count children of PRD `#10`, `#11`, etc. A `jq` regex like `test("Parent PRD: #N\\b")` works.
   - Any PRD with zero matching open issues is a candidate for closure.

   **Do not close any PRD yourself.** This step is read-only — the user decides.

# Rules

- **DO NOT push.** No `git push`, no `gh pr create`. Local merge only.
- **DO NOT delete the source branch `{{BRANCH}}`.** The orchestrator handles cleanup.
- **DO NOT amend or rewrite any existing commits.** Only add new commits if needed for conflict resolution or post-merge fixes.
- **DO NOT close any PRDs yourself**, even if they look ready. The user decides.

# Output

When done, print a short summary:
- Number of commits merged
- Whether there were conflicts (and what you did about them)
- Verification result (pass / which step failed)
- PRDs ready to close (if any), with the issue numbers and titles

Then finish your output with **clearly-labeled, copy-pastable cleanup command blocks** so the user can run them manually if they want.

Always emit the branch-delete block. Use exactly this format (`{{BRANCH}}` is the literal branch name):

```
--------------------------------------------------------------------
To delete the merged branch locally (optional), run:

  git branch -d {{BRANCH}}
--------------------------------------------------------------------
```

If step 6 found any PRDs ready to close, also emit a second block listing one `gh issue close` line per ready PRD:

```
--------------------------------------------------------------------
PRDs whose child issues are all closed (optional):

  gh issue close <PRD#> --comment "All child issues complete; closing per sandcastle run."
  gh issue close <PRD#> --comment "All child issues complete; closing per sandcastle run."
--------------------------------------------------------------------
```

If no PRDs are ready to close, omit that second block entirely (do not print an empty one).

Do not run `git branch -d` or `gh issue close` yourself. Leave both for the user.
