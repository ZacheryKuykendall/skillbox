# skillbox/implementation-planner

An agent that turns a requirement into an ordered plan whose steps can each be verified independently.

## What it does

Reads the existing code before planning, separates gaps it can answer itself from decisions only a human can make, and breaks the work into steps that each leave the repository working. Every step names the files it touches and carries a concrete acceptance check.

It plans and stops. Producing an implementation instead would defeat the purpose, since the value is in the sequencing being reviewable before any code exists.

## Inputs

| Name          | Type   | Required | Description                       |
| ------------- | ------ | -------- | --------------------------------- |
| `requirement` | string | yes      | What needs to be built or changed |
| `constraints` | string | no       | Anything the plan must respect    |

## Outputs

| Name    | Type  | Description                                            |
| ------- | ----- | ------------------------------------------------------ |
| `plan`  | array | Ordered steps, each with files and an acceptance check |
| `risks` | array | What could go wrong, and how the plan reduces it       |

## Dependencies

| Resource               | Version  | Why                                                                                                         |
| ---------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `skillbox/code-review` | `^0.1.0` | The plan's final step is normally a review, and referencing a shared prompt beats restating review criteria |

Installing this agent installs the prompt too.

## Installation

```powershell
skillbox add skillbox/implementation-planner
```

```bash
skillbox add skillbox/implementation-planner
```

Two resources are installed, the dependency first:

```text
.skillbox/
├── agents/implementation-planner/
│   ├── agent.md
│   └── README.md
└── prompts/code-review/
    ├── prompt.md
    └── README.md
```

`skillbox list` shows the prompt marked `(dependency)`. Because of that relationship, removing the prompt on its own is refused:

```powershell
skillbox remove skillbox/code-review
```

```text
error  "skillbox/code-review" is required by 1 installed resource.
       skillbox/implementation-planner

hint   Remove the dependents first, or pass --force.
```

## Required permissions

| Permission        | Why                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `filesystem:read` | The process requires reading existing code, since planning against an imagined codebase produces a change that fights the real one |
| `model:invoke`    | Planning is performed by a language model                                                                                          |

It writes nothing and makes no network requests. Permissions are declared by the author and are not enforced by Skillbox in v0.1.0 — see the [security model](../../../docs/architecture/security-model.md).

## Expected tools

`read-file`, `list-files`, and `search`. These are declared so a host knows what to provide; Skillbox does not supply them.

## Configuration

None.

## Usage

In an AI-assisted editor:

```text
Act as .skillbox/agents/implementation-planner/agent.md.

requirement: add rate limiting to the public API
constraints: must work behind the existing reverse proxy; no new services
```

### Worked example

Given "add a `--verbose` flag to the CLI", it produces something like:

```markdown
## Assumptions

- `--verbose` affects log detail only, not output format. This is the smallest
  reversible reading; a format change would need its own decision.

## Plan

### 1. Add the flag to the program definition

**Files:** `packages/cli/src/run.ts`

Register `--verbose` as a global boolean alongside `--json`, so every command
inherits it rather than each declaring its own.

**Acceptance:** `skillbox --help` lists `--verbose`.

### 2. Thread the flag through the writer

**Files:** `packages/cli/src/output.ts`, `packages/cli/src/context.ts`

Add a `verbose` level to the writer so commands call one method rather than
branching on the flag at each call site.

**Acceptance:** a unit test asserts detail lines are suppressed when the flag is absent.

### 3. Review

**Files:** all changed

Apply `.skillbox/prompts/code-review/prompt.md` to the diff.

**Acceptance:** no high-severity findings.

## Risks

- **Verbose output could leak an environment variable value.** Detail lines often
  print configuration. Step 2 routes everything through the existing writer,
  which has no access to environment values.
```

Note the shape: the review step references the installed prompt rather than restating criteria, and the risk is specific to this change rather than generic.

## Notes

The plan quality depends on the agent actually reading the code. Asked to plan without filesystem access, it will state assumptions about structure it could not verify — those assumptions are worth checking before following the plan.

Ambiguous requirements produce an `Assumptions` section rather than questions. Only decisions genuinely reserved for a human — destructive changes, security trade-offs, anything expensive to reverse — reach `Open questions`.
