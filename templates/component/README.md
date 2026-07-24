# skillbox/REPLACE-ME

TODO one line describing what this component provides.

## What it does

TODO a short paragraph. Say what makes it worth installing rather than writing from scratch, and what its dependency footprint is.

## Inputs

| Name   | Type   | Required | Default | Description |
| ------ | ------ | -------- | ------- | ----------- |
| `TODO` | string | no       | —       | TODO        |

## Outputs

| Name   | Type   | Description |
| ------ | ------ | ----------- |
| `TODO` | object | TODO        |

## Exports

| Export | Description |
| ------ | ----------- |
| `TODO` | TODO        |

## Installation

```powershell
skillbox add skillbox/REPLACE-ME
```

```bash
skillbox add skillbox/REPLACE-ME
```

Installs to `src/components/REPLACE-ME/`:

```text
src/components/REPLACE-ME/
├── index.ts
├── index.test.ts
└── README.md
```

This installs into your **source tree**, not `.skillbox/`, because it is code you compile and own. Override the destination if you organize differently:

```powershell
skillbox add skillbox/REPLACE-ME --target src/lib/todo
```

The test file ships with it, so you inherit its coverage instead of reconstructing it.

## Requirements

| Requirement | Version                                      |
| ----------- | -------------------------------------------- |
| Node.js     | 20.19 or newer                               |
| TypeScript  | 5.0 or newer, declared as a peer requirement |

Skillbox reports peer requirements but does not install them — add them with your own package manager.

## Required permissions

TODO, or "None. The component has no side effects."

Permissions are declared by the author and are not enforced by Skillbox in v0.1.0 — see the [security model](../../../docs/architecture/security-model.md).

## Configuration

TODO how it is configured, and at what point.

## Usage

```typescript
import { createTodo } from './components/REPLACE-ME/index.js';

const todo = createTodo({ todo: 'value' });
```

### Testing

Run the bundled tests:

```powershell
pnpm vitest run src/components/REPLACE-ME
```

```bash
pnpm vitest run src/components/REPLACE-ME
```

## Notes

TODO limitations.

Because this installs into your source tree, Skillbox records a digest of each file. Editing them is expected — `skillbox doctor` reports them as modified, and `skillbox remove` refuses to delete your changes without `--force`.
