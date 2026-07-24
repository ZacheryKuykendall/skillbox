# Repository Structure

Where things live and why. Deviating from this layout requires updating this document.

---

## Top level

```text
skillbox/
├── .cursor/rules/          Repository rules for AI agents
├── .github/                CI workflows and contribution templates
├── docs/                   Product, architecture, and guide documentation
├── examples/               Demonstration projects
├── packages/               Source packages
├── registry/               The local resource catalog
├── schemas/                Generated JSON Schema artifacts
├── scripts/                Repository maintenance scripts
├── templates/              Starting points for new resources
├── AGENTS.md               Agent and contributor operating guide
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── SECURITY.md
├── eslint.config.js
├── package.json            Private workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json      Shared compiler options
├── tsconfig.json           Solution file referencing every package
└── vitest.config.ts
```

## packages/

```text
packages/
├── schema/     @skillbox/schema   Manifest types, validation, JSON Schema
├── core/       @skillbox/core     Discovery, resolution, planning, installation
├── cli/        @skillbox/cli      The skillbox command
└── testing/    @skillbox/testing  Shared fixtures and helpers (private)
```

Every package follows the same internal layout:

```text
packages/<name>/
├── src/
│   ├── index.ts        Public surface — the only thing other packages import
│   └── *.ts            Implementation modules
├── test/               Integration tests
├── package.json
└── tsconfig.json       Extends tsconfig.base.json, declares references
```

Unit tests sit beside their subject as `src/foo.test.ts`. Tests that need a built binary or a temporary project live in `test/`. Cross-package imports go through `index.ts`; importing a deep path from another package is a layering violation.

### schema/src

```text
identifier.ts    Namespace, name, version rules; reference parsing
metadata.ts      The shared metadata block
spec.ts          Shared spec fields, path safety constraints
kinds/           One module per resource kind
manifest.ts      Discriminated union, apiVersion gating
project.ts       Project manifest and lockfile schemas
errors.ts        Zod issues to human diagnostics
json-schema.ts   JSON Schema emission
```

### core/src

```text
paths.ts             Containment-checked path resolution
integrity.ts         SHA-256 SRI digests
manifest-loader.ts   Read and validate a manifest from disk
catalog.ts           Walk a registry, build the catalog
search.ts            Query and rank
resolve.ts           Semver resolution
graph.ts             Dependency graph, topological order, cycles
plan.ts              InstallPlan construction, conflict detection
apply.ts             Journaled application with rollback
variables.ts         Project variable substitution
project.ts           Project manifest IO
lockfile.ts          Deterministic lockfile serialization
init.ts              Project initialization
remove.ts            Safe removal
update.ts            Update planning
doctor.ts            Diagnostics
errors.ts            SkillboxError and error codes
```

### cli/src

```text
program.ts       Commander wiring, global options
output.ts        Terminal and JSON rendering
errors.ts        Error rendering, exit code mapping
commands/        One module per command
```

## registry/

The local catalog, one directory per kind (plural), one directory per resource:

```text
registry/
├── prompts/code-review/
├── skills/technical-documentation/
├── agents/implementation-planner/
├── scripts/project-summary/
├── apis/generic-rest-client/
├── workflows/plan-implement-review/
└── components/structured-logger/
```

Each resource contains at minimum a `skillbox.yaml` and a `README.md`:

```text
code-review/
├── skillbox.yaml
├── README.md
└── prompt.md
```

Directory names are plural for kinds and match `metadata.name` for resources. The kind directory is organizational only — `kind` comes from the manifest, never from the path, so a misfiled resource is a validation error rather than a silent reclassification.

## docs/

```text
docs/
├── README.md                 Documentation index
├── TASKS.md                  Canonical task ledger
├── roadmap.md                Post-MVP phases
├── v0.1.0-readiness.md       Acceptance evidence
├── product/
│   ├── vision.md
│   ├── requirements.md       Numbered, testable requirements
│   └── terminology.md
├── architecture/
│   ├── overview.md
│   ├── repository-structure.md
│   ├── resource-model.md     Normative manifest specification
│   ├── security-model.md     Threat model
│   └── decisions/            ADRs
└── guides/
    ├── getting-started.md
    ├── creating-a-resource.md
    ├── contributing-a-resource.md
    └── cli-reference.md
```

Documents are lowercase kebab-case, except the all-caps root conventions (`README.md`, `TASKS.md`) and ADRs (`ADR-0001-kebab-title.md`).

## Generated and committed artifacts

```text
schemas/
├── resource-manifest.schema.json
├── project-manifest.schema.json
└── lockfile.schema.json
```

Generated by `pnpm schema:generate` and **committed**, so editors get completion without a build step. A test fails if they drift from the Zod schemas — they are derived artifacts, and Zod stays the source of truth.

## examples/ and templates/

```text
examples/starter-project/    A project with committed .skillbox/ configuration
templates/                   Copyable manifest templates, one per kind
```

`examples/starter-project` is a pnpm workspace member so its dependencies resolve; it is private and never published.

## Where a change belongs

| Change | Location |
| --- | --- |
| A manifest field or validation rule | `packages/schema/src/` |
| A new resource kind | `packages/schema/src/kinds/`, plus a `registry/` example and docs |
| Discovery, resolution, install, lockfile logic | `packages/core/src/` |
| A command, flag, or terminal output | `packages/cli/src/` |
| A shared fixture | `packages/testing/src/` |
| A catalog resource | `registry/<kind-plural>/<name>/` |
| An architectural decision | `docs/architecture/decisions/` |
| The normative manifest spec | `docs/architecture/resource-model.md` |

## Excluded from version control

`.gitignore` covers `node_modules/`, build output (`dist/`, `*.tsbuildinfo`), coverage output, editor state, OS metadata, and `.env*` files except `.env.example`. Environment files are excluded categorically so a real credential cannot be committed by accident.

Committed on purpose: `pnpm-lock.yaml`, generated `schemas/`, and `examples/starter-project/.skillbox/`. That last one is committed precisely because a project's Skillbox configuration and lockfile belong in version control — the example demonstrates that.
