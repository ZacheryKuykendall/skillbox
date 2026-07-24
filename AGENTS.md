# AGENTS.md

Operating guide for humans and AI agents working in the Skillbox repository. Read this file first in every session.

---

## 1. Mission

Skillbox is a developer toolkit for packaging, discovering, installing, and reusing software capabilities.

> Everything needed to give software a new ability should be packaged, documented, validated, and stored in one organized box.

A Skillbox resource is a versioned, documented, validated unit of capability. The supported kinds are `prompt`, `skill`, `agent`, `script`, `api`, `workflow`, and `component`.

## 2. Current scope: v0.1.0 MVP

In scope:

1. A standardized resource manifest format (`skillbox.yaml`).
2. A local registry catalog under `registry/`.
3. A CLI with `init`, `search`, `list`, `inspect`, `add`, `remove`, `validate`, `update`, `doctor`.
4. Project-level configuration under `.skillbox/`.
5. Resource installation with dependency tracking and a deterministic lockfile.
6. Manifest and project validation.
7. Contributor and user documentation.
8. Automated tests and CI validation.
9. One working example of every supported resource kind.

Explicitly **out of scope** for v0.1.0, tracked in [docs/roadmap.md](docs/roadmap.md): remote registry, registry REST API, authentication, web portal, editor extensions, hosted or sandboxed execution, package signing, marketplace, telemetry, and enterprise governance.

Do not start roadmap work until the [MVP acceptance criteria](docs/product/requirements.md#mvp-acceptance-criteria) are met.

## 3. Repository structure

```text
skillbox/
├── packages/
│   ├── schema/     Resource kinds, manifest types, validation, JSON Schema
│   ├── core/       Discovery, resolution, planning, installation, lockfile
│   ├── cli/        Command parsing and terminal presentation
│   └── testing/    Reusable fixtures and test helpers
├── registry/       Canonical local resource catalog (by kind)
├── examples/       Demonstration projects
├── templates/      Starting points for new resources
├── docs/           Product, architecture, and guide documentation
├── .cursor/rules/  Repository rules for AI agents
└── .github/        CI workflows and contribution templates
```

Full detail: [docs/architecture/repository-structure.md](docs/architecture/repository-structure.md).

## 4. Package responsibilities

| Package | Owns | Must not |
| --- | --- | --- |
| `@skillbox/schema` | Resource kinds, manifest types, runtime validation, JSON Schema generation, name and version rules, permission and dependency declarations | Touch the filesystem or depend on `core`/`cli` |
| `@skillbox/core` | Catalog discovery, resolution, dependency graphs, install planning, file copying, conflict detection, lockfiles, integrity, variable substitution, safe paths | Import CLI presentation logic or write to stdout |
| `@skillbox/cli` | Command parsing, terminal output, user-facing errors, confirmations, exit codes | Hold business logic that belongs in `core` |
| `@skillbox/testing` | Fixtures for valid and invalid resources, temp project helpers, assertion utilities | Be published as a runtime dependency |

The dependency direction is strictly `cli -> core -> schema`. `testing` may depend on any of them.

## 5. Commands

PowerShell (Windows, primary):

```powershell
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

bash (POSIX):

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Additional commands:

```powershell
pnpm test:coverage      # enforces the 90% coverage gate
pnpm format             # apply Prettier
pnpm format:check       # verify formatting
pnpm schema:generate    # regenerate JSON Schema artifacts
pnpm validate:registry  # validate every catalog resource
```

The commands are identical across shells. Where a difference exists (path separators, `;` vs `&&`, `$env:` vs `export`), documentation shows PowerShell first, then bash.

## 6. Task tracking

[docs/TASKS.md](docs/TASKS.md) is the canonical implementation ledger. Every meaningful unit of work has an `SBX-###` identifier.

Rules:

- Add a task before implementing anything non-trivial.
- Mark a task `[x]` only when implementation is complete, relevant tests pass, documentation is updated, completion evidence is recorded, and no blocker is hidden.
- Never mark a partially implemented task complete.
- Every `TODO` in code must cite a task: `// TODO(SBX-041): Add remote registry authentication.`
- Untracked TODOs are prohibited.

## 7. Documentation requirements

Documentation is part of the implementation, not a cleanup step.

At the start of a phase:

1. Read this file.
2. Read [docs/TASKS.md](docs/TASKS.md).
3. Read the relevant product and architecture documents.
4. Confirm the next task still matches the documented architecture.
5. Update the ledger before starting work.

At the end of a phase:

1. Update all affected documentation.
2. Record architectural decisions.
3. Cross off completed tasks and add completion evidence.
4. Record newly discovered work.
5. Update the roadmap if scope changed.
6. Run the quality gates.

Documentation and implementation must never contradict each other. If they diverge, stop and reconcile them before adding features.

## 8. ADR process

Architectural decisions live in [docs/architecture/decisions/](docs/architecture/decisions/README.md) as `ADR-####-kebab-title.md`.

Each ADR records Status, Context, Decision, Alternatives considered, Consequences, and Follow-up work.

Create an ADR whenever you choose a technology, define a file format, set a security boundary, or make a choice that would be expensive to reverse. Never silently change an accepted ADR — write a new one that supersedes it and update the old one's status.

## 9. Testing expectations

- Unit tests for business logic; focused integration tests for filesystem and CLI behavior.
- All filesystem tests run inside temporary directories created with `fs.mkdtemp`. Never write test artifacts into the repository tree.
- Repository-wide coverage gate: **90% of lines, statements, functions, and branches**. New or modified files must reach at least 80%. CI fails below the gate.
- Provide at least one happy-path and one edge-case test for every new behavior.
- Prefer explicit assertions over snapshots so failures are self-explanatory.
- Never claim a test passed unless it was actually executed. If a test cannot run, report the exact command, the failure, the likely reason, whether it pre-dated the current change, and the task opened to fix it.

## 10. Security expectations

Treat every resource as untrusted. The model is deny-by-default and documented in [docs/architecture/security-model.md](docs/architecture/security-model.md).

Non-negotiable rules:

1. Reject any path that escapes the project directory.
2. Prevent path traversal through every manifest field that reaches the filesystem.
3. Never execute resource code during installation. Installing a script and running a script are separate actions.
4. Show declared permissions before installation.
5. Record required environment variable **names** only; never read, store, or print their values.
6. Never print secret values in output, errors, or logs.
7. Validate that declared entrypoints exist and are inside the resource directory.
8. Detect undeclared files in a resource directory where practical.
9. Record file integrity in the lockfile.
10. No lifecycle hooks such as `postinstall` without an approved, documented security design.

Never commit secrets, credentials, tokens, or private keys.

## 11. Definition of done

A unit of work is done when all of the following hold:

- Implementation matches documented requirements.
- New behavior has automated tests.
- Existing tests still pass.
- `pnpm lint` passes.
- `pnpm typecheck` passes.
- `pnpm build` passes.
- Coverage meets the 90% gate.
- Documentation is updated.
- The task ledger is updated with completion evidence.
- Relevant ADRs are current.
- No untracked TODOs were introduced.
- No secrets were added.
- No known failure is hidden.

## 12. Prohibited behaviors

Do not:

- Invent product requirements without documenting them.
- Start optional or roadmap features before MVP acceptance criteria are met.
- Replace working technology without an ADR.
- Create a second system that solves a problem an existing one already solves.
- Rename a core concept without updating every affected document.
- Perform a large refactor while unrelated tests are failing.
- Hide failures or claim tests passed when they were not run.
- Create speculative abstractions with no current caller.
- Add a dependency for convenience without evaluating necessity.
- Store secrets, credentials, tokens, or private keys in the repository.
- Hard-code author names, company names, licensing terms, registry domains, or legal details the user has not provided.

When information is missing, choose the smallest reversible assumption and record it as an ADR. Ask a human only when the decision is destructive, legally sensitive, security-critical, expensive to reverse, dependent on unavailable credentials, or fundamentally product-defining.

## 13. Resuming work in a later session

1. Read `AGENTS.md`.
2. Read [docs/TASKS.md](docs/TASKS.md).
3. Read recently modified ADRs in [docs/architecture/decisions/](docs/architecture/decisions/README.md).
4. Run repository status checks: `git status`, then `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
5. Identify the first unblocked task in the ledger.
6. Confirm its acceptance criteria.
7. Implement only that coherent unit of work.
8. Test it.
9. Update documentation and the task ledger.

If step 4 reveals a pre-existing failure, fix or formally record it before adding new behavior. Do not build on an unresolved foundational failure.
