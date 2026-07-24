# Terminology

The vocabulary used across Skillbox documentation, code, and CLI output. These terms are load-bearing: renaming one requires updating every affected document and identifier.

---

## Core concepts

### Resource

A versioned, documented, validated unit of capability. Physically, a directory containing a `skillbox.yaml` manifest, a `README.md`, and source files.

"Resource" is the general noun. A `prompt` and a `component` are both resources. Prefer it over "package" (which suggests a published tarball) and "asset" (too vague).

### Kind

The type of a resource, declared as `kind` in the manifest. Exactly seven kinds are supported: `prompt`, `skill`, `agent`, `script`, `api`, `workflow`, `component`.

Kinds are lowercase and singular in manifests. Registry directories use the plural form (`registry/prompts/`).

### Manifest

The `skillbox.yaml` file that describes a resource. Contains `apiVersion`, `kind`, `metadata`, and `spec`.

Unqualified, "manifest" means a resource manifest. The project's own file is always called the **project manifest**.

### Metadata

The manifest block holding identity and descriptive fields: `namespace`, `name`, `version`, `description`, `tags`, and optional `license`, `homepage`, and `deprecated`. Shared by every kind.

### Spec

The manifest block describing behavior. Contains fields shared by all kinds plus fields specific to the resource's kind. Short for "specification"; the field name is always `spec`.

### Resource identifier

The canonical name of a resource: `namespace/name@version`.

```text
skillbox/code-review@0.1.0
```

A **resource reference** is what a user or dependency writes, where the version part may be omitted or be a range:

```text
skillbox/code-review           # highest stable version
skillbox/code-review@0.1.0     # exact
skillbox/code-review@^0.1.0    # range
```

An identifier is fully resolved. A reference may need resolution.

### Namespace

The grouping prefix of an identifier. Resources in this repository's catalog use the `skillbox` namespace. Namespaces prevent name collisions and will map to owners when a remote registry exists.

### Entrypoint

The file within a resource that is its primary content: the prompt body for a `prompt`, the executable file for a `script`, the main module for a `component`. Declared as `spec.entrypoint`, and always relative to the resource directory.

An entrypoint identifies the main file. It does not imply that Skillbox will execute it — Skillbox never does.

---

## Catalog and registry

### Registry

A source of resources. In v0.1.0 the only registry is the local `registry/` directory in this repository. The term is reserved for the eventual remote service.

### Catalog

The in-memory index built by scanning a registry, mapping identifiers to resource entries. A registry is storage; a catalog is the loaded, queryable view of it.

### Catalog entry

One resolved resource in the catalog: its validated manifest plus the absolute path of its directory.

---

## Project-side concepts

### Project

A directory using Skillbox, identified by a `.skillbox/` directory at its root.

### Project root

The directory containing `.skillbox/`. The security boundary for every filesystem operation: nothing may be written outside it.

### Project manifest

`.skillbox/skillbox.yaml`. Records what the project **requested**: resource references, install destinations, and project variables. Hand-editable.

### Lockfile

`.skillbox/skillbox.lock`. Records what was actually **resolved and installed**: exact versions, source locations, integrity digests, installed file lists, and dependency relationships. Machine-generated, deterministic, and committed to version control.

The project manifest states intent; the lockfile states fact.

### Install target

The directory, relative to the project root, where a resource's files are written. Declared by the resource as `spec.install.target` and overridable per-project in the project manifest.

### Installed file

A file written into the project by a resource, recorded in the lockfile with its integrity digest. Skillbox considers an installed file **owned** by the resource that wrote it.

### Project variable

A named value declared in the project manifest and substituted into installed text files. Project variables are configuration, never secrets — secrets are supplied through environment variables and never enter Skillbox artifacts.

---

## Resolution and installation

### Resolution

Turning a resource reference into a concrete catalog entry: selecting the version that satisfies the requested range.

### Dependency graph

The directed graph of resources reachable from the requested set through `spec.dependencies`. Traversed to produce install order and to detect cycles.

### Install plan

An immutable description of every file operation an installation would perform, produced without touching the filesystem. Plans enable dry runs, conflict reporting, and confirmation before mutation.

The vocabulary is deliberate: **planning** computes, **applying** mutates. Nothing writes during planning.

### Conflict

A condition that would make an install unsafe. Three classified varieties:

| Conflict                  | Meaning                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------- |
| Untracked existing file   | A file already exists at the destination and Skillbox did not put it there         |
| Owned by another resource | The destination is recorded as owned by a different resource                       |
| Locally modified          | Skillbox installed the file, but its content no longer matches the recorded digest |

### Integrity digest

A hash recording a file's content, written as an SRI-style string:

```text
sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=
```

Used to detect local modification and verify that an installed file is what the lockfile says it is.

### Rollback

Restoring the pre-installation state after a failure: removing files that were created and restoring files that were overwritten, leaving the manifest and lockfile untouched.

---

## Validation and diagnostics

### Validation

Checking structure and consistency: manifest schema, declared files exist, entrypoint exists, dependency references resolve, install paths are safe. Static — it never runs resource code.

### Diagnostic

One finding produced by validation or `doctor`, carrying a severity, a location, a message, and a remediation hint.

### Doctor

The command that inspects an initialized project for problems: configuration validity, lockfile consistency, missing or modified files, dependency problems, runtime compatibility, and unset required environment variables.

---

## Security vocabulary

### Permission

A declared capability a resource states it needs, drawn from a closed vocabulary. Permissions are **declarative and informational** in v0.1.0: they are validated and shown to the user before installation, but Skillbox does not enforce them at runtime because it does not provide a runtime. Enforcement arrives with sandboxed execution (see the [roadmap](../roadmap.md)).

### Required environment variable

The **name** of an environment variable a resource needs. Skillbox records names only. It never reads, stores, prints, or substitutes values.

### Containment

The guarantee that a resolved path stays inside its permitted root. Verified with path relativity, never string prefix comparison, because prefix comparison misses `..` segments and case-folding on Windows.

### Untrusted resource

The default assumption about every resource. Drives the deny-by-default posture: validate before use, confine writes, never execute during install.

---

## Deprecated or avoided terms

| Avoid                        | Use instead                    | Reason                                                                                                |
| ---------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Package                      | Resource                       | "Package" implies a published archive and invites confusion with npm packages                         |
| Plugin                       | Resource, or the specific kind | Implies runtime loading, which Skillbox does not do                                                   |
| Tool                         | The specific kind              | Overloaded, especially in AI contexts                                                                 |
| Install script               | Not applicable                 | Skillbox has no install scripts and no lifecycle hooks; saying otherwise misstates the security model |
| Repository (for the catalog) | Registry, or catalog           | Reserved for the git repository                                                                       |
| Secret (in a manifest)       | Required environment variable  | Manifests never contain secrets, only variable names                                                  |
