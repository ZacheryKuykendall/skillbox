import { z } from 'zod';

/**
 * Path constraints for manifest fields.
 *
 * Every path that reaches the filesystem passes through here first. This is a
 * security boundary, not a style preference: a malicious `install.target` or
 * `files` entry is rejected as *data*, before any code resolves it against a
 * real directory (SR-2, SR-3).
 *
 * `@skillbox/core` re-verifies containment against the concrete project root at
 * install time. Both layers are necessary: this one cannot see the project root
 * or resolve symlinks, and that one cannot run before a manifest is parsed.
 * See docs/architecture/security-model.md.
 */

/** Why a path was rejected. Ordered from most to least specific. */
export type PathRejection =
  | 'empty'
  | 'nul-byte'
  | 'absolute-posix'
  | 'absolute-windows'
  | 'drive-relative'
  | 'unc'
  | 'backslash'
  | 'parent-segment'
  | 'current-segment'
  | 'trailing-slash'
  | 'double-slash';

const REJECTION_MESSAGES: Readonly<Record<PathRejection, string>> = {
  empty: 'must not be empty',
  'nul-byte': 'must not contain a NUL byte',
  'absolute-posix': 'must be relative, not an absolute path beginning with "/"',
  'absolute-windows': 'must be relative, not an absolute Windows path such as C:\\...',
  'drive-relative':
    'must be relative to the project, not drive-relative such as C:file.txt',
  unc: 'must be relative, not a UNC path such as \\\\server\\share',
  backslash: 'must use forward slashes; manifest paths are POSIX-style',
  'parent-segment': 'must not contain a ".." segment',
  'current-segment': 'must not contain a "." segment',
  'trailing-slash': 'must not end with a slash',
  'double-slash': 'must not contain an empty path segment',
};

/**
 * Check a manifest path.
 *
 * Returns the reason for rejection, or `undefined` when the path is acceptable.
 * Windows-specific forms are rejected on every platform, because a manifest is
 * portable data and must be safe wherever it is installed.
 */
export function checkManifestPath(value: string): PathRejection | undefined {
  if (value.length === 0) return 'empty';

  // Checked first: a NUL byte can truncate a path in a native call, so a value
  // like "safe.txt\0../../evil" could pass later checks yet resolve elsewhere.
  if (value.includes('\0')) return 'nul-byte';

  if (value.startsWith('\\\\') || value.startsWith('//')) return 'unc';
  if (value.startsWith('/')) return 'absolute-posix';

  if (/^[a-zA-Z]:[\\/]/.test(value)) return 'absolute-windows';
  if (/^[a-zA-Z]:/.test(value)) return 'drive-relative';

  if (value.includes('\\')) return 'backslash';

  if (value.endsWith('/')) return 'trailing-slash';
  if (value.includes('//')) return 'double-slash';

  const segments = value.split('/');
  if (segments.includes('..')) return 'parent-segment';
  if (segments.includes('.')) return 'current-segment';

  return undefined;
}

/** The human-readable reason for a rejection. */
export function describePathRejection(rejection: PathRejection): string {
  return REJECTION_MESSAGES[rejection];
}

/**
 * A relative, POSIX-style path safe to resolve inside a project.
 *
 * Used for `spec.entrypoint`, every entry in `spec.files`, and
 * `spec.install.target`.
 */
export const manifestPathSchema = z.string().superRefine((value, ctx) => {
  const rejection = checkManifestPath(value);
  if (rejection !== undefined) {
    ctx.addIssue({
      code: 'custom',
      message: describePathRejection(rejection),
      params: { rejection },
    });
  }
});

/** A non-empty list of unique manifest paths. */
export const manifestPathListSchema = z
  .array(manifestPathSchema)
  .min(1, { message: 'at least one file must be declared' })
  .refine((paths) => new Set(paths).size === paths.length, {
    message: 'must not contain duplicate paths',
  });
