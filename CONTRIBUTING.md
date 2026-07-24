# Contributing to Skillbox

Thanks for helping build Skillbox. This guide covers contributing **code**. To contribute a **resource** to the catalog, read [docs/guides/contributing-a-resource.md](docs/guides/contributing-a-resource.md) instead.

## Before you start

Read these in order:

1. [AGENTS.md](AGENTS.md) — how work is organized, including rules that apply to humans and AI agents alike.
2. [docs/TASKS.md](docs/TASKS.md) — the canonical task ledger. Find or add a task before you write code.
3. [docs/architecture/overview.md](docs/architecture/overview.md) — how the packages fit together.

## Prerequisites

- Node.js 20.19 or newer. Node 24 is what CI uses.
- pnpm 10. Enable it with `corepack enable pnpm` if you do not have it.
- git.

## Setup

PowerShell:

```powershell
git clone <repository-url> skillbox
cd skillbox
pnpm install
pnpm build
```

bash:

```bash
git clone <repository-url> skillbox
cd skillbox
pnpm install
pnpm build
```

## Development commands

PowerShell:

```powershell
pnpm lint            # ESLint, zero warnings tolerated
pnpm typecheck       # tsc --noEmit across the workspace
pnpm test            # Vitest, all packages
pnpm test:coverage   # Vitest with the 90% coverage gate
pnpm build           # tsc -b over project references
pnpm format          # apply Prettier
pnpm format:check    # verify formatting
pnpm validate:registry   # validate every catalog resource
```

bash:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm format
pnpm format:check
pnpm validate:registry
```

To run one package's tests, use a filter:

```powershell
pnpm --filter @skillbox/core test
```

```bash
pnpm --filter @skillbox/core test
```

## Where code belongs

The dependency direction is strict: `cli` depends on `core`, `core` depends on `schema`. Never reverse it.

| Change | Package |
| --- | --- |
| A manifest field, validation rule, or kind | `packages/schema` |
| Discovery, resolution, planning, installation, lockfiles | `packages/core` |
| A command, flag, or anything printed to a terminal | `packages/cli` |
| A shared fixture or test helper | `packages/testing` |

Business logic does not belong in the CLI. If a command grows a decision, move that decision into `core` and let the command present the result. `core` must not write to stdout or import anything from `cli`.

## Testing requirements

- Every new behavior needs at least one happy-path test and one edge-case test.
- Coverage is gated at **90%** for lines, statements, functions, and branches repository-wide. New or modified files should reach at least 80%. CI fails below the gate.
- Filesystem tests must run in a temporary directory. Use the helpers in `@skillbox/testing`; never write into the repository tree.
- Prefer explicit assertions over snapshots so a failure explains itself.
- Security-relevant changes need a test for the vector they address. See [docs/architecture/security-model.md](docs/architecture/security-model.md) for the required list.

Do not report a test as passing unless you ran it.

## Architectural decisions

Choosing a technology, defining a file format, moving a security boundary, or making any decision that would be costly to reverse requires an ADR in [docs/architecture/decisions/](docs/architecture/decisions/README.md).

Never edit an accepted ADR to change its decision. Write a new ADR that supersedes it and update the old one's status.

## Task tracking

Every meaningful change maps to an `SBX-###` task in [docs/TASKS.md](docs/TASKS.md).

- Add the task before implementing, including acceptance criteria.
- Mark it `[x]` only when implementation, tests, documentation, and completion evidence are all in place.
- Any `TODO` you leave in code must cite a task: `// TODO(SBX-041): Add remote registry authentication.`

Untracked TODOs will be rejected in review.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
feat(core): detect circular dependencies during graph construction
fix(cli): return exit code 2 when validation fails
docs(architecture): record the lockfile determinism decision
test(core): cover UNC path rejection
chore(deps): pin typescript to 5.9.3
```

Reference the task in the body where it adds context:

```text
feat(schema): add compatibility constraints to the shared spec

Implements SBX-032.
```

## Pull requests

Fill in [the template](.github/PULL_REQUEST_TEMPLATE.md). A PR is ready for review when:

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` all pass.
- Coverage meets the gate.
- Documentation affected by the change is updated in the same PR.
- The task ledger is updated.
- No secrets, credentials, tokens, or private keys were added.
- No known failure is hidden.

Keep PRs small and coherent. Do not mix unrelated cleanup into a feature change.

## Security

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md).

## License

Contributions are licensed under the [MIT License](LICENSE).
