# Product Vision

## The problem

Software teams rebuild the same capabilities endlessly.

A code review prompt lives in one engineer's notes. A REST client wrapper is copy-pasted across four services and diverges in each. A structured logger gets reimplemented every time a new project starts. An agent definition that works well is shared as a message in a chat thread and then lost.

None of these assets are versioned. None declare their dependencies. None state what permissions or environment they need. None can be discovered by someone who did not already know they existed. There is no way to tell whether the copy in your project is current, modified, or safe.

The result is duplicated effort, silent drift, and capability that exists somewhere in the organization but is unavailable to the person who needs it.

The rise of AI-assisted development sharpened the problem. Prompts, skills, agent definitions, and tool integrations are now real engineering assets that shape how software gets built — but they are managed with far less rigor than the code they produce. They are shared as text, not as packages.

## The thesis

> Everything needed to give software a new ability should be packaged, documented, validated, and stored in one organized box.

Package management solved this for libraries. It has not been applied to the wider set of things that give software new abilities. Skillbox applies the same discipline — a manifest, a version, a dependency graph, a lockfile, an integrity check — to prompts, skills, agents, scripts, API integrations, workflows, and components.

The insight is that these seven kinds of asset differ in content but not in lifecycle. Each one needs to be described, validated, versioned, discovered, installed to a known location, tracked, updated, and removed. That shared lifecycle is what Skillbox owns. The differences between kinds are confined to a `spec` block, so a prompt is not forced to describe a runtime and a component is not forced to describe model inputs.

## What Skillbox is

A **resource** is a versioned, documented, validated unit of capability. It is a directory with a manifest, a README, and source files. It is identified as `namespace/name@version`.

**Skillbox** is the toolkit that makes resources useful: a catalog to discover them, a resolver to work out which versions and dependencies you need, an installer that puts files where they belong and records exactly what it did, and a validator that keeps the whole thing honest.

A developer should be able to think "I need a code review capability," find one, read what it does and what it will touch, install it, and see it recorded in their project configuration — in under a minute, without reading the implementation first.

## What Skillbox is not

- **Not a runtime.** Skillbox does not execute prompts, run agents, or invoke scripts. It packages and delivers them. Sandboxed execution is a possible future phase, deliberately excluded from the MVP so that installation carries no execution risk.
- **Not a framework.** Installing a component gives you source files in your project that you own and can edit. Skillbox does not impose an architecture or insert itself into your runtime dependencies.
- **Not a replacement for npm, PyPI, or your language's package manager.** Those distribute libraries you link against. Skillbox distributes assets you adopt into your project, frequently as files you then modify.
- **Not a chat-log or snippet manager.** A resource that cannot state its version, dependencies, and effects is not a Skillbox resource.

## Design principles

**Deny by default.** Resources are untrusted input. Installation confines writes to the project directory and never executes resource code. Capability must be declared to be granted, and declarations are shown to the user before anything happens.

**Declaration over convention.** A resource says where it installs, which files it owns, and what it requires. Skillbox does not guess from directory layout, because guessing is how path traversal and surprise overwrites happen.

**Planning is separate from mutation.** Resolution produces an immutable plan describing every intended file operation. Only then does a separate step apply it. This makes dry runs real, conflict detection reliable, and rollback possible.

**Determinism.** The same inputs produce the same lockfile bytes on every machine and platform. A lockfile that churns is a lockfile nobody reads.

**Local first.** The MVP catalog lives in the repository. Building the local case properly defines the interfaces a remote registry will later implement, rather than inventing a network protocol before the domain model is settled.

**Documentation is part of the artifact.** A resource without a README that explains its inputs, outputs, and effects is incomplete, and Skillbox validation says so.

## The v0.1.0 boundary

The MVP proves the model end to end on a local catalog: define the format, validate it, resolve it, install it deterministically, and remove it safely — with one working example of every kind and documentation good enough for someone else to extend.

Everything network-shaped is deferred: remote registries, publishing, authentication, signing, a web portal, editor extensions, hosted execution, and governance. Those are real, and they are in the [roadmap](../roadmap.md). None of them are allowed to delay a working v0.1.0, because each one is easier to design well once the resource model has survived contact with seven real examples.

## How we will know it worked

Success for v0.1.0 is narrow and testable: a developer clones the repository, installs, runs the checks, initializes Skillbox in a project, searches the catalog, inspects a resource, installs it, sees it in their configuration and lockfile, validates the project, removes it cleanly, and understands how to contribute a new resource of their own.

The measurable claim beyond that is reuse: a capability added to the box once should be installable by the next person without them rebuilding it. The full criteria are enumerated in [requirements.md](requirements.md#mvp-acceptance-criteria).
