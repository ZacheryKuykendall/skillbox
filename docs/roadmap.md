# Roadmap

Where Skillbox could go after v0.1.0. Everything here is **deferred**, tracked in the [task ledger](TASKS.md) backlog, and explicitly not permitted to delay the MVP.

Nothing on this roadmap has a committed date. Ordering reflects dependency, not schedule.

---

## Now: v0.1.0 — local foundation

Shipped. Resource format, local catalog, resolution, deterministic installation, and a CLI. See the [changelog](../CHANGELOG.md) and [readiness report](v0.1.0-readiness.md).

The deliberate boundary: everything network-shaped is excluded so the resource model could be proven against seven real resources first. Designing a registry API before that would have meant designing it twice.

---

## Phase A: Sharing beyond one repository

The central limitation of v0.1.0 is that resources cannot leave this repository. This phase fixes that.

**SBX-102 — Remote registry service.** A second catalog implementation behind the existing load/search/resolve interface. Needs a fetch cache, offline behavior, and an integrity story for fetched content.

**SBX-103 — Registry REST API.** Resource metadata, version listing, and content retrieval. Deliberately after SBX-102's client so the API is shaped by a real consumer.

**SBX-104 — Authentication, organizations, and namespace ownership.** A prerequisite for publishing, and the mitigation for dependency confusion and typosquatting (T6, T9 in the [security model](architecture/security-model.md)). Namespaces are unowned today; publishing without ownership would be irresponsible.

**SBX-110 — Publishing CLI.** `skillbox publish`. Requires SBX-104.

**SBX-105 — Private enterprise registries.** Self-hosted or scoped registries with access control.

A git-based registry — resolving from arbitrary git URLs — is worth considering as a cheaper stepping stone. It was rejected for v0.1.0 as scope creep ([ADR-0003](architecture/decisions/ADR-0003-local-registry-first.md)) but needs no server.

---

## Phase B: Trust

Once resources come from strangers, structural validation stops being enough.

**SBX-111 — Signed packages.** Signing and verification. Requires identity from SBX-104. Closes the residual risk that a tampered file with a correctly-updated digest is indistinguishable from a legitimate one (T5).

**SBX-112 — Reputation and verification.** Verified publishers, download signals, provenance.

**SBX-113 — Policy enforcement.** Organization rules such as "no `process:spawn`" or "only verified publishers."

**SBX-114 — Approval workflows.** Review gates before a resource enters an organization's allowed set.

---

## Phase C: Discovery and integration

**SBX-106 — Web catalog and management portal.** Browse, search, and read resources without a clone.

**SBX-107 / SBX-108 — Cursor and VS Code extensions.** In-editor browse and install. `@skillbox/core` was kept free of terminal dependencies specifically so these can consume it directly ([ADR-0001](architecture/decisions/ADR-0001-monorepo-structure.md)).

**SBX-109 — One-click installation.** Deep links from the portal into the editor.

**SBX-116 — Update notifications.** Alerts when an installed resource has a newer compatible version.

**SBX-120 — MCP server integration.** Expose the catalog over the Model Context Protocol so agents can discover resources directly.

---

## Phase D: Execution

The largest and most security-sensitive area. Skillbox does not execute resource code today, and that is a deliberate guarantee, not a gap to be filled casually.

**SBX-119 — Sandboxed script execution.** Process isolation with filesystem and network policy. This is the prerequisite for making permissions _enforced_ rather than declarative — the single most likely thing for users to misread about the current model.

**SBX-118 — Hosted workflow execution.** Running `workflow` resources as orchestrated steps. Requires SBX-119.

Ordering here is non-negotiable: enforcement before execution, execution before orchestration. Shipping a weak sandbox would be worse than shipping none, because it would invite trust it could not justify.

---

## Phase E: Scale and ecosystem

**SBX-115 — Usage analytics.** Explicitly opt-in. No telemetry without consent.

**SBX-117 — Compatibility scoring.** Signals about whether a resource will work in a given project.

**SBX-121 — Multi-language SDKs.** Python first, to consume the catalog from non-Node projects.

**SBX-122 — GitHub organization synchronization.** Discover resources across an organization's repositories.

**SBX-123 — Team-curated collections.** Named sets installable as a unit.

**SBX-124 — Enterprise governance controls.** Audit trails, mandatory review, license and compliance reporting.

---

## Near-term, non-feature work

Small items that do not need a phase:

- **SBX-018** — Done. `.github/CODEOWNERS` assigns ownership; "Require review from Code Owners" stays off until there is a second maintainer to review, since with one code owner it would block every merge.
- **SBX-099** — Verify the CI workflow on GitHub. The remote now exists and `main` is pushed; the first run is outstanding.
- **SBX-100** — Revisit TypeScript 7. Blocked upstream on [typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940): `typescript-eslint` throws at module load on TypeScript 7, so linting fails outright rather than degrading ([ADR-0007](architecture/decisions/ADR-0007-typescript-version-pin.md)).
- **SBX-101** — Reconsider a caching build orchestrator if build times grow ([ADR-0006](architecture/decisions/ADR-0006-build-orchestration.md)).
- **Manifest format stabilization** — `v1alpha1` is explicitly unstable. Reaching `v1` requires the format to survive contact with resources written by people who did not design it.

---

## Not planned

To set expectations:

- **A runtime or framework.** Skillbox packages and delivers. Installing a component gives you source you own.
- **Replacing your package manager.** npm, PyPI, and their peers distribute libraries you link against. Skillbox distributes assets you adopt.
- **Lifecycle hooks.** No `postinstall`, ever. This is a permanent design position, not a deferred feature ([ADR-0005](architecture/decisions/ADR-0005-security-model.md)).
- **Judging resource content.** Skillbox validates structure and confines effects. It does not decide whether a prompt is any good.

---

## How this document changes

Scope changes are recorded here and in the [task ledger](TASKS.md) together. A change in direction that affects the architecture needs an ADR.

Moving something from this roadmap into active work requires the [MVP acceptance criteria](product/requirements.md#mvp-acceptance-criteria) to be met first.
