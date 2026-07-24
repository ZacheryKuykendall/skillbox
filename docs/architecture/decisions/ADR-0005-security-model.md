# ADR-0005: Deny-by-default security model

- **Status:** Accepted
- **Date:** 2026-07-24
- **Tasks:** SBX-014, SBX-040, SBX-080, SBX-081, SBX-082

## Context

Skillbox installs files described by manifests that other people wrote. A manifest's fields directly determine filesystem operations. That makes a manifest closer to a request body from the internet than to a project's own configuration file.

The package ecosystem offers a clear lesson: the dominant supply-chain attack vector is not clever exploitation of package managers, it is lifecycle scripts. `postinstall` turns "I downloaded some files" into "I ran a stranger's code," and the majority of published npm supply-chain incidents rely on it.

Skillbox v0.1.0 also lacks every mitigation that would make executing resource code defensible: no author identity, no package signing, no reputation, and no sandbox.

## Decision

**Deny by default.** Capability must be declared and shown to be granted, and the most dangerous capabilities are not available at all.

### 1. No execution, and no mechanism for it

Installation copies files. Nothing more.

There are no lifecycle hooks. `postinstall` and its equivalents do not exist and are not planned. This is a design property rather than a configurable control, so it cannot be misconfigured or bypassed.

For a `script` resource, **installing and running are separate actions**. Skillbox installs; you run it yourself, deliberately. `spec.interpreter` documents how you _would_ run it; Skillbox never acts on it.

`validate`, `inspect`, `search`, `list`, and `doctor` are read-only and equally never execute resource code.

### 2. Containment by relativity, checked twice

Every write must land inside the project root. A destination is permitted only if `path.relative(root, resolved)` is non-empty, does not begin with `..`, and is not absolute.

String prefix comparison is explicitly rejected as the mechanism: `startsWith('/project')` accepts `/project-evil`, and on Windows it breaks on case differences and 8.3 short names. Relativity normalizes first and handles all of these.

The check happens twice on purpose. The schema layer rejects malformed paths as data — absolute, `..`-containing, drive-prefixed, UNC, NUL-bearing. `core/paths.ts` then re-verifies containment against the concrete project root at install time, including resolving the real path of the destination's existing ancestor so a pre-planted symlink cannot redirect a write outside the project.

### 3. Secret values never enter the system

Manifests declare environment variables by **name only**. There is no field for a value, and strict object validation means one cannot be added by a resource author.

Skillbox never reads a declared variable's value, never writes one to any artifact, and never substitutes environment values into installed files. `doctor` checks presence with a `name in process.env` test, never a read. Variable substitution operates on project variables, which are declared configuration and never secrets.

### 4. Effects are visible before they occur

Planning is separate from application. The complete plan — resources, versions, destinations, declared permissions, required environment variable names — is available before anything is written. `--dry-run` is the same code path stopping before application.

### 5. Atomicity

Application is journaled: created files and overwritten content are recorded so any failure restores the prior state. The manifest and lockfile are written last, so a crash cannot leave configuration claiming an incomplete install.

### 6. Permissions are declarative, not enforced

A closed permission vocabulary is validated and displayed, but **not enforced** in v0.1.0. Skillbox has no runtime, so there is nothing to enforce it in.

This is stated explicitly everywhere permissions appear, because a permission list that looks like a sandbox but is not one is worse than no list at all. The vocabulary exists now so resources authored today carry the metadata a future sandbox will need.

## Alternatives considered

**Support lifecycle hooks with a confirmation prompt.** Rejected. Prompts are approved reflexively, and one approval is all an attacker needs. The stronger position — no mechanism at all — costs the MVP nothing, since no MVP feature requires post-install work.

**Sandboxed execution in v0.1.0.** The ideal end state. Rejected as out of scope: doing it properly means process isolation, a filesystem and network policy layer, and a permission enforcement engine — a project in its own right (SBX-119). Shipping a weak sandbox would be worse than shipping none, because it would invite trust it could not justify.

**Enforce permissions without a sandbox.** Rejected as not meaningful. Without execution there is nothing to gate, and gating Skillbox's own file copying against a resource's self-declared permissions would be theater.

**`startsWith` for containment.** Rejected. Demonstrably wrong for sibling-prefix directories and unreliable on Windows.

**Rely on schema path validation alone.** Rejected. The schema cannot see the project root and cannot resolve symlinks, so it cannot decide containment. Both layers are necessary.

**Allow absolute install targets for advanced use, e.g. a global config directory.** Rejected. A single legitimate use case is not worth turning the security boundary into a special case. If global installs are needed later they must be an explicit, separately-approved mode with its own ADR.

**Read environment values to validate them, e.g. check a token looks well-formed.** Rejected. Reading a secret to validate it means it exists in memory, in a stack trace, and potentially in an error message. Presence checking answers the only question `doctor` actually needs to ask.

**Verify signatures.** Not possible yet: signing requires identity, which requires the account system deferred to SBX-104. Tracked as SBX-111.

## Consequences

Positive:

- Installing a resource cannot execute code. This is the strongest guarantee in the system and it holds by construction.
- Path traversal is blocked at two layers, tested per-vector.
- Secrets cannot leak because they are never read.
- Users see effects before they happen; dry runs are real.
- Failed installs leave no partial state.

Negative:

- Resources cannot perform setup work. Any post-install step must be documented for the user to run. Accepted, and arguably better: the user sees what is happening.
- Permissions look enforceable but are not. Mitigated by stating it explicitly wherever they appear, but it remains the most likely thing to be overread.
- Two-layer path checking duplicates some validation. Accepted deliberately; defense in depth is worth a redundant check on the highest-risk boundary.
- No protection against a resource whose _content_ is malicious once you run it yourself. Skillbox surfaces the declarations; the decision is the user's.
- No protection against a tampered file with a correctly-updated digest. Requires signing (SBX-111).

## Follow-up work

- SBX-111: Package signing and verification.
- SBX-112: Reputation and verification.
- SBX-113, SBX-114: Policy enforcement and approval workflows.
- SBX-119: Sandboxed execution, which is the prerequisite for enforcing permissions.

## References

- [Subresource Integrity](https://www.w3.org/TR/SRI/)
- [OpenSSF: npm Best Practices Guide](https://github.com/ossf/package-manager-best-practices/blob/main/published/npm.md) — on lifecycle script risk
- [Node.js `path.relative` documentation](https://nodejs.org/api/path.html#pathrelativefrom-to)
