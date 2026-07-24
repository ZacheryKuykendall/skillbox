import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createTempDir, withTempDir } from './temp.js';

describe('createTempDir', () => {
  it('creates a directory that exists', async () => {
    const dir = await createTempDir();
    try {
      const stats = await stat(dir.path);
      expect(stats.isDirectory()).toBe(true);
    } finally {
      await dir.cleanup();
    }
  });

  it('creates a distinct directory on each call', async () => {
    const first = await createTempDir();
    const second = await createTempDir();
    try {
      expect(first.path).not.toBe(second.path);
    } finally {
      await first.cleanup();
      await second.cleanup();
    }
  });

  it('removes the directory on cleanup', async () => {
    const dir = await createTempDir();
    await dir.cleanup();

    await expect(stat(dir.path)).rejects.toThrow();
  });

  it('is safe to clean up twice', async () => {
    const dir = await createTempDir();
    await dir.cleanup();

    await expect(dir.cleanup()).resolves.toBeUndefined();
  });

  it('writes a file, creating parent directories', async () => {
    const dir = await createTempDir();
    try {
      const written = await dir.write('nested/deeply/file.txt', 'contents');

      expect(await readFile(written, 'utf8')).toBe('contents');
      expect(written).toBe(path.join(dir.path, 'nested', 'deeply', 'file.txt'));
    } finally {
      await dir.cleanup();
    }
  });

  it('creates a directory tree', async () => {
    const dir = await createTempDir();
    try {
      const created = await dir.mkdir('a/b/c');
      const stats = await stat(created);

      expect(stats.isDirectory()).toBe(true);
    } finally {
      await dir.cleanup();
    }
  });

  it('resolves paths inside itself', async () => {
    const dir = await createTempDir();
    try {
      expect(dir.resolve('a', 'b')).toBe(path.join(dir.path, 'a', 'b'));
    } finally {
      await dir.cleanup();
    }
  });
});

describe('withTempDir', () => {
  it('returns the callback result and cleans up', async () => {
    let captured = '';

    const result = await withTempDir(async (dir) => {
      captured = dir.path;
      await dir.write('file.txt', 'x');
      return 'result';
    });

    expect(result).toBe('result');
    await expect(stat(captured)).rejects.toThrow();
  });

  it('cleans up even when the callback throws', async () => {
    let captured = '';

    await expect(
      withTempDir(async (dir) => {
        captured = dir.path;
        await dir.write('file.txt', 'x');
        throw new Error('failure inside the callback');
      }),
    ).rejects.toThrow('failure inside the callback');

    // A failing assertion must not leave directories behind.
    await expect(stat(captured)).rejects.toThrow();
  });
});
