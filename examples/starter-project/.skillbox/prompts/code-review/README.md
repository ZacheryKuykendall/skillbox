# skillbox/code-review

A prompt that reviews a code change and produces severity-ranked findings with concrete fixes.

## What it does

Given a unified diff, it works through correctness, error handling, edge cases, security, resource handling, tests, and readability in that order — so a real bug is not buried under formatting notes. Each finding carries a location, a severity, and a fix specific enough to apply.

It is instructed to report nothing when the change is sound, rather than inventing nitpicks to appear thorough.

## Inputs

| Name       | Type                          | Required          | Description                            |
| ---------- | ----------------------------- | ----------------- | -------------------------------------- |
| `diff`     | string                        | yes               | The unified diff to review             |
| `context`  | string                        | no                | What the change is meant to accomplish |
| `severity` | enum: `low`, `medium`, `high` | no, default `low` | Lowest severity worth reporting        |

## Outputs

| Name       | Type   | Description                                         |
| ---------- | ------ | --------------------------------------------------- |
| `findings` | array  | Findings with location, severity, and suggested fix |
| `verdict`  | string | An accept or request-changes decision with a reason |

## Installation

```powershell
skillbox add skillbox/code-review
```

```bash
skillbox add skillbox/code-review
```

Installs to `.skillbox/prompts/code-review/`:

```text
.skillbox/prompts/code-review/
├── prompt.md
└── README.md
```

## Required permissions

| Permission     | Why                                    |
| -------------- | -------------------------------------- |
| `model:invoke` | The prompt is sent to a language model |

It reads no files, makes no network requests, and needs no environment variables. Permissions are declared by the author and are not enforced by Skillbox in v0.1.0 — see the security model (docs/architecture/security-model.md in the Skillbox repository).

## Configuration

None. Behavior is controlled entirely through the inputs.

## Usage

Get a diff and pass it with the prompt.

PowerShell:

```powershell
$diff = git diff main...HEAD
$prompt = Get-Content .skillbox/prompts/code-review/prompt.md -Raw
```

bash:

```bash
diff=$(git diff main...HEAD)
prompt=$(cat .skillbox/prompts/code-review/prompt.md)
```

Then send `$prompt` followed by the diff to your model, substituting the inputs. In an AI-assisted editor, reference the file directly:

```text
Follow .skillbox/prompts/code-review/prompt.md and review my staged changes.
Report only medium and high severity findings.
```

### Worked example

Input diff:

```diff
--- a/src/user.ts
+++ b/src/user.ts
@@ -10,6 +10,9 @@ export function getDisplayName(user: User): string {
-  return user.name;
+  if (user.name) {
+    return user.nickname;
+  }
+  return user.name;
 }
```

Expected output:

```markdown
## Findings

### high — src/user.ts:12

The branch returns `user.nickname` when `user.name` is set, which inverts the
apparent intent and returns a field the guard did not check. If `nickname` is
absent this returns `undefined` from a function typed to return `string`.

**Fix:** guard on the field being returned: `if (user.nickname) { return user.nickname; }`

## Verdict

request changes — the guard checks one field and returns another.
```

## Notes

Reviews are only as good as the diff you supply. `git diff main...HEAD` gives the whole branch; `git diff --staged` gives what you are about to commit. Passing a truncated diff will produce findings about code the model cannot actually see, which is why the prompt is instructed to say when it lacks context rather than guess.
