# Triage Labels

The skills speak in terms of five canonical triage roles, plus a PRD/specification parent label. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |
| PRD / specification parent | `prd`                | Parent PRD/specification issue           |

When a skill mentions a role, use the corresponding label string from this table.

## Collaboration expectations

`ready-for-human` means the human is expected to lead the work session in the
vast majority of scenarios. Treat these issues as decision, judgment, product,
or implementation tasks that are not fully delegated to an AFK agent.

When working on a `ready-for-human` issue:

- Read the issue, parent PRD, comments, and relevant codebase context first.
- Summarize the context back to the human before proposing changes.
- Ask how the human wants to proceed before creating, editing, or committing
  files.
- Do not start making code or documentation changes just because the next step
  is obvious to the agent.

If a `ready-for-human` issue were meant to be picked up and changed
autonomously, it should be labeled `ready-for-agent` instead.

Edit the right-hand column to match whatever vocabulary you actually use.
