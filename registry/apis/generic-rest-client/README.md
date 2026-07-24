# skillbox/generic-rest-client

A typed REST client with retries, timeouts, and normalized errors.

## What it does

Wraps `fetch` with the parts you otherwise write again in every project:

- **Normalized errors.** `fetch` reports a 404, a DNS failure, and a timeout in three different shapes. This collapses them into one `RestError` with a `kind`, so callers write one `catch` rather than branching on how the failure happened to surface.
- **Retries that discriminate.** Only genuinely transient failures are retried: network errors, timeouts, and HTTP 408, 429, and 5xx. Retrying a 400 or 403 would fail identically, and retrying a non-idempotent request that actually succeeded is worse than failing.
- **Per-request timeouts** via `AbortController`, with the timer always cleared.
- **Exponential backoff**, so a struggling server is not hammered.
- **204 and 205 handled**, which otherwise throw a parse error on success.

There is no external service behind this. It is a client you point at your own API.

## Configuration

Two environment variables, declared in the manifest **by name only**:

| Variable                        | Required | Description                                       |
| ------------------------------- | -------- | ------------------------------------------------- |
| `SKILLBOX_EXAMPLE_API_BASE_URL` | yes      | Base URL of the service, without a trailing slash |
| `SKILLBOX_EXAMPLE_API_TOKEN`    | yes      | Bearer token. Marked `secret`                     |

Skillbox records the names and never reads, stores, or prints the values. `skillbox doctor` reports whether they are set, using a presence check that never touches the value.

Set them in your shell:

```powershell
$env:SKILLBOX_EXAMPLE_API_BASE_URL = "https://api.example.com"
$env:SKILLBOX_EXAMPLE_API_TOKEN = "<your-token>"
```

```bash
export SKILLBOX_EXAMPLE_API_BASE_URL="https://api.example.com"
export SKILLBOX_EXAMPLE_API_TOKEN="<your-token>"
```

Never commit these. Rename the variables to match your service after installing.

### How the token is protected

The token is held in a `#private` class field. That means it cannot be read back off the instance, cannot be picked up by a structured logger walking own properties, and does not appear in `JSON.stringify` output.

`RestError` carries the request **path**, not the full URL, because a URL can carry credentials in its userinfo or query and the message may reach a log. Response bodies are truncated to 512 characters so a large error body cannot flood one.

## Operations

| Operation | Method | Description                                    |
| --------- | ------ | ---------------------------------------------- |
| `get`     | GET    | Send a GET request and parse the JSON response |
| `post`    | POST   | Send a POST request with a JSON body           |
| `put`     | PUT    | Send a PUT request with a JSON body            |
| `remove`  | DELETE | Send a DELETE request                          |

Named `remove` rather than `delete` because `delete` is a reserved word.

## Installation

```powershell
skillbox add skillbox/generic-rest-client
```

```bash
skillbox add skillbox/generic-rest-client
```

Installs to `src/integrations/rest-client/`:

```text
src/integrations/rest-client/
├── src/client.ts
├── src/errors.ts
└── README.md
```

Note this installs into **your source tree**, not `.skillbox/`. It is code you own and can edit. Override the destination if you organize differently:

```powershell
skillbox add skillbox/generic-rest-client --target src/lib/http
```

## Required permissions

| Permission         | Why                                                      |
| ------------------ | -------------------------------------------------------- |
| `network:outbound` | It makes HTTP requests to the configured base URL        |
| `env:read`         | `configFromEnvironment` reads the two declared variables |

Permissions are declared by the author and are not enforced by Skillbox in v0.1.0 — see the security model (docs/architecture/security-model.md in the Skillbox repository). Installing this resource does not grant it network access; it grants nothing, because installation only copies files. The code runs when you import and call it.

## Requirements

Node.js 20.19 or newer, for stable `fetch` and `AbortController`. TypeScript users need `lib` including `DOM` or `undici-types` for `fetch` types.

## Usage

```typescript
import { RestClient } from './integrations/rest-client/src/client.js';
import { isRestError } from './integrations/rest-client/src/errors.js';

const client = RestClient.fromEnvironment();

interface User {
  id: string;
  name: string;
}

try {
  const user = await client.get<User>('/users/42');
  console.log(user.name);
} catch (error) {
  if (isRestError(error)) {
    // One shape for every failure mode.
    console.error(error.describe());
    if (error.kind === 'http' && error.status === 404) {
      // Handle a missing user specifically.
    }
  } else {
    throw error;
  }
}
```

Explicit configuration, when the environment is not where your config lives:

```typescript
const client = new RestClient({
  baseUrl: 'https://api.example.com',
  token: myTokenFromKeyVault,
  timeoutMs: 5_000,
  retries: 3,
});
```

Query parameters and per-request overrides:

```typescript
await client.get<User[]>('/users', {
  query: { page: 2, active: true },
  timeoutMs: 10_000,
  retries: 0,
});
```

### Testing without a network

`fetch` is injectable, so tests need no HTTP server and no mocking library:

```typescript
const client = new RestClient({
  baseUrl: 'https://api.example.com',
  token: 'test-token',
  retries: 0,
  fetch: async () =>
    new Response(JSON.stringify({ id: '42', name: 'Ada' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
});

const user = await client.get<{ id: string; name: string }>('/users/42');
```

## Error handling

`RestError.kind` is one of:

| Kind            | Meaning                                                    | Retryable              |
| --------------- | ---------------------------------------------------------- | ---------------------- |
| `http`          | The server responded with a non-2xx status                 | Only 408, 429, and 5xx |
| `network`       | The request did not complete: DNS, connection refused, TLS | yes                    |
| `timeout`       | The request exceeded its timeout                           | yes                    |
| `parse`         | A 2xx response body was not valid JSON                     | no                     |
| `configuration` | A required environment variable is not set                 | no                     |

`error.retryable` encodes the rule, so a caller adding its own retry layer does not have to restate it.

## Notes

The variable names are deliberately prefixed `SKILLBOX_EXAMPLE_` so they cannot collide with a real service's variables if you install this to try it out. Rename them for actual use.

Because this installs into your source tree, Skillbox records a digest of each file. Editing them is expected — `skillbox doctor` will report them as modified, and `skillbox remove` refuses to delete your changes without `--force`.
