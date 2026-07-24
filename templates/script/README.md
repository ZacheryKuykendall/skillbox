# skillbox/REPLACE-ME

TODO one line describing what this script does.

## What it does

TODO a short paragraph. Be explicit about side effects: what it reads, what it writes, what it contacts.

## Skillbox does not run this

**Installing a script and running a script are separate actions.** Skillbox copies the file and stops. Nothing is executed during `add`, `validate`, `inspect`, or any other command, and there are no lifecycle hooks.

You run it yourself with the commands below. See the [security model](../../../docs/architecture/security-model.md).

## Arguments

| Name     | Type   | Required | Default | Description |
| -------- | ------ | -------- | ------- | ----------- |
| `--todo` | string | no       | —       | TODO        |
| `--help` | flag   | no       | —       | Show usage  |

## Outputs

| Name   | Type   | Description                                      |
| ------ | ------ | ------------------------------------------------ |
| `TODO` | string | TODO. State whether anything is written to disk. |

## Requirements

TODO, for example "Node.js 20.19 or newer." `skillbox doctor` checks a declared Node requirement against the running version.

## Installation

```powershell
skillbox add skillbox/REPLACE-ME
```

```bash
skillbox add skillbox/REPLACE-ME
```

Installs to `.skillbox/scripts/REPLACE-ME/`.

## Required permissions

| Permission        | Why  |
| ----------------- | ---- |
| `filesystem:read` | TODO |

Declare only what the script does. Permissions are declared by the author and are not enforced by Skillbox in v0.1.0.

## Configuration

TODO, or "None. Behavior is controlled entirely by the arguments."

## Usage

```powershell
node .skillbox/scripts/REPLACE-ME/run.mjs
```

```bash
node .skillbox/scripts/REPLACE-ME/run.mjs
```

### Worked example

TODO show a real invocation and its output.

## Exit codes

| Code | Meaning                    |
| ---- | -------------------------- |
| `0`  | Success                    |
| `1`  | TODO the failure condition |

## Notes

TODO anything a user should know before running it.
