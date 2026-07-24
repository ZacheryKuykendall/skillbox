# skillbox/project-summary

A script that summarizes a project's structure and file counts as a Markdown report.

## What it does

Walks a directory to a chosen depth and prints a Markdown report: a directory tree and a table of file counts by extension. Skips `node_modules`, `.git`, build output, and virtual environments, since those dominate the counts without describing the project.

Useful for orienting in an unfamiliar repository, or for pasting into an issue to describe layout.

## Skillbox does not run this

**Installing a script and running a script are separate actions.** Skillbox copies the file and stops. Nothing is executed during `add`, `validate`, `inspect`, or any other command, and there are no lifecycle hooks.

You run it yourself, deliberately, with the commands below. See the [security model](../../../docs/architecture/security-model.md) for why this is a design guarantee rather than a default that could be changed.

## Arguments

| Name      | Type   | Required | Default           | Description                          |
| --------- | ------ | -------- | ----------------- | ------------------------------------ |
| `--root`  | path   | no       | working directory | Directory to summarize               |
| `--depth` | number | no       | 3                 | How many directory levels to descend |
| `--help`  | flag   | no       | —                 | Show usage                           |

## Outputs

| Name     | Type   | Description                                  |
| -------- | ------ | -------------------------------------------- |
| `report` | string | A Markdown report written to standard output |

Nothing is written to disk. Redirect the output if you want a file.

## Requirements

Node.js 20.19 or newer. `skillbox doctor` checks this against your running version and warns if it is not satisfied.

## Installation

```powershell
skillbox add skillbox/project-summary
```

```bash
skillbox add skillbox/project-summary
```

Installs to `.skillbox/scripts/project-summary/`:

```text
.skillbox/scripts/project-summary/
├── summarize.mjs
└── README.md
```

## Required permissions

| Permission        | Why                                          |
| ----------------- | -------------------------------------------- |
| `filesystem:read` | It reads directory entries to build the tree |

It does not declare `filesystem:write`, `network:outbound`, or `process:spawn`, because it does none of those things. Permissions are declared by the author and are not enforced by Skillbox in v0.1.0.

## Configuration

None. Behavior is controlled entirely by the arguments.

## Usage

Run it yourself:

```powershell
node .skillbox/scripts/project-summary/summarize.mjs
node .skillbox/scripts/project-summary/summarize.mjs --depth 2
node .skillbox/scripts/project-summary/summarize.mjs --root packages/core --depth 1
```

```bash
node .skillbox/scripts/project-summary/summarize.mjs
node .skillbox/scripts/project-summary/summarize.mjs --depth 2
node .skillbox/scripts/project-summary/summarize.mjs --root packages/core --depth 1
```

Save the report:

```powershell
node .skillbox/scripts/project-summary/summarize.mjs > STRUCTURE.md
```

```bash
node .skillbox/scripts/project-summary/summarize.mjs > STRUCTURE.md
```

### Worked example

```powershell
node .skillbox/scripts/project-summary/summarize.mjs --root packages/schema --depth 2
```

````markdown
# Project summary: schema

11 files across 2 extensions.

## Structure

```text
src/
  constants.ts
  errors.ts
  identifier.ts
  ...
```
````

## Files by extension

| Extension | Count |
| --------- | ----- |
| `.ts`     | 10    |
| `.json`   | 1     |

```

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Report written to standard output |
| `1` | `--root` is not a directory, or `--depth` is not a positive whole number |

## Notes

The script is marked `executable: false`, so it is copied without an executable bit on POSIX. Invoke it through `node` rather than directly. A shebang is present so that making it executable yourself works, but Skillbox does not do that for you.

Hidden directories are skipped, with `.skillbox` deliberately excepted so a report shows what Skillbox has installed.
```
