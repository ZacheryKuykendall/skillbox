# Requirements

Numbered, testable requirements for Skillbox v0.1.0. Each requirement has an identifier used in tests and commit messages. `MUST` and `MUST NOT` are binding; `SHOULD` indicates a strong default that may be varied with a recorded reason.

Terminology is defined in [terminology.md](terminology.md). The manifest specification is in [../architecture/resource-model.md](../architecture/resource-model.md).

---

## FR-1 Resource format

- **FR-1.1** A resource MUST be a directory containing a `skillbox.yaml` manifest.
- **FR-1.2** A manifest MUST declare `apiVersion`, `kind`, `metadata`, and `spec`.
- **FR-1.3** Skillbox MUST reject any `apiVersion` it does not support, naming the versions it does support.
- **FR-1.4** Skillbox MUST support exactly these kinds: `prompt`, `skill`, `agent`, `script`, `api`, `workflow`, `component`. An unknown kind MUST be rejected with the valid kinds listed.
- **FR-1.5** Metadata MUST include `namespace`, `name`, `version`, and `description`.
- **FR-1.6** `namespace` and `name` MUST match `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` and be between 2 and 64 characters.
- **FR-1.7** `version` MUST be a strict semantic version. Ranges MUST NOT appear in a resource's own version.
- **FR-1.8** A resource MUST be identified canonically as `namespace/name@version`.
- **FR-1.9** A manifest MUST declare an `entrypoint`, and that file MUST exist inside the resource directory.
- **FR-1.10** A manifest MUST declare the `files` it owns. Every declared file MUST exist.
- **FR-1.11** Unknown manifest fields MUST be rejected rather than silently ignored.
- **FR-1.12** A kind MUST NOT be required to declare fields that have no meaning for it.
- **FR-1.13** Every resource MUST contain a `README.md`.
- **FR-1.14** A resource MAY declare deprecation with a reason and an optional replacement identifier.

## FR-2 Local catalog

- **FR-2.1** Skillbox MUST discover resources by walking the `registry/` directory.
- **FR-2.2** Catalog discovery MUST be deterministic: the same tree yields the same ordering.
- **FR-2.3** Two resources sharing a `namespace/name@version` MUST be an error.
- **FR-2.4** A single invalid resource MUST NOT abort discovery of the rest; it MUST be reported as invalid.
- **FR-2.5** The catalog MUST contain at least one valid example of every supported kind.

## FR-3 Search

- **FR-3.1** Search MUST match against name, namespace, description, kind, and tags.
- **FR-3.2** Matching MUST be case-insensitive.
- **FR-3.3** Results MUST be ranked deterministically, with name matches ahead of description matches.
- **FR-3.4** An empty query MUST list all resources.
- **FR-3.5** Search SHOULD support filtering by kind and by tag.

## FR-4 Version resolution

- **FR-4.1** An exact version request MUST resolve to that version or fail.
- **FR-4.2** A semantic version range MUST resolve to the highest satisfying version in the catalog.
- **FR-4.3** A request with no version MUST resolve to the highest stable version.
- **FR-4.4** An unsatisfiable request MUST list the versions that are available.
- **FR-4.5** Prerelease versions MUST NOT satisfy a range unless the range explicitly includes a prerelease.

## FR-5 Dependencies

- **FR-5.1** A resource MUST be able to declare dependencies on other resources by identifier and range.
- **FR-5.2** Dependency resolution MUST be transitive.
- **FR-5.3** A missing dependency MUST be an error naming both the missing resource and the resource that requested it.
- **FR-5.4** A circular dependency MUST be detected and reported with the full cycle path.
- **FR-5.5** A resource reached by more than one path MUST be installed once.
- **FR-5.6** Two requirements that cannot be satisfied by one version MUST be reported as a version conflict.
- **FR-5.7** Installation MUST proceed in dependency order.

## FR-6 Installation planning

- **FR-6.1** Planning MUST produce a plan describing every file operation before any change is made.
- **FR-6.2** Planning MUST NOT write, modify, or delete anything.
- **FR-6.3** A plan MUST enumerate resources to install, their resolved versions, and each destination path.
- **FR-6.4** A plan MUST classify conflicts as: an existing untracked file, a file owned by another resource, or a locally modified file.
- **FR-6.5** A plan MUST be presentable to the user before application.

## FR-7 Project configuration

- **FR-7.1** A project using Skillbox MUST have a `.skillbox/` directory.
- **FR-7.2** `.skillbox/skillbox.yaml` MUST record requested resources, requested version ranges, install destinations, and project variables.
- **FR-7.3** `.skillbox/skillbox.lock` MUST record resolved versions, source location, integrity digests, installed files, and dependency relationships.
- **FR-7.4** The lockfile MUST be deterministic: identical inputs produce byte-identical output across runs, machines, and platforms.
- **FR-7.5** The lockfile MUST NOT contain timestamps, absolute paths, or other unstable data.
- **FR-7.6** Reading a project that has not been initialized MUST produce a clear "not initialized" error.

## FR-8 Installation

- **FR-8.1** Installation MUST copy a resource's declared files to its install target.
- **FR-8.2** Installation MUST update both the project manifest and the lockfile on success.
- **FR-8.3** A failure mid-installation MUST leave no partial state: new files removed, overwritten files restored, manifest and lockfile unchanged.
- **FR-8.4** Installation MUST refuse to overwrite a conflicting file unless explicitly forced.
- **FR-8.5** Installation MUST NOT execute any resource code.
- **FR-8.6** Installation MUST support a dry run that reports the plan and changes nothing.
- **FR-8.7** Project variables MUST be substituted into installed text files; an undeclared variable reference MUST be an error.

## FR-9 Removal

- **FR-9.1** Removal MUST delete only files recorded as owned by that resource.
- **FR-9.2** Removal MUST detect a locally modified file, preserve it, and report it, unless forced.
- **FR-9.3** Removal MUST refuse to remove a resource another installed resource depends on, unless forced.
- **FR-9.4** Removal MUST update the project manifest and lockfile.
- **FR-9.5** Removal SHOULD delete directories left empty, and MUST NOT delete a directory containing unrelated files.

## FR-10 Update

- **FR-10.1** Update MUST find newer versions compatible with the requested range.
- **FR-10.2** Update MUST produce a plan before changing files.
- **FR-10.3** Update MUST detect conflicts and abort before mutation.
- **FR-10.4** Update MUST rewrite the lockfile only after success.
- **FR-10.5** An already up-to-date resource MUST report that no work is needed.

## FR-11 Validation

- **FR-11.1** Validation MUST check manifest structure against the schema.
- **FR-11.2** Validation MUST confirm declared files exist.
- **FR-11.3** Validation MUST confirm the entrypoint exists and is inside the resource directory.
- **FR-11.4** Validation MUST confirm dependency references are parseable and resolvable in the catalog.
- **FR-11.5** Validation MUST confirm install targets are relative and confined to the project.
- **FR-11.6** Validation errors MUST identify the file, the field path, and a remediation hint.
- **FR-11.7** Validation MUST be runnable against a single resource, a directory of resources, or a project.

## FR-12 Diagnostics

- **FR-12.1** `doctor` MUST check that project configuration is present and valid.
- **FR-12.2** `doctor` MUST check lockfile consistency against the project manifest.
- **FR-12.3** `doctor` MUST detect missing installed files.
- **FR-12.4** `doctor` MUST detect files whose content no longer matches the recorded integrity digest.
- **FR-12.5** `doctor` MUST detect dependency problems, including unsatisfied and orphaned entries.
- **FR-12.6** `doctor` MUST check declared runtime compatibility against the running environment.
- **FR-12.7** `doctor` MUST report required environment variables that are unset, by **name only**.
- **FR-12.8** Every finding MUST carry a severity and a remediation hint.

## FR-13 CLI

- **FR-13.1** The CLI MUST provide `init`, `search`, `list`, `inspect`, `add`, `remove`, `validate`, `update`, and `doctor`.
- **FR-13.2** `init` MUST create `.skillbox/` and MUST NOT overwrite existing configuration without confirmation, and MUST explain what it created.
- **FR-13.3** `list` MUST show installed resources with both requested and resolved versions, and flag those with validation problems.
- **FR-13.4** `inspect` MUST show manifest details, dependencies, permissions, required environment variable names, and install targets, and MUST NOT expose secret values.
- **FR-13.5** `add` MUST show the plan, detect conflicts, install, and update the manifest and lockfile.
- **FR-13.6** Every command MUST exit non-zero on failure, using the documented exit codes.
- **FR-13.7** Every command SHOULD support `--json` for machine-readable output.
- **FR-13.8** The CLI MUST NOT contain business logic that belongs in `@skillbox/core`.
- **FR-13.9** Color output MUST be suppressed when output is not a TTY or when `NO_COLOR` is set.

---

## Security requirements

- **SR-1** Any path that resolves outside the project directory MUST be rejected before any filesystem write.
- **SR-2** Path traversal MUST be blocked through every manifest field that reaches the filesystem: install targets, file lists, and entrypoints.
- **SR-3** Absolute paths, drive-relative paths, UNC paths, and `..` segments MUST be rejected in manifest path fields.
- **SR-4** A symlink whose target escapes the project directory MUST NOT be followed for writing.
- **SR-5** Installation MUST NOT execute resource code. There MUST be no lifecycle hooks such as `postinstall`.
- **SR-6** Declared permissions MUST be shown before installation completes.
- **SR-7** Required environment variables MUST be recorded by name only. Values MUST NOT be read, stored, or written to any artifact.
- **SR-8** Secret values MUST NOT appear in output, errors, or logs.
- **SR-9** Entrypoints MUST be validated to exist and be confined to the resource directory.
- **SR-10** Undeclared files in a resource directory SHOULD be reported.
- **SR-11** File integrity MUST be recorded in the lockfile and MUST be verifiable.
- **SR-12** Any future executable resource MUST require explicit approval before running.
- **SR-13** Containment checks MUST use path relativity, not string prefix comparison.

The threat model and the tests enforcing these requirements are in [../architecture/security-model.md](../architecture/security-model.md).

---

## Non-functional requirements

- **NFR-1 Determinism.** Lockfile serialization and catalog ordering MUST be stable across runs and platforms.
- **NFR-2 Cross-platform.** Skillbox MUST work on Windows and POSIX. Manifest paths are POSIX-style and are translated for the host platform.
- **NFR-3 Testability.** Business logic MUST be unit-testable without filesystem access. Filesystem tests MUST run in temporary directories.
- **NFR-4 Coverage.** Repository-wide coverage MUST be at least 90% of lines, statements, functions, and branches.
- **NFR-5 Error quality.** Every user-facing error MUST state what failed, where, and what to do about it.
- **NFR-6 Layering.** `cli` depends on `core`; `core` depends on `schema`. The direction MUST NOT be reversed, and `core` MUST NOT write to stdout.
- **NFR-7 Dependency restraint.** A new runtime dependency MUST be justified. Node built-ins are preferred where they suffice.
- **NFR-8 Performance.** Catalog discovery and resolution for a catalog of a few hundred resources SHOULD complete in well under a second. Discovery is O(n) in resource count; resolution is O(V+E) in the dependency graph.

---

## MVP acceptance criteria

Skillbox v0.1.0 is ready only when a developer can do all fourteen of the following. Evidence for each is recorded in [../v0.1.0-readiness.md](../v0.1.0-readiness.md).

| #     | Criterion                                                         |
| ----- | ----------------------------------------------------------------- |
| AC-1  | Clone the repository.                                             |
| AC-2  | Install dependencies using the documented command.                |
| AC-3  | Run linting, tests, and the build successfully.                   |
| AC-4  | Initialize Skillbox in an example project.                        |
| AC-5  | Search the local catalog.                                         |
| AC-6  | Inspect a resource.                                               |
| AC-7  | Install a resource.                                               |
| AC-8  | See the installed resource in the project configuration.          |
| AC-9  | See exact resolution information in the lockfile.                 |
| AC-10 | Validate the project.                                             |
| AC-11 | Remove the resource safely.                                       |
| AC-12 | Understand how to create and contribute a new resource.           |
| AC-13 | Review one working example of every supported resource kind.      |
| AC-14 | Understand the security implications before installing resources. |

Compiling is not completion. Every criterion requires demonstrated behavior.

---

## Out of scope for v0.1.0

Deferred to the [roadmap](../roadmap.md): remote registry, registry REST API, authentication and organizations, private registries, web portal, Cursor and VS Code extensions, one-click install, publishing CLI, package signing, reputation and verification, policy enforcement, approval workflows, analytics, update notifications, compatibility scoring, hosted or sandboxed execution, MCP server integration, multi-language SDKs, GitHub organization sync, curated collections, and enterprise governance.
