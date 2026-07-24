# ADR-0001: Monorepo structure and toolchain

- **Status:** Accepted
- **Date:** 2026-07-24
- **Tasks:** SBX-014, SBX-020, SBX-021

## Context

Skillbox was started in an empty repository with no existing code, configuration, or technical constraints. The MVP needs a resource schema, a domain library, a CLI, and shared test fixtures, and it must be extensible toward a remote registry, a web portal, and editor extensions without a restructure.

Two shapes were available: a single package containing everything, or several packages with explicit boundaries.

The deciding consideration is the set of future consumers. An editor extension, a registry service, and a web catalog would each need the domain logic without the CLI. If that logic starts out interleaved with command handlers, every one of those consumers begins with an extraction.

The available toolchain was verified rather than assumed: Node v24.10.0, pnpm 10.18.1, npm 11.6.1, git 2.51.0.

## Decision

A pnpm workspace monorepo with four packages and a strictly one-directional dependency graph.

```text
packages/schema    @skillbox/schema    Manifest types, validation, JSON Schema
packages/core      @skillbox/core      Discovery, resolution, planning, installation
packages/cli       @skillbox/cli       Command-line interface
packages/testing   @skillbox/testing   Shared fixtures (private)
```

`cli -> core -> schema`, never reversed. `core` may not import CLI presentation logic and may not write to stdout.

Toolchain:

- **TypeScript** in strict mode, **ESM** only, `NodeNext` resolution and `verbatimModuleSyntax`.
- **pnpm workspaces** for package management.
- **`tsc -b`** with project references for builds; **`pnpm -r`** for script fan-out. See [ADR-0006](ADR-0006-build-orchestration.md).
- **Zod** for runtime validation. See [ADR-0002](ADR-0002-resource-manifest-format.md).
- **Vitest** for tests, with coverage gated at 90%.
- **ESLint** flat config with `typescript-eslint`, plus **Prettier**.
- **GitHub Actions** for CI.
- **Commander** for CLI argument parsing.

The npm scope is `@skillbox/*`, chosen by the repository owner. Packages are unpublished in v0.1.0.

The layering rule is enforced by an ESLint `no-restricted-imports` rule rather than left to convention, because a boundary that is only documented erodes.

## Alternatives considered

**Single package.** Simplest to set up and adequate for the MVP alone. Rejected because it makes the layering rule unenforceable — nothing would stop domain logic from reaching into terminal output — and every future non-CLI consumer would begin with an extraction.

**npm or Yarn workspaces.** Both are capable. pnpm was chosen because it is already installed and configured, its strict `node_modules` layout catches undeclared dependencies that hoisting would hide, and `pnpm -r` provides topological script execution without an extra tool.

**Turborepo or Nx.** Task graphs and remote caching are genuinely useful at scale. Rejected for now: four small packages build in seconds, `tsc -b` already computes reference order and caches incrementally, and both tools add a large native binary. Revisit if build times grow (SBX-101).

**CommonJS.** Rejected. Node's ESM support is mature at Node 20+, dependencies are ESM-first, and shipping dual formats would double the build surface for no MVP benefit.

**A bundler (tsup, tsdown, esbuild).** Rejected. These are libraries and a Node CLI, not browser artifacts. `tsc` emits usable ESM plus declaration files, and adding a bundler would add a dependency and a failure mode without improving anything measurable (NFR-7).

## Consequences

Positive:

- The domain layer is consumable without a terminal, so future consumers add a dependency rather than perform surgery.
- Package boundaries make the intended layering visible and mechanically enforced.
- Project references give incremental builds and fast per-package typechecking.
- No bundler and no orchestrator means fewer moving parts and fewer version conflicts.

Negative:

- More configuration files than a single package: four `package.json` and four `tsconfig.json`.
- Cross-package changes touch several directories.
- Project references must be kept in sync with `package.json` dependencies; a mismatch produces a confusing build error.
- ESM-only means no CommonJS consumer can `require` these packages. Acceptable for a CLI-first tool on Node 20+.

## Follow-up work

- SBX-101: Reconsider a caching orchestrator if build times grow.
- SBX-102: Add a remote registry as a second catalog implementation behind the existing interface.
