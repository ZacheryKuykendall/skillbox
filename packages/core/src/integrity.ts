import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/**
 * Integrity digests.
 *
 * SRI-style `sha256-<base64>`, matching the format npm and Yarn use. Digests let
 * three otherwise-invisible situations be detected: a local edit to an installed
 * file, corruption, and a file replaced by something other than Skillbox
 * (ADR-0004).
 */

const ALGORITHM = 'sha256';
const PREFIX = `${ALGORITHM}-`;

/** Compute the digest of a buffer or string. */
export function digestOf(contents: Buffer | string): string {
  return PREFIX + createHash(ALGORITHM).update(contents).digest('base64');
}

/** Compute the digest of a file's contents. */
export async function digestOfFile(filePath: string): Promise<string> {
  return digestOf(await readFile(filePath));
}

/**
 * Compute an aggregate digest over a set of files.
 *
 * Hashes each path together with its digest, in sorted path order, so the result
 * is stable regardless of the order files were discovered. Including the path
 * means renaming a file changes the aggregate even when its contents do not.
 *
 * Paths must already be POSIX-style, so the aggregate matches across platforms.
 */
export function aggregateDigest(files: Readonly<Record<string, string>>): string {
  const hash = createHash(ALGORITHM);

  const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));

  for (const [filePath, digest] of entries) {
    // The NUL delimiter is what keeps {"ab": "c"} and {"a": "bc"} distinct.
    hash.update(filePath);
    hash.update('\u0000');
    hash.update(digest);
    hash.update('\u0000');
  }

  return PREFIX + hash.digest('base64');
}

/** Is this a well-formed digest? */
export function isDigest(value: string): boolean {
  return /^sha256-[A-Za-z0-9+/]{43}=$/.test(value);
}

/**
 * Compare two digests.
 *
 * A plain `===` would do, but going through a named function keeps call sites
 * readable and leaves one place to add constant-time comparison if digests ever
 * become security-critical rather than integrity-critical.
 */
export function digestsMatch(a: string, b: string): boolean {
  return a === b;
}
