# Creating a Resource

Build a Skillbox resource from scratch. The example is a `prompt`, but the process is the same for every kind.

The complete field specification is in [resource-model.md](../architecture/resource-model.md). This guide is the practical path through it.

---

## 1. Pick a kind

| Kind        | Use when the resource is...                                        |
| ----------- | ------------------------------------------------------------------ |
| `prompt`    | A reusable instruction template for a language model               |
| `skill`     | A capability with instructions plus supporting reference files     |
| `agent`     | An autonomous role definition, usually composing prompts and tools |
| `script`    | An executable automation the user runs themselves                  |
| `api`       | A client integration for an external service                       |
| `workflow`  | An ordered composition of other resources                          |
| `component` | Application source meant to be copied into a codebase              |

If two kinds seem to fit, ask what the consumer does with it. Something they _read or send to a model_ is a `prompt` or `skill`. Something they _run_ is a `script`. Something they _import_ is a `component`.

## 2. Start from a template

Templates live in [`templates/`](../../templates), one per kind:

PowerShell:

```powershell
mkdir registry\prompts\release-notes
Copy-Item templates\prompt\* registry\prompts\release-notes\ -Recurse
```

bash:

```bash
mkdir -p registry/prompts/release-notes
cp -r templates/prompt/* registry/prompts/release-notes/
```

You need at minimum:

```text
release-notes/
├── skillbox.yaml     Required
├── README.md         Required
└── prompt.md         The entrypoint
```

## 3. Write the manifest

`registry/prompts/release-notes/skillbox.yaml`:

```yaml
apiVersion: skillbox.dev/v1alpha1
kind: prompt

metadata:
  namespace: skillbox
  name: release-notes
  version: 0.1.0
  description: Turns a commit range into user-facing release notes.
  tags:
    - development
    - documentation

spec:
  entrypoint: prompt.md
  files:
    - prompt.md
    - README.md
  install:
    target: .skillbox/prompts/release-notes
  inputs:
    - name: commits
      type: string
      required: true
      description: Commit log for the release range.
    - name: audience
      type: enum
      values: [users, developers]
      default: users
      description: Who the notes are written for.
  outputs:
    - name: notes
      type: string
      description: Markdown release notes.
  permissions:
    - model:invoke
```

### Rules that trip people up

**Names.** `namespace`, `name`, and tags must match `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`, 2–64 characters. Lowercase, hyphens allowed inside only. No underscores, dots, or uppercase.

**Version.** Strict semver. Start at `0.1.0`. A resource declares one concrete version — ranges only appear in dependencies.

**Description.** 10–200 characters, one line. It is what shows in search results, so make it say what the resource _does_.

**Every file must be declared.** `files` lists everything the resource owns, and every entry must exist. A file in the directory but missing from `files` is reported as undeclared and never installed.

**The entrypoint must appear in `files`.**

**Paths are relative and POSIX-style.** Use `/`. Absolute paths, `..`, drive prefixes (`C:`), and UNC paths are rejected by the schema — this is a [security boundary](../architecture/security-model.md), not a style preference.

**Unknown fields are errors.** Writing `entrypoints:` instead of `entrypoint:` fails validation rather than being ignored. That is intentional.

**Quote version ranges.** `'>=20.19.0'` needs quotes; YAML will otherwise misparse it.

## 4. Write the entrypoint

`prompt.md`:

```markdown
# Release Notes

Turn the provided commit log into release notes for the stated audience.

## Inputs

- `commits` — the commit log for the release range.
- `audience` — `users` or `developers`.

## Instructions

1. Group changes into Added, Changed, Fixed, and Removed.
2. Write each entry as a single sentence describing user-visible impact.
3. Omit purely internal changes when the audience is `users`.
4. Do not invent changes that are not in the log.

## Output

Markdown with one heading per group. Omit empty groups.
```

## 5. Write the README

Required, and validation checks it exists. Cover:

- **What it does**, in a sentence or two.
- **Inputs and outputs**, matching the manifest.
- **Installation** — the `skillbox add` command and where files land.
- **Required permissions**, and why each is needed.
- **Required environment variables**, if any, by name.
- **Configuration**, if there is any.
- **A usage example** concrete enough to copy.

A README that only restates the manifest is not useful. The manifest says _what_; the README should say _how_ and _why_.

## 6. Kind-specific notes

### script

```yaml
kind: script
spec:
  entrypoint: summarize.mjs
  interpreter: node
  runtime:
    type: node
    version: '>=20.19.0'
  permissions:
    - filesystem:read
```

`interpreter` documents how a user _would_ run it. **Skillbox never executes it.** Installing and running are separate actions. Your README must tell the user the exact command to run it themselves.

### api

```yaml
kind: api
spec:
  protocol: rest
  baseUrlEnv: SKILLBOX_EXAMPLE_API_BASE_URL
  auth:
    type: bearer
    tokenEnv: SKILLBOX_EXAMPLE_API_TOKEN
  env:
    - name: SKILLBOX_EXAMPLE_API_TOKEN
      description: Bearer token for the target service.
      required: true
      secret: true
```

`baseUrlEnv` and `tokenEnv` hold environment variable **names**. There is no field for a value and no way to add one. Never put a real URL with embedded credentials, a token, or a key in a manifest, a source file, or a README.

### component

```yaml
kind: component
spec:
  language: typescript
  exports: [createLogger]
  peerDependencies:
    typescript: '>=5.0.0'
  install:
    target: src/components/structured-logger
```

Components default into `src/`, so they land among the user's source. Say so clearly in the README. `peerDependencies` is informational — Skillbox reports it but does not install language packages.

### workflow and agent

Both reference other resources. Anything you reference must also be declared in `dependencies` or it will not be installed:

```yaml
kind: workflow
spec:
  steps:
    - name: plan
      uses: skillbox/implementation-planner
      description: Produce an implementation plan.
  dependencies:
    - resource: skillbox/implementation-planner
      version: ^0.1.0
```

Validation warns when a `uses` or `prompts` reference is missing from `dependencies`.

## 7. Declaring dependencies

```yaml
dependencies:
  - resource: skillbox/code-review
    version: ^0.1.0
    optional: false
```

`resource` is `namespace/name` with no version; `version` is a separate semver range. A resource cannot depend on itself, and cycles are rejected.

## 8. Declaring permissions

Only from this closed set:

| Permission         | Declare when the resource... |
| ------------------ | ---------------------------- |
| `filesystem:read`  | Reads project files          |
| `filesystem:write` | Writes project files         |
| `network:outbound` | Makes network requests       |
| `process:spawn`    | Spawns a subprocess          |
| `env:read`         | Reads environment variables  |
| `secrets:read`     | Reads credential material    |
| `model:invoke`     | Invokes a language model     |

Declare the minimum. Permissions are shown to users before installation, and an over-broad list is a reason to skip your resource.

Be honest here even though nothing enforces it. Permissions are declarative in v0.1.0 — Skillbox has no runtime to police them — so their whole value is that authors describe reality.

## 9. Validate

```powershell
pnpm skillbox validate registry\prompts\release-notes
```

```bash
pnpm skillbox validate registry/prompts/release-notes
```

Errors name the file, the field path, and what to do:

```text
registry/prompts/release-notes/skillbox.yaml

  error  spec.files       Declared file "prompt.md" does not exist.
                          Create the file or remove it from spec.files.
  error  metadata.name    "Release-Notes" must match ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$
                          Use lowercase letters, digits, and internal hyphens.
```

Validate the whole catalog:

```powershell
pnpm validate:registry
```

```bash
pnpm validate:registry
```

## 10. Test the install

Install into a scratch project to confirm the files land where you intended:

```powershell
mkdir C:\temp\resource-test
cd C:\temp\resource-test
$env:SKILLBOX_REGISTRY = "C:\projects\skillbox\registry"
node C:\projects\skillbox\packages\cli\bin\skillbox.js init
node C:\projects\skillbox\packages\cli\bin\skillbox.js add skillbox/release-notes --dry-run
node C:\projects\skillbox\packages\cli\bin\skillbox.js add skillbox/release-notes
```

```bash
mkdir -p /tmp/resource-test
cd /tmp/resource-test
export SKILLBOX_REGISTRY="$HOME/skillbox/registry"
node ~/skillbox/packages/cli/bin/skillbox.js init
node ~/skillbox/packages/cli/bin/skillbox.js add skillbox/release-notes --dry-run
node ~/skillbox/packages/cli/bin/skillbox.js add skillbox/release-notes
```

Then check `inspect` output reads well, files are where you expect, and `remove` cleans up.

## 11. Versioning

Follow [semver](https://semver.org/spec/v2.0.0.html) from the consumer's perspective:

- **Patch** — fix wording or a bug; behavior is compatible.
- **Minor** — add an optional input or capability; existing use still works.
- **Major** — remove or rename an input, change output shape, change the install target, or change behavior enough to break a consumer.

For a prompt, rewording instructions enough to change the output shape is a **major** change even though no field changed. The interface is the behavior, not just the manifest.

Deprecating:

```yaml
metadata:
  deprecated:
    reason: Superseded by a schema-driven release notes prompt.
    replacement: skillbox/release-notes-v2
```

## Checklist

- [ ] Kind matches what consumers do with it
- [ ] `metadata.name` and `namespace` match the identifier pattern
- [ ] Version is strict semver
- [ ] Description is 10–200 characters and says what it does
- [ ] Every file in `files` exists; the entrypoint is among them
- [ ] All paths relative and POSIX-style
- [ ] Inputs and outputs documented with types and descriptions
- [ ] Permissions minimal and honest
- [ ] Environment variables declared by name, no values anywhere
- [ ] Dependencies declared for everything referenced
- [ ] README covers what, inputs, outputs, install, permissions, usage
- [ ] `pnpm skillbox validate <path>` passes
- [ ] Installs and removes cleanly in a scratch project
- [ ] No credentials, tokens, or keys anywhere

## Next

[Contributing a resource](contributing-a-resource.md) — getting it into the catalog.
