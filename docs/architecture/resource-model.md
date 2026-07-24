# Resource Model

The normative specification of the Skillbox resource manifest. This document is the source of truth for [`@skillbox/schema`](../../packages/schema); the code implements what is written here.

Decision record: [ADR-0002](decisions/ADR-0002-resource-manifest-format.md).

---

## 1. Resource directory

A resource is a directory. Its name SHOULD match `metadata.name`.

```text
code-review/
├── skillbox.yaml     Required. The manifest.
├── README.md         Required. Human documentation.
├── prompt.md         The entrypoint and other source files.
└── tests/            Optional validation fixtures.
```

Every file the resource installs must be listed in `spec.files`. Files present in the directory but absent from `spec.files` are reported as undeclared (SR-10) and are never installed.

## 2. Manifest structure

```yaml
apiVersion: skillbox.dev/v1alpha1
kind: prompt

metadata:
  namespace: skillbox
  name: code-review
  version: 0.1.0
  description: Reviews a code change and produces actionable findings.
  tags: [development, code-review]

spec:
  entrypoint: prompt.md
  files: [prompt.md, README.md]
  install:
    target: .skillbox/prompts/code-review
```

Four top-level keys are required: `apiVersion`, `kind`, `metadata`, `spec`. **Unknown keys are rejected** at every level of the manifest (FR-1.11), so a typo fails loudly rather than being silently ignored.

### apiVersion

```yaml
apiVersion: skillbox.dev/v1alpha1
```

The only supported value. Any other value is rejected with a dedicated error naming the supported version (FR-1.3). The `v1alpha1` suffix signals that the format may change before v1; `skillbox.dev` is the format's identifying group, not a URL that Skillbox contacts.

### kind

One of exactly seven lowercase values (FR-1.4):

```text
prompt  skill  agent  script  api  workflow  component
```

`kind` is the discriminant. It selects which kind-specific spec fields apply.

---

## 3. metadata

Shared by every kind.

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `namespace` | string | yes | Identifier pattern |
| `name` | string | yes | Identifier pattern |
| `version` | string | yes | Strict semver, no range |
| `description` | string | yes | 10–200 characters, single line |
| `tags` | string[] | no | Identifier pattern, lowercased, deduplicated, max 10 |
| `license` | string | no | SPDX expression |
| `homepage` | string | no | `http` or `https` URL |
| `deprecated` | object | no | See below |

### Identifier pattern

`namespace`, `name`, and each tag must match:

```text
^[a-z0-9]([a-z0-9-]*[a-z0-9])?$
```

Length 2–64. Lowercase alphanumeric with internal hyphens: no leading or trailing hyphen, no underscores, no dots, no uppercase, no spaces (FR-1.6).

The pattern is deliberately narrower than npm's. It keeps identifiers safe as directory names on case-insensitive filesystems and unambiguous inside a `namespace/name@version` string.

### version

A strict semantic version: `MAJOR.MINOR.PATCH` with optional prerelease and build metadata. A resource declares one concrete version; ranges appear only in dependencies and project requests (FR-1.7).

### deprecated

```yaml
deprecated:
  reason: Superseded by a schema-driven review prompt.
  replacement: skillbox/code-review-v2
```

`reason` is required when the block is present. `replacement`, when given, must be a valid resource reference. Installing a deprecated resource warns but succeeds.

---

## 4. Shared spec fields

Available to every kind.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `entrypoint` | path | yes | The resource's primary file |
| `files` | path[] | yes | Every file the resource owns, min 1 |
| `install` | object | no | Where files are written |
| `inputs` | Input[] | no | Declared inputs |
| `outputs` | Output[] | no | Declared outputs |
| `dependencies` | Dependency[] | no | Other resources required |
| `env` | EnvVar[] | no | Required environment variable names |
| `permissions` | Permission[] | no | Declared capabilities |
| `runtime` | object | no | Runtime requirements |
| `compatibility` | object | no | Compatibility constraints |

### Path fields

Every path in a manifest — `entrypoint`, entries in `files`, and `install.target` — must be:

- **Relative.** Absolute paths are rejected.
- **POSIX-style**, using `/`. Translated to the host separator at install time (NFR-2).
- **Free of `..` segments** at any position.
- **Free of a Windows drive prefix** (`C:`) or UNC prefix (`\\server\share`).
- **Free of a leading `/` or `\`.**
- **Free of NUL bytes.**

These constraints are enforced in the schema layer, before any code touches the filesystem (SR-2, SR-3). `@skillbox/core` re-verifies containment at install time with a relativity check (SR-13), because defense in depth matters more here than avoiding a duplicated check.

`entrypoint` must appear in `files`, and the file must exist (FR-1.9).

### install

```yaml
install:
  target: .skillbox/prompts/code-review
  strategy: directory
```

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `target` | path | kind default | Destination directory relative to the project root |
| `strategy` | enum | `directory` | `directory` copies the file tree; `flat` copies all files into the target without subdirectories |

Kind defaults, applied when `install` is omitted:

| Kind | Default target |
| --- | --- |
| `prompt` | `.skillbox/prompts/<name>` |
| `skill` | `.skillbox/skills/<name>` |
| `agent` | `.skillbox/agents/<name>` |
| `script` | `.skillbox/scripts/<name>` |
| `api` | `.skillbox/apis/<name>` |
| `workflow` | `.skillbox/workflows/<name>` |
| `component` | `src/components/<name>` |

`component` defaults into `src/` because components are application source meant to live alongside your code. A project may override any target (FR-7.2).

### inputs and outputs

```yaml
inputs:
  - name: diff
    type: string
    required: true
    description: The unified diff to review.
  - name: severity
    type: enum
    values: [low, medium, high]
    default: medium
    description: Minimum severity to report.

outputs:
  - name: findings
    type: array
    description: Actionable review findings.
```

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | Identifier pattern |
| `type` | yes | `string`, `number`, `boolean`, `enum`, `array`, `object`, `path` |
| `description` | yes | 1–200 characters |
| `required` | no | Inputs only, default `false` |
| `default` | no | Inputs only; must match `type` |
| `values` | when `type: enum` | Non-empty list of allowed values |

Inputs and outputs are **declarations for humans and tooling**, not a validated call interface — Skillbox does not invoke resources.

### dependencies

```yaml
dependencies:
  - resource: skillbox/code-review
    version: ^0.1.0
    optional: false
```

| Field | Required | Notes |
| --- | --- | --- |
| `resource` | yes | `namespace/name`, no version |
| `version` | yes | Semver range |
| `optional` | no | Default `false`; a missing optional dependency warns instead of failing |

Version belongs in its own field rather than appended to `resource` so that ranges containing `@` or spaces never need escaping.

A resource must not depend on itself. Cycles are detected during graph construction (FR-5.4).

### env

```yaml
env:
  - name: SKILLBOX_EXAMPLE_API_BASE_URL
    description: Base URL of the target REST service.
    required: true
  - name: SKILLBOX_EXAMPLE_API_TOKEN
    description: Bearer token for the target service.
    required: true
    secret: true
```

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | `^[A-Z][A-Z0-9_]*$`, max 128 characters |
| `description` | yes | What the variable is for |
| `required` | no | Default `true` |
| `secret` | no | Default `false`; marks the value as sensitive |

**A manifest declares names, never values.** There is no field for a value, and there is no way to add one — the schema rejects unknown keys. Skillbox never reads, stores, or prints the value of any declared variable (SR-7, SR-8). `secret: true` additionally suppresses the variable from being echoed even in diagnostic contexts where a name would normally appear alongside a "set/unset" status.

### permissions

```yaml
permissions:
  - filesystem:read
  - network:outbound
```

A closed vocabulary. Unknown values are rejected.

| Permission | Meaning |
| --- | --- |
| `filesystem:read` | Reads files in the project |
| `filesystem:write` | Writes files in the project |
| `network:outbound` | Makes outbound network requests |
| `process:spawn` | Spawns a subprocess |
| `env:read` | Reads environment variables |
| `secrets:read` | Reads credential material |
| `model:invoke` | Invokes a language model |

Permissions are **declarative in v0.1.0**. They are validated and shown to the user before installation (SR-6) but not enforced, because Skillbox provides no runtime to enforce them in. Enforcement is tied to sandboxed execution on the [roadmap](../roadmap.md). The vocabulary exists now so that resources authored today carry the metadata enforcement will need.

### runtime

```yaml
runtime:
  type: node
  version: '>=20.19.0'
```

| Field | Required | Notes |
| --- | --- | --- |
| `type` | yes | `node`, `python`, `shell`, `powershell`, `none` |
| `version` | no | Semver range for the runtime |

Meaningful for `script`, `api`, and `component`. `doctor` compares a `node` requirement against the running Node version (FR-12.6).

### compatibility

```yaml
compatibility:
  skillbox: '>=0.1.0'
  platforms: [win32, linux, darwin]
```

| Field | Required | Notes |
| --- | --- | --- |
| `skillbox` | no | Semver range of Skillbox versions supported |
| `platforms` | no | Subset of `win32`, `linux`, `darwin`; omitted means all |

---

## 5. Kind-specific spec fields

Each kind adds only fields meaningful to it (FR-1.12). All shared fields remain available.

### prompt

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `format` | enum | no | `markdown` (default) or `text` |
| `model` | object | no | `{ providers?: string[], minContextTokens?: number }` |

### skill

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `instructions` | path | no | Instruction file; defaults to `entrypoint` |
| `resources` | path[] | no | Supporting files the skill reads at use time |

### agent

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `role` | string | yes | One-line statement of the agent's role |
| `tools` | string[] | no | Tool names the agent expects |
| `prompts` | string[] | no | Resource references to prompts the agent uses |

An agent referencing a prompt in `prompts` SHOULD also declare it in `dependencies` so it is installed.

### script

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `interpreter` | enum | yes | `node`, `python`, `bash`, `powershell` |
| `args` | Input[] | no | Command-line arguments |
| `executable` | boolean | no | Default `false`; hints that the file should be marked executable on POSIX |

Declaring a script does not make Skillbox run it. Installation copies the file and stops (FR-8.5, SR-5).

### api

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `protocol` | enum | yes | `rest`, `graphql`, `grpc` |
| `baseUrlEnv` | string | no | **Name** of the env var holding the base URL |
| `auth` | object | no | `{ type: 'none' \| 'bearer' \| 'basic' \| 'apiKey', tokenEnv?: string }` |
| `operations` | Operation[] | no | `{ name, method?, path?, description }` |

`baseUrlEnv` and `auth.tokenEnv` hold variable **names**. There is deliberately no field for a URL literal with embedded credentials or for a token value.

### workflow

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `steps` | Step[] | yes | Ordered steps, min 1 |

A step:

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | Identifier pattern, unique within the workflow |
| `uses` | yes | Resource reference for the step |
| `description` | yes | What the step accomplishes |
| `with` | no | Input values passed to the step |

Every `uses` reference SHOULD appear in `dependencies`. Validation warns when it does not.

### component

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `language` | enum | yes | `typescript`, `javascript`, `python` |
| `exports` | string[] | no | Public symbols the component exports |
| `peerDependencies` | Record<string,string> | no | Host-package requirements, informational |

`peerDependencies` is informational. Skillbox does not install language packages; it reports the requirement so you can add it with your own package manager.

---

## 6. Resource identifiers

Canonical form:

```text
namespace/name@version
```

A **reference** may omit the version or supply a range:

| Reference | Meaning |
| --- | --- |
| `skillbox/code-review` | Highest stable version |
| `skillbox/code-review@0.1.0` | Exactly 0.1.0 |
| `skillbox/code-review@^0.1.0` | Highest version matching the range |

Parsing rules: exactly one `/`; the version begins at the first `@`; both parts must satisfy the identifier pattern; a leading `@` (npm scope style) is rejected to keep one unambiguous form.

Prereleases never satisfy a range unless the range names a prerelease explicitly (FR-4.5).

---

## 7. Worked example

`registry/apis/generic-rest-client/skillbox.yaml`:

```yaml
apiVersion: skillbox.dev/v1alpha1
kind: api

metadata:
  namespace: skillbox
  name: generic-rest-client
  version: 0.1.0
  description: A typed REST client wrapper with retries and error normalization.
  tags: [api, http, integration]
  license: MIT

spec:
  entrypoint: src/client.ts
  files:
    - src/client.ts
    - src/errors.ts
    - README.md
  install:
    target: src/integrations/rest-client
  protocol: rest
  baseUrlEnv: SKILLBOX_EXAMPLE_API_BASE_URL
  auth:
    type: bearer
    tokenEnv: SKILLBOX_EXAMPLE_API_TOKEN
  env:
    - name: SKILLBOX_EXAMPLE_API_BASE_URL
      description: Base URL of the target REST service.
      required: true
    - name: SKILLBOX_EXAMPLE_API_TOKEN
      description: Bearer token for the target service.
      required: true
      secret: true
  permissions:
    - network:outbound
    - env:read
  runtime:
    type: node
    version: '>=20.19.0'
  compatibility:
    skillbox: '>=0.1.0'
```

Its identifier is `skillbox/generic-rest-client@0.1.0`.

---

## 8. Validation order

Validation fails fast in stages, so an error names the earliest real cause rather than a cascade:

1. **Parse** — the file is valid YAML.
2. **apiVersion** — supported version.
3. **kind** — known kind.
4. **Structure** — metadata and spec validate against the kind's schema, including path constraints.
5. **Filesystem** — declared files exist; the entrypoint exists, is inside the resource directory, and appears in `files`.
6. **References** — dependency and workflow references parse and resolve in the catalog.
7. **Containment** — install targets stay inside the project root.

Stages 1–4 need only the manifest. Stage 5 needs the resource directory. Stages 6–7 need a catalog and a project. This layering is why `@skillbox/schema` can validate without filesystem access (NFR-3).

## 9. JSON Schema

JSON Schema artifacts are generated from the Zod schemas with `z.toJSONSchema()` and committed under `schemas/`:

```powershell
pnpm schema:generate
```

```bash
pnpm schema:generate
```

Zod remains the source of truth; the JSON Schema is a derived artifact for editor completion. A test fails if the committed files drift from the schemas, so the two cannot disagree.

## 10. Evolution

While `v1alpha1` is current, the format may change. Any change to this document requires:

1. An update here first, since this document is normative.
2. A matching schema change in `@skillbox/schema`.
3. Regenerated JSON Schema artifacts.
4. Updated fixtures and tests.
5. An ADR if the change is breaking.

A breaking change after v0.1.0 requires a new `apiVersion`, not a silent redefinition of this one.
