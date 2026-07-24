/**
 * Normalized errors for the REST client.
 *
 * `fetch` reports a 404, a DNS failure, and a timeout in three different shapes.
 * Normalizing them into one type means callers write one `catch` rather than
 * branching on how the failure happened to surface.
 */

/** What kind of failure occurred. */
export type RestErrorKind =
  /** The server responded with a non-2xx status. */
  | 'http'
  /** The request did not complete: DNS, connection refused, TLS. */
  | 'network'
  /** The request exceeded the configured timeout. */
  | 'timeout'
  /** A 2xx response body could not be parsed as JSON. */
  | 'parse'
  /** Required configuration is missing. */
  | 'configuration';

export interface RestErrorOptions {
  readonly kind: RestErrorKind;
  readonly message: string;
  /** HTTP status, when the failure was an HTTP response. */
  readonly status?: number | undefined;
  /** Request method, for context. */
  readonly method?: string | undefined;
  /**
   * Request path, not the full URL.
   *
   * Deliberately the path only: a full URL can carry credentials in its userinfo
   * or query, and this message may reach a log.
   */
  readonly path?: string | undefined;
  /** Response body, truncated. Useful for a server's own error detail. */
  readonly body?: string | undefined;
  readonly cause?: unknown;
}

/** How much of a response body to keep, so a large one cannot flood a log. */
const MAX_BODY_LENGTH = 512;

/** A single error type for every REST failure. */
export class RestError extends Error {
  readonly kind: RestErrorKind;
  readonly status: number | undefined;
  readonly method: string | undefined;
  readonly path: string | undefined;
  readonly body: string | undefined;

  constructor(options: RestErrorOptions) {
    super(options.message, options.cause === undefined ? {} : { cause: options.cause });

    this.name = 'RestError';
    this.kind = options.kind;
    this.status = options.status;
    this.method = options.method;
    this.path = options.path;
    this.body =
      options.body === undefined ? undefined : options.body.slice(0, MAX_BODY_LENGTH);
  }

  /**
   * Is this failure worth retrying?
   *
   * Network and timeout failures are transient. Among HTTP statuses, only 408,
   * 429, and 5xx are: retrying a 400 or a 403 will fail identically, and
   * retrying a non-idempotent request that actually succeeded is worse than
   * failing.
   */
  get retryable(): boolean {
    if (this.kind === 'network' || this.kind === 'timeout') return true;
    if (this.kind !== 'http' || this.status === undefined) return false;

    return this.status === 408 || this.status === 429 || this.status >= 500;
  }

  /** A single-line description safe to log. */
  describe(): string {
    const parts: string[] = [this.kind];

    if (this.status !== undefined) parts.push(String(this.status));
    if (this.method !== undefined && this.path !== undefined) {
      parts.push(`${this.method} ${this.path}`);
    }

    return `${parts.join(' ')}: ${this.message}`;
  }
}

/** Is this value a RestError? */
export function isRestError(value: unknown): value is RestError {
  return value instanceof RestError;
}
