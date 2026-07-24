# Skillbox Task Ledger

Canonical implementation ledger. Every meaningful unit of work has an `SBX-###` identifier.

A task may be marked `[x]` only when its implementation is complete, relevant tests pass, documentation is updated, completion evidence is recorded, and no blocker remains hidden. Never mark a partially implemented task complete.

Any `TODO` in the codebase must cite a task ID from this file, for example `// TODO(SBX-041): Add remote registry authentication.`

**Status legend:** `Not started` · `In progress` · `Blocked` · `Complete`

---

## Phase 0 — Repository Orientation

### SBX-001: Assess the repository and record constraints

- **Phase:** 0
- **Dependencies:** none
- **Description:** Inspect the repository, inventory existing systems, determine the toolchain, and record constraints and assumptions before any implementation.
- **Acceptance criteria:**
  - Directory structure inspected.
  - Package manager, build system, test, lint, format, and CI state determined.
  - Repository classified as empty, scaffold, or existing implementation.
  - Contradictions between the repository and the specification recorded.
  - Toolchain versions verified against the registry rather than assumed.
- **Status:** Complete
- **Completion evidence:**
  - Repository was empty: no files and no `.git` directory. `git init -b main` created the repository.
  - Toolchain verified: Node v24.10.0, pnpm 10.18.1, npm 11.6.1, git 2.51.0.
  - Dependency versions verified via `npm view`: see [ADR-0007](architecture/decisions/ADR-0007-typescript-version-pin.md).
  - Blocker found and resolved: `typescript@7.0.2` is `latest` but `typescript-eslint@8.65.0` declares `typescript: ">=4.8.4 <6.1.0"`, so TypeScript is pinned to 5.9.3.
  - Two dependencies avoided: Node 24 provides `util.styleText` (no `picocolors`) and Zod 4 provides `z.toJSONSchema()` (no `zod-to-json-schema`).
- **Related files:** [docs/architecture/overview.md](architecture/overview.md), [docs/architecture/decisions/ADR-0007-typescript-version-pin.md](architecture/decisions/ADR-0007-typescript-version-pin.md)
- **Follow-up:** SBX-017 leaves CODEOWNERS ownership unresolved until a GitHub owner exists.

- [x] SBX-001: Assess the repository and record constraints

---

## Phase 1 — Documentation and Governance Foundation

### SBX-010: Root governance documents

- **Phase:** 1
- **Dependencies:** SBX-001
- **Description:** Create `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, and `LICENSE`.
- **Acceptance criteria:** Each document contains substantive content; the license is MIT as directed by the repository owner; no invented company, author, or registry details.
- **Status:** Complete
- **Completion evidence:** Files created at repository root. MIT license chosen by the owner; copyright holder is recorded as "The Skillbox Contributors" because no individual or company name was supplied.
- **Related files:** `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`

- [x] SBX-010: Root governance documents

### SBX-011: Agent operating guide

- **Phase:** 1
- **Dependencies:** SBX-001
- **Description:** Author `AGENTS.md` covering mission, MVP scope, structure, package responsibilities, commands, task tracking, documentation rules, ADR process, testing, security, definition of done, prohibited behaviors, and the session resume sequence.
- **Acceptance criteria:** All fourteen topics required by the specification are present and internally consistent with the rest of the documentation.
- **Status:** Complete
- **Completion evidence:** [AGENTS.md](../AGENTS.md) sections 1 through 13.
- **Related files:** `AGENTS.md`

- [x] SBX-011: Agent operating guide

### SBX-012: Product documentation

- **Phase:** 1
- **Dependencies:** SBX-010
- **Description:** Write `docs/product/vision.md`, `requirements.md`, and `terminology.md`.
- **Acceptance criteria:** Vision states the problem and the product thesis; requirements are numbered and testable and include the MVP acceptance criteria; terminology defines every core noun used elsewhere.
- **Status:** Complete
- **Completion evidence:** [vision.md](product/vision.md), [requirements.md](product/requirements.md), [terminology.md](product/terminology.md).
- **Related files:** `docs/product/*`

- [x] SBX-012: Product documentation

### SBX-013: Architecture documentation

- **Phase:** 1
- **Dependencies:** SBX-012
- **Description:** Write `docs/architecture/overview.md`, `repository-structure.md`, `resource-model.md`, and `security-model.md`.
- **Acceptance criteria:** The resource model is specified precisely enough to implement without further design work; the security model documents a threat model and required tests.
- **Status:** Complete
- **Completion evidence:** [overview.md](architecture/overview.md), [repository-structure.md](architecture/repository-structure.md), [resource-model.md](architecture/resource-model.md), [security-model.md](architecture/security-model.md).
- **Related files:** `docs/architecture/*`

- [x] SBX-013: Architecture documentation

### SBX-014: Initial architectural decision records

- **Phase:** 1
- **Dependencies:** SBX-013
- **Description:** Record ADR-0001 through ADR-0007 with Status, Context, Decision, Alternatives considered, Consequences, and Follow-up work.
- **Acceptance criteria:** Every technology and format choice made during Phase 1 has a corresponding ADR; the index lists them all.
- **Status:** Complete
- **Completion evidence:** Seven ADRs plus an index in [docs/architecture/decisions/](architecture/decisions/README.md).
- **Related files:** `docs/architecture/decisions/*`

- [x] SBX-014: Initial architectural decision records

### SBX-015: Task ledger

- **Phase:** 1
- **Dependencies:** SBX-001
- **Description:** Create this ledger and decompose the MVP into numbered tasks across all phases.
- **Acceptance criteria:** Every phase has tasks with descriptions, dependencies, acceptance criteria, and status fields.
- **Status:** Complete
- **Completion evidence:** This file.
- **Related files:** `docs/TASKS.md`

- [x] SBX-015: Task ledger

### SBX-016: Cursor rules

- **Phase:** 1
- **Dependencies:** SBX-011
- **Description:** Author `.cursor/rules/skillbox-project.mdc`, `documentation.mdc`, and `testing.mdc`.
- **Acceptance criteria:** Rules carry valid frontmatter, do not contradict `AGENTS.md`, and are scoped with globs where appropriate.
- **Status:** Complete
- **Completion evidence:** Three rule files under `.cursor/rules/`.
- **Related files:** `.cursor/rules/*.mdc`

- [x] SBX-016: Cursor rules

### SBX-017: GitHub templates and code ownership

- **Phase:** 1
- **Dependencies:** SBX-010
- **Description:** Create `CODEOWNERS`, `PULL_REQUEST_TEMPLATE.md`, and the bug report, feature request, and new resource issue forms.
- **Acceptance criteria:** Issue templates are valid GitHub issue form YAML; the PR template encodes the definition of done.
- **Status:** Complete
- **Completion evidence:** Files under `.github/`. CODEOWNERS contains no ownership entries yet because no GitHub owner or team has been provided; the placeholder cites SBX-018.
- **Related files:** `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/*.yml`
- **Follow-up:** SBX-018

- [x] SBX-017: GitHub templates and code ownership

### SBX-018: Assign code ownership

- **Phase:** Backlog
- **Dependencies:** SBX-017
- **Description:** Populate `.github/CODEOWNERS` with real reviewers once a GitHub organization or owner exists.
- **Acceptance criteria:** CODEOWNERS references an existing GitHub user or team and branch protection requires their review.
- **Status:** Blocked
- **Blocker:** No GitHub owner or organization has been provided. Requires a decision from the repository owner.
- **Related files:** `.github/CODEOWNERS`

- [ ] SBX-018: Assign code ownership

### SBX-019: Documentation index and roadmap

- **Phase:** 1
- **Dependencies:** SBX-012, SBX-013
- **Description:** Write `docs/README.md` as the documentation entry point and `docs/roadmap.md` covering post-MVP phases.
- **Acceptance criteria:** The index links every documentation file; the roadmap lists all deferred capabilities from the specification without scheduling them into the MVP.
- **Status:** Complete
- **Completion evidence:** [docs/README.md](README.md), [docs/roadmap.md](roadmap.md).
- **Related files:** `docs/README.md`, `docs/roadmap.md`

- [x] SBX-019: Documentation index and roadmap

### SBX-0110: Contributor guides

- **Phase:** 1
- **Dependencies:** SBX-013
- **Description:** Write `docs/guides/getting-started.md`, `creating-a-resource.md`, and `contributing-a-resource.md`.
- **Acceptance criteria:** A new developer can follow the getting-started guide end to end; the creation guide documents every manifest field a resource author needs.
- **Status:** Complete
- **Completion evidence:** Three guides under [docs/guides/](guides/getting-started.md).
- **Related files:** `docs/guides/*`

- [x] SBX-0110: Contributor guides

---

## Phase 2 — Workspace Foundation

### SBX-020: pnpm workspace configuration

- **Phase:** 2
- **Dependencies:** SBX-014
- **Description:** Create `pnpm-workspace.yaml`, the root `package.json`, `.npmrc`, `.gitignore`, and `.editorconfig`.
- **Acceptance criteria:** `pnpm install` succeeds; the workspace resolves `packages/*` and `examples/*`; the root package is private.
- **Status:** Complete
- **Completion evidence:**
  - `pnpm install` exited 0 with no unmet peer dependencies, confirming the pinned versions in [ADR-0006](architecture/decisions/ADR-0006-build-orchestration.md) are mutually compatible.
  - `pnpm ls -r --depth -1` lists all four packages as private workspace members.
  - `@eslint/js@10.0.1` had to be added explicitly: ESLint 10 no longer depends on it, and pnpm's strict layout does not hoist it.
- **Related files:** `pnpm-workspace.yaml`, `package.json`, `.npmrc`, `.gitignore`, `.editorconfig`

- [x] SBX-020: pnpm workspace configuration

### SBX-021: TypeScript configuration

- **Phase:** 2
- **Dependencies:** SBX-020
- **Description:** Create `tsconfig.base.json` with strict settings, a root config that checks every file, and per-package composite build configs using project references.
- **Acceptance criteria:** `pnpm typecheck` passes; `pnpm build` emits declaration files; strict mode and `verbatimModuleSyntax` are enabled; test files are type-checked but never emitted to `dist/`.
- **Status:** Complete
- **Completion evidence:**
  - `pnpm typecheck` and `pnpm build` both exited 0.
  - `dist/` contains no `*.test.js`, verified by listing build output.
  - Design note: the tree contains exactly one `tsconfig.json`, at the root. typescript-eslint's project service resolves a file's project by walking up to the nearest `tsconfig.json`, so a per-package one would shadow the root config and leave test files without a project. Builds are driven by `tsconfig.build.json` instead.
- **Related files:** `tsconfig.base.json`, `tsconfig.json`, `tsconfig.build.json`, `packages/*/tsconfig.build.json`

- [x] SBX-021: TypeScript configuration

### SBX-022: ESLint configuration

- **Phase:** 2
- **Dependencies:** SBX-021
- **Description:** Create a flat `eslint.config.js` using `typescript-eslint` with type-aware rules, plus a rule enforcing the package dependency direction.
- **Acceptance criteria:** `pnpm lint` passes with zero warnings; `no-restricted-imports` prevents `core` from importing `cli` and prevents `schema` from importing `node:fs`.
- **Status:** Complete
- **Completion evidence:** `pnpm lint` exited 0 with `--max-warnings 0`. Type-aware rules (`no-floating-promises`, `no-misused-promises`, `await-thenable`) are active, which is the reason TypeScript is pinned to 5.9.3 per [ADR-0007](architecture/decisions/ADR-0007-typescript-version-pin.md).
- **Related files:** `eslint.config.js`

- [x] SBX-022: ESLint configuration

### SBX-023: Prettier configuration

- **Phase:** 2
- **Dependencies:** SBX-020
- **Description:** Add `.prettierrc.json` and `.prettierignore` with `format` and `format:check` scripts.
- **Acceptance criteria:** `pnpm format:check` passes on a clean tree.
- **Status:** Complete
- **Completion evidence:** `pnpm format:check` exited 0.
- **Related files:** `.prettierrc.json`, `.prettierignore`

- [x] SBX-023: Prettier configuration

### SBX-024: Vitest configuration and coverage gate

- **Phase:** 2
- **Dependencies:** SBX-021
- **Description:** Configure Vitest with a workspace projects setup and `@vitest/coverage-v8` thresholds at 90% for lines, statements, functions, and branches.
- **Acceptance criteria:** `pnpm test` runs all package suites; `pnpm test:coverage` fails when coverage drops below 90%.
- **Status:** Complete
- **Completion evidence:**
  - `pnpm test` exited 0 with 86 tests passing across 6 files.
  - The gate was observed working rather than assumed: an initial run failed with `Coverage for lines (67.24%) does not meet global threshold (90%)` because `run.ts` was untested. After adding `run.test.ts`, coverage reached 96.72% statements, 94.11% branches, 100% functions, 96.72% lines.
  - Workspace imports are aliased to source in `vitest.config.ts` so unit tests run without a prior build and coverage attributes to `.ts` files.
- **Related files:** `vitest.config.ts`

- [x] SBX-024: Vitest configuration and coverage gate

### SBX-025: Build orchestration and shared scripts

- **Phase:** 2
- **Dependencies:** SBX-021
- **Description:** Define root scripts that fan out across the workspace in topological order using `pnpm -r`.
- **Acceptance criteria:** `pnpm build` builds `schema` before `core` before `cli`; no additional orchestration dependency is introduced.
- **Status:** Complete
- **Completion evidence:** `pnpm build` succeeded using `tsc -b`, which resolves reference order itself. See [ADR-0006](architecture/decisions/ADR-0006-build-orchestration.md).
- **Related files:** `package.json`

- [x] SBX-025: Build orchestration and shared scripts

### SBX-026: Continuous integration workflow

- **Phase:** 2
- **Dependencies:** SBX-020, SBX-022, SBX-024
- **Description:** Implement `.github/workflows/ci.yml` running install, format check, lint, typecheck, test with coverage, build, and registry validation.
- **Acceptance criteria:** The workflow pins action versions, uses the repository's pnpm version, and fails on any gate.
- **Status:** Complete
- **Completion evidence:** Workflow committed. Every step maps to a script verified locally; GitHub-side execution requires a remote, tracked by SBX-099.
- **Related files:** `.github/workflows/ci.yml`
- **Follow-up:** SBX-099

- [x] SBX-026: Continuous integration workflow

### SBX-027: Testing package scaffold

- **Phase:** 2
- **Dependencies:** SBX-021
- **Description:** Create `packages/testing` exposing temporary-directory helpers and fixture builders.
- **Acceptance criteria:** The package builds, is private, and is consumable from other packages' tests.
- **Status:** Complete
- **Completion evidence:** `@skillbox/testing` builds and is listed as a private workspace member. `createTempDir` and `withTempDir` are covered by `temp.test.ts`, including the case where the callback throws so a failing assertion cannot leave directories behind. Manifest fixtures are added in SBX-037; consumption by the core and CLI suites begins in Phase 4.
- **Related files:** `packages/testing/**`

- [x] SBX-027: Testing package scaffold

### SBX-028: Foundational error and vocabulary modules

- **Phase:** 2
- **Dependencies:** SBX-021
- **Description:** Add the modules every later phase depends on: the resource-format vocabulary in `@skillbox/schema`, the `SkillboxError` type in `@skillbox/core`, and exit-code mapping plus program wiring in `@skillbox/cli`. These exist in Phase 2 so the toolchain gate exercises real code rather than stubs.
- **Acceptance criteria:** Constants match the normative resource model; every error code maps to a non-zero exit status; all modules are covered by tests.
- **Status:** Complete
- **Completion evidence:** `constants.ts`, `errors.ts`, `exit-codes.ts`, `run.ts`, and `version.ts` with tests. A test asserts every `ERROR_CODE` maps to a non-zero exit code, so a failure can never be invisible to a calling script (FR-13.6). Another asserts `CLI_VERSION` matches `package.json` so the hand-maintained constant cannot drift.
- **Related files:** `packages/schema/src/constants.ts`, `packages/core/src/errors.ts`, `packages/cli/src/exit-codes.ts`, `packages/cli/src/run.ts`

- [x] SBX-028: Foundational error and vocabulary modules

---

## Phase 3 — Resource Schema

### SBX-030: Identifier and version primitives

- **Phase:** 3
- **Dependencies:** SBX-027
- **Description:** Implement namespace, name, and semantic version validation plus parsing and formatting of `namespace/name@version` references.
- **Acceptance criteria:** Names and namespaces match the documented pattern; reserved and malformed inputs are rejected with actionable messages; round-trip parse and format is lossless.
- **Status:** Complete
- **Completion evidence:** `packages/schema/src/identifier.ts` with 86 tests in `identifier.test.ts`, covering the round trip, every rejection path with its message, and the rule that a prerelease never satisfies a plain range (FR-4.5). An npm-style `@scope/name` is rejected so there is exactly one canonical form.
- **Related files:** `packages/schema/src/identifier.ts`

- [x] SBX-030: Identifier and version primitives

### SBX-031: Shared metadata schema

- **Phase:** 3
- **Dependencies:** SBX-030
- **Description:** Define the `metadata` block: namespace, name, version, description, tags, license, homepage, deprecation.
- **Acceptance criteria:** Required fields are enforced; unknown fields are rejected; tags are normalized and deduplicated.
- **Status:** Complete
- **Completion evidence:** `packages/schema/src/metadata.ts` with tests.
- **Related files:** `packages/schema/src/metadata.ts`

- [x] SBX-031: Shared metadata schema

### SBX-032: Common specification fields

- **Phase:** 3
- **Dependencies:** SBX-031
- **Description:** Define shared spec fields: entrypoint, files, install target, inputs, outputs, dependencies, environment variables, permissions, runtime, compatibility.
- **Acceptance criteria:** Relative POSIX paths only; absolute paths, `..` segments, and Windows drive prefixes are rejected at the schema layer; permissions use a closed vocabulary.
- **Status:** Complete
- **Completion evidence:** `packages/schema/src/spec.ts` and `paths.ts`, with 45 path tests asserting each rejection vector individually so a regression names the specific form that stopped being rejected. A test confirms `envVarSchema` has no field for a value and rejects one, which is the mechanism the entire secret-handling guarantee rests on (SR-7).
- **Related files:** `packages/schema/src/spec.ts`, `packages/schema/src/paths.ts`

- [x] SBX-032: Common specification fields

### SBX-033: Kind-specific specifications

- **Phase:** 3
- **Dependencies:** SBX-032
- **Description:** Define the spec schema for each of the seven kinds, adding only the fields that are meaningful to that kind.
- **Acceptance criteria:** Every kind has a schema; no kind is forced to declare irrelevant fields; each kind has a passing and a failing fixture.
- **Status:** Complete
- **Completion evidence:** `packages/schema/src/kinds.ts`, with a test per kind validating its fixture and a test confirming a prompt declaring `interpreter` is rejected (FR-1.12). Design note: each kind schema is written out rather than produced by a generic helper, because a generic `defineSpec<T>` loses Zod's inference through the shape merge and degrades the `superRefine` argument to `Record<string, unknown>`.
- **Related files:** `packages/schema/src/kinds.ts`

- [x] SBX-033: Kind-specific specifications

### SBX-034: Manifest union and apiVersion gating

- **Phase:** 3
- **Dependencies:** SBX-033
- **Description:** Compose a discriminated union on `kind` and reject unsupported `apiVersion` values.
- **Acceptance criteria:** A manifest with an unknown `apiVersion` produces a dedicated error naming the supported version; an unknown `kind` lists valid kinds.
- **Status:** Complete
- **Completion evidence:** `packages/schema/src/manifest.ts` and `validate-manifest.ts`. `checkEnvelope` runs before the body so an unsupported `apiVersion` yields exactly one diagnostic rather than a cascade; a test asserts the diagnostic count is 1 and that the message names the supported version.
- **Related files:** `packages/schema/src/manifest.ts`, `packages/schema/src/validate-manifest.ts`

- [x] SBX-034: Manifest union and apiVersion gating

### SBX-035: Validation error formatting

- **Phase:** 3
- **Dependencies:** SBX-034
- **Description:** Convert Zod issues into stable, path-qualified, human-readable diagnostics.
- **Acceptance criteria:** Every diagnostic reports a dotted path and a remediation hint; output ordering is deterministic; no input values that could be secrets are echoed for environment fields.
- **Status:** Complete
- **Completion evidence:** `packages/schema/src/errors.ts`. Redaction is proven with a sentinel value placed in `env[].name`, `auth.tokenEnv`, and `baseUrlEnv`; each test asserts the sentinel appears nowhere in the serialized diagnostics. Ordering is sorted by path then message, with a test asserting two runs on the same input produce identical output. An unexpected value is described by shape (`a mapping`) rather than stringified, avoiding `[object Object]`.
- **Related files:** `packages/schema/src/errors.ts`

- [x] SBX-035: Validation error formatting

### SBX-036: JSON Schema generation

- **Phase:** 3
- **Dependencies:** SBX-034
- **Description:** Emit JSON Schema for the manifest and project files using Zod's native `z.toJSONSchema()`.
- **Acceptance criteria:** `pnpm schema:generate` writes deterministic artifacts under `schemas/`; a test fails if committed artifacts drift from the schemas.
- **Status:** Complete
- **Completion evidence:** `packages/schema/src/json-schema.ts`, `scripts/generate-json-schema.ts`, and three committed artifacts under `schemas/`. A drift test compares committed bytes against freshly generated output and names the fix command on failure. Zod 4's native `z.toJSONSchema()` is used, so no converter dependency was needed. `reused: 'ref'` extracts the shared spec into `$defs`, taking the manifest artifact from 70 kB to 23 kB — inlined output was too large to review in a diff.
- **Related files:** `packages/schema/src/json-schema.ts`, `scripts/generate-json-schema.ts`, `schemas/**`

- [x] SBX-036: JSON Schema generation

### SBX-037: Manifest fixtures

- **Phase:** 3
- **Dependencies:** SBX-033
- **Description:** Provide valid and invalid manifest fixtures in `@skillbox/testing` for reuse across packages.
- **Acceptance criteria:** At least one valid fixture per kind and invalid fixtures for each documented failure mode.
- **Status:** Complete
- **Completion evidence:** `packages/testing/src/fixtures.ts` provides `VALID_MANIFESTS` for all seven kinds and 31 entries in `INVALID_MANIFESTS`, each labelled with the reason it must be rejected. Fixtures are deep-cloned on access so a mutation in one test cannot leak into another. Consumed by the schema suite now and by the core suite from Phase 4.
- **Related files:** `packages/testing/src/fixtures.ts`

- [x] SBX-037: Manifest fixtures

---

## Phase 4 — Core Catalog and Resolution

### SBX-040: Safe path utilities

- **Phase:** 4
- **Dependencies:** SBX-032
- **Description:** Implement containment-checked path resolution used by every filesystem operation.
- **Acceptance criteria:** Traversal, absolute paths, drive-relative paths, and UNC paths are rejected; containment uses `path.relative` rather than string prefixes; behavior is correct on Windows and POSIX.
- **Status:** Complete
- **Completion evidence:** `packages/core/src/paths.ts` with a dedicated traversal test suite.
- **Related files:** `packages/core/src/paths.ts`

- [x] SBX-040: Safe path utilities

### SBX-041: Manifest loading

- **Phase:** 4
- **Dependencies:** SBX-040, SBX-034
- **Description:** Read and parse `skillbox.yaml` from disk, mapping YAML and validation failures to structured errors.
- **Acceptance criteria:** Malformed YAML reports file and line; validation failures include the file path; the entrypoint is confirmed to exist inside the resource directory.
- **Status:** Complete
- **Completion evidence:** `packages/core/src/manifest-loader.ts` with tests in temporary directories.
- **Related files:** `packages/core/src/manifest-loader.ts`

- [x] SBX-041: Manifest loading

### SBX-042: Catalog discovery

- **Phase:** 4
- **Dependencies:** SBX-041
- **Description:** Walk `registry/` to build an in-memory catalog indexed by resource identifier.
- **Acceptance criteria:** Discovery is deterministic; duplicate `namespace/name@version` entries are an error; a resource whose manifest fails validation is reported without aborting the whole scan.
- **Status:** Complete
- **Completion evidence:** `packages/core/src/catalog.ts` with tests.
- **Related files:** `packages/core/src/catalog.ts`

- [x] SBX-042: Catalog discovery

### SBX-043: Catalog search

- **Phase:** 4
- **Dependencies:** SBX-042
- **Description:** Search across name, namespace, description, kind, and tags with kind and tag filters.
- **Acceptance criteria:** Matching is case-insensitive; results are ranked deterministically; an empty query lists everything.
- **Status:** Complete
- **Completion evidence:** `packages/core/src/search.ts` with ranking tests.
- **Related files:** `packages/core/src/search.ts`

- [x] SBX-043: Catalog search

### SBX-044: Version resolution

- **Phase:** 4
- **Dependencies:** SBX-042
- **Description:** Resolve an exact version or a semver range to the highest satisfying catalog entry.
- **Acceptance criteria:** Exact and range resolution both work; an unsatisfiable range lists available versions; prerelease versions are excluded unless explicitly requested.
- **Status:** Complete
- **Completion evidence:** `packages/core/src/resolve.ts` with tests.
- **Related files:** `packages/core/src/resolve.ts`

- [x] SBX-044: Version resolution

### SBX-045: Dependency graph and cycle detection

- **Phase:** 4
- **Dependencies:** SBX-044
- **Description:** Build a transitive dependency graph and produce a topological install order, detecting cycles and missing dependencies.
- **Acceptance criteria:** Missing dependencies name the requesting resource; cycles report the full path; diamond dependencies resolve once; version conflicts are reported.
- **Status:** Complete
- **Completion evidence:** `packages/core/src/graph.ts` with cycle, diamond, and missing-dependency tests.
- **Related files:** `packages/core/src/graph.ts`

- [x] SBX-045: Dependency graph and cycle detection

### SBX-046: Installation planning and conflict detection

- **Phase:** 4
- **Dependencies:** SBX-045, SBX-040
- **Description:** Produce an immutable `InstallPlan` describing every file operation without touching the filesystem, and detect conflicts.
- **Acceptance criteria:** Planning performs no writes; destination containment is enforced; conflicts distinguish untracked existing files, files owned by another resource, and locally modified files.
- **Status:** Complete
- **Completion evidence:** `packages/core/src/plan.ts` with conflict-classification tests.
- **Related files:** `packages/core/src/plan.ts`

- [x] SBX-046: Installation planning and conflict detection

---

## Phase 5 — Project Installation

### SBX-050: Project manifest schema and IO

- **Phase:** 5
- **Dependencies:** SBX-034
- **Description:** Define and persist `.skillbox/skillbox.yaml` describing requested resources, targets, and variables.
- **Acceptance criteria:** Round-trip read and write is stable; missing files produce a clear "not initialized" error; unknown fields are rejected.
- **Status:** Complete
- **Completion evidence:** `packages/schema/src/project.ts` and `packages/core/src/project.ts` with tests.
- **Related files:** `packages/schema/src/project.ts`, `packages/core/src/project.ts`

- [x] SBX-050: Project manifest schema and IO

### SBX-051: Lockfile schema and deterministic serialization

- **Phase:** 5
- **Dependencies:** SBX-050, SBX-052
- **Description:** Define `.skillbox/skillbox.lock` recording resolved versions, source, integrity, installed files, and dependency relationships.
- **Acceptance criteria:** Serialization is byte-identical across runs and platforms; keys are sorted; no timestamps or absolute paths; unchanged installs produce no diff.
- **Status:** Complete
- **Completion evidence:** `packages/core/src/lockfile.ts` with a determinism test that serializes twice and compares bytes. See [ADR-0004](architecture/decisions/ADR-0004-lockfile-design.md).
- **Related files:** `packages/core/src/lockfile.ts`

- [x] SBX-051: Lockfile schema and deterministic serialization

### SBX-052: Integrity hashing

- **Phase:** 5
- **Dependencies:** SBX-040
- **Description:** Compute SRI-style `sha256-<base64>` digests for individual files and a stable aggregate digest per resource.
- **Acceptance criteria:** Digests are stable regardless of line-ending normalization decisions being applied consistently; the aggregate digest changes when any file changes.
- **Status:** Complete
- **Completion evidence:** `packages/core/src/integrity.ts` with tests.
- **Related files:** `packages/core/src/integrity.ts`

- [x] SBX-052: Integrity hashing

### SBX-053: Project initialization

- **Phase:** 5
- **Dependencies:** SBX-050
- **Description:** Create `.skillbox/` with a project manifest and an empty lockfile, refusing to clobber existing configuration without explicit force.
- **Acceptance criteria:** Initializing twice without `--force` fails with a clear message and changes nothing; the result explains what was created.
- **Status:** Complete
- **Completion evidence:** `packages/core/src/init.ts` with tests for the fresh, existing, and forced cases.
- **Related files:** `packages/core/src/init.ts`

- [x] SBX-053: Project initialization

### SBX-054: Plan application with rollback

- **Phase:** 5
- **Dependencies:** SBX-046, SBX-051
- **Description:** Apply an install plan, journaling changes so a mid-operation failure restores the prior state.
- **Acceptance criteria:** An injected failure leaves no new files, restores overwritten content, and leaves the manifest and lockfile untouched.
- **Status:** Complete
- **Completion evidence:** `packages/core/src/apply.ts` with a fault-injection rollback test.
- **Related files:** `packages/core/src/apply.ts`

- [x] SBX-054: Plan application with rollback

### SBX-055: Variable substitution

- **Phase:** 5
- **Dependencies:** SBX-050
- **Description:** Substitute project variables into installed text files using an explicit delimiter.
- **Acceptance criteria:** Only declared variables are substituted; an undeclared reference is an error; binary files are copied untouched; environment variable values are never substituted.
- **Status:** Complete
- **Completion evidence:** `packages/core/src/variables.ts` with tests.
- **Related files:** `packages/core/src/variables.ts`

- [x] SBX-055: Variable substitution

### SBX-056: Safe removal

- **Phase:** 5
- **Dependencies:** SBX-051, SBX-052
- **Description:** Remove files owned by a resource, refusing to delete locally modified files unless forced, and updating the manifest and lockfile.
- **Acceptance criteria:** Modified files are preserved and reported; removal is blocked when another installed resource depends on the target; empty directories are cleaned up.
- **Status:** Complete
- **Completion evidence:** `packages/core/src/remove.ts` with tests for modified files and dependents.
- **Related files:** `packages/core/src/remove.ts`

- [x] SBX-056: Safe removal

### SBX-057: Update planning

- **Phase:** 5
- **Dependencies:** SBX-046, SBX-051
- **Description:** Find compatible newer versions and produce an update plan that detects conflicts before any file changes.
- **Acceptance criteria:** Updates respect the requested range; up-to-date resources report no work; conflicts abort before mutation; the lockfile is rewritten only after success.
- **Status:** Complete
- **Completion evidence:** `packages/core/src/update.ts` with tests.
- **Related files:** `packages/core/src/update.ts`

- [x] SBX-057: Update planning

### SBX-058: Doctor diagnostics

- **Phase:** 5
- **Dependencies:** SBX-051, SBX-052
- **Description:** Diagnose project configuration, lockfile consistency, missing files, invalid manifests, dependency problems, runtime compatibility, and unresolved environment requirements.
- **Acceptance criteria:** Each check yields a severity and a remediation hint; a healthy project reports no findings; environment checks report names only.
- **Status:** Complete
- **Completion evidence:** `packages/core/src/doctor.ts` with tests for each finding type.
- **Related files:** `packages/core/src/doctor.ts`

- [x] SBX-058: Doctor diagnostics

---

## Phase 6 — CLI

### SBX-060: CLI program wiring

- **Phase:** 6
- **Dependencies:** SBX-053
- **Description:** Build the Commander program with the binary entrypoint, global options, and version reporting.
- **Acceptance criteria:** `skillbox --help` and `--version` work; `--json` and `--no-color` are honored globally; unknown commands exit non-zero.
- **Status:** Complete
- **Completion evidence:** `packages/cli/src/program.ts` and `bin/skillbox.js` with tests.
- **Related files:** `packages/cli/src/program.ts`

- [x] SBX-060: CLI program wiring

### SBX-061: Output and error presentation

- **Phase:** 6
- **Dependencies:** SBX-060
- **Description:** Centralize terminal output using `node:util` `styleText`, with machine-readable JSON output and a single error renderer.
- **Acceptance criteria:** Color is disabled when not a TTY or when `NO_COLOR` is set; errors show cause and remediation; no secret values are printed.
- **Status:** Complete
- **Completion evidence:** `packages/cli/src/output.ts` and `errors.ts` with tests.
- **Related files:** `packages/cli/src/output.ts`, `packages/cli/src/errors.ts`

- [x] SBX-061: Output and error presentation

### SBX-062: Commands

- **Phase:** 6
- **Dependencies:** SBX-061, SBX-058
- **Description:** Implement `init`, `search`, `list`, `inspect`, `add`, `remove`, `validate`, `update`, and `doctor` as thin adapters over `@skillbox/core`.
- **Acceptance criteria:** Every command delegates business logic to core, returns documented exit codes, and supports `--json`; `add` shows a plan and supports `--dry-run` and `--yes`.
- **Status:** Complete
- **Completion evidence:** `packages/cli/src/commands/*.ts` with per-command tests.
- **Related files:** `packages/cli/src/commands/**`

- [x] SBX-062: Commands

### SBX-063: CLI integration tests

- **Phase:** 6
- **Dependencies:** SBX-062
- **Description:** Spawn the built CLI against temporary projects and assert stdout, stderr, and exit codes.
- **Acceptance criteria:** The full init, search, inspect, add, list, validate, doctor, remove lifecycle is covered end to end; failure paths assert non-zero exit codes.
- **Status:** Complete
- **Completion evidence:** `packages/cli/test/integration.test.ts` executing the built binary through `node`.
- **Related files:** `packages/cli/test/integration.test.ts`

- [x] SBX-063: CLI integration tests

### SBX-064: CLI documentation

- **Phase:** 6
- **Dependencies:** SBX-062
- **Description:** Document every command, option, and exit code.
- **Acceptance criteria:** Documented behavior matches the implementation; exit codes are tabulated.
- **Status:** Complete
- **Completion evidence:** [docs/guides/cli-reference.md](guides/cli-reference.md).
- **Related files:** `docs/guides/cli-reference.md`

- [x] SBX-064: CLI documentation

---

## Phase 7 — Starter Catalog

### SBX-070: Prompt example — code-review

- **Phase:** 7
- **Dependencies:** SBX-062
- **Description:** Author `registry/prompts/code-review` with manifest, README, and prompt body.
- **Acceptance criteria:** Validates cleanly; documents inputs, outputs, permissions, and usage.
- **Status:** Complete
- **Completion evidence:** Resource validates via `pnpm validate:registry`.
- **Related files:** `registry/prompts/code-review/**`

- [x] SBX-070: Prompt example — code-review

### SBX-071: Skill example — technical-documentation

- **Phase:** 7
- **Dependencies:** SBX-062
- **Status:** Complete
- **Acceptance criteria:** Validates cleanly; documents inputs, outputs, permissions, and usage.
- **Completion evidence:** Resource validates via `pnpm validate:registry`.
- **Related files:** `registry/skills/technical-documentation/**`

- [x] SBX-071: Skill example — technical-documentation

### SBX-072: Agent example — implementation-planner

- **Phase:** 7
- **Dependencies:** SBX-062
- **Status:** Complete
- **Acceptance criteria:** Validates cleanly; declares its prompt dependency; documents permissions.
- **Completion evidence:** Resource validates and exercises cross-resource dependency resolution.
- **Related files:** `registry/agents/implementation-planner/**`

- [x] SBX-072: Agent example — implementation-planner

### SBX-073: Script example — project-summary

- **Phase:** 7
- **Dependencies:** SBX-062
- **Status:** Complete
- **Acceptance criteria:** Validates cleanly; is not executed during installation; documents how to run it explicitly.
- **Completion evidence:** Resource validates; installation performs no execution.
- **Related files:** `registry/scripts/project-summary/**`

- [x] SBX-073: Script example — project-summary

### SBX-074: API example — generic-rest-client

- **Phase:** 7
- **Dependencies:** SBX-062
- **Status:** Complete
- **Acceptance criteria:** Validates cleanly; declares required environment variable names without values; contains no credentials.
- **Completion evidence:** Resource validates; no secrets present.
- **Related files:** `registry/apis/generic-rest-client/**`

- [x] SBX-074: API example — generic-rest-client

### SBX-075: Workflow example — plan-implement-review

- **Phase:** 7
- **Dependencies:** SBX-072
- **Status:** Complete
- **Acceptance criteria:** Validates cleanly; composes other catalog resources through declared dependencies.
- **Completion evidence:** Resource validates; dependency graph resolves transitively.
- **Related files:** `registry/workflows/plan-implement-review/**`

- [x] SBX-075: Workflow example — plan-implement-review

### SBX-076: Component example — structured-logger

- **Phase:** 7
- **Dependencies:** SBX-062
- **Status:** Complete
- **Acceptance criteria:** Validates cleanly; ships source plus its own test fixture; documents configuration.
- **Completion evidence:** Resource validates.
- **Related files:** `registry/components/structured-logger/**`

- [x] SBX-076: Component example — structured-logger

### SBX-077: Catalog-wide validation

- **Phase:** 7
- **Dependencies:** SBX-070 through SBX-076
- **Description:** Add a test and a `pnpm validate:registry` script that validate every catalog resource and assert all seven kinds are represented.
- **Acceptance criteria:** The suite fails if any resource is invalid or if a kind has no example.
- **Status:** Complete
- **Completion evidence:** `packages/core/test/registry.test.ts` and the `validate:registry` script.
- **Related files:** `packages/core/test/registry.test.ts`

- [x] SBX-077: Catalog-wide validation

### SBX-078: Starter project example

- **Phase:** 7
- **Dependencies:** SBX-077
- **Description:** Provide `examples/starter-project` demonstrating a real initialization and install.
- **Acceptance criteria:** Contains a committed `.skillbox/` configuration and documents the exact commands that produced it.
- **Status:** Complete
- **Completion evidence:** `examples/starter-project/**` with a README walkthrough.
- **Related files:** `examples/starter-project/**`

- [x] SBX-078: Starter project example

### SBX-079: Resource templates

- **Phase:** 7
- **Dependencies:** SBX-077
- **Description:** Provide copyable manifest templates for each kind under `templates/`.
- **Acceptance criteria:** Templates validate after placeholder substitution and are referenced by the creation guide.
- **Status:** Complete
- **Completion evidence:** `templates/**` referenced from [creating-a-resource.md](guides/creating-a-resource.md).
- **Related files:** `templates/**`

- [x] SBX-079: Resource templates

---

## Phase 8 — MVP Hardening

### SBX-080: Path traversal security tests

- **Phase:** 8
- **Dependencies:** SBX-040, SBX-054
- **Description:** Prove that traversal, absolute, drive-relative, UNC, and symlinked destinations cannot escape the project root.
- **Acceptance criteria:** Every vector is rejected before any write occurs; each rejection is asserted individually.
- **Status:** Complete
- **Completion evidence:** `packages/core/test/security-paths.test.ts`.
- **Related files:** `packages/core/test/security-paths.test.ts`

- [x] SBX-080: Path traversal security tests

### SBX-081: Malformed input security tests

- **Phase:** 8
- **Dependencies:** SBX-041
- **Description:** Cover malformed manifests, undeclared entrypoints, undeclared files, conflicting files, missing dependencies, and circular dependencies.
- **Acceptance criteria:** Each failure mode has an explicit assertion on the error and no partial state remains.
- **Status:** Complete
- **Completion evidence:** `packages/core/test/security-manifests.test.ts`.
- **Related files:** `packages/core/test/security-manifests.test.ts`

- [x] SBX-081: Malformed input security tests

### SBX-082: Secret leakage tests

- **Phase:** 8
- **Dependencies:** SBX-061
- **Description:** Prove that environment variable values never appear in output, errors, or the lockfile.
- **Acceptance criteria:** A sentinel value set in the environment is absent from every captured output stream and written artifact.
- **Status:** Complete
- **Completion evidence:** `packages/core/test/security-secrets.test.ts`.
- **Related files:** `packages/core/test/security-secrets.test.ts`

- [x] SBX-082: Secret leakage tests

### SBX-083: Coverage verification

- **Phase:** 8
- **Dependencies:** all implementation tasks
- **Description:** Confirm repository-wide coverage meets the 90% gate for lines, statements, functions, and branches.
- **Acceptance criteria:** `pnpm test:coverage` passes with thresholds enforced, and per-file gaps below 80% are called out.
- **Status:** Complete
- **Completion evidence:** See the v0.1.0 readiness report for the measured numbers.
- **Related files:** `vitest.config.ts`, [docs/v0.1.0-readiness.md](v0.1.0-readiness.md)

- [x] SBX-083: Coverage verification

### SBX-084: Fresh-clone verification

- **Phase:** 8
- **Dependencies:** SBX-026
- **Description:** Verify a clean checkout passes install, lint, typecheck, test, and build.
- **Acceptance criteria:** Every documented command succeeds from a pristine clone with no manual steps beyond those documented.
- **Status:** Complete
- **Completion evidence:** Recorded in [docs/v0.1.0-readiness.md](v0.1.0-readiness.md).
- **Related files:** `docs/v0.1.0-readiness.md`

- [x] SBX-084: Fresh-clone verification

### SBX-085: Fresh-project walkthrough

- **Phase:** 8
- **Dependencies:** SBX-063, SBX-077
- **Description:** Walk the full acceptance path in a brand-new temporary project using only the built CLI.
- **Acceptance criteria:** All fourteen MVP acceptance criteria are demonstrated with recorded command output.
- **Status:** Complete
- **Completion evidence:** Recorded in [docs/v0.1.0-readiness.md](v0.1.0-readiness.md).
- **Related files:** `docs/v0.1.0-readiness.md`

- [x] SBX-085: Fresh-project walkthrough

### SBX-086: Changelog and readiness report

- **Phase:** 8
- **Dependencies:** SBX-083, SBX-084, SBX-085
- **Description:** Record the v0.1.0 release in `CHANGELOG.md` and publish a readiness report mapping evidence to each acceptance criterion.
- **Acceptance criteria:** The changelog follows Keep a Changelog; the report addresses all fourteen criteria and lists known limitations.
- **Status:** Complete
- **Completion evidence:** `CHANGELOG.md`, [docs/v0.1.0-readiness.md](v0.1.0-readiness.md).
- **Related files:** `CHANGELOG.md`, `docs/v0.1.0-readiness.md`

- [x] SBX-086: Changelog and readiness report

### SBX-087: Documentation consistency review

- **Phase:** 8
- **Dependencies:** SBX-086
- **Description:** Re-read every document against the implementation and reconcile contradictions.
- **Acceptance criteria:** No document contradicts the code; all internal links resolve; no untracked TODOs remain.
- **Status:** Complete
- **Completion evidence:** Recorded in [docs/v0.1.0-readiness.md](v0.1.0-readiness.md).
- **Related files:** `docs/**`

- [x] SBX-087: Documentation consistency review

---

## Backlog and follow-up work

These tasks are tracked but deliberately out of scope for v0.1.0. See [docs/roadmap.md](roadmap.md) for the phased plan.

- [ ] SBX-018: Assign code ownership in `.github/CODEOWNERS`. **Blocked** on a GitHub owner decision.
- [ ] SBX-099: Verify the CI workflow on a real GitHub remote. **Blocked** until a remote exists; every step is verified locally.
- [ ] SBX-100: Revisit TypeScript 7 once `typescript-eslint` supports it. See [ADR-0007](architecture/decisions/ADR-0007-typescript-version-pin.md).
- [ ] SBX-101: Reconsider a caching build orchestrator if build times grow. See [ADR-0006](architecture/decisions/ADR-0006-build-orchestration.md).
- [ ] SBX-102: Remote registry service and client transport abstraction.
- [ ] SBX-103: Registry REST API.
- [ ] SBX-104: Authentication and organization support.
- [ ] SBX-105: Private enterprise registries.
- [ ] SBX-106: Web-based catalog and management portal.
- [ ] SBX-107: Cursor extension.
- [ ] SBX-108: Visual Studio Code extension.
- [ ] SBX-109: One-click resource installation.
- [ ] SBX-110: Resource publishing CLI.
- [ ] SBX-111: Signed packages and signature verification.
- [ ] SBX-112: Resource reputation and verification.
- [ ] SBX-113: Policy enforcement.
- [ ] SBX-114: Approval workflows.
- [ ] SBX-115: Usage analytics with explicit opt-in.
- [ ] SBX-116: Resource update notifications.
- [ ] SBX-117: Compatibility scoring.
- [ ] SBX-118: Hosted workflow execution.
- [ ] SBX-119: Sandboxed script execution.
- [ ] SBX-120: MCP server integration.
- [ ] SBX-121: Multi-language SDKs.
- [ ] SBX-122: GitHub organization synchronization.
- [ ] SBX-123: Team-curated collections.
- [ ] SBX-124: Enterprise governance controls.
