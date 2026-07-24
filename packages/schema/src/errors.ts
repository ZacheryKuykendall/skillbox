import { type z } from 'zod';

/**
 * Turn Zod issues into stable, path-qualified, human-readable diagnostics.
 *
 * Two requirements shape this module:
 *
 * - Every diagnostic reports a dotted field path and, where one can be derived,
 *   a remediation hint (FR-11.6).
 * - Values from `env` fields are never echoed, because an author could paste a
 *   real secret into a field expecting a variable name, and a validation error
 *   would then print it (SR-8).
 */

export type DiagnosticSeverity = 'error' | 'warning';

export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  /** Dotted field path, for example `spec.files[1]`. Empty for whole-document issues. */
  readonly path: string;
  readonly message: string;
  readonly hint?: string;
}

/**
 * Field paths whose input values must never be echoed in an error.
 *
 * A resource author might paste a token where a variable *name* belongs; if the
 * error quoted the received value, the secret would land in logs and CI output.
 */
const REDACTED_PATH_PATTERNS: readonly RegExp[] = [
  /^spec\.env\b/,
  /\btokenEnv$/,
  /\bbaseUrlEnv$/,
  /\bsecret$/,
];

export const REDACTED_PLACEHOLDER = '[redacted]';

/** Format a Zod issue path as a dotted string with bracketed indices. */
export function formatPath(path: readonly (string | number | symbol)[]): string {
  let result = '';

  for (const segment of path) {
    if (typeof segment === 'number') {
      result += `[${String(segment)}]`;
    } else {
      result += result.length === 0 ? String(segment) : `.${String(segment)}`;
    }
  }

  return result;
}

/** Should values at this path be withheld from error output? */
export function isRedactedPath(path: string): boolean {
  return REDACTED_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Derive a remediation hint from an issue.
 *
 * Returns `undefined` when nothing more useful than the message itself can be
 * said; a vague hint is worse than none.
 */
function hintFor(issue: z.core.$ZodIssue, path: string): string | undefined {
  switch (issue.code) {
    case 'unrecognized_keys': {
      const keys = issue.keys.join(', ');
      return `Remove ${keys}, or check for a typo. Unknown fields are rejected so a misspelling fails loudly rather than being ignored.`;
    }
    case 'invalid_type':
      // Zod 4 does not carry the received value on the issue, so a missing field
      // and a wrong-typed one are indistinguishable here. One hint that is
      // accurate for both beats guessing from the message text.
      return `"${path}" must be a ${String(issue.expected)}. Add it, or correct its type.`;
    case 'too_small':
      return `"${path}" needs at least ${String(issue.minimum)} ${issue.origin === 'array' ? 'items' : 'characters'}.`;
    case 'too_big':
      return `"${path}" allows at most ${String(issue.maximum)} ${issue.origin === 'array' ? 'items' : 'characters'}.`;
    case 'invalid_value': {
      const options = issue.values.map((value) => String(value)).join(', ');
      return `Use one of: ${options}.`;
    }
    case 'invalid_format':
      return `"${path}" does not match the required format.`;
    default:
      return undefined;
  }
}

/** Convert one Zod issue into a diagnostic. */
export function issueToDiagnostic(issue: z.core.$ZodIssue): Diagnostic {
  const path = formatPath(issue.path);
  const redact = isRedactedPath(path);

  // Zod embeds the received value in some messages. Where the path is sensitive,
  // replace anything quoted so a pasted secret cannot reach the output.
  const message = redact ? redactQuotedValues(issue.message) : issue.message;
  const hint = redact ? undefined : hintFor(issue, path);

  return {
    severity: 'error',
    path,
    message,
    ...(hint === undefined ? {} : { hint }),
  };
}

function redactQuotedValues(message: string): string {
  return message.replace(/"[^"]*"/g, `"${REDACTED_PLACEHOLDER}"`);
}

/**
 * Convert a Zod error into diagnostics, ordered deterministically.
 *
 * Sorted by path then message so the same input always produces the same output,
 * which matters for readable CI logs and for asserting on output in tests.
 */
export function toDiagnostics(error: z.ZodError): Diagnostic[] {
  return error.issues
    .map(issueToDiagnostic)
    .sort((a, b) => a.path.localeCompare(b.path) || a.message.localeCompare(b.message));
}

/** Render diagnostics as indented lines for terminal output. */
export function formatDiagnostics(diagnostics: readonly Diagnostic[]): string {
  return diagnostics
    .map((diagnostic) => {
      const location = diagnostic.path.length === 0 ? '<document>' : diagnostic.path;
      const head = `  ${diagnostic.severity}  ${location}  ${diagnostic.message}`;
      return diagnostic.hint === undefined
        ? head
        : `${head}\n           ${diagnostic.hint}`;
    })
    .join('\n');
}

/** The outcome of validating a value. */
export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

/** Validate a value against a schema, returning diagnostics instead of throwing. */
export function validate<T>(schema: z.ZodType<T>, value: unknown): ValidationResult<T> {
  const result = schema.safeParse(value);

  if (result.success) {
    return { ok: true, value: result.data };
  }

  return { ok: false, diagnostics: toDiagnostics(result.error) };
}
