# Contributing a Resource

How to get a resource into the Skillbox catalog.

This guide covers the contribution process. To build the resource first, see [creating a resource](creating-a-resource.md). To contribute **code**, see [CONTRIBUTING.md](../../CONTRIBUTING.md).

---

## Before you write anything

Two questions worth answering honestly, because they are the two most common reasons a contribution gets sent back.

**Does something similar already exist?**

```powershell
pnpm skillbox search <keywords>
pnpm skillbox list --json
```

```bash
pnpm skillbox search <keywords>
pnpm skillbox list --json
```

If a resource already covers most of the ground, improving it is usually more valuable than adding a near-duplicate. Duplicate systems solving the same problem are explicitly discouraged.

**Is it general enough to reuse?**

A resource earns its place by being useful to someone who did not write it. A prompt that references your internal service names, a component wired to your specific database schema, or a script that assumes your directory layout will not help anyone else.

Make it configurable through inputs and variables, or keep it in your own project.

## Where it goes

One directory per resource, under the plural form of its kind:

```text
registry/
├── prompts/<name>/
├── skills/<name>/
├── agents/<name>/
├── scripts/<name>/
├── apis/<name>/
├── workflows/<name>/
└── components/<name>/
```

The directory name must match `metadata.name`. The kind directory is organizational only — `kind` comes from the manifest, so a misfiled resource is a validation error, not a silent reclassification.

Use the `skillbox` namespace for catalog contributions. Namespace ownership is unenforced today and becomes meaningful when publishing exists (SBX-104).

## Contribution steps

### 1. Open an issue

Use the **New resource** issue template. It asks for the kind, what the resource does, why it belongs in the catalog, and what permissions it needs.

This exists to catch duplication and scope problems before you invest in writing, so open it first for anything non-trivial.

### 2. Branch

```powershell
git checkout -b resource/prompt-release-notes
```

```bash
git checkout -b resource/prompt-release-notes
```

Use `resource/<kind>-<name>`.

### 3. Add the resource

Follow [creating a resource](creating-a-resource.md). Every resource needs a valid `skillbox.yaml`, a `README.md`, its source files, and validation fixtures where applicable.

### 4. Validate

```powershell
pnpm skillbox validate registry\prompts\release-notes
pnpm validate:registry
pnpm test
```

```bash
pnpm skillbox validate registry/prompts/release-notes
pnpm validate:registry
pnpm test
```

`pnpm validate:registry` also confirms every kind still has at least one example.

### 5. Install it for real

Do not skip this. Validation checks structure; only an install proves the resource behaves.

```powershell
mkdir C:\temp\contrib-test
cd C:\temp\contrib-test
$env:SKILLBOX_REGISTRY = "C:\PersonalProjects\skillbox\registry"
$sb = "C:\PersonalProjects\skillbox\packages\cli\bin\skillbox.js"
node $sb init
node $sb inspect skillbox/release-notes
node $sb add skillbox/release-notes --dry-run
node $sb add skillbox/release-notes
node $sb doctor
node $sb remove skillbox/release-notes
```

```bash
mkdir -p /tmp/contrib-test
cd /tmp/contrib-test
export SKILLBOX_REGISTRY="$HOME/skillbox/registry"
sb="$HOME/skillbox/packages/cli/bin/skillbox.js"
node "$sb" init
node "$sb" inspect skillbox/release-notes
node "$sb" add skillbox/release-notes --dry-run
node "$sb" add skillbox/release-notes
node "$sb" doctor
node "$sb" remove skillbox/release-notes
```

Check that `inspect` reads clearly, files land where intended, `doctor` reports nothing, and `remove` leaves no debris.

### 6. Update the ledger

Add an `SBX-###` task in [docs/TASKS.md](../TASKS.md) with acceptance criteria and completion evidence. Every meaningful change is tracked there.

### 7. Open a pull request

Fill in the template. Confirm:

- `pnpm validate:registry` passes.
- `pnpm test` passes.
- You installed and removed the resource in a scratch project.
- No credentials, tokens, or keys are present anywhere.
- The task ledger is updated.

## What reviewers check

### Correctness

- Manifest validates; declared files all exist; entrypoint is among them.
- Version is `0.1.0` for a new resource.
- Directory name matches `metadata.name` and sits under the right kind directory.

### Documentation

- The README explains what it does, its inputs and outputs, how to install it, what permissions it needs and why, and shows a usage example.
- The description says what the resource does, not merely what it is about.
- No broken links.

### Security

This is where contributions most often need changes.

- **No secrets.** No tokens, keys, passwords, connection strings, or credential-bearing URLs — in the manifest, source files, README, or fixtures. Not even expired or example-looking ones.
- **Environment variables declared by name only.** `secret: true` on anything sensitive.
- **Minimal, honest permissions.** An unexplained `secrets:read` or `process:spawn` will be questioned. Permissions are declarative in v0.1.0, so their value depends entirely on authors describing reality.
- **No unreachable integrations.** Do not contribute something that only works against a service reviewers cannot access.
- **Relative install targets** inside the project.

### Quality

- General enough to be reused.
- Not a near-duplicate of an existing resource.
- Small enough to be reviewable. An example resource should demonstrate the system, not become a product in its own right.

## Updating an existing resource

Bump the version according to consumer impact:

| Change | Bump |
| --- | --- |
| Fix wording, typo, or bug with compatible behavior | patch |
| Add an optional input or capability | minor |
| Remove or rename an input, change output shape, change install target | major |
| Change behavior enough to break a consumer | major |

For prompts and skills, rewording instructions enough to change the output shape is a **major** change even though no manifest field moved. The interface is the behavior.

Note the change in [CHANGELOG.md](../../CHANGELOG.md) under Unreleased.

## Deprecating a resource

Do not delete a resource that people may have installed. Mark it:

```yaml
metadata:
  deprecated:
    reason: Superseded by a schema-driven release notes prompt.
    replacement: skillbox/release-notes-v2
```

Installing a deprecated resource warns but still works, so existing users are not broken.

## Licensing

Contributions are licensed under the [MIT License](../../LICENSE).

Only contribute content you have the right to contribute. If a resource adapts someone else's work, ensure the license permits it and attribute the source in the README.

## Getting help

- Open an issue with the **New resource** template for scope questions.
- Use the **Bug report** template if the CLI behaves unexpectedly.
- For a security issue, do **not** open a public issue. Follow [SECURITY.md](../../SECURITY.md).
