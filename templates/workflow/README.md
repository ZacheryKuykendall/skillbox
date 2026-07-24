# skillbox/REPLACE-ME

TODO one line describing what process this workflow carries out.

## What it does

TODO a short paragraph. Explain what the gates between steps catch.

## Steps

| Step   | Uses            | Gate before continuing |
| ------ | --------------- | ---------------------- |
| `TODO` | `skillbox/TODO` | TODO                   |

## Inputs

| Name   | Type   | Required | Description |
| ------ | ------ | -------- | ----------- |
| `TODO` | string | yes      | TODO        |

## Outputs

| Name      | Type   | Description |
| --------- | ------ | ----------- |
| `summary` | string | TODO        |

## Dependencies

| Resource        | Version  |
| --------------- | -------- |
| `skillbox/TODO` | `^0.1.0` |

Every `uses` reference must be declared here, or that step's resource will not be installed.

## Installation

```powershell
skillbox add skillbox/REPLACE-ME
```

```bash
skillbox add skillbox/REPLACE-ME
```

This installs the dependencies too. Preview first:

```powershell
skillbox add skillbox/REPLACE-ME --dry-run
```

```bash
skillbox add skillbox/REPLACE-ME --dry-run
```

## Required permissions

| Permission     | Why  |
| -------------- | ---- |
| `model:invoke` | TODO |

The union of its dependencies' permissions, which is what `skillbox add` shows before installing. Permissions are declared by the author and are not enforced by Skillbox in v0.1.0 — see the [security model](../../../docs/architecture/security-model.md).

## Configuration

TODO, or "None. The `with` values in the manifest set each step's defaults."

## Usage

Skillbox does not execute workflows. `workflow.md` is the instruction set; you or an agent follow it.

```text
Follow .skillbox/workflows/REPLACE-ME/workflow.md.

TODO: input value
```

Running one step at a time is often better for substantial work, since it puts a human at each gate.

### Worked example

TODO walk through a real run, showing what each gate catches.

## Notes

TODO whether the workflow is meant to be automated end to end, and why or why not.
