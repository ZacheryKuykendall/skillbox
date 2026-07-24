# Changelog

All notable changes to Skillbox are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.1.0] - 2026-07-24

The first Skillbox MVP. Establishes the resource format, a local catalog, and a working CLI.

### Added

- **Resource manifest format** (`skillbox.yaml`) at `apiVersion: skillbox.dev/v1alpha1`, with shared metadata and a `kind`-discriminated specification covering `prompt`, `skill`, `agent`, `script`, `api`, `workflow`, and `component`.
- **`@skillbox/schema`** — runtime validation with Zod, identifier and semantic version rules, path-safety constraints at the schema layer, human-readable diagnostics, and JSON Schema generation to `schemas/`.
- **`@skillbox/core`** — registry discovery, search, semantic version resolution, transitive dependency graphs with cycle detection, install planning separated from filesystem mutation, conflict detection, install application with rollback, deterministic lockfiles with SHA-256 integrity, safe removal, update planning, and project diagnostics.
- **`@skillbox/cli`** — `init`, `search`, `list`, `inspect`, `add`, `remove`, `validate`, `update`, and `doctor`, each with `--json` output and documented exit codes.
- **`@skillbox/testing`** — shared fixtures and temporary-project helpers.
- **Project configuration** under `.skillbox/` with `skillbox.yaml` and a deterministic `skillbox.lock`.
- **Starter catalog** with one validated example of every resource kind: `skillbox/code-review`, `skillbox/technical-documentation`, `skillbox/implementation-planner`, `skillbox/project-summary`, `skillbox/generic-rest-client`, `skillbox/plan-implement-review`, and `skillbox/structured-logger`.
- **Resource templates** under `templates/` and a worked example under `examples/starter-project`.
- **Documentation** covering product vision, requirements, terminology, architecture, the resource model, the security model, seven architectural decision records, and contributor guides.
- **Continuous integration** running format, lint, typecheck, test with a 90% coverage gate, build, and catalog validation.

### Security

- Deny-by-default installation. Install destinations are confined to the project directory using `path.relative` containment checks; traversal, absolute, drive-relative, UNC, and symlinked destinations are rejected before any write.
- Resource code is never executed during installation. There are no lifecycle hooks.
- Declared permissions are shown before installation.
- Required environment variables are recorded by name only. Values are never read, stored, or printed.
- File integrity is recorded in the lockfile and verified by `skillbox doctor`.

### Known limitations

- The catalog is local to this repository. There is no remote registry, publishing, or package signing.
- Resource execution is out of scope; `script` resources are installed but never run by Skillbox.
- `.github/CODEOWNERS` has no ownership entries pending a repository owner decision (SBX-018).
- The CI workflow has not been executed on a GitHub remote (SBX-099).

[Unreleased]: https://keepachangelog.com/en/1.1.0/
[0.1.0]: https://semver.org/spec/v2.0.0.html
