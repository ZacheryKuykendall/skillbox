/**
 * Typed errors for Skillbox operations.
 *
 * Every failure carries a stable machine-readable `code`, a human-readable
 * message, and where possible a location and a remediation hint (FR-11.6,
 * NFR-5). The CLI maps `code` to an exit status; tests assert on `code` rather
 * than message text, since messages are presentation.
 */

export const ERROR_CODES = [
  // Validation
  'VALIDATION_FAILED',
  'INVALID_MANIFEST',
  'UNSUPPORTED_API_VERSION',
  'INVALID_REFERENCE',
  'UNSAFE_PATH',
  'MISSING_FILE',

  // Lookup
  'RESOURCE_NOT_FOUND',
  'VERSION_NOT_FOUND',
  'DUPLICATE_RESOURCE',

  // Conflict
  'FILE_CONFLICT',
  'ALREADY_INITIALIZED',
  'MODIFIED_FILES',

  // Project state
  'PROJECT_NOT_INITIALIZED',
  'RESOURCE_NOT_INSTALLED',
  'RESOURCE_ALREADY_INSTALLED',

  // Dependencies
  'MISSING_DEPENDENCY',
  'CIRCULAR_DEPENDENCY',
  'VERSION_CONFLICT',
  'DEPENDENTS_EXIST',

  // Runtime
  'IO_ERROR',
  'INTEGRITY_MISMATCH',
  'UNDECLARED_VARIABLE',
  'USAGE_ERROR',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface SkillboxErrorOptions {
  /** Stable machine-readable code. */
  readonly code: ErrorCode;
  /** What went wrong, in a complete sentence. */
  readonly message: string;
  /** Where it went wrong: a file path, or a path plus a field. */
  readonly location?: string;
  /** What the user should do about it. */
  readonly hint?: string;
  /** Supporting lines, such as a list of offending files. */
  readonly details?: readonly string[];
  /** The underlying error, when this wraps one. */
  readonly cause?: unknown;
}

/**
 * The single error type thrown by `@skillbox/core`.
 *
 * Never include an environment variable's value, or any other potentially
 * secret input, in `message`, `hint`, or `details` (SR-8).
 */
export class SkillboxError extends Error {
  readonly code: ErrorCode;
  readonly location: string | undefined;
  readonly hint: string | undefined;
  readonly details: readonly string[];

  constructor(options: SkillboxErrorOptions) {
    super(options.message, options.cause === undefined ? {} : { cause: options.cause });
    this.name = 'SkillboxError';
    this.code = options.code;
    this.location = options.location;
    this.hint = options.hint;
    this.details = options.details ?? [];
  }

  /** True when `value` is a SkillboxError. */
  static is(value: unknown): value is SkillboxError {
    return value instanceof SkillboxError;
  }

  /** A plain object suitable for `--json` output. */
  toJSON(): {
    code: ErrorCode;
    message: string;
    location?: string;
    hint?: string;
    details?: readonly string[];
  } {
    return {
      code: this.code,
      message: this.message,
      ...(this.location === undefined ? {} : { location: this.location }),
      ...(this.hint === undefined ? {} : { hint: this.hint }),
      ...(this.details.length === 0 ? {} : { details: this.details }),
    };
  }
}

/**
 * Wrap an unknown thrown value as a SkillboxError.
 *
 * Used at boundaries where a third-party call may throw anything. A value that
 * is already a SkillboxError passes through unchanged so the original code and
 * hint survive.
 */
export function wrapError(
  value: unknown,
  options: { code: ErrorCode; message: string; location?: string; hint?: string },
): SkillboxError {
  if (SkillboxError.is(value)) {
    return value;
  }

  const detail = value instanceof Error ? value.message : String(value);

  return new SkillboxError({
    code: options.code,
    message: options.message,
    ...(options.location === undefined ? {} : { location: options.location }),
    ...(options.hint === undefined ? {} : { hint: options.hint }),
    details: [detail],
    cause: value,
  });
}
