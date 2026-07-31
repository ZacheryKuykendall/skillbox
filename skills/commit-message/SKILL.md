---
name: commit-message
description: Write a commit message that explains why a change was made. Use when committing staged work, rewording a commit, or drafting a message for a diff.
---

# Commit Message

Write a commit message a reviewer can use six months from now, when nobody remembers the conversation that produced the change.

## Process

### 1. Read the actual change

Never write a message from the conversation alone. Read the diff:

```powershell
git diff --staged
```

```bash
git diff --staged
```

If nothing is staged, read the unstaged diff and say which files you are describing. Do not stage files on the author's behalf without being asked.

### 2. Match the repository's existing style

Read the last several messages before inventing a format:

```powershell
git log --oneline -15
```

```bash
git log --oneline -15
```

If the history uses Conventional Commits, follow it. If it uses plain sentences, follow that instead. A repository with one consistent style is worth more than a repository with your preferred style.

### 3. Work out why, not what

The diff already shows what changed. A message that restates it adds nothing.

Ask what the change makes possible, or what it stops going wrong. That is the subject line. Reach for the body when the reasoning would not be obvious to someone reading the diff cold.

## Format

```
<type>(<scope>): <what this enables, in the imperative>

<Why the change was needed. What was going wrong, or what was not
possible before. Wrap at 72 characters.>

<Any consequence a reader needs: a behaviour change, a required
migration, a follow-up that was deliberately deferred.>
```

Pick the type from what the change actually does, not from how it feels:

| Type       | Use when                                                       |
| ---------- | -------------------------------------------------------------- |
| `feat`     | A capability exists that did not exist before                  |
| `fix`      | Behaviour that was wrong is now correct                        |
| `docs`     | Only documentation changed                                     |
| `refactor` | Behaviour is unchanged and the structure improved              |
| `test`     | Only tests changed                                             |
| `chore`    | Tooling, configuration, or dependencies                         |
| `perf`     | Measurably faster or lighter, with the measurement in the body |

## Rules

- Imperative mood in the subject: "add", not "added" or "adds".
- No trailing period on the subject. Keep it under 72 characters.
- One logical change per commit. If the subject needs "and", consider two commits.
- A breaking change gets a `!` before the colon and a `BREAKING CHANGE:` footer explaining what a consumer must do.
- Never describe a change you have not read in the diff.
- Never claim a test passes unless it was run.
- Omit the body when the subject genuinely says everything. A body restating the subject wastes the reader's attention.
- Do not credit tools or assistants in the message. It tells a future reader nothing about the code.

## Example

A weak message and a useful one for the same diff:

```
# Weak: restates the diff
fix: change timeout from 30 to 60 in client.ts

# Useful: explains why
fix(client): raise request timeout to 60s

The 30s timeout was below the p99 latency of the upstream search
endpoint, so roughly one request in a hundred failed for reasons
unrelated to the request itself. 60s sits above the observed p99
with headroom.
```
