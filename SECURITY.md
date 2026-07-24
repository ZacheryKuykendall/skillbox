# Security Policy

## Supported versions

Skillbox is pre-1.0. Only the latest released version receives security fixes.

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
| < 0.1 | No |

## Reporting a vulnerability

Report vulnerabilities privately through GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) on this repository. Use the **Security** tab, then **Report a vulnerability**.

Do not open a public issue for a suspected vulnerability.

Include, where possible:

- The affected version or commit.
- A minimal reproduction, ideally a manifest or resource directory that triggers the issue.
- The observed and expected behavior.
- Impact, especially whether it allows writing outside a project directory, executing code, or disclosing secrets.

Please do not include real credentials in a report. Redact them or substitute obvious placeholders.

## What Skillbox considers a vulnerability

Skillbox treats resources as untrusted input. The following are in scope:

- **Escaping the project directory.** Any manifest, install target, variable, or file path that causes a write, read, or delete outside the project root.
- **Unintended code execution.** Any path where installing, validating, inspecting, or removing a resource executes resource-supplied code. Installation must never execute anything.
- **Secret disclosure.** Any case where an environment variable value, credential, or token appears in CLI output, an error message, a log, the lockfile, or the project manifest.
- **Integrity bypass.** Any way to make an installed file differ from its recorded integrity digest without detection.
- **Permission concealment.** Any way for a resource to gain effect without its declared permissions being shown before installation.
- **Lockfile tampering leading to unsafe writes.** Any crafted lockfile that causes writes outside the project directory.

The threat model, trust boundaries, and the tests that enforce them are documented in [docs/architecture/security-model.md](docs/architecture/security-model.md).

## Out of scope

- The content or quality of a third-party resource's instructions. Skillbox validates structure and confines filesystem effects; it does not judge whether a prompt or script is well-behaved when you choose to run it.
- Consequences of running a `script` resource yourself. Skillbox installs scripts; executing one is your explicit, separate action.
- Denial of service from an intentionally enormous local catalog you supply yourself.
- Vulnerabilities in Node.js or in third-party dependencies that are already publicly known and awaiting an upstream fix. Report those upstream; open a normal issue here to track the version bump.

## Handling secrets

Skillbox never stores secret values. Resources declare required environment variables **by name**; supply the values through your shell environment or a secret manager.

PowerShell:

```powershell
$env:SKILLBOX_EXAMPLE_API_TOKEN = "<value>"
```

bash:

```bash
export SKILLBOX_EXAMPLE_API_TOKEN="<value>"
```

Never commit a `.env` file containing real values, and never add credentials, tokens, or private keys to this repository or to a resource you contribute.

## Response expectations

Because this is a pre-1.0 project maintained on a best-effort basis, no formal response deadline is offered. Reports are triaged in the order received, and confirmed issues affecting the guarantees listed above are prioritized over feature work.
