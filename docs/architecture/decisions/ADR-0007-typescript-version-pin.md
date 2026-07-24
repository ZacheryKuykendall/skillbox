# ADR-0007: TypeScript version pin

- **Status:** Accepted
- **Date:** 2026-07-24
- **Tasks:** SBX-001, SBX-021

## Context

At the time this repository was created, `npm view typescript dist-tags` reported:

```json
{
  "beta": "6.0.0-beta",
  "rc": "7.0.1-rc",
  "latest": "7.0.2",
  "next": "7.1.0-dev.20260724.1"
}
```

TypeScript 7 is the native compiler rewrite. Installing `typescript@latest` would pull 7.0.2.

However, `typescript-eslint` — required for type-aware linting — declares:

```json
{
  "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
  "typescript": ">=4.8.4 <6.1.0"
}
```

That upper bound excludes both TypeScript 7 and TypeScript 6. Its `canary` tag (`8.65.1-alpha.7`) carries the identical constraint, so there is no prerelease path either.

Type-aware linting depends on the TypeScript compiler API. TypeScript 7's native rewrite changes that surface, which is why the peer range has not moved.

This matters because the definition of done requires `pnpm lint` and `pnpm typecheck` to pass. Taking `latest` would produce an unsatisfied peer dependency and either broken or degraded linting from the first commit.

The versions above were read from the registry, not assumed — which is the only reason the conflict was caught before installation rather than after.

## Decision

**Pin TypeScript to exactly `5.9.3`**, the highest release inside `typescript-eslint`'s supported range.

The pin is exact, not `^5.9.3`, so the resolved version cannot drift.

Also pinned for the same reason:

- `eslint` at `10.8.0`, which is inside `typescript-eslint`'s supported ESLint range.
- `typescript-eslint` at `8.65.0`.

Revisit when `typescript-eslint` publishes a stable release whose peer range admits TypeScript 7 (SBX-100).

## Alternatives considered

**Use TypeScript 7 and drop type-aware linting.** Rules like `no-floating-promises`, `no-misused-promises`, and `no-unnecessary-condition` require type information and are exactly the rules that catch real bugs in filesystem and async code — which is most of `@skillbox/core`. Rejected: losing them to gain compiler speed on a four-package repository is a bad trade.

**Use TypeScript 7 and accept a broken peer dependency.** Would require `--strict-peer-dependencies=false` and would leave linting in an unsupported, possibly silently-degraded state. Rejected: starting a project with a known-broken quality gate contradicts the requirement not to hide failures.

**Use TypeScript 7 for building and 5.9.3 for linting.** Technically possible with two installs. Rejected: two compiler versions means two sets of type-checking semantics, so lint and build could legitimately disagree — a genuinely confusing failure mode for a marginal benefit.

**Use TypeScript 6.0.0-beta.** Rejected on two counts: it is a beta, and `<6.1.0` would admit it but `typescript-eslint` has not validated against a 6.x beta. No reason to take prerelease risk here.

**Float the version with `^5.9.3`.** Rejected. An exact pin means CI and local development compile with identical semantics, and a compiler upgrade becomes a deliberate, reviewable commit. This ADR exists precisely because a floating version would have silently caused the problem it documents.

## Consequences

Positive:

- Type-aware linting works, and the rules that catch real async and filesystem bugs stay available.
- No unsatisfied peer dependencies, so `pnpm install` is clean.
- CI and local development share identical compiler semantics.
- TypeScript 5.9.3 is mature and well understood.

Negative:

- Not on the latest compiler, so TypeScript 7's compilation speed improvements are unavailable. Negligible at this repository's size.
- Newer language features in 6.x and 7.x are unavailable. None are needed.
- The pin needs periodic revisiting, tracked as SBX-100.
- Exact pinning means upgrades require a deliberate commit rather than drifting forward. Intended.

## Follow-up work

- SBX-100: Re-evaluate TypeScript 7 once `typescript-eslint` publishes a stable release supporting it. Verify with `npm view typescript-eslint peerDependencies` before attempting the upgrade, and expect to bump `typescript`, `typescript-eslint`, and possibly `eslint` together.

## References

- [typescript-eslint dependency versions](https://typescript-eslint.io/users/dependency-versions/)
- [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references.html)
