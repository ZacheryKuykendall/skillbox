# Resource Templates

A starting manifest for each resource kind. Copy the directory, replace the placeholders, and validate.

## Usage

PowerShell:

```powershell
mkdir registry\prompts\my-resource
Copy-Item templates\prompt\* registry\prompts\my-resource\ -Recurse
```

bash:

```bash
mkdir -p registry/prompts/my-resource
cp -r templates/prompt/* registry/prompts/my-resource/
```

Then replace every `REPLACE-ME` and `TODO`, and validate:

```powershell
pnpm skillbox validate registry\prompts\my-resource
```

```bash
pnpm skillbox validate registry/prompts/my-resource
```

A template does **not** validate as-is: the placeholder name and description are deliberately invalid, so an unfinished resource fails loudly rather than shipping with placeholder text.

## Templates

| Kind        | Directory                | Required kind-specific fields |
| ----------- | ------------------------ | ----------------------------- |
| `prompt`    | [prompt/](prompt/)       | none                          |
| `skill`     | [skill/](skill/)         | none                          |
| `agent`     | [agent/](agent/)         | `role`                        |
| `script`    | [script/](script/)       | `interpreter`                 |
| `api`       | [api/](api/)             | `protocol`                    |
| `workflow`  | [workflow/](workflow/)   | `steps`                       |
| `component` | [component/](component/) | `language`                    |

## Reminders

- **Names** must match `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`, 2 to 64 characters.
- **Descriptions** must be 10 to 200 characters on a single line. This is what shows in search results, so say what the resource does.
- **Every file** must appear in `spec.files`, and the entrypoint must be among them.
- **Paths** are relative and POSIX-style. Absolute paths, `..`, and drive prefixes are rejected.
- **Quote version ranges.** `'>=20.19.0'` needs quotes or YAML will misparse it.
- **Permissions** come from a closed set and should be minimal. They are shown to users before installation, and an over-broad list is a reason to skip a resource.
- **Environment variables are declared by name only.** There is no field for a value, and there is no way to add one.
- **Never include a credential**, not even an expired or obviously-fake one. This repository's own tests scan contributed resources for credential-shaped strings.

Full field reference: [docs/architecture/resource-model.md](../docs/architecture/resource-model.md). Walkthrough: [docs/guides/creating-a-resource.md](../docs/guides/creating-a-resource.md).
