---
name: feature-review
description: Review a design-heavy feature before commit. Use when a pretool hook stops git commit because the staged diff is large or architecture-sensitive.
---

# Feature Review

Review the current session's feature work before the user decides whether to commit manually.

## Inputs

- Original user request and accepted scope from the current session and Engram.
- PRD or design notes if `/to-prd` was used.
- `CONTEXT.md` and ADRs if present.
- Staged diff and relevant unstaged changes.
- Test and verification evidence.

## Process

1. Recover task provenance using Engram MCP tools and the current conversation.
2. Inspect `git diff --cached`; use `hunk diff` if the diff is easier to review visually.
3. Check:
   - request fit
   - scope control
   - correctness
   - architecture and module locality
   - safety and protected local state
   - test coverage proportional to risk
4. Report findings ordered by severity.
5. Save the review to Engram so the pretool hook can detect it on the next commit attempt:
   - `mem_save` with `topic_key: "review/last"`, `type: "decision"`, title `"Feature review: <pass|warn|block>"`, content = the full findings from the Output section below.
   - This is an upsert — repeated reviews overwrite the previous record rather than accumulating noise.

## Output

Use:

```md
## Verdict
pass | warn | block

## Findings
- severity, file if relevant, issue, required action

## Test Evidence
- commands/results or missing evidence

## Commit Advice
- whether the user should commit manually, wait, or request fixes
```

Do not commit. The user commits manually if they accept the review.
