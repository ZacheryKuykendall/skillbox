/**
 * The CLI's reported version.
 *
 * Declared as a constant rather than read from `package.json` at runtime.
 * Reading the manifest would require resolving a path relative to the compiled
 * output, which differs between `dist/` and a test importing from source, and
 * would add a filesystem read to every invocation for a value that is fixed at
 * build time.
 *
 * A test asserts this matches `package.json`, so the two cannot drift.
 */
export const CLI_VERSION = '0.1.0';
