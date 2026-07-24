# skillbox/plan-implement-review

A workflow that composes three other resources into an ordered process: plan, implement, review, document.

## What it does

Sequences four steps with an explicit gate between each. The gates are the point of the workflow — each step exists because skipping it fails in a specific way, and each gate stops the process before that failure compounds.

Planning first makes the sequencing reviewable while changing it is still free. Implementing one step at a time keeps the repository working, so a failure is attributable. Reviewing afterward catches what the author stopped being able to see. Documenting last is the first moment the change is settled enough to describe accurately.

This is also the clearest demonstration of dependency resolution in the catalog: it declares three dependencies, one of which has a dependency of its own.

## Steps

| Step        | Uses                               | Gate before continuing                                               |
| ----------- | ---------------------------------- | -------------------------------------------------------------------- |
| `plan`      | `skillbox/implementation-planner`  | Assumptions match intent; every step has a runnable acceptance check |
| `implement` | `skillbox/implementation-planner`  | Each step's acceptance check passes; repository still works          |
| `review`    | `skillbox/code-review`             | No outstanding high-severity finding                                 |
| `document`  | `skillbox/technical-documentation` | Documentation does not contradict the implementation                 |

## Inputs

| Name          | Type   | Required | Description                       |
| ------------- | ------ | -------- | --------------------------------- |
| `requirement` | string | yes      | What needs to be built or changed |

## Outputs

| Name      | Type   | Description                                              |
| --------- | ------ | -------------------------------------------------------- |
| `summary` | string | What was planned, built, found in review, and documented |

## Dependencies

| Resource                           | Version  |
| ---------------------------------- | -------- |
| `skillbox/implementation-planner`  | `^0.1.0` |
| `skillbox/code-review`             | `^0.1.0` |
| `skillbox/technical-documentation` | `^0.1.0` |

`implementation-planner` itself depends on `code-review`. Both paths reach the same prompt, and it is installed once.

## Installation

```powershell
skillbox add skillbox/plan-implement-review
```

```bash
skillbox add skillbox/plan-implement-review
```

Four resources are installed, dependencies before the resources that need them:

```text
.skillbox/
├── prompts/code-review/
├── skills/technical-documentation/
├── agents/implementation-planner/
└── workflows/plan-implement-review/
```

Preview before committing to it:

```powershell
skillbox add skillbox/plan-implement-review --dry-run
```

```bash
skillbox add skillbox/plan-implement-review --dry-run
```

## Required permissions

| Permission        | Why                                                                      |
| ----------------- | ------------------------------------------------------------------------ |
| `filesystem:read` | Planning, reviewing, and documenting all require reading the actual code |
| `model:invoke`    | Every step is carried out by a language model                            |

The union of its dependencies' permissions, which is what `skillbox add` shows before installing. Nothing here needs `filesystem:write`, `network:outbound`, or `process:spawn`.

Permissions are declared by the author and are not enforced by Skillbox in v0.1.0 — see the security model (docs/architecture/security-model.md in the Skillbox repository).

## Configuration

None. The `with` values in the manifest set the defaults each step runs under: `review` requests `severity: medium` so it reports genuine problems rather than style notes, and `document` defaults to a guide.

Adjust them by editing `workflow.md` after installing. Skillbox records a digest of each installed file, so your edits are detected rather than silently overwritten.

## Usage

Skillbox does not execute workflows. `workflow.md` is the instruction set; you or an agent follow it.

In an AI-assisted editor:

```text
Follow .skillbox/workflows/plan-implement-review/workflow.md.

requirement: add a --verbose flag to the CLI
```

Or run one step at a time, which is often better for a substantial change, since it puts a human at each gate:

```text
Step 1 only, from .skillbox/workflows/plan-implement-review/workflow.md.
requirement: add a --verbose flag to the CLI
```

Then read the plan, correct anything wrong, and continue.

### Worked example

For "add a `--verbose` flag to the CLI", the workflow produces:

1. **Plan** — the planner reads `packages/cli/src/`, notes that global options are declared in one place, and produces three steps: register the flag, thread it through the writer, then review. It records an assumption that `--verbose` affects log detail only, not output format.
2. **Gate** — you read that assumption. If you meant it to change output format, you correct the plan now rather than after two steps of implementation.
3. **Implement** — step one registers the flag; `skillbox --help` lists it. Step two threads it through; a unit test asserts detail lines are suppressed without the flag.
4. **Review** — the prompt reviews `git diff main...HEAD` at medium severity. Suppose it flags that verbose output could print a configuration value. You fix it and re-review.
5. **Document** — the CLI reference gains a `--verbose` row.

## Notes

The workflow is deliberately not automated end to end. The gates are where a human catches a wrong assumption cheaply, and automating past them would remove the only part that prevents a plausible-but-wrong plan from becoming a plausible-but-wrong implementation.

Hosted workflow execution is on the roadmap (docs/roadmap.md in the Skillbox repository) as SBX-118, sequenced after sandboxed execution. Until then, following the steps yourself is the intended use.
