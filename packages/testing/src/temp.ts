import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Temporary-directory helpers for filesystem tests.
 *
 * Every filesystem test must run inside a temporary directory so nothing is
 * written into the repository tree. These helpers create the directory, track
 * it, and remove it on cleanup.
 */

const PREFIX = 'skillbox-test-';

/** A temporary directory that removes itself when disposed. */
export interface TempDir {
  /** Absolute path to the directory. */
  readonly path: string;
  /** Resolve a path inside the directory. */
  resolve(...segments: string[]): string;
  /** Write a file, creating parent directories as needed. */
  write(relativePath: string, contents: string): Promise<string>;
  /** Create a directory, including parents. */
  mkdir(relativePath: string): Promise<string>;
  /** Remove the directory and everything in it. */
  cleanup(): Promise<void>;
}

/**
 * Create a temporary directory.
 *
 * The path is resolved through `fs.realpath` semantics by way of `mkdtemp` on
 * the OS temp directory, which matters on macOS where `/tmp` is itself a
 * symlink to `/private/tmp` — comparing an unresolved path against a resolved
 * one would produce spurious containment failures.
 */
export async function createTempDir(): Promise<TempDir> {
  const root = await mkdtemp(path.join(tmpdir(), PREFIX));

  return makeTempDir(root);
}

function makeTempDir(root: string): TempDir {
  return {
    path: root,

    resolve(...segments: string[]): string {
      return path.join(root, ...segments);
    },

    async write(relativePath: string, contents: string): Promise<string> {
      const target = path.join(root, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, contents, 'utf8');
      return target;
    },

    async mkdir(relativePath: string): Promise<string> {
      const target = path.join(root, relativePath);
      await mkdir(target, { recursive: true });
      return target;
    },

    async cleanup(): Promise<void> {
      await rm(root, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}

/**
 * Run a callback with a temporary directory, cleaning up afterwards.
 *
 * Cleanup runs even when the callback throws, so a failing assertion does not
 * leave directories behind.
 */
export async function withTempDir<T>(fn: (dir: TempDir) => Promise<T>): Promise<T> {
  const dir = await createTempDir();
  try {
    return await fn(dir);
  } finally {
    await dir.cleanup();
  }
}
