# ADR-0006: Build orchestration and dependency restraint

- **Status:** Accepted
- **Date:** 2026-07-24
- **Tasks:** SBX-014, SBX-024, SBX-025

## Context

A four-package monorepo needs builds in dependency order, workspace-wide lint, typecheck, test, and format commands, and a coverage gate at 90% for lines, statements, functions, and branches.

The reflexive answer is a task orchestrator plus a bundler. Both were evaluated against actual need rather than adopted by default, per the standing rule that a dependency added for convenience without evaluating necessity is a defect (NFR-7).

## Decision

### Builds: `tsc -b` over project references

Each package has a `tsconfig.json` declaring `references` to its dependencies. The root `tsconfig.json` is a solution file referencing all four.

`tsc -b` computes the correct order itself from the reference graph and rebuilds incrementally using `.tsbuildinfo`. No orchestrator is needed for ordering, because TypeScript already knows the graph.

### Script fan-out: `pnpm -r`

Workspace-wide scripts use `pnpm -r`, which executes in topological order based on workspace dependencies.

### No bundler

`tsc` emits ESM plus declaration files. These are Node libraries and a Node CLI, not browser artifacts, so there is nothing to bundle for.

### Tests: Vitest with a 90% coverage gate

One root `vitest.config.ts` with a project per package. `@vitest/coverage-v8` enforces thresholds of 90 for lines, statements, functions, and branches. Below the gate is a hard CI failure.

### No color library

Terminal color comes from Node's built-in `node:util` `styleText`, verified present in Node 24.10.0. It honors `NO_COLOR` and non-TTY output automatically.

### No JSON Schema converter

Zod 4's native `z.toJSONSchema()` replaces `zod-to-json-schema`.

### Pinned versions

Every dependency version was verified against the registry rather than guessed:

| Package               | Version | Role                                                                  |
| --------------------- | ------- | --------------------------------------------------------------------- |
| `typescript`          | 5.9.3   | Compiler — pinned, see [ADR-0007](ADR-0007-typescript-version-pin.md) |
| `zod`                 | 4.4.3   | Validation and JSON Schema                                            |
| `yaml`                | 2.9.0   | Manifest parsing                                                      |
| `semver`              | 7.8.5   | Version resolution                                                    |
| `commander`           | 15.0.0  | CLI parsing                                                           |
| `vitest`              | 4.1.10  | Test runner                                                           |
| `@vitest/coverage-v8` | 4.1.10  | Coverage                                                              |
| `eslint`              | 10.8.0  | Linting                                                               |
| `typescript-eslint`   | 8.65.0  | TypeScript lint rules                                                 |
| `globals`             | 17.7.0  | ESLint global definitions                                             |
| `prettier`            | 3.9.6   | Formatting                                                            |
| `tsx`                 | 4.23.1  | Running TypeScript for repo scripts                                   |
| `@types/node`         | 26.1.1  | Node type definitions                                                 |

Four runtime dependencies total. Each earns its place: correct YAML parsing, correct semver comparison, validation with type inference, and argument parsing.

## Alternatives considered

**Turborepo.** Task graph orchestration with local and remote caching, and the specification's suggested "lightweight monorepo build orchestrator." Rejected for now: `tsc -b` already provides ordering and incremental caching, `pnpm -r` already provides topological fan-out, and four small packages build in seconds. Turborepo would add a large platform-specific native binary and a second source of truth for the task graph to solve a problem that does not exist yet. Revisit if build times grow (SBX-101).

**Nx.** Same reasoning, plus a heavier conceptual footprint including generators and plugins that this repository would not use.

**`tsup` or `tsdown`.** Fast bundling with a pleasant API. Rejected: bundling matters for browser payload size and for hiding internals. Neither applies. `tsc` output is directly runnable by Node and produces the declaration files consumers need. A bundler would add a dependency, a config file, and a sourcemap failure mode for no measurable gain.

**`tsc` per package without project references.** Rejected: it forfeits ordering and incremental rebuild, requiring manual sequencing — reinventing what references already do.

**Jest.** Rejected: Vitest has native ESM and TypeScript support with no transform configuration, and Jest's ESM support still requires care. Vitest is also faster on this size of suite.

**Node's built-in test runner.** Genuinely appealing for zero dependencies. Rejected: coverage thresholds, workspace projects, and watch-mode ergonomics all require additional assembly, and the coverage gate is a hard requirement. A single well-scoped test dependency is worth it.

**`picocolors` or `chalk`.** Rejected: `node:util` `styleText` is built in and verified working on the target Node version. Even a 2 kB dependency is not worth adding for functionality already in the runtime.

**`zod-to-json-schema`.** Rejected: superseded by Zod 4's native `z.toJSONSchema()`.

**Loose version ranges (`^`).** Rejected for the toolchain. Exact pins mean CI and local development run identical versions, and upgrades are explicit, reviewable commits. [ADR-0007](ADR-0007-typescript-version-pin.md) exists precisely because a floating TypeScript would have silently broken linting.

## Consequences

Positive:

- Fewer moving parts: no orchestrator config, no bundler config, no second task graph to keep in sync.
- Build order is derived from the reference graph, so it cannot drift from actual dependencies.
- Incremental builds work out of the box via `.tsbuildinfo`.
- Four runtime dependencies keeps the supply-chain surface small, which is consistent with the project's own security posture.
- Exact pins make the toolchain reproducible and upgrades deliberate.

Negative:

- No build caching across CI runs. Acceptable at this size; revisit as SBX-101 if it stops being true.
- Project references must stay in sync with `package.json` dependencies. A mismatch produces a confusing TypeScript error, so the relationship is documented in [repository-structure.md](../repository-structure.md).
- `pnpm -r` provides ordering but no parallelism control or output grouping. Adequate for four packages.
- Exact pins require deliberate upgrade commits rather than drifting forward.
- Consumers must support ESM. Acceptable for a Node 20+ CLI-first tool.

## Follow-up work

- SBX-100: Revisit TypeScript 7 once `typescript-eslint` supports it.
- SBX-101: Reconsider a caching orchestrator if build times grow beyond a few seconds.

## References

- [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [pnpm recursive commands](https://pnpm.io/cli/recursive)
- [Node.js `util.styleText`](https://nodejs.org/api/util.html#utilstyletextformat-text-options)
- [Vitest coverage configuration](https://vitest.dev/guide/coverage.html)
