import { stat, symlink } from 'node:fs/promises';
import path from 'node:path';

import { checkManifestPath } from '@skillbox/schema';
import { createTempDir, writeRegistry, type TempDir } from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadCatalog } from '../src/catalog.js';
import { initProject } from '../src/init.js';
import { isInside, resolveInside } from '../src/paths.js';
import { planInstall } from '../src/plan.js';
import { loadProject } from '../src/project.js';

/**
 * Path traversal: nothing may be written outside the project directory (T1, SR-1).
 *
 * Every vector is asserted individually rather than in a loop, so a regression
 * names the specific form that stopped being rejected.
 *
 * Windows-specific forms are asserted on every platform, because a manifest is
 * portable data and must be safe wherever it is installed.
 *
 * Required by docs/architecture/security-model.md. Do not weaken without an ADR.
 */

let dir: TempDir;
let projectRoot: string;

beforeEach(async () => {
  dir = await createTempDir();
  projectRoot = await dir.mkdir('project');
});

afterEach(async () => {
  await dir.cleanup();
});

const FIELD = { field: 'spec.install.target' };

/** Attempt to install a resource whose install target is the given path. */
async function planWithTarget(target: string): Promise<unknown> {
  const registry = await writeRegistry(dir, [{ name: 'escaping-resource', target }]);
  const catalog = await loadCatalog(registry);
  await initProject({ root: projectRoot, force: true });
  const project = await loadProject(projectRoot);

  return planInstall({
    projectRoot,
    catalog,
    lockfile: project.lockfile,
    requested: [{ reference: 'skillbox/escaping-resource' }],
  });
}

describe('containment uses relativity, not string prefixes', () => {
  it('rejects a sibling directory sharing a string prefix with the root', () => {
    // The specific case a startsWith check gets wrong: "/project-evil" shares a
    // prefix with "/project" but is a different directory (SR-13).
    expect(isInside('/project', '/project-evil/file.txt')).toBe(false);
  });

  it('rejects the root itself, since there is nothing to write', () => {
    expect(isInside('/project', '/project')).toBe(false);
  });

  it('rejects a parent of the root', () => {
    expect(isInside('/project/nested', '/project')).toBe(false);
  });

  it('normalizes before comparing, so traversing out and back is rejected', () => {
    expect(isInside('/project', '/project/../sibling/file.txt')).toBe(false);
  });

  it('accepts traversing out and back to a path still inside', () => {
    expect(isInside('/project', '/project/sub/../file.txt')).toBe(true);
  });
});

describe('traversal vectors are rejected at the schema layer', () => {
  it('rejects a leading parent segment', () => {
    expect(checkManifestPath('../etc/passwd')).toBe('parent-segment');
  });

  it('rejects a parent segment in the middle of a path', () => {
    expect(checkManifestPath('a/../../etc/passwd')).toBe('parent-segment');
  });

  it('rejects a trailing parent segment', () => {
    expect(checkManifestPath('a/b/..')).toBe('parent-segment');
  });

  it('rejects deeply nested traversal', () => {
    expect(checkManifestPath('../../../../../../../etc/passwd')).toBe('parent-segment');
  });

  it('rejects a POSIX absolute path', () => {
    expect(checkManifestPath('/etc/passwd')).toBe('absolute-posix');
  });

  it('rejects a Windows absolute path with backslashes', () => {
    expect(checkManifestPath('C:\\Windows\\System32\\drivers\\etc\\hosts')).toBe(
      'absolute-windows',
    );
  });

  it('rejects a Windows absolute path with forward slashes', () => {
    expect(checkManifestPath('C:/Windows/System32')).toBe('absolute-windows');
  });

  it('rejects a drive-relative path', () => {
    // "C:evil.txt" resolves against the current directory on drive C, which is
    // not necessarily the project directory.
    expect(checkManifestPath('C:evil.txt')).toBe('drive-relative');
  });

  it('rejects a UNC path with backslashes', () => {
    expect(checkManifestPath('\\\\server\\share\\evil.txt')).toBe('unc');
  });

  it('rejects a UNC-style path with forward slashes', () => {
    expect(checkManifestPath('//server/share/evil.txt')).toBe('unc');
  });

  it('rejects a leading backslash', () => {
    expect(checkManifestPath('\\evil.txt')).toBe('backslash');
  });

  it('rejects an embedded backslash', () => {
    expect(checkManifestPath('src\\evil.txt')).toBe('backslash');
  });

  it('rejects a NUL byte before any other check', () => {
    // A NUL can truncate a path in a native call, so a value that looks safe to a
    // later check could still resolve elsewhere.
    expect(checkManifestPath('safe.txt\u0000../../evil')).toBe('nul-byte');
    expect(checkManifestPath('/etc\u0000passwd')).toBe('nul-byte');
  });

  it('accepts a filename that merely begins with two dots', () => {
    // Only a whole ".." segment escapes; "..config" is a legitimate filename.
    expect(checkManifestPath('..config')).toBeUndefined();
  });
});

describe('traversal vectors are rejected at the resolution layer', () => {
  it('rejects a leading parent segment', () => {
    expect(() => resolveInside(projectRoot, '../escaped.txt', FIELD)).toThrowError(
      expect.objectContaining({ code: 'UNSAFE_PATH' }),
    );
  });

  it('rejects a parent segment in the middle', () => {
    expect(() => resolveInside(projectRoot, 'a/../../escaped.txt', FIELD)).toThrowError(
      expect.objectContaining({ code: 'UNSAFE_PATH' }),
    );
  });

  it('rejects a POSIX absolute path', () => {
    expect(() => resolveInside(projectRoot, '/etc/passwd', FIELD)).toThrowError(
      expect.objectContaining({ code: 'UNSAFE_PATH' }),
    );
  });

  it('rejects a Windows absolute path', () => {
    expect(() =>
      resolveInside(projectRoot, 'C:\\Windows\\System32', FIELD),
    ).toThrowError(expect.objectContaining({ code: 'UNSAFE_PATH' }));
  });

  it('rejects a drive-relative path', () => {
    expect(() => resolveInside(projectRoot, 'C:escaped.txt', FIELD)).toThrowError(
      expect.objectContaining({ code: 'UNSAFE_PATH' }),
    );
  });

  it('rejects a UNC path', () => {
    expect(() =>
      resolveInside(projectRoot, '\\\\server\\share\\escaped.txt', FIELD),
    ).toThrowError(expect.objectContaining({ code: 'UNSAFE_PATH' }));
  });

  it('rejects a NUL byte', () => {
    expect(() =>
      resolveInside(projectRoot, 'safe.txt\u0000../../escaped', FIELD),
    ).toThrowError(expect.objectContaining({ code: 'UNSAFE_PATH' }));
  });

  it('accepts a safe nested path', () => {
    expect(resolveInside(projectRoot, 'a/b/c.txt', FIELD)).toBe(
      path.join(projectRoot, 'a', 'b', 'c.txt'),
    );
  });
});

describe('an escaping install target never reaches the filesystem', () => {
  // Each of these rejects during planning, before any write. The assertion that
  // the escape target does not exist afterwards is the one that matters.
  it.each([
    ['a parent segment', '../escaped'],
    ['nested traversal', 'a/../../escaped'],
    ['a POSIX absolute path', '/tmp/skillbox-escaped'],
    ['a Windows absolute path', 'C:\\skillbox-escaped'],
    ['a drive-relative path', 'C:skillbox-escaped'],
    ['a UNC path', '\\\\server\\share\\escaped'],
    ['a leading backslash', '\\escaped'],
  ])('rejects %s and writes nothing', async (_label, target) => {
    await expect(planWithTarget(target)).rejects.toThrow();

    await expect(stat(dir.resolve('escaped'))).rejects.toThrow();
    await expect(stat(dir.resolve('skillbox-escaped'))).rejects.toThrow();
  });

  it('accepts a target inside the project', async () => {
    await expect(planWithTarget('safe/location')).resolves.toBeDefined();
  });
});

describe('a declared file cannot escape the resource directory', () => {
  it('rejects traversal in spec.files', async () => {
    const registry = await writeRegistry(dir, [
      {
        name: 'escaping-files',
        entrypoint: 'entry.md',
        files: ['entry.md', '../../escaped.md'],
      },
    ]);

    const catalog = await loadCatalog(registry);

    // Rejected at the schema layer, so the resource never enters the catalog.
    expect(catalog.resources).toHaveLength(0);
    expect(catalog.failures).toHaveLength(1);
  });

  it('rejects an absolute path in spec.files', async () => {
    const registry = await writeRegistry(dir, [
      {
        name: 'absolute-files',
        entrypoint: 'entry.md',
        files: ['entry.md', '/etc/passwd'],
      },
    ]);

    expect((await loadCatalog(registry)).resources).toHaveLength(0);
  });
});

describe('symlink escape', () => {
  it('rejects a destination reached through a symlink out of the project', async () => {
    // A purely textual check cannot catch this: every path component looks
    // relative, but the link redirects the write outside the project.
    const outside = await dir.mkdir('outside-the-project');

    let linked = true;
    try {
      await symlink(outside, path.join(projectRoot, 'escape-link'), 'dir');
    } catch {
      // Directory symlinks can require elevation on Windows. Skipping is honest:
      // the behavior is covered wherever symlinks can be created, and CI runs
      // Linux as well.
      linked = false;
    }

    if (!linked) return;

    await expect(planWithTarget('escape-link/inside')).rejects.toMatchObject({
      code: 'UNSAFE_PATH',
    });

    await expect(stat(path.join(outside, 'inside'))).rejects.toThrow();
  });

  it('accepts a symlink that stays inside the project', async () => {
    await dir.mkdir('project/real-directory');

    let linked = true;
    try {
      await symlink(
        path.join(projectRoot, 'real-directory'),
        path.join(projectRoot, 'inside-link'),
        'dir',
      );
    } catch {
      linked = false;
    }

    if (!linked) return;

    await expect(planWithTarget('inside-link/nested')).resolves.toBeDefined();
  });
});

describe('a tampered lockfile cannot direct a write outside the project', () => {
  it('rejects a lockfile path that escapes, even with force', async () => {
    // A lockfile arrives via a pull request, so its paths are untrusted input
    // exactly as a manifest's are (T5).
    const { removeResource, planRemove } = await import('../src/remove.js');
    const { digestOf } = await import('../src/integrity.js');

    await initProject({ root: projectRoot, force: true });
    const project = await loadProject(projectRoot);

    const tampered = {
      ...project,
      lockfile: {
        lockfileVersion: 1 as const,
        resources: {
          'skillbox/tampered': {
            version: '0.1.0',
            kind: 'prompt' as const,
            source: { type: 'local' as const, path: 'prompts/tampered' },
            integrity: digestOf('x'),
            target: 'target-dir',
            files: { '../../escaped.txt': digestOf('x') },
            requestedBy: 'direct' as const,
          },
        },
      },
    };

    await expect(planRemove(tampered, 'skillbox/tampered')).rejects.toMatchObject({
      code: 'UNSAFE_PATH',
    });

    await expect(
      removeResource({
        project: tampered,
        qualifiedName: 'skillbox/tampered',
        force: true,
      }),
    ).rejects.toMatchObject({ code: 'UNSAFE_PATH' });
  });
});
