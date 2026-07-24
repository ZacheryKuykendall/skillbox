# skillbox/REPLACE-ME

TODO one line describing what service this integrates with.

## What it does

TODO a short paragraph. Say what the wrapper adds over calling `fetch` directly.

## Configuration

TODO adjust the variable names for your service. Declared in the manifest **by name only**:

| Variable                  | Required | Description                        |
| ------------------------- | -------- | ---------------------------------- |
| `REPLACE_ME_API_BASE_URL` | yes      | Base URL, without a trailing slash |
| `REPLACE_ME_API_TOKEN`    | yes      | Credential. Marked `secret`        |

Skillbox records the names and never reads, stores, or prints the values. `skillbox doctor` reports whether they are set using a presence check that never touches the value.

```powershell
$env:REPLACE_ME_API_BASE_URL = "https://api.example.com"
$env:REPLACE_ME_API_TOKEN = "<your-token>"
```

```bash
export REPLACE_ME_API_BASE_URL="https://api.example.com"
export REPLACE_ME_API_TOKEN="<your-token>"
```

Never commit these.

## Operations

| Operation | Method | Description |
| --------- | ------ | ----------- |
| `TODO`    | GET    | TODO        |

## Installation

```powershell
skillbox add skillbox/REPLACE-ME
```

```bash
skillbox add skillbox/REPLACE-ME
```

Installs to `src/integrations/REPLACE-ME/` — your **source tree**, not `.skillbox/`, because it is code you compile and own. Override with `--target` if you organize differently.

## Required permissions

| Permission         | Why                                               |
| ------------------ | ------------------------------------------------- |
| `network:outbound` | It makes HTTP requests to the configured base URL |
| `env:read`         | It reads the two declared variables               |

Permissions are declared by the author and are not enforced by Skillbox in v0.1.0 — see the security model (docs/architecture/security-model.md in the Skillbox repository). Installing grants nothing, because installation only copies files; the code runs when you import and call it.

## Requirements

TODO, for example "Node.js 20.19 or newer, for stable `fetch` and `AbortController`."

## Usage

```typescript
import { Client } from './integrations/REPLACE-ME/src/client.js';

const client = Client.fromEnvironment();
const result = await client.todo<{ id: string }>('/some/path');
```

### Testing without a network

`fetch` is injectable, so tests need no HTTP server:

```typescript
const client = new Client({
  baseUrl: 'https://api.example.com',
  token: 'test-token',
  fetch: async () =>
    new Response(JSON.stringify({ id: '42' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
});
```

## Error handling

TODO describe the failure modes and which are worth retrying.

## Notes

TODO rate limits, pagination, and anything else a caller must handle.

Because this installs into your source tree, Skillbox records a digest of each file. Editing them is expected — `skillbox doctor` reports them as modified, and `skillbox remove` refuses to delete your changes without `--force`.
