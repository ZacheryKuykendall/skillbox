import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  INVALID_MANIFESTS,
  createTempDir,
  writeRegistry,
  type TempDir,
} from '@skillbox/testing';
import { MANIFEST_FILENAME, validateManifest } from '@skillbox/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadCatalog } from '../src/catalog.js';
import { buildGraph } from '../src/graph.js';
import { initProject } from '../src/init.js';
import { loadResource } from '../src/manifest-loader.js';
import { assertNoConflicts, planInstall } from '../src/plan.js';
import { loadProject } from '../src/project.js';

/**
 * Malformed and hostile manifest input.
 *
 * Covers every documented failure mode, and asserts that a rejection leaves no
 * partial state behind (T8, SR-9, SR-10).
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

describe('every documented invalid manifest is rejected', () => {
  it.each(INVALID_MANIFESTS.map((f) => [f.label, f.reason, f.manifest] as const))(
    'rejects %s because %s',
    (_label, _reason, manifest) => {
      const result = validateManifest(manifest);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // A rejection with no diagnostic tells the author nothing.
        expect(result.diagnostics.length).toBeGreaterThan(0);
        expect(result.diagnostics.every((d) => d.message.length > 0)).toBe(true);
      }
    },
  );
});

describe('malformed YAML', () => {
  it.each([
    ['unclosed bracket', 'a: [unclosed'],
    ['unclosed quote', 'a: "unclosed'],
    ['bad indentation', 'a: 1\n  b: 2\nc: 3'],
    ['a tab character', 'a:\n\tb: 1'],
    ['duplicate keys', 'a: 1\na: 2\nb: ['],
    ['binary content', '\u0000\u0001\u0002 not yaml at all: ['],
  ])('reports %s without throwing', async (label, contents) => {
    await dir.write(
      `broken-${label.replace(/\s+/g, '-')}/${MANIFEST_FILENAME}`,
      contents,
    );

    const result = await loadResource(
      dir.resolve(`broken-${label.replace(/\s+/g, '-')}`),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.diagnostics.length).toBeGreaterThan(0);
    }
  });

  it('reports an empty manifest', async () => {
    await dir.write(`empty/${MANIFEST_FILENAME}`, '');

    expect((await loadResource(dir.resolve('empty'))).ok).toBe(false);
  });

  it('reports a manifest that is a YAML list rather than a mapping', async () => {
    await dir.write(`list/${MANIFEST_FILENAME}`, '- one\n- two\n');

    expect((await loadResource(dir.resolve('list'))).ok).toBe(false);
  });

  it('reports a manifest that is a bare scalar', async () => {
    await dir.write(`scalar/${MANIFEST_FILENAME}`, 'just a string\n');

    expect((await loadResource(dir.resolve('scalar'))).ok).toBe(false);
  });
});

describe('undeclared and missing entrypoints', () => {
  it('rejects an entrypoint absent from spec.files', () => {
    const result = validateManifest({
      apiVersion: 'skillbox.dev/v1alpha1',
      kind: 'prompt',
      metadata: {
        namespace: 'skillbox',
        name: 'mismatched-entrypoint',
        version: '0.1.0',
        description: 'A fixture whose entrypoint is not among its declared files.',
      },
      spec: { entrypoint: 'not-listed.md', files: ['other.md'] },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.diagnostics.some((d) => d.message.includes('must also be listed')),
      ).toBe(true);
    }
  });

  it('rejects an entrypoint that does not exist on disk', async () => {
    await dir.write(
      `missing-entrypoint/${MANIFEST_FILENAME}`,
      [
        'apiVersion: skillbox.dev/v1alpha1',
        'kind: prompt',
        'metadata:',
        '  namespace: skillbox',
        '  name: missing-entrypoint',
        '  version: 0.1.0',
        '  description: A fixture whose entrypoint file is absent from disk.',
        'spec:',
        '  entrypoint: absent.md',
        '  files:',
        '    - absent.md',
        '',
      ].join('\n'),
    );

    const result = await loadResource(dir.resolve('missing-entrypoint'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.failure.diagnostics.some((d) => d.message.includes('does not exist')),
      ).toBe(true);
    }
  });

  it('rejects a declared file that is a directory', async () => {
    await dir.write(
      `directory-as-file/${MANIFEST_FILENAME}`,
      [
        'apiVersion: skillbox.dev/v1alpha1',
        'kind: prompt',
        'metadata:',
        '  namespace: skillbox',
        '  name: directory-as-file',
        '  version: 0.1.0',
        '  description: A fixture that declares a directory among its files.',
        'spec:',
        '  entrypoint: entry.md',
        '  files:',
        '    - entry.md',
        '    - a-directory',
        '',
      ].join('\n'),
    );
    await dir.write('directory-as-file/entry.md', 'present');
    await dir.mkdir('directory-as-file/a-directory');

    expect((await loadResource(dir.resolve('directory-as-file'))).ok).toBe(false);
  });
});

describe('undeclared files are reported', () => {
  it('warns about a file present but not in spec.files', async () => {
    // A file the author forgot to declare will not be installed, so the resource
    // would be silently incomplete (SR-10).
    const { validateDirectory } = await import('../src/validate.js');

    const registry = await writeRegistry(dir, [
      { name: 'undeclared-extra', contents: { 'forgotten.md': 'not declared' } },
    ]);

    const report = await validateDirectory({ directory: registry });

    expect(report.warnings).toBe(1);
    expect(report.targets[0]?.diagnostics[0]?.message).toContain('forgotten.md');
  });
});

describe('dependency failures', () => {
  it('rejects a missing dependency and names the requester', async () => {
    const registry = await writeRegistry(dir, [
      {
        name: 'needs-absent',
        dependencies: [{ resource: 'skillbox/absent-resource', version: '^0.1.0' }],
      },
    ]);

    const catalog = await loadCatalog(registry);

    expect(() =>
      buildGraph(catalog, [{ reference: 'skillbox/needs-absent' }]),
    ).toThrowError(expect.objectContaining({ code: 'MISSING_DEPENDENCY' }));
  });

  it('rejects a two-resource cycle with the full path', async () => {
    const registry = await writeRegistry(dir, [
      {
        name: 'cycle-a',
        dependencies: [{ resource: 'skillbox/cycle-b', version: '^0.1.0' }],
      },
      {
        name: 'cycle-b',
        dependencies: [{ resource: 'skillbox/cycle-a', version: '^0.1.0' }],
      },
    ]);

    const catalog = await loadCatalog(registry);

    try {
      buildGraph(catalog, [{ reference: 'skillbox/cycle-a' }]);
      expect.unreachable('should have thrown');
    } catch (error) {
      const skillboxError = error as { code: string; message: string };
      expect(skillboxError.code).toBe('CIRCULAR_DEPENDENCY');
      expect(skillboxError.message).toContain('cycle-a');
      expect(skillboxError.message).toContain('cycle-b');
    }
  });

  it('rejects a longer cycle', async () => {
    const registry = await writeRegistry(dir, [
      {
        name: 'ring-one',
        dependencies: [{ resource: 'skillbox/ring-two', version: '^0.1.0' }],
      },
      {
        name: 'ring-two',
        dependencies: [{ resource: 'skillbox/ring-three', version: '^0.1.0' }],
      },
      {
        name: 'ring-three',
        dependencies: [{ resource: 'skillbox/ring-four', version: '^0.1.0' }],
      },
      {
        name: 'ring-four',
        dependencies: [{ resource: 'skillbox/ring-one', version: '^0.1.0' }],
      },
    ]);

    const catalog = await loadCatalog(registry);

    expect(() =>
      buildGraph(catalog, [{ reference: 'skillbox/ring-one' }]),
    ).toThrowError(expect.objectContaining({ code: 'CIRCULAR_DEPENDENCY' }));
  });

  it('rejects a self-dependency', async () => {
    const registry = await writeRegistry(dir, [
      {
        name: 'self-referential',
        dependencies: [{ resource: 'skillbox/self-referential', version: '^0.1.0' }],
      },
    ]);

    const catalog = await loadCatalog(registry);

    expect(() =>
      buildGraph(catalog, [{ reference: 'skillbox/self-referential' }]),
    ).toThrowError(expect.objectContaining({ code: 'CIRCULAR_DEPENDENCY' }));
  });

  it('writes nothing when a dependency failure occurs', async () => {
    const registry = await writeRegistry(dir, [
      {
        name: 'needs-absent',
        target: 'target-dir',
        dependencies: [{ resource: 'skillbox/absent-resource', version: '^0.1.0' }],
      },
    ]);

    await initProject({ root: projectRoot });
    const project = await loadProject(projectRoot);

    await expect(
      planInstall({
        projectRoot,
        catalog: await loadCatalog(registry),
        lockfile: project.lockfile,
        requested: [{ reference: 'skillbox/needs-absent' }],
      }),
    ).rejects.toThrow();

    await expect(stat(path.join(projectRoot, 'target-dir'))).rejects.toThrow();
  });
});

describe('conflicting files', () => {
  it('refuses to overwrite a file Skillbox did not install', async () => {
    await dir.write('project/target-dir/entry.md', 'my own work');

    const registry = await writeRegistry(dir, [
      { name: 'conflicting-resource', target: 'target-dir' },
    ]);

    await initProject({ root: projectRoot });
    const project = await loadProject(projectRoot);

    const plan = await planInstall({
      projectRoot,
      catalog: await loadCatalog(registry),
      lockfile: project.lockfile,
      requested: [{ reference: 'skillbox/conflicting-resource' }],
    });

    expect(plan.conflicts.length).toBeGreaterThan(0);
    expect(() => {
      assertNoConflicts(plan, false);
    }).toThrowError(expect.objectContaining({ code: 'FILE_CONFLICT' }));
  });

  it('leaves the existing file untouched when a conflict is refused', async () => {
    const { readFile } = await import('node:fs/promises');
    await dir.write('project/target-dir/entry.md', 'my own work');

    const registry = await writeRegistry(dir, [
      { name: 'conflicting-resource', target: 'target-dir' },
    ]);

    await initProject({ root: projectRoot });
    const project = await loadProject(projectRoot);

    const plan = await planInstall({
      projectRoot,
      catalog: await loadCatalog(registry),
      lockfile: project.lockfile,
      requested: [{ reference: 'skillbox/conflicting-resource' }],
    });

    try {
      assertNoConflicts(plan, false);
    } catch {
      // Expected.
    }

    expect(
      await readFile(path.join(projectRoot, 'target-dir', 'entry.md'), 'utf8'),
    ).toBe('my own work');
    // Only the pre-existing file is present; nothing was written.
    expect(await readdir(path.join(projectRoot, 'target-dir'))).toEqual(['entry.md']);
  });
});

describe('duplicate identifiers', () => {
  it('rejects two resources claiming the same identifier', async () => {
    // An ambiguous catalog would make resolution non-deterministic, which is a
    // prerequisite for dependency confusion (T6).
    const registry = await writeRegistry(dir, [{ name: 'code-review' }]);

    await dir.write(
      `registry/prompts/duplicate/${MANIFEST_FILENAME}`,
      [
        'apiVersion: skillbox.dev/v1alpha1',
        'kind: prompt',
        'metadata:',
        '  namespace: skillbox',
        '  name: code-review',
        '  version: 0.1.0',
        '  description: A duplicate identifier, which must be rejected.',
        'spec:',
        '  entrypoint: entry.md',
        '  files:',
        '    - entry.md',
        '',
      ].join('\n'),
    );
    await dir.write('registry/prompts/duplicate/entry.md', 'x');

    await expect(loadCatalog(registry)).rejects.toMatchObject({
      code: 'DUPLICATE_RESOURCE',
    });
  });
});

describe('bounded input', () => {
  it('rejects an over-long description rather than accepting unbounded input', () => {
    const result = validateManifest({
      apiVersion: 'skillbox.dev/v1alpha1',
      kind: 'prompt',
      metadata: {
        namespace: 'skillbox',
        name: 'unbounded',
        version: '0.1.0',
        description: 'a'.repeat(10_000),
      },
      spec: { entrypoint: 'entry.md', files: ['entry.md'] },
    });

    expect(result.ok).toBe(false);
  });

  it('rejects an over-long name', () => {
    const result = validateManifest({
      apiVersion: 'skillbox.dev/v1alpha1',
      kind: 'prompt',
      metadata: {
        namespace: 'skillbox',
        name: 'a'.repeat(1000),
        version: '0.1.0',
        description: 'A fixture with a name far beyond the allowed length.',
      },
      spec: { entrypoint: 'entry.md', files: ['entry.md'] },
    });

    expect(result.ok).toBe(false);
  });

  it('caps the number of tags', () => {
    const result = validateManifest({
      apiVersion: 'skillbox.dev/v1alpha1',
      kind: 'prompt',
      metadata: {
        namespace: 'skillbox',
        name: 'many-tags',
        version: '0.1.0',
        description: 'A fixture declaring more tags than are permitted.',
        tags: Array.from({ length: 500 }, (_, index) => `tag-${String(index)}`),
      },
      spec: { entrypoint: 'entry.md', files: ['entry.md'] },
    });

    expect(result.ok).toBe(false);
  });
});
