# ADR-0003: Local registry first

- **Status:** Accepted
- **Date:** 2026-07-24
- **Tasks:** SBX-014, SBX-042

## Context

Skillbox needs somewhere for resources to live. The long-term vision includes a remote registry with publishing, authentication, namespace ownership, and signed packages. That is a substantial service: an API, storage, identity, a permission model, and an availability commitment.

The MVP's job is to prove the resource model works end to end. The open question is whether it needs a network to do that.

Everything the MVP must demonstrate — discovery, search, version resolution, dependency graphs, install planning, conflict detection, lockfiles, integrity, removal — is independent of where resources are fetched from. A remote registry changes how bytes arrive, not what the domain model does with them.

There is also a sequencing argument. A registry API constrains the resource format: identifier rules become URL structure, versioning becomes cache semantics, dependency declarations become resolution round-trips. Designing that API before the resource model has met seven real resources would mean designing it twice.

## Decision

**v0.1.0 ships one registry: the local `registry/` directory in this repository.**

Discovery walks the directory tree, loads every `skillbox.yaml`, validates it, and indexes it by resource identifier.

Catalog access sits behind a narrow interface — load, search, resolve by reference — that makes no assumption about the backing store. Discovery returns a fully materialized catalog; nothing downstream knows whether it came from disk or a network.

No HTTP client, no cache directory, no authentication, and no transport abstraction layer is built in v0.1.0. The interface is narrow enough that a remote implementation slots in behind it, but no speculative abstraction is created for a caller that does not yet exist (per the prohibition on speculative abstractions in `AGENTS.md`).

Deferred to SBX-102 and beyond: remote registry service, REST API, authentication, private registries, publishing, and signing.

## Alternatives considered

**Build the remote registry in v0.1.0.** Rejected. It is a service, not a feature: storage, identity, availability, and a versioned API. It would consume the entire MVP budget and produce an API designed against an unproven resource model.

**Git-based registry — resolve resources from arbitrary git URLs.** Genuinely appealing: no server, versioning via tags, and it works today. Rejected for v0.1.0 as scope creep with a security cost. It introduces network fetching, credential handling for private repositories, ref-to-semver mapping, and a clone cache — all before the local case is proven. Worth revisiting as a stepping stone to SBX-102, and cheaper than a full service.

**npm as the transport, distributing resources as npm packages.** Rejected. It would inherit npm's `postinstall` execution model, which directly contradicts [ADR-0005](ADR-0005-security-model.md), and it forces resource identifiers into npm's naming rules rather than Skillbox's.

**A single manifest file listing all resources instead of directory discovery.** Rejected. A central index is a merge-conflict magnet: every contributed resource touches the same file. Directory discovery means adding a resource touches only its own directory.

**Build a transport abstraction now, with a local implementation.** Rejected as a speculative abstraction. The right shape for a remote transport depends on decisions not yet made — caching, authentication, partial fetch — and guessing produces an interface that has to be rewritten anyway. The narrow catalog interface is a natural seam, not a speculative one; it exists because the domain needs it, and it happens to be replaceable.

## Consequences

Positive:

- The MVP is achievable, and every domain behavior can be proven without a network.
- Tests need no HTTP mocking. Discovery tests are directory fixtures.
- No network means no availability, latency, or authentication failure modes in v0.1.0.
- The resource format gets validated against seven real resources before it constrains an API.
- Contributing a resource is a pull request, which gives review for free.

Negative:

- Resources cannot be shared outside this repository. This is the central limitation of v0.1.0 and is stated plainly in the README and CHANGELOG.
- Consumers must clone the repository, which is acceptable for an MVP but not a product.
- Some code will change when remote support lands — resolution becomes asynchronous at the boundary and errors gain network cases. The narrow interface limits the blast radius but does not eliminate it.
- Namespace ownership is unenforced. Any contributor can use any namespace, which is fine under pull-request review and becomes a real problem the moment publishing exists (T6 in the [security model](../security-model.md)).

## Follow-up work

- SBX-102: Remote registry service and a second catalog implementation.
- SBX-103: Registry REST API.
- SBX-104: Authentication, organizations, and namespace ownership — a prerequisite for publishing.
- SBX-105: Private enterprise registries.
- SBX-110: Publishing CLI.
- SBX-111: Signed packages.
