# Starter Project

A project with all seven Skillbox resource kinds installed, so you can see what installation actually produces before doing it yourself.

The `.skillbox/` directory here is **committed**, which is the point: a project's Skillbox configuration and lockfile belong in version control, the same as `package-lock.json`.

## What is installed

```powershell
skillbox list
```

```bash
skillbox list
```

```text
6 resources installed

  skillbox/code-review              prompt     requested (dependency)  resolved 0.1.0  ok
  skillbox/implementation-planner   agent      requested (dependency)  resolved 0.1.0  ok
  skillbox/plan-implement-review    workflow   requested ^0.1.0        resolved 0.1.0  ok
  skillbox/project-summary          script     requested ^0.1.0        resolved 0.1.0  ok
  skillbox/structured-logger        component  requested ^0.1.0        resolved 0.1.0  ok
  skillbox/technical-documentation  skill      requested (dependency)  resolved 0.1.0  ok
```

Six resources from three commands. Three of them were never asked for directly — they arrived as dependencies of the workflow, which is why they show `(dependency)` in the requested column.

## The commands that produced this

Run from this directory, with `skillbox` resolving to `../../packages/cli/bin/skillbox.js`:

```powershell
skillbox init --name starter-project
skillbox add skillbox/plan-implement-review
skillbox add skillbox/project-summary
skillbox add skillbox/structured-logger
```

```bash
skillbox init --name starter-project
skillbox add skillbox/plan-implement-review
skillbox add skillbox/project-summary
skillbox add skillbox/structured-logger
```

That is three `add` commands for six resources. `skillbox/plan-implement-review` declares three dependencies, and one of those (`implementation-planner`) declares a dependency of its own on `code-review`. Both paths reach `code-review`; it is installed once.

## Where the files went

```text
examples/starter-project/
├── .skillbox/
│   ├── skillbox.yaml          What was requested
│   ├── skillbox.lock          What was resolved and installed
│   ├── prompts/code-review/
│   ├── skills/technical-documentation/
│   ├── agents/implementation-planner/
│   ├── scripts/project-summary/
│   └── workflows/plan-implement-review/
└── src/
    └── components/structured-logger/
```

Note the split. Prompts, skills, agents, scripts, and workflows are Skillbox-managed metadata and live under `.skillbox/`. The component lives in `src/`, because it is application source you compile and own.

`api` resources also install into `src/`. This project does not install one, because `skillbox/generic-rest-client` requires two environment variables to be useful and a committed example would suggest values that do not exist.

## Intent versus fact

`.skillbox/skillbox.yaml` records what was **requested**. It is hand-editable and lists only the three direct requests:

```yaml
apiVersion: skillbox.dev/v1alpha1
kind: Project
metadata:
  name: starter-project
spec:
  resources:
    - resource: skillbox/plan-implement-review
      version: ^0.1.0
    - resource: skillbox/project-summary
      version: ^0.1.0
    - resource: skillbox/structured-logger
      version: ^0.1.0
```

`.skillbox/skillbox.lock` records what was **resolved and installed** — all six resources, exact versions, integrity digests per file, and the dependency edges. It is machine-generated and deterministic: reinstalling produces no diff.

Look at a lockfile entry and note what is absent. There is no timestamp and no absolute path, so the file is identical on every machine. That is deliberate — a lockfile that churns stops being reviewed, and the integrity information it carries stops being read.

## Try it

Verify the project is healthy:

```powershell
skillbox doctor
```

```bash
skillbox doctor
```

```text
Skillbox doctor

  ok     Project "starter-project" is valid
  ok     Lockfile is consistent with the project manifest
  ok     All installed files match their recorded integrity digests
  ok     All recorded dependencies are installed
  ok     Every installed resource is present in the catalog
  ok     Runtime requirements are satisfied (Node 24.10.0)
  ok     All required environment variables are set

No problems found.
```

### See modification detection work

Edit an installed file, then run `doctor` again:

```powershell
Add-Content .skillbox\prompts\code-review\prompt.md "`nMy own addition."
skillbox doctor
```

```bash
echo "\nMy own addition." >> .skillbox/prompts/code-review/prompt.md
skillbox doctor
```

It reports the file as modified, by digest. That is also why removal protects your work:

```powershell
skillbox remove skillbox/code-review
```

```text
error  1 file has local modifications.
       .skillbox/prompts/code-review/prompt.md

hint   Back up your changes, then pass --force to remove them anyway.
```

Restore it with `git checkout .skillbox/`.

### See dependency protection work

`code-review` is required by `implementation-planner`, so removing it on its own is refused:

```powershell
skillbox remove skillbox/code-review
```

```text
error  "skillbox/code-review" is required by 1 installed resource.
       skillbox/implementation-planner

hint   Remove the dependents first, or pass --force.
```

### Run the installed script

Installing a script does not run it. Run it yourself:

```powershell
node .skillbox/scripts/project-summary/summarize.mjs --depth 2
```

```bash
node .skillbox/scripts/project-summary/summarize.mjs --depth 2
```

Or through the package script defined in `package.json`:

```powershell
pnpm --filter skillbox-starter-project summary
```

```bash
pnpm --filter skillbox-starter-project summary
```

### Use the installed component

`src/components/structured-logger/` is TypeScript you own. Its tests ship with it:

```powershell
pnpm vitest run registry/components/structured-logger
```

```bash
pnpm vitest run registry/components/structured-logger
```

## Restoring this example

If you experiment and want to get back to the committed state:

```powershell
git checkout examples/starter-project
git clean -fd examples/starter-project
```

```bash
git checkout examples/starter-project
git clean -fd examples/starter-project
```

## Next

- [Getting started](../../docs/guides/getting-started.md) — do this in your own project.
- [CLI reference](../../docs/guides/cli-reference.md) — every command and exit code.
- [Creating a resource](../../docs/guides/creating-a-resource.md) — build your own.
- [Security model](../../docs/architecture/security-model.md) — read before installing resources you did not write.
