import {
  checkEnvelope,
  describeEnvelopeProblem,
  resourceManifestSchema,
  type ResourceManifest,
} from './manifest.js';
import { type Diagnostic, toDiagnostics, type ValidationResult } from './errors.js';

/**
 * Validate a parsed manifest value.
 *
 * Runs the envelope check first so an unsupported `apiVersion` or unknown `kind`
 * produces one actionable message rather than a cascade of field errors from a
 * schema that was never going to match.
 */
export function validateManifest(value: unknown): ValidationResult<ResourceManifest> {
  const problem = checkEnvelope(value);

  if (problem !== undefined) {
    const path =
      problem.kind === 'not-an-object'
        ? ''
        : problem.kind === 'missing-api-version' ||
            problem.kind === 'unsupported-api-version'
          ? 'apiVersion'
          : 'kind';

    const diagnostic: Diagnostic = {
      severity: 'error',
      path,
      message: describeEnvelopeProblem(problem),
    };

    return { ok: false, diagnostics: [diagnostic] };
  }

  const result = resourceManifestSchema.safeParse(value);

  if (result.success) {
    return { ok: true, value: result.data };
  }

  return { ok: false, diagnostics: toDiagnostics(result.error) };
}

/**
 * Validate and return the manifest, throwing on failure.
 *
 * For callers that treat an invalid manifest as unrecoverable. Prefer
 * {@link validateManifest} where diagnostics should be reported to a user.
 */
export function parseManifest(value: unknown): ResourceManifest {
  const result = validateManifest(value);

  if (!result.ok) {
    const summary = result.diagnostics
      .map((d) => `${d.path.length === 0 ? '<document>' : d.path}: ${d.message}`)
      .join('; ');
    throw new Error(`Invalid resource manifest: ${summary}`);
  }

  return result.value;
}
