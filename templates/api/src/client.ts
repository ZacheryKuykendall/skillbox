/**
 * TODO describe the client.
 *
 * Configuration comes from environment variables read at construction. Keep the
 * token in a private field so it cannot be read back off the instance, picked up
 * by a structured logger walking own properties, or included in
 * `JSON.stringify` output.
 */

export interface ClientConfig {
  /** Base URL without a trailing slash. */
  readonly baseUrl: string;
  /** Credential. Held in memory only; never logged or serialized. */
  readonly token: string;
  readonly timeoutMs?: number;
  /** Injectable for testing. Defaults to global `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Read configuration from the environment.
 *
 * A missing value fails immediately with a message naming the variable, which is
 * far easier to act on than an authentication error later. The message names the
 * variable but never its value.
 */
export function configFromEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ClientConfig {
  const baseUrl = env.REPLACE_ME_API_BASE_URL;
  const token = env.REPLACE_ME_API_TOKEN;

  if (baseUrl === undefined || baseUrl.length === 0) {
    throw new Error('REPLACE_ME_API_BASE_URL is not set.');
  }

  if (token === undefined || token.length === 0) {
    throw new Error('REPLACE_ME_API_TOKEN is not set.');
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ''), token };
}

export class Client {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof globalThis.fetch;

  constructor(config: ClientConfig) {
    this.#baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.#token = config.token;
    this.#timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#fetch = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  static fromEnvironment(env?: Readonly<Record<string, string | undefined>>): Client {
    return new Client(configFromEnvironment(env));
  }

  /** TODO describe this operation. */
  async todo<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);

    try {
      const response = await this.#fetch(
        new URL(path.replace(/^\//, ''), `${this.#baseUrl}/`).toString(),
        {
          signal: controller.signal,
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${this.#token}`,
          },
        },
      );

      if (!response.ok) {
        // The path, not the full URL: a URL can carry credentials, and this
        // message may reach a log.
        throw new Error(
          `Request failed with status ${String(response.status)} for ${path}.`,
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
