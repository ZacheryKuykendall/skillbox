import path from 'node:path';

import { createTempDir, type TempDir } from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertRealPathInside,
  fromPosix,
  isInside,
  normalizePosix,
  resolveInside,
  toPosixRelative,
} from './paths.js';

let dir: TempDir;

beforeEach(async () => {
  dir = await createTempDir();
});

afterEach(async () => {
  await dir.cleanup();
});

const CONTEXT = { field: 'spec.install.target' };

describe('isInside', () => {
  it('accepts a direct child', () => {
    expect(isInside('/project', '/project/file.txt')).toBe(true);
  });

  it('accepts a deep descendant', () => {
    expect(isInside('/project', '/project/a/b/c/file.txt')).toBe(true);
  });

  it('rejects the root itself, since there is nothing to write', () => {
    expect(isInside('/project', '/project')).toBe(false);
  });

  it('rejects a parent', () => {
    expect(isInside('/project/sub', '/project')).toBe(false);
  });

  it('rejects a sibling', () => {
    expect(isInside('/project', '/other/file.txt')).toBe(false);
  });

  it('rejects a sibling whose name merely starts with the root', () => {
    // This is the case a `startsWith` check gets wrong: "/project-evil" shares a
    // string prefix with "/project" but is a different directory (SR-13).
    expect(isInside('/project', '/project-evil/file.txt')).toBe(false);
  });

  it('rejects a path that traverses out and back to a sibling', () => {
    expect(isInside('/project', '/project/../other/file.txt')).toBe(false);
  });

  it('accepts a path that traverses out and back inside', () => {
    expect(isInside('/project', '/project/sub/../file.txt')).toBe(true);
  });

  it('handles real temporary directories', async () => {
    const root = await dir.mkdir('root');

    expect(isInside(root, path.join(root, 'child.txt'))).toBe(true);
    expect(isInside(root, dir.resolve('sibling.txt'))).toBe(false);
  });
});

describe('resolveInside', () => {
  it('resolves a simple relative path', async () => {
    const root = await dir.mkdir('project');

    expect(resolveInside(root, 'a/b.txt', CONTEXT)).toBe(path.join(root, 'a', 'b.txt'));
  });

  it('translates POSIX separators to the host separator', async () => {
    const root = await dir.mkdir('project');
    const resolved = resolveInside(root, 'a/b/c.txt', CONTEXT);

    expect(resolved).toBe(path.join(root, 'a', 'b', 'c.txt'));
    expect(resolved).not.toContain('/a/b/c.txt'.replace(/\//g, path.sep) + 'x');
  });

  // Each vector individually, so a regression names the specific form that
  // stopped being rejected.
  describe('rejects paths that escape', () => {
    it('rejects a leading parent segment', () => {
      expect(() => resolveInside('/project', '../evil.txt', CONTEXT)).toThrowError(
        expect.objectContaining({ code: 'UNSAFE_PATH' }),
      );
    });

    it('rejects a parent segment in the middle', () => {
      expect(() => resolveInside('/project', 'a/../../evil.txt', CONTEXT)).toThrowError(
        expect.objectContaining({ code: 'UNSAFE_PATH' }),
      );
    });

    it('rejects deeply nested traversal', () => {
      expect(() =>
        resolveInside('/project', '../../../../../../etc/passwd', CONTEXT),
      ).toThrowError(expect.objectContaining({ code: 'UNSAFE_PATH' }));
    });

    it('rejects a POSIX absolute path', () => {
      expect(() => resolveInside('/project', '/etc/passwd', CONTEXT)).toThrowError(
        expect.objectContaining({ code: 'UNSAFE_PATH' }),
      );
    });

    it('rejects a Windows absolute path', () => {
      expect(() =>
        resolveInside('/project', 'C:\\Windows\\System32\\hosts', CONTEXT),
      ).toThrowError(expect.objectContaining({ code: 'UNSAFE_PATH' }));
    });

    it('rejects a drive-relative path', () => {
      expect(() => resolveInside('/project', 'C:evil.txt', CONTEXT)).toThrowError(
        expect.objectContaining({ code: 'UNSAFE_PATH' }),
      );
    });

    it('rejects a UNC path', () => {
      expect(() =>
        resolveInside('/project', '\\\\server\\share\\evil.txt', CONTEXT),
      ).toThrowError(expect.objectContaining({ code: 'UNSAFE_PATH' }));
    });

    it('rejects a leading backslash', () => {
      expect(() => resolveInside('/project', '\\evil.txt', CONTEXT)).toThrowError(
        expect.objectContaining({ code: 'UNSAFE_PATH' }),
      );
    });

    it('rejects a NUL byte', () => {
      expect(() =>
        resolveInside('/project', 'safe.txt\u0000../../evil', CONTEXT),
      ).toThrowError(expect.objectContaining({ code: 'UNSAFE_PATH' }));
    });

    it('rejects an empty path', () => {
      expect(() => resolveInside('/project', '', CONTEXT)).toThrowError(
        expect.objectContaining({ code: 'UNSAFE_PATH' }),
      );
    });
  });

  it('includes the field name in the hint so a user knows what to change', () => {
    try {
      resolveInside('/project', '../evil', { field: 'spec.files' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as { hint?: string }).hint).toContain('spec.files');
    }
  });

  it('includes the manifest location when supplied', () => {
    try {
      resolveInside('/project', '../evil', {
        field: 'spec.files',
        location: '/registry/a/skillbox.yaml',
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as { location?: string }).location).toBe(
        '/registry/a/skillbox.yaml',
      );
    }
  });
});

describe('assertRealPathInside', () => {
  it('accepts a destination inside the project', async () => {
    const root = await dir.mkdir('project');
    await dir.mkdir('project/sub');

    await expect(
      assertRealPathInside(root, path.join(root, 'sub', 'file.txt'), CONTEXT),
    ).resolves.toBeUndefined();
  });

  it('accepts a destination whose parents do not exist yet', async () => {
    const root = await dir.mkdir('project');

    await expect(
      assertRealPathInside(root, path.join(root, 'not', 'yet', 'file.txt'), CONTEXT),
    ).resolves.toBeUndefined();
  });

  it('rejects a destination reached through a symlink out of the project', async () => {
    // A purely textual check cannot catch this: every component looks relative,
    // but the link redirects the write outside the project.
    const root = await dir.mkdir('project');
    const outside = await dir.mkdir('outside');

    const { symlink } = await import('node:fs/promises');
    try {
      await symlink(outside, path.join(root, 'escape'), 'dir');
    } catch {
      // Creating a directory symlink can require elevation on Windows. Skipping
      // is honest: the behavior is covered wherever symlinks can be created.
      return;
    }

    await expect(
      assertRealPathInside(root, path.join(root, 'escape', 'file.txt'), CONTEXT),
    ).rejects.toMatchObject({ code: 'UNSAFE_PATH' });
  });

  it('accepts a symlink that stays inside the project', async () => {
    const root = await dir.mkdir('project');
    await dir.mkdir('project/real');

    const { symlink } = await import('node:fs/promises');
    try {
      await symlink(path.join(root, 'real'), path.join(root, 'link'), 'dir');
    } catch {
      return;
    }

    await expect(
      assertRealPathInside(root, path.join(root, 'link', 'file.txt'), CONTEXT),
    ).resolves.toBeUndefined();
  });
});

describe('toPosixRelative', () => {
  it('always produces forward slashes', () => {
    const result = toPosixRelative(
      path.join('/project'),
      path.join('/project', 'a', 'b.txt'),
    );

    expect(result).toBe('a/b.txt');
    expect(result).not.toContain('\\');
  });

  it('produces a stable value regardless of host separator', async () => {
    // Lockfiles must be byte-identical across platforms (ADR-0004).
    const root = await dir.mkdir('project');
    const target = path.join(root, 'nested', 'deeply', 'file.txt');

    expect(toPosixRelative(root, target)).toBe('nested/deeply/file.txt');
  });
});

describe('fromPosix', () => {
  it('converts to the host separator', () => {
    expect(fromPosix('a/b/c.txt')).toBe(path.join('a', 'b', 'c.txt'));
  });

  it('leaves a single segment unchanged', () => {
    expect(fromPosix('file.txt')).toBe('file.txt');
  });
});

describe('normalizePosix', () => {
  it('collapses redundant separators', () => {
    expect(normalizePosix('a//b/c.txt')).toBe('a/b/c.txt');
  });

  it('resolves an interior parent segment that stays inside', () => {
    expect(normalizePosix('a/b/../c.txt')).toBe('a/c.txt');
  });

  it('returns undefined for a path that escapes', () => {
    expect(normalizePosix('../escape')).toBeUndefined();
    expect(normalizePosix('a/../../escape')).toBeUndefined();
  });

  it('returns undefined for an absolute path', () => {
    expect(normalizePosix('/etc/passwd')).toBeUndefined();
  });

  it('returns undefined for a path that normalizes to the current directory', () => {
    expect(normalizePosix('.')).toBeUndefined();
    expect(normalizePosix('a/..')).toBeUndefined();
  });
});
