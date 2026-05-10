# TASK

Review the **most recent commits** on branch `{{BRANCH}}` (the commits the implementer just added in this iteration) and improve code clarity, consistency, and maintainability while preserving exact functionality.

Earlier commits on this branch have already been reviewed in prior iterations — do not re-review them.

# CONTEXT

## Diff of new commits

!`git diff {{SINCE}}..HEAD`

## New commits being reviewed

!`git log {{SINCE}}..HEAD --oneline`

## Progress log from earlier agents this run

!`cat .sandcastle/progress.txt 2>/dev/null || echo "(empty — you are the first agent in this run)"`

# REVIEW PROCESS

1. **Understand the change**: Read the diff and commits above to understand the intent.

2. **Analyze for improvements**: Look for opportunities to:
   - Reduce unnecessary complexity and nesting
   - Eliminate redundant code and abstractions
   - Improve readability through clear variable and function names
   - Consolidate related logic
   - Remove unnecessary comments that describe obvious code
   - Avoid nested ternary operators - prefer switch statements or if/else chains
   - Choose clarity over brevity - explicit code is often better than overly compact code

3. **Check correctness**:
   - Does the implementation match the intent? Are edge cases handled?
   - Are new/changed behaviours covered by tests?
   - Are there unsafe casts, `any` types, or unchecked assumptions?
   - Does the change introduce injection vulnerabilities, credential leaks, or other security issues?

4. **Maintain balance**: Avoid over-simplification that could:
   - Reduce code clarity or maintainability
   - Create overly clever solutions that are hard to understand
   - Combine too many concerns into single functions or components
   - Remove helpful abstractions that improve code organization
   - Make the code harder to debug or extend

5. **Apply project standards**: Follow the coding standards defined in @.sandcastle/CODING_STANDARDS.md

6. **Preserve functionality**: Never change what the code does - only how it does it. All original features, outputs, and behaviors must remain intact.

# EXECUTION

If you find improvements to make:

1. Make the changes directly on this branch
2. Run the project's verification commands (as defined in CLAUDE.md / AGENTS.md) to ensure nothing is broken
3. Commit describing the refinements (use a clear, non-`RALPH:` prefix so the commit is distinguishable from the implementer's work)

If the code is already clean and well-structured, do nothing.

# Before you sign off

Append a brief entry to `.sandcastle/progress.txt` so the next agent in this run has context. Format:

```
[reviewer iter {{ITERATION}}] <one-line summary of refinements (or "no changes needed")>
  - <optional pointer the next agent might want to know>
```

Rules for the entry:
- 1–3 lines total. Brief and factual.
- Mention any structural changes you made that the next implementer should be aware of (renamed exports, extracted helpers, etc.).
- Do **not** instruct future agents how to do their job.
- Do **not** add filler or thanks.

Use `>>` to append, never `>` (don't overwrite earlier entries).

# Done

Emit **exactly one** of these completion signals when you finish, then stop:

- `<promise>NEXT</promise>` — your normal exit signal. Use this whether you made refinement commits or decided no changes were needed.

- `<promise>COMPLETE</promise>` — emit this only if the diff range `{{SINCE}}..HEAD` turned out to be empty (i.e. the implementer made no commits this iteration). This is unusual — the orchestrator only invokes you when the implementer has produced commits — but emit it if you find yourself in that state.
