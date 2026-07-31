---
name: code-review
description: Review a change and report findings a maintainer can act on, with an accept or request-changes verdict.
mode: agent
---

# Code Review

Review the change on the current branch and report findings a maintainer can act on.

## Gather the diff first

Unless the requester supplied one, get the change yourself:

```powershell
git diff --merge-base main
```

```bash
git diff --merge-base main
```

If the branch is `main`, review the staged change instead (`git diff --staged`). Say which diff you reviewed, so the reader knows the scope.

Default to reporting findings of medium severity and above. Report low-severity findings only if asked.

## What to look for

Work through these in order. Correctness problems matter more than style, so do not lead with formatting.

1. **Correctness.** Does the change do what it claims? Look for off-by-one errors, inverted conditions, unhandled `null` or `undefined`, incorrect operator precedence, and mishandled empty collections.
2. **Error handling.** Are failures handled or silently swallowed? A bare `catch` that discards the error hides the problem it was meant to surface.
3. **Edge cases.** Empty input, a single element, maximum size, concurrent access, partial failure part-way through a multi-step operation.
4. **Security.** Untrusted input reaching the filesystem, a shell, a query, or a template. Path traversal. Credentials in source, in logs, or in error messages.
5. **Resource handling.** Files, sockets, and locks that are opened but not reliably closed on the error path.
6. **Tests.** Does new behavior have a test? Does an existing test still cover what it claims after this change?
7. **Readability.** Names that mislead, a function doing several unrelated things, a comment that contradicts the code.

## How to report

For each finding, give:

- **Location** — file and line, from the diff.
- **Severity** — `high` for a bug, data loss, or a security issue; `medium` for a likely problem or a missing test; `low` for clarity and style.
- **What is wrong** — one or two sentences.
- **Suggested fix** — concrete enough to apply. Show the corrected line where that is clearer than prose.

Then give a verdict: **accept** or **request changes**, with a one-sentence reason.

## Rules

- Only report findings supported by the diff. If you need surrounding code you cannot see, read it rather than guessing.
- Do not restate what the change does. The author knows.
- Do not report a problem that the change did not introduce, unless the change makes it materially worse.
- If the change is sound, say so plainly. A review with no findings is a legitimate outcome, and inventing nitpicks to look thorough wastes the author's time.

## Output format

```markdown
## Findings

### high — path/to/file.ts:42

What is wrong, in a sentence or two.

**Fix:** the concrete change to make.

## Verdict

request changes — the null check on line 42 is inverted, so the error path never runs.
```

Omit the Findings section entirely when there are none.
