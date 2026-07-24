/**
 * A typed REST client with retries, timeouts, and normalized errors.
 *
 * Configuration comes from environment variables read at construction time. The
 * token is never logged, never included in an error message, and never returned
 * from any method here.
 */
import { RestError } from './errors.js';

export interface RestClientConfig {
  /** Base URL without a trailing slash. */
  readonly baseUrl: string;
  /** Bearer token. Held in memory only; never logged or serialized. */
  readonly token: string;
  /** Per-request timeout in milliseconds. */
  readonly timeoutMs?: number;
  /** How many times to retry a retryable failure. */
  readonly retries?: number;
  /** Base delay for exponential backoff, in milliseconds. */
  readonly retryDelayMs?: number;
  /** Injectable for testing. Defaults to global `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
}

export interface RequestOptions {
  readonly query?: Readonly<Record<string, string | number | boolean>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  /** Override the retry count for this request. */
  readonly retries?: number;
}

const DEFAULTS = {
  timeoutMs: 30_000,
  retries: 2,
  retryDelayMs: 250,
} as const;

/**
 * Read configuration from the environment.
 *
 * The variable names match what the manifest declares. A missing value fails
 * immediately with a message naming the variable, which is far easier to act on
 * than an authentication error later.
 *
 * The message names the variable but never its value.
 */
export function configFromEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
): RestClientConfig {
  const baseUrl = env.SKILLBOX_EXAMPLE_API_BASE_URL;
  const token = env.SKILLBOX_EXAMPLE_API_TOKEN;

  if (baseUrl === undefined || baseUrl.length === 0) {
    throw new RestError({
      kind: 'configuration',
      message: 'SKILLBOX_EXAMPLE_API_BASE_URL is not set.',
    });
  }

  if (token === undefined || token.length === 0) {
    throw new RestError({
      kind: 'configuration',
      message: 'SKILLBOX_EXAMPLE_API_TOKEN is not set.',
    });
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ''), token };
}

/** A configured REST client. */
export class RestClient {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #timeoutMs: number;
  readonly #retries: number;
  readonly #retryDelayMs: number;
  readonly #fetch: typeof globalThis.fetch;

  constructor(config: RestClientConfig) {
    this.#baseUrl = config.baseUrl.replace(/\/+$/, '');
    // Private so it cannot be read back off the instance, logged by a generic
    // serializer, or picked up by a structured logger walking own properties.
    this.#token = config.token;
    this.#timeoutMs = config.timeoutMs ?? DEFAULTS.timeoutMs;
    this.#retries = config.retries ?? DEFAULTS.retries;
    this.#retryDelayMs = config.retryDelayMs ?? DEFAULTS.retryDelayMs;
    this.#fetch = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Build a client from the environment. */
  static fromEnvironment(
    env?: Readonly<Record<string, string | undefined>>,
  ): RestClient {
    return new RestClient(configFromEnvironment(env));
  }

  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.#request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.#request<T>('POST', path, body, options);
  }

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.#request<T>('PUT', path, body, options);
  }

  async remove<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.#request<T>('DELETE', path, undefined, options);
  }

  async #request<T>(
    method: string,
    path: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = this.#buildUrl(path, options.query);
    const retries = options.retries ?? this.#retries;

    let lastError: RestError | undefined;

    // One extra attempt than the retry count: the first is not a retry.
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (attempt > 0) {
        // Exponential backoff, so a struggling server is not hammered.
        await delay(this.#retryDelayMs * 2 ** (attempt - 1));
      }

      try {
        return await this.#attempt<T>(method, url, path, body, options);
      } catch (error) {
        if (!(error instanceof RestError) || !error.retryable) throw error;
        lastError = error;
      }
    }

    // Unreachable unless the loop body always threw, which the retryable check
    // above guarantees is the only way out.
    throw (
      lastError ??
      new RestError({ kind: 'network', message: 'Request failed.', method, path })
    );
  }

  async #attempt<T>(
    method: string,
    url: string,
    path: string,
    body: unknown,
    options: RequestOptions,
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? this.#timeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.#fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${this.#token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...options.headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      if (!response.ok) {
        throw new RestError({
          kind: 'http',
          message: `Request failed with status ${String(response.status)}.`,
          status: response.status,
          method,
          path,
          body: await response.text().catch(() => undefined),
        });
      }

      // 204 and 205 carry no body, so parsing would fail on a success.
      if (response.status === 204 || response.status === 205) {
        return undefined as T;
      }

      const text = await response.text();
      if (text.length === 0) return undefined as T;

      try {
        return JSON.parse(text) as T;
      } catch (error) {
        throw new RestError({
          kind: 'parse',
          message: 'The response was not valid JSON.',
          status: response.status,
          method,
          path,
          body: text,
          cause: error,
        });
      }
    } catch (error) {
      if (error instanceof RestError) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        throw new RestError({
          kind: 'timeout',
          message: `Request timed out after ${String(options.timeoutMs ?? this.#timeoutMs)}ms.`,
          method,
          path,
          cause: error,
        });
      }

      throw new RestError({
        kind: 'network',
        message: error instanceof Error ? error.message : 'The request failed.',
        method,
        path,
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  #buildUrl(
    path: string,
    query?: Readonly<Record<string, string | number | boolean>>,
  ): string {
    const url = new URL(
      path.startsWith('/') ? path.slice(1) : path,
      `${this.#baseUrl}/`,
    );

    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, String(value));
    }

    return url.toString();
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
