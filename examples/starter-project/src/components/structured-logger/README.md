# skillbox/structured-logger

A dependency-free structured JSON logger with recursive redaction, for Node services.

## What it does

Emits one JSON object per line, which is what log aggregators expect. Around 150 lines with no dependencies, so it is a component you own rather than a library you track.

What makes it worth installing over writing your own:

- **Recursive redaction.** A token nested inside a logged request object is how secrets actually reach logs. Redaction walks the whole structure, not just top-level keys, and applies to base and child fields too.
- **Child loggers.** `logger.child({ requestId })` attaches a field to every subsequent line without threading it through every call.
- **`isEnabled`.** Lets a caller skip building expensive fields for a level that will be discarded.
- **Values that would otherwise crash a log call**: `Error` becomes name, message, and stack; `bigint` becomes a string, since `JSON.stringify` throws on it; a cyclic or pathologically deep object is truncated rather than recursing forever.
- **Errors to stderr**, so they survive stdout being redirected or parsed.
- **Injectable clock and writer**, so tests need no mocking library.

## Inputs

| Name     | Type                                   | Required | Default   | Description           |
| -------- | -------------------------------------- | -------- | --------- | --------------------- |
| `level`  | enum: `debug`, `info`, `warn`, `error` | no       | `info`    | Lowest level to emit  |
| `redact` | array                                  | no       | see below | Field names to redact |

## Outputs

| Name     | Type   | Description                                                                  |
| -------- | ------ | ---------------------------------------------------------------------------- |
| `logger` | object | A logger exposing `debug`, `info`, `warn`, `error`, `child`, and `isEnabled` |

## Exports

| Export                    | Description                               |
| ------------------------- | ----------------------------------------- |
| `createLogger`            | Creates a logger                          |
| `LOG_LEVELS`              | The four levels, in order                 |
| `DEFAULT_REDACTED_FIELDS` | The default redaction list, for extending |
| `REDACTED_PLACEHOLDER`    | The replacement string                    |

## Installation

```powershell
skillbox add skillbox/structured-logger
```

```bash
skillbox add skillbox/structured-logger
```

Installs to `src/components/structured-logger/`:

```text
src/components/structured-logger/
├── logger.ts
├── logger.test.ts
└── README.md
```

This installs into **your source tree**, not `.skillbox/`, because it is code you compile and own. Override the destination if you organize differently:

```powershell
skillbox add skillbox/structured-logger --target src/lib/logging
```

The test file ships with it, so you inherit its coverage instead of reconstructing it. It is written for Vitest; the assertions translate to any runner with minimal change.

## Requirements

| Requirement | Version                                      |
| ----------- | -------------------------------------------- |
| Node.js     | 20.19 or newer                               |
| TypeScript  | 5.0 or newer, declared as a peer requirement |

Skillbox reports the peer requirement but does not install it — add TypeScript with your own package manager.

## Required permissions

| Permission         | Why                                                                        |
| ------------------ | -------------------------------------------------------------------------- |
| `filesystem:write` | The default writer writes to stdout and stderr, which are file descriptors |

It makes no network requests and reads no environment variables. Permissions are declared by the author and are not enforced by Skillbox in v0.1.0 — see the [security model](../../../docs/architecture/security-model.md).

## Configuration

Configured at construction, not through a file.

Default redacted field names, matched case-insensitively:

```text
password, token, secret, authorization, apikey, api_key,
cookie, sessionid, session_id, credential, privatekey, private_key
```

`redact` **replaces** this list rather than adding to it, so a caller has to be deliberate. To extend it, spread the default:

```typescript
import {
  createLogger,
  DEFAULT_REDACTED_FIELDS,
} from './components/structured-logger/logger.js';

const logger = createLogger({
  redact: [...DEFAULT_REDACTED_FIELDS, 'ssn', 'creditCard'],
});
```

## Usage

```typescript
import { createLogger } from './components/structured-logger/logger.js';

const logger = createLogger({
  level: 'info',
  base: { service: 'billing', version: '1.4.2' },
});

logger.info('server started', { port: 3000 });
```

```json
{
  "time": "2026-07-24T12:00:00.000Z",
  "level": "info",
  "message": "server started",
  "service": "billing",
  "version": "1.4.2",
  "port": 3000
}
```

### Child loggers per request

```typescript
app.use((req, res, next) => {
  req.log = logger.child({ requestId: crypto.randomUUID(), path: req.path });
  next();
});

// Later, without threading requestId through every call:
req.log.info('user authenticated', { userId: user.id });
```

### Redaction in practice

```typescript
logger.info('outgoing request', {
  request: {
    path: '/users',
    headers: { authorization: 'Bearer <token>', accept: 'application/json' },
  },
});
```

```json
{
  "time": "...",
  "level": "info",
  "message": "outgoing request",
  "request": {
    "path": "/users",
    "headers": { "authorization": "[redacted]", "accept": "application/json" }
  }
}
```

The token is redacted two levels down; the useful context is kept.

### Skipping expensive work

```typescript
if (logger.isEnabled('debug')) {
  logger.debug('cache state', { entries: summarizeCache() });
}
```

### Errors

```typescript
try {
  await risky();
} catch (error) {
  logger.error('operation failed', { err: error });
}
```

An `Error` becomes `{ name, message, stack }` rather than the `{}` that `JSON.stringify` would produce.

### Testing

Inject a writer and a clock for deterministic assertions:

```typescript
const lines: string[] = [];

const logger = createLogger({
  write: (line) => lines.push(line),
  now: () => new Date('2026-01-01T00:00:00.000Z'),
});

logger.info('test');

expect(JSON.parse(lines[0])).toEqual({
  time: '2026-01-01T00:00:00.000Z',
  level: 'info',
  message: 'test',
});
```

Run the bundled tests:

```powershell
pnpm vitest run src/components/structured-logger
```

```bash
pnpm vitest run src/components/structured-logger
```

## Notes

Redaction matches **field names**, not value patterns. A secret logged under an unlisted name still appears in the output. Add your own names to the list rather than assuming the defaults are exhaustive.

Because this installs into your source tree, Skillbox records a digest of each file. Editing them is expected — `skillbox doctor` reports them as modified, and `skillbox remove` refuses to delete your changes without `--force`.
