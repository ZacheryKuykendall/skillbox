/**
 * A dependency-free structured JSON logger.
 *
 * One JSON object per line, which is what log aggregators expect. Redaction is
 * applied to every field before serialization, so a secret cannot reach the
 * output by being nested inside an object someone logged casually.
 */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** Numeric order, so a threshold comparison is a single integer check. */
const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Field names redacted unless the caller replaces the list. */
const DEFAULT_REDACTED = [
  'password',
  'token',
  'secret',
  'authorization',
  'apikey',
  'api_key',
  'cookie',
  'sessionid',
  'session_id',
  'credential',
  'privatekey',
  'private_key',
] as const;

export const REDACTED_PLACEHOLDER = '[redacted]';

/** How deep to walk a logged object before giving up. */
const MAX_DEPTH = 8;

export interface LoggerOptions {
  /** Lowest level to emit. Defaults to `info`. */
  readonly level?: LogLevel;
  /**
   * Field names to redact, matched case-insensitively.
   *
   * Replaces the defaults rather than adding to them, so a caller can be
   * deliberate. Spread `DEFAULT_REDACTED_FIELDS` to extend instead.
   */
  readonly redact?: readonly string[];
  /** Fields attached to every line, such as a service name. */
  readonly base?: Readonly<Record<string, unknown>>;
  /** Where to write. Defaults to stdout, with errors to stderr. */
  readonly write?: (line: string, level: LogLevel) => void;
  /** Injectable for deterministic tests. Defaults to the current time. */
  readonly now?: () => Date;
}

export interface Logger {
  debug(message: string, fields?: Readonly<Record<string, unknown>>): void;
  info(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
  error(message: string, fields?: Readonly<Record<string, unknown>>): void;
  /** A logger with additional fields on every line. */
  child(fields: Readonly<Record<string, unknown>>): Logger;
  /** Is this level currently emitted? Useful before expensive field building. */
  isEnabled(level: LogLevel): boolean;
}

/** The default redaction list, for extending rather than replacing. */
export const DEFAULT_REDACTED_FIELDS: readonly string[] = DEFAULT_REDACTED;

/** Create a logger. */
export function createLogger(options: LoggerOptions = {}): Logger {
  const threshold = LEVEL_ORDER[options.level ?? 'info'];
  const redacted = new Set(
    (options.redact ?? DEFAULT_REDACTED).map((field) => field.toLowerCase()),
  );
  const now = options.now ?? ((): Date => new Date());

  const write =
    options.write ??
    ((line: string, level: LogLevel): void => {
      // Errors to stderr so they survive stdout being redirected or parsed.
      const stream = level === 'error' ? process.stderr : process.stdout;
      stream.write(`${line}\n`);
    });

  function build(base: Readonly<Record<string, unknown>>): Logger {
    function emit(
      level: LogLevel,
      message: string,
      fields: Readonly<Record<string, unknown>> = {},
    ): void {
      if (LEVEL_ORDER[level] < threshold) return;

      const record = {
        time: now().toISOString(),
        level,
        message,
        ...redact({ ...base, ...fields }, redacted, 0),
      };

      write(JSON.stringify(record), level);
    }

    return {
      debug: (message, fields) => emit('debug', message, fields),
      info: (message, fields) => emit('info', message, fields),
      warn: (message, fields) => emit('warn', message, fields),
      error: (message, fields) => emit('error', message, fields),
      child: (fields) => build({ ...base, ...fields }),
      isEnabled: (level) => LEVEL_ORDER[level] >= threshold,
    };
  }

  return build(options.base ?? {});
}

/**
 * Replace redacted field values, recursively.
 *
 * Recursion matters: a token nested inside a logged request object is exactly
 * how secrets reach logs in practice, and a shallow check would miss it.
 */
function redact(
  value: Readonly<Record<string, unknown>>,
  fields: ReadonlySet<string>,
  depth: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (fields.has(key.toLowerCase())) {
      result[key] = REDACTED_PLACEHOLDER;
      continue;
    }

    result[key] = redactValue(entry, fields, depth + 1);
  }

  return result;
}

function redactValue(
  value: unknown,
  fields: ReadonlySet<string>,
  depth: number,
): unknown {
  // A cyclic or pathologically deep object would otherwise recurse forever.
  if (depth > MAX_DEPTH) return '[truncated]';

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, fields, depth + 1));
  }

  if (value !== null && typeof value === 'object') {
    return redact(value as Record<string, unknown>, fields, depth);
  }

  // BigInt is not JSON-serializable, so it would throw during stringify.
  if (typeof value === 'bigint') return value.toString();

  return value;
}
