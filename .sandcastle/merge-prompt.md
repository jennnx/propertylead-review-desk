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

# Rules

- **DO NOT push.** No `git push`, no `gh pr create`. Local merge only.
- **DO NOT delete the source branch `{{BRANCH}}`.** The orchestrator handles cleanup.
- **DO NOT amend or rewrite any existing commits.** Only add new commits if needed for conflict resolution or post-merge fixes.

# Output

When done, print a short summary:
- Number of commits merged
- Whether there were conflicts (and what you did about them)
- Verification result (pass / which step failed)

Then, **finish your output with a clearly-labeled, copy-pastable cleanup command block** so the user can delete the merged branch themselves if they want. Use exactly this format (replacing nothing — `{{BRANCH}}` is the literal branch name):

```
--------------------------------------------------------------------
To delete the merged branch locally (optional), run:

  git branch -d {{BRANCH}}
--------------------------------------------------------------------
```

Do not run `git branch -d` yourself. Leave that for the user.
