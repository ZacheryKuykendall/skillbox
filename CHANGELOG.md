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

- **Line-ending normalization** via a committed `.gitattributes`. This is load-bearing rather than cosmetic: without it, a Windows clone with the common `core.autocrlf=true` default reports every installed file as modified, because a file checked out with CRLF hashes differently from the same file with LF.

### Security

- Deny-by-default installation. Install destinations are confined to the project directory using `path.relative` containment checks; traversal, absolute, drive-relative, UNC, and symlinked destinations are rejected before any write.
- Resource code is never executed during installation. There are no lifecycle hooks.
- Declared permissions are shown before installation, alongside an explicit statement that Skillbox does not enforce them.
- Required environment variables are recorded by name only. Values are never read, stored, or printed. Values pasted into a name field are redacted from validation errors.
- File integrity is recorded in the lockfile and verified by `skillbox doctor`.
- Three mandatory test suites enforce the above: per-vector path traversal including symlink escape and tampered lockfiles, malformed manifest handling, and a sentinel-based check that no environment value reaches any artifact or output.

### Known limitations

- The catalog is local to this repository. There is no remote registry, publishing, or package signing.
- Resource execution is out of scope; `script` resources are installed but never run by Skillbox.
- Permissions are declared and displayed but not enforced, because Skillbox provides no runtime. Enforcement requires sandboxed execution.
- `apiVersion: skillbox.dev/v1alpha1` is explicitly unstable; the manifest format may change before v1.
- A tampered file with a correctly-updated digest is not detectable by digest alone. This requires package signing.
- "Require review from Code Owners" is intentionally off. `.github/CODEOWNERS` assigns ownership, but requiring it in branch protection with a single code owner would make every pull request unmergeable, since GitHub never requests a review from the author (SBX-018).
- CI is verified green on GitHub across Linux and Windows on Node 24, plus Linux on Node 20.19 (SBX-099).
- TypeScript is pinned to 5.9.3. TypeScript 7 cannot be adopted until [typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940) lands; `typescript-eslint` currently throws at module load on TypeScript 7, so linting fails outright (SBX-100).

Full acceptance evidence and the complete limitation list are in [docs/v0.1.0-readiness.md](docs/v0.1.0-readiness.md).

[Unreleased]: https://keepachangelog.com/en/1.1.0/
[0.1.0]: https://semver.org/spec/v2.0.0.html
