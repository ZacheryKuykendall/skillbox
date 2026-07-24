# CLI Reference

Complete reference for the `skillbox` command.

---

## Invocation

Inside this repository:

```powershell
pnpm skillbox <command>
```

```bash
pnpm skillbox <command>
```

From another directory, call the binary directly:

```powershell
node C:\PersonalProjects\skillbox\packages\cli\bin\skillbox.js <command>
```

```bash
node ~/skillbox/packages/cli/bin/skillbox.js <command>
```

## Global options

| Option              | Description                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `--registry <path>` | Path to the resource catalog. Defaults to `SKILLBOX_REGISTRY`, then the repository's `registry/`. |
| `--project <path>`  | Project root. Defaults to the nearest ancestor containing `.skillbox/`.                           |
| `--json`            | Machine-readable JSON output.                                                                     |
| `--no-color`        | Disable color. Also honored via `NO_COLOR`.                                                       |
| `-h, --help`        | Show help.                                                                                        |
| `-V, --version`     | Show version.                                                                                     |

## Environment variables

| Variable            | Effect                               |
| ------------------- | ------------------------------------ |
| `SKILLBOX_REGISTRY` | Default catalog path                 |
| `SKILLBOX_PROJECT`  | Default project root                 |
| `NO_COLOR`          | Disables color when set to any value |

## Exit codes

| Code | Meaning                                                             |
| ---- | ------------------------------------------------------------------- |
| `0`  | Success                                                             |
| `1`  | General runtime error                                               |
| `2`  | Validation failure                                                  |
| `3`  | Resource not found, or no version satisfies the request             |
| `4`  | Conflict: destination file conflict, or already-initialized project |
| `5`  | Project not initialized                                             |
| `6`  | Dependency error: missing, circular, or version conflict            |
| `7`  | Usage error: unknown command, bad arguments                         |

Every failure exits non-zero. Scripts should test the exit code rather than parse output; use `--json` for structured results.

---

## skillbox init

Create `.skillbox/` with a project manifest and an empty lockfile.

```powershell
skillbox init [--name <name>] [--force]
```

| Option          | Description                                   |
| --------------- | --------------------------------------------- |
| `--name <name>` | Project name. Defaults to the directory name. |
| `--force`       | Overwrite existing configuration.             |

Refuses to overwrite an existing configuration without `--force`, and changes nothing when it refuses. Exits `4` if already initialized.

```text
Initialized Skillbox project.

  Created .skillbox/skillbox.yaml
  Created .skillbox/skillbox.lock

Next: skillbox search <query> to find resources.
```

---

## skillbox search

Search the catalog by name, namespace, description, kind, and tags.

```powershell
skillbox search [query] [--kind <kind>] [--tag <tag>] [--limit <n>]
```

| Option          | Description                 |
| --------------- | --------------------------- |
| `--kind <kind>` | Filter by kind              |
| `--tag <tag>`   | Filter by tag; repeatable   |
| `--limit <n>`   | Maximum results, default 20 |

Matching is case-insensitive. Name matches rank above description matches. An empty query lists everything. Finding nothing is not an error — it exits `0` with an empty result.

Does not require an initialized project.

---

## skillbox list

List resources installed in the current project.

```powershell
skillbox list [--kind <kind>]
```

Shows requested and resolved versions, and flags resources with validation problems.

```text
2 resources installed

  skillbox/code-review            prompt    requested ^0.1.0    resolved 0.1.0    ok
  skillbox/implementation-planner  agent     requested ^0.1.0    resolved 0.1.0    modified
```

The status column is `ok`, `modified` (a file's digest no longer matches), `missing` (an installed file is gone), or `invalid` (the resource no longer validates). Run `skillbox doctor` for detail.

Exits `5` if the project is not initialized.

---

## skillbox inspect

Show everything a resource declares.

```powershell
skillbox inspect <resource>
```

`<resource>` is a reference: `skillbox/code-review`, `skillbox/code-review@0.1.0`, or `skillbox/code-review@^0.1.0`.

Shows manifest details, files, inputs and outputs, dependencies, permissions, required environment variable names, and the install target.

**Never shows secret values.** Environment variables appear by name with their description only.

Read this before installing anything you did not write. See the [security model](../architecture/security-model.md).

Exits `3` if not found. Does not require an initialized project.

---

## skillbox add

Install a resource and its dependencies.

```powershell
skillbox add <resource> [--target <path>] [--dry-run] [--yes] [--force]
```

| Option            | Description                                                    |
| ----------------- | -------------------------------------------------------------- |
| `--target <path>` | Override the install destination, relative to the project root |
| `--dry-run`       | Show the plan and exit without changing anything               |
| `--yes`           | Skip confirmation                                              |
| `--force`         | Overwrite conflicting files                                    |

Sequence: resolve the reference, resolve dependencies, build a plan, detect conflicts, show the plan with declared permissions, install in dependency order, then update the manifest and lockfile.

```text
Install plan

  skillbox/code-review@0.1.0  prompt
    + .skillbox/prompts/code-review/prompt.md
    + .skillbox/prompts/code-review/README.md

Permissions requested
  model:invoke

Installed 1 resource.
```

Guarantees worth knowing:

- **Nothing is executed.** True for `script` resources too.
- **`--dry-run` is the real code path**, stopped before writing.
- **Conflicts abort before mutation.** Nothing is written when a conflict is found.
- **Failures roll back.** No partial state; the manifest and lockfile are written last.

Exits `3` if not found, `4` on conflict, `5` if not initialized, `6` on a dependency problem.

---

## skillbox remove

Remove an installed resource.

```powershell
skillbox remove <resource> [--force] [--yes]
```

| Option    | Description                                          |
| --------- | ---------------------------------------------------- |
| `--force` | Remove modified files, and remove despite dependents |
| `--yes`   | Skip confirmation                                    |

Deletes only files the lockfile records as owned by that resource. **Refuses to delete a file you modified** unless forced, and refuses to remove a resource another installed resource depends on. Directories left empty are cleaned up; a directory containing unrelated files is left alone.

```text
Cannot remove skillbox/code-review

  1 file has local modifications:
    .skillbox/prompts/code-review/prompt.md

  Use --force to remove it anyway.
```

Exits `4` on modified files, `5` if not initialized, `6` if dependents exist.

---

## skillbox validate

Validate manifests and project configuration.

```powershell
skillbox validate [path] [--strict]
```

| Argument                 | Behavior                                                 |
| ------------------------ | -------------------------------------------------------- |
| omitted                  | Validate the current project and its installed resources |
| a resource directory     | Validate that resource                                   |
| a directory of resources | Validate all resources beneath it                        |

`--strict` treats warnings as errors.

Checks manifest structure, that declared files exist, that the entrypoint exists and is inside the resource directory, that dependency references resolve, and that install targets are relative and confined to the project.

```text
registry/prompts/example/skillbox.yaml

  error  spec.files      Declared file "prompt.md" does not exist.
                         Create the file or remove it from spec.files.
  warn   metadata.tags   Tag "Development" was normalized to "development".

1 error, 1 warning
```

Exits `2` if any error is found, or any warning with `--strict`.

---

## skillbox update

Update installed resources to newer compatible versions.

```powershell
skillbox update [resource] [--dry-run] [--yes]
```

With no argument, considers every installed resource. Respects the range in the project manifest — it will not cross a range boundary. To move to a new major version, edit the manifest and run `add`.

Produces a plan, detects conflicts before changing files, and rewrites the lockfile only after success. Reports when nothing needs updating.

Exits `4` on conflict, `5` if not initialized, `6` on a dependency problem.

---

## skillbox doctor

Diagnose the current project.

```powershell
skillbox doctor [--strict]
```

Checks:

| Check                | Detects                                                       |
| -------------------- | ------------------------------------------------------------- |
| Configuration        | Missing or invalid project manifest                           |
| Lockfile consistency | Manifest and lockfile disagreement                            |
| Missing files        | An installed file that is gone                                |
| Integrity            | A file whose content no longer matches its digest             |
| Dependencies         | Unsatisfied or orphaned entries                               |
| Runtime              | Declared runtime requirements against the current environment |
| Environment          | Required variables that are unset                             |

```text
Skillbox doctor

  ok     Project configuration is valid
  ok     Lockfile is consistent with the project manifest
  warn   1 file has local modifications
           .skillbox/prompts/code-review/prompt.md
           Run skillbox update, or remove and reinstall to restore it.
  warn   Required environment variable is not set
           SKILLBOX_EXAMPLE_API_TOKEN
           Set it in your shell before using skillbox/generic-rest-client.

2 warnings
```

**Environment variables are reported by name only.** `doctor` tests presence; it never reads a value.

Exits `0` if healthy or only warnings, `1` if errors are found, `2` with `--strict` and any warning, `5` if not initialized.

---

## JSON output

Every command supports `--json`:

```powershell
skillbox search review --json
skillbox list --json
skillbox doctor --json
```

Shape:

```json
{
  "ok": true,
  "command": "search",
  "data": {}
}
```

On failure:

```json
{
  "ok": false,
  "command": "add",
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Resource \"skillbox/nonexistent\" was not found in the catalog.",
    "hint": "Run skillbox search to list available resources."
  }
}
```

With `--json`, human-readable output is suppressed and the JSON document goes to stdout, so it is safe to pipe. Exit codes are unchanged.

## Color

Color is applied through Node's built-in `util.styleText` and suppressed automatically when stdout is not a TTY, when `--no-color` is passed, or when `NO_COLOR` is set.
