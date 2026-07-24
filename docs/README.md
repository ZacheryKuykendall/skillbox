# Skillbox Documentation

Start here.

## If you want to...

| Goal                                                    | Read                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| Use Skillbox in a project                               | [Getting started](guides/getting-started.md)                        |
| Look up a command or exit code                          | [CLI reference](guides/cli-reference.md)                            |
| Build your own resource                                 | [Creating a resource](guides/creating-a-resource.md)                |
| Contribute a resource to the catalog                    | [Contributing a resource](guides/contributing-a-resource.md)        |
| Understand how the code is organized                    | [Architecture overview](architecture/overview.md)                   |
| Look up a manifest field                                | [Resource model](architecture/resource-model.md)                    |
| Know what Skillbox guarantees about untrusted resources | [Security model](architecture/security-model.md)                    |
| Contribute code                                         | [CONTRIBUTING.md](../CONTRIBUTING.md) and [AGENTS.md](../AGENTS.md) |
| See what is planned                                     | [Roadmap](roadmap.md)                                               |
| Find the current state of work                          | [Task ledger](TASKS.md)                                             |

## Product

- [Vision](product/vision.md) — the problem, the thesis, and what Skillbox is not.
- [Requirements](product/requirements.md) — numbered, testable requirements and the fourteen MVP acceptance criteria.
- [Terminology](product/terminology.md) — the vocabulary used everywhere else. Worth skimming first; several terms are load-bearing.

## Architecture

- [Overview](architecture/overview.md) — package layering, the plan-then-apply split, and data flow.
- [Repository structure](architecture/repository-structure.md) — where every kind of change belongs.
- [Resource model](architecture/resource-model.md) — the **normative** manifest specification. The schema code implements this document.
- [Security model](architecture/security-model.md) — threat model, guarantees, and the tests that enforce them.
- [Decision records](architecture/decisions/README.md) — seven ADRs covering the toolchain, manifest format, registry approach, lockfile design, and security posture.

## Guides

- [Getting started](guides/getting-started.md) — install, initialize, search, add, validate, remove.
- [CLI reference](guides/cli-reference.md) — every command, option, and exit code.
- [Creating a resource](guides/creating-a-resource.md) — build a resource from a template.
- [Contributing a resource](guides/contributing-a-resource.md) — get it into the catalog.

## Project management

- [Task ledger](TASKS.md) — canonical `SBX-###` task list with acceptance criteria and completion evidence.
- [Roadmap](roadmap.md) — post-MVP phases, deliberately deferred.
- [v0.1.0 readiness report](v0.1.0-readiness.md) — evidence for each acceptance criterion.
- [Changelog](../CHANGELOG.md)

## Reading order

New to the project and want the full picture in about twenty minutes:

1. [Vision](product/vision.md) — why this exists.
2. [Terminology](product/terminology.md) — the vocabulary.
3. [Resource model](architecture/resource-model.md) — the central artifact.
4. [Architecture overview](architecture/overview.md) — how the code is shaped.
5. [Security model](architecture/security-model.md) — the constraints that drove the design.

## Conventions

- The [resource model](architecture/resource-model.md) is normative. If code and that document disagree, the document is right and the code is a bug.
- [Requirements](product/requirements.md) are numbered (`FR-`, `SR-`, `NFR-`, `AC-`) and referenced from tests and commit messages.
- Commands appear in PowerShell first, then bash.
- Documentation and implementation must never contradict each other. Reconcile before adding features.
