# Skillbox

An organized toolbox for reusable software capabilities.

Skillbox packages, documents, validates, and distributes the things developers keep rebuilding: prompts, skills, agents, scripts, API integrations, workflow components, and application components. Each one becomes a versioned, validated resource you can discover and install into a project with a single command.

> Everything needed to give software a new ability should be packaged, documented, validated, and stored in one organized box.

**Status: v0.1.0 MVP.** The catalog is local to this repository. There is no remote registry yet — see the [roadmap](docs/roadmap.md).

---

## Why

Every team accumulates the same set of half-documented, copy-pasted assets: a code review prompt in someone's notes, a REST client wrapper duplicated across four services, a logging component reimplemented per project. None of it is versioned, validated, or discoverable.

Skillbox treats those assets as first-class packages. A resource declares what it is, what it needs, where it installs, and what permissions it wants. Skillbox validates that declaration, resolves dependencies, and installs the files deterministically with a lockfile.

## Supported resource kinds

| Kind        | Purpose                                                      |
| ----------- | ------------------------------------------------------------ |
| `prompt`    | A reusable instruction template for a language model         |
| `skill`     | A packaged capability with instructions and supporting files |
| `agent`     | An autonomous role definition composed of prompts and tools  |
| `script`    | An executable automation, installed but never auto-run       |
| `api`       | A client integration for an external service                 |
| `workflow`  | An ordered composition of other resources                    |
| `component` | Application source intended to be copied into a codebase     |

## Quick start

Requirements: Node.js 20.19 or newer (Node 24 recommended) and pnpm 10.

PowerShell:

```powershell
git clone https://github.com/ZacheryKuykendall/skillbox.git skillbox
cd skillbox
pnpm install
pnpm build
```

bash:

```bash
git clone https://github.com/ZacheryKuykendall/skillbox.git skillbox
cd skillbox
pnpm install
pnpm build
```

Then use the CLI against a project. From inside this repository the local binary is available through pnpm:

```powershell
pnpm skillbox init
pnpm skillbox search review
pnpm skillbox inspect skillbox/code-review
pnpm skillbox add skillbox/code-review
pnpm skillbox list
pnpm skillbox validate
pnpm skillbox remove skillbox/code-review
```

The same commands work in bash. Full detail is in the [CLI reference](docs/guides/cli-reference.md) and the [getting started guide](docs/guides/getting-started.md).

## What a resource looks like

Every resource is a directory containing a `skillbox.yaml` manifest, a `README.md`, and its source files:

```yaml
apiVersion: skillbox.dev/v1alpha1
kind: prompt

metadata:
  namespace: skillbox
  name: code-review
  version: 0.1.0
  description: Reviews a code change and produces actionable findings.
  tags:
    - development
    - code-review

spec:
  entrypoint: prompt.md
  files:
    - prompt.md
    - README.md
  install:
    target: .skillbox/prompts/code-review
```

Resources are identified as `namespace/name@version`, for example `skillbox/code-review@0.1.0`. The complete specification is in [docs/architecture/resource-model.md](docs/architecture/resource-model.md).

## Repository layout

```text
packages/schema     Manifest types, runtime validation, JSON Schema generation
packages/core       Discovery, resolution, planning, installation, lockfiles
packages/cli        The skillbox command-line interface
packages/testing    Shared fixtures and test helpers
registry/           The local resource catalog
examples/           Demonstration projects
templates/          Starting points for new resources
docs/               Product, architecture, and guide documentation
```

## Security

Skillbox treats every resource as untrusted and installs deny-by-default. Installation never executes resource code — installing a script and running a script are separate actions. Install destinations are confined to the project directory, declared permissions are shown before install, and required environment variables are recorded by name only, never by value.

Read [docs/architecture/security-model.md](docs/architecture/security-model.md) before installing resources you did not write, and see [SECURITY.md](SECURITY.md) to report a vulnerability.

## Development

```powershell
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Coverage is gated at 90% for lines, statements, functions, and branches. Run `pnpm test:coverage` to check it locally.

## Documentation

- [Documentation index](docs/README.md)
- [Getting started](docs/guides/getting-started.md)
- [Creating a resource](docs/guides/creating-a-resource.md)
- [Contributing a resource](docs/guides/contributing-a-resource.md)
- [Architecture overview](docs/architecture/overview.md)
- [Roadmap](docs/roadmap.md)
- [Task ledger](docs/TASKS.md)
- [Agent operating guide](AGENTS.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Work is tracked in [docs/TASKS.md](docs/TASKS.md).

## License

[MIT](LICENSE)
