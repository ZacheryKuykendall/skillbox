# Getting Started

Install Skillbox, add a resource to a project, and remove it again. About ten minutes.

## Prerequisites

- **Node.js 20.19 or newer.** Node 24 is what CI uses.
- **pnpm 10.** If you do not have it: `corepack enable pnpm`.
- **git.**

Check:

```powershell
node --version
pnpm --version
```

```bash
node --version
pnpm --version
```

## 1. Clone and build

PowerShell:

```powershell
git clone <repository-url> skillbox
cd skillbox
pnpm install
pnpm build
```

bash:

```bash
git clone <repository-url> skillbox
cd skillbox
pnpm install
pnpm build
```

Verify the toolchain is healthy before going further:

```powershell
pnpm lint
pnpm typecheck
pnpm test
```

```bash
pnpm lint
pnpm typecheck
pnpm test
```

All three should pass. If they do not, that is a bug — please report it rather than working around it.

## 2. Initialize a project

Skillbox installs resources into a **project**: any directory with a `.skillbox/` folder. The `examples/starter-project` directory is already initialized, so create a scratch project to work in.

PowerShell:

```powershell
mkdir C:\temp\my-project
cd C:\temp\my-project
node C:\PersonalProjects\skillbox\packages\cli\bin\skillbox.js init
```

bash:

```bash
mkdir -p /tmp/my-project
cd /tmp/my-project
node ~/skillbox/packages/cli/bin/skillbox.js init
```

Adjust the path to wherever you cloned the repository. To save typing, set an alias for this session:

```powershell
function skillbox { node C:\PersonalProjects\skillbox\packages\cli\bin\skillbox.js @args }
```

```bash
alias skillbox='node ~/skillbox/packages/cli/bin/skillbox.js'
```

`init` reports what it created:

```text
Initialized Skillbox project.

  Created .skillbox/skillbox.yaml
  Created .skillbox/skillbox.lock

Next: skillbox search <query> to find resources.
```

`init` will not overwrite an existing configuration. Running it twice fails and changes nothing unless you pass `--force`.

Skillbox needs to know where the catalog is. Since v0.1.0 has no remote registry, point it at the cloned repository:

```powershell
$env:SKILLBOX_REGISTRY = "C:\PersonalProjects\skillbox\registry"
```

```bash
export SKILLBOX_REGISTRY="$HOME/skillbox/registry"
```

You can also pass `--registry <path>` to any command.

## 3. Search the catalog

```powershell
skillbox search review
```

```bash
skillbox search review
```

```text
2 resources matched "review"

  skillbox/code-review@0.1.0                  prompt
    Reviews a code change and produces actionable findings.
    tags: development, code-review

  skillbox/plan-implement-review@0.1.0        workflow
    Plans, implements, and reviews a change as an ordered workflow.
    tags: workflow, development
```

An empty query lists everything. `--kind` and `--tag` filter:

```powershell
skillbox search --kind component
skillbox list --json
```

```bash
skillbox search --kind component
skillbox list --json
```

## 4. Inspect before installing

**Read this before installing anything you did not write.** `inspect` shows exactly what a resource declares.

```powershell
skillbox inspect skillbox/code-review
```

```bash
skillbox inspect skillbox/code-review
```

```text
skillbox/code-review@0.1.0
Reviews a code change and produces actionable findings.

Kind          prompt
Entrypoint    prompt.md
Install to    .skillbox/prompts/code-review
Tags          development, code-review

Files
  prompt.md
  README.md

Inputs
  diff        string   required   The unified diff to review.
  severity    enum     optional   Minimum severity to report.

Permissions
  model:invoke

Dependencies
  none
```

Pay attention to three things: **Install to**, because that is where files land; **Permissions**, because those are capabilities the author says the resource needs; and **Environment**, if present, because those are variables you will have to supply.

Permissions are declared, not enforced. Skillbox shows them so you can decide; it has no runtime to police them. See the [security model](../architecture/security-model.md).

## 5. Preview the install

```powershell
skillbox add skillbox/code-review --dry-run
```

```bash
skillbox add skillbox/code-review --dry-run
```

```text
Install plan

  skillbox/code-review@0.1.0  prompt
    + .skillbox/prompts/code-review/prompt.md
    + .skillbox/prompts/code-review/README.md

Permissions requested
  model:invoke

Dry run: no changes were made.
```

`--dry-run` uses the same code path as a real install and stops before writing, so what you see is what would happen.

## 6. Install

```powershell
skillbox add skillbox/code-review
```

```bash
skillbox add skillbox/code-review
```

Installation copies files and updates your configuration. It **does not execute anything** — that is true even for `script` resources.

If a destination file already exists and Skillbox did not put it there, the install aborts and reports the conflict rather than overwriting your work.

## 7. See what happened

```powershell
skillbox list
```

```bash
skillbox list
```

```text
1 resource installed

  skillbox/code-review    prompt    requested ^0.1.0    resolved 0.1.0    ok
```

Two files now describe your project state:

`.skillbox/skillbox.yaml` — what you **requested**. Hand-editable.

```yaml
apiVersion: skillbox.dev/v1alpha1
kind: Project
metadata:
  name: my-project
spec:
  resources:
    - resource: skillbox/code-review
      version: ^0.1.0
```

`.skillbox/skillbox.lock` — what was **resolved and installed**, with integrity digests. Machine-generated; commit it.

```yaml
lockfileVersion: 1
resources:
  skillbox/code-review:
    version: 0.1.0
    kind: prompt
    integrity: sha256-...
    target: .skillbox/prompts/code-review
    files:
      .skillbox/prompts/code-review/README.md: sha256-...
      .skillbox/prompts/code-review/prompt.md: sha256-...
    requestedBy: direct
```

The manifest states intent; the lockfile states fact. Both belong in version control.

## 8. Validate and diagnose

```powershell
skillbox validate
skillbox doctor
```

```bash
skillbox validate
skillbox doctor
```

`validate` checks structure: manifests, declared files, entrypoints, dependency references, install paths.

`doctor` checks your project's health: lockfile consistency, missing files, files whose content drifted from the recorded digest, dependency problems, runtime compatibility, and required environment variables that are unset.

`doctor` reports environment variables **by name only**. It never reads a value.

Try editing an installed file, then run `doctor` again — it detects the change by digest. That is also why `remove` will not silently delete work you have modified.

## 9. Remove

```powershell
skillbox remove skillbox/code-review
```

```bash
skillbox remove skillbox/code-review
```

Removal deletes only files the lockfile records as owned by that resource, and refuses to delete a file you modified unless you pass `--force`. It also refuses to remove a resource another installed resource depends on.

## Working with environment variables

Some resources — `api` resources especially — need environment variables. `inspect` lists the names:

```text
Environment
  SKILLBOX_EXAMPLE_API_BASE_URL   required   Base URL of the target REST service.
  SKILLBOX_EXAMPLE_API_TOKEN      required   Bearer token for the target service.  (secret)
```

Supply them in your shell:

```powershell
$env:SKILLBOX_EXAMPLE_API_BASE_URL = "https://api.example.com"
$env:SKILLBOX_EXAMPLE_API_TOKEN = "<your-token>"
```

```bash
export SKILLBOX_EXAMPLE_API_BASE_URL="https://api.example.com"
export SKILLBOX_EXAMPLE_API_TOKEN="<your-token>"
```

Skillbox records the **names** and never the values. Values are not stored in the manifest, the lockfile, or any output. Never commit a file containing real values.

## Troubleshooting

**`Project is not initialized`** — no `.skillbox/` in this directory or a parent. Run `skillbox init`.

**`Resource not found`** — check the registry path with `--registry` or `SKILLBOX_REGISTRY`, and confirm the reference with `skillbox search`.

**`Destination conflict`** — a file already exists where the resource wants to write. Move your file, override the target in `.skillbox/skillbox.yaml`, or pass `--force` if overwriting is genuinely what you want.

**`No version satisfies`** — the requested range does not match any catalog version. The error lists what is available.

## Next steps

- [CLI reference](cli-reference.md) — every command, flag, and exit code.
- [Creating a resource](creating-a-resource.md) — build your own.
- [Security model](../architecture/security-model.md) — read this before installing resources from anyone else.
- [Resource model](../architecture/resource-model.md) — the full manifest specification.
