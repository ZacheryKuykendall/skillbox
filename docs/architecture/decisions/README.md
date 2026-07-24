# Architectural Decision Records

An ADR captures a decision that would be expensive to reverse, along with the context that made it reasonable. Reading the context later is usually more valuable than reading the decision.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](ADR-0001-monorepo-structure.md) | Monorepo structure and toolchain | Accepted |
| [0002](ADR-0002-resource-manifest-format.md) | Resource manifest format | Accepted |
| [0003](ADR-0003-local-registry-first.md) | Local registry first | Accepted |
| [0004](ADR-0004-lockfile-design.md) | Lockfile design and determinism | Accepted |
| [0005](ADR-0005-security-model.md) | Deny-by-default security model | Accepted |
| [0006](ADR-0006-build-orchestration.md) | Build orchestration and dependency restraint | Accepted |
| [0007](ADR-0007-typescript-version-pin.md) | TypeScript version pin | Accepted |

## When to write one

Write an ADR when you:

- Choose a language, framework, library, or tool.
- Define or change a file format or wire protocol.
- Establish or move a security boundary.
- Pick a structural pattern that other code will follow.
- Decline an obvious option for a non-obvious reason.
- Make a call on incomplete information and want the assumption recorded.

Do not write one for an implementation detail with no downstream consequence, or to restate something already normative in [resource-model.md](../resource-model.md).

## Format

Filename: `ADR-####-kebab-case-title.md`, numbered sequentially and never reused.

Required sections:

```markdown
# ADR-####: Title

- **Status:** Proposed | Accepted | Superseded by ADR-#### | Deprecated
- **Date:** YYYY-MM-DD
- **Tasks:** SBX-###

## Context
## Decision
## Alternatives considered
## Consequences
## Follow-up work
```

## Changing a decision

Never edit an accepted ADR to change what it decided. The record of a wrong decision and the reasoning behind it is the useful part.

Instead:

1. Write a new ADR that states the new decision and references the old one.
2. Set the old ADR's status to `Superseded by ADR-####`.
3. Update this index.
4. Update any documentation that relied on the old decision.
