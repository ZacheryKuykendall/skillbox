import { MANIFEST_FILENAME } from '@skillbox/schema';
import { createTempDir, writeRegistry, type TempDir } from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildCatalog, kindsInCatalog, loadCatalog } from './catalog.js';
import { SkillboxError } from './errors.js';

let dir: TempDir;

beforeEach(async () => {
  dir = await createTempDir();
});

afterEach(async () => {
  await dir.cleanup();
});

describe('loadCatalog', () => {
  it('discovers resources across kind directories', async () => {
    const registry = await writeRegistry(dir, [
      { name: 'code-review', kind: 'prompt' },
      { name: 'structured-logger', kind: 'component' },
      { name: 'project-summary', kind: 'script' },
    ]);

    const catalog = await loadCatalog(registry);

    expect(catalog.resources).toHaveLength(3);
    expect(catalog.failures).toHaveLength(0);
    expect(catalog.names()).toEqual([
      'skillbox/code-review',
      'skillbox/project-summary',
      'skillbox/structured-logger',
    ]);
  });

  it('orders resources deterministically by identifier', async () => {
    const registry = await writeRegistry(dir, [
      { name: 'zebra-resource' },
      { name: 'alpha-resource' },
      { name: 'middle-resource' },
    ]);

    const first = await loadCatalog(registry);
    const second = await loadCatalog(registry);

    expect(first.resources.map((r) => r.identifier)).toEqual(
      second.resources.map((r) => r.identifier),
    );
    expect(first.resources.map((r) => r.identifier)).toEqual([
      'skillbox/alpha-resource@0.1.0',
      'skillbox/middle-resource@0.1.0',
      'skillbox/zebra-resource@0.1.0',
    ]);
  });

  it('indexes multiple versions of one name, highest first', async () => {
    const registry = await writeRegistry(dir, []);
    await writeRegistry(
      dir,
      [
        { name: 'code-review', version: '0.1.0' },
        { name: 'code-review-v2', version: '0.2.0' },
      ],
      'registry',
    );

    // Two versions must live in distinct directories, so write them explicitly.
    await dir.write(
      `registry/prompts/code-review-0.2.0/${MANIFEST_FILENAME}`,
      [
        'apiVersion: skillbox.dev/v1alpha1',
        'kind: prompt',
        'metadata:',
        '  namespace: skillbox',
        '  name: code-review',
        '  version: 0.2.0',
        '  description: A newer version of the code review prompt fixture.',
        'spec:',
        '  entrypoint: entry.md',
        '  files:',
        '    - entry.md',
        '',
      ].join('\n'),
    );
    await dir.write('registry/prompts/code-review-0.2.0/entry.md', 'newer');

    const catalog = await loadCatalog(registry);
    const versions = catalog.versionsOf('skillbox/code-review');

    expect(versions.map((r) => r.manifest.metadata.version)).toEqual([
      '0.2.0',
      '0.1.0',
    ]);
  });

  it('reports an invalid resource without aborting the scan', async () => {
    // One bad resource must not make the whole catalog unusable (FR-2.4).
    const registry = await writeRegistry(dir, [
      { name: 'good-resource' },
      { name: 'bad-resource', rawManifest: 'this: is: not: valid: yaml:' },
      { name: 'another-good-resource' },
    ]);

    const catalog = await loadCatalog(registry);

    expect(catalog.resources).toHaveLength(2);
    expect(catalog.failures).toHaveLength(1);
    expect(catalog.failures[0]?.diagnostics[0]?.message).toContain('Could not parse');
  });

  it('reports a resource whose declared file is missing', async () => {
    const registry = await writeRegistry(dir, [
      {
        name: 'missing-file',
        files: ['entry.md', 'absent.md'],
        contents: { 'entry.md': 'x' },
      },
    ]);

    // writeResource creates every declared file, so remove one to simulate drift.
    const { rm } = await import('node:fs/promises');
    await rm(dir.resolve('registry/prompts/missing-file/absent.md'));

    const catalog = await loadCatalog(registry);

    expect(catalog.resources).toHaveLength(0);
    expect(catalog.failures[0]?.diagnostics[0]?.message).toContain('does not exist');
  });

  it('rejects two resources claiming the same identifier', async () => {
    // An ambiguous catalog would make resolution non-deterministic (FR-2.3).
    const registry = await writeRegistry(dir, [{ name: 'code-review' }]);

    await dir.write(
      `registry/prompts/duplicate-directory/${MANIFEST_FILENAME}`,
      [
        'apiVersion: skillbox.dev/v1alpha1',
        'kind: prompt',
        'metadata:',
        '  namespace: skillbox',
        '  name: code-review',
        '  version: 0.1.0',
        '  description: A duplicate of the code review prompt fixture.',
        'spec:',
        '  entrypoint: entry.md',
        '  files:',
        '    - entry.md',
        '',
      ].join('\n'),
    );
    await dir.write('registry/prompts/duplicate-directory/entry.md', 'x');

    await expect(loadCatalog(registry)).rejects.toMatchObject({
      code: 'DUPLICATE_RESOURCE',
    });
  });

  it('throws a clear error when the registry does not exist', async () => {
    await expect(loadCatalog(dir.resolve('no-such-registry'))).rejects.toMatchObject({
      code: 'IO_ERROR',
    });

    // The remediation lives on `hint`, which is what the CLI renders below the
    // message.
    await expect(loadCatalog(dir.resolve('no-such-registry'))).rejects.toMatchObject({
      hint: expect.stringContaining('--registry'),
    });
  });

  it('throws when the registry path is a file', async () => {
    await dir.write('not-a-directory.txt', 'x');

    await expect(loadCatalog(dir.resolve('not-a-directory.txt'))).rejects.toMatchObject(
      {
        code: 'IO_ERROR',
      },
    );
  });

  it('returns an empty catalog for an empty registry', async () => {
    await dir.mkdir('empty-registry');

    const catalog = await loadCatalog(dir.resolve('empty-registry'));

    expect(catalog.resources).toEqual([]);
    expect(catalog.names()).toEqual([]);
  });

  it('does not descend into a resource directory', async () => {
    // A manifest marks a leaf, so a resource's own files cannot be misread as
    // nested resources.
    const registry = await writeRegistry(dir, [{ name: 'outer-resource' }]);
    await dir.write(
      `registry/prompts/outer-resource/nested/${MANIFEST_FILENAME}`,
      'apiVersion: skillbox.dev/v1alpha1',
    );

    const catalog = await loadCatalog(registry);

    expect(catalog.resources).toHaveLength(1);
    expect(catalog.failures).toHaveLength(0);
  });

  it('skips node_modules and other noise directories', async () => {
    const registry = await writeRegistry(dir, [{ name: 'real-resource' }]);
    await dir.write(
      `registry/node_modules/fake-resource/${MANIFEST_FILENAME}`,
      'apiVersion: skillbox.dev/v1alpha1',
    );

    const catalog = await loadCatalog(registry);

    expect(catalog.resources).toHaveLength(1);
    expect(catalog.failures).toHaveLength(0);
  });

  it('exposes the install target resolved from the manifest', async () => {
    const registry = await writeRegistry(dir, [
      { name: 'code-review', kind: 'prompt' },
      { name: 'structured-logger', kind: 'component' },
    ]);

    const catalog = await loadCatalog(registry);

    expect(catalog.get('skillbox/code-review@0.1.0')?.target).toBe(
      '.skillbox/prompts/code-review',
    );
    expect(catalog.get('skillbox/structured-logger@0.1.0')?.target).toBe(
      'src/components/structured-logger',
    );
  });
});

describe('Catalog queries', () => {
  it('looks up an exact identifier', async () => {
    const registry = await writeRegistry(dir, [{ name: 'code-review' }]);
    const catalog = await loadCatalog(registry);

    expect(catalog.get('skillbox/code-review@0.1.0')?.qualifiedName).toBe(
      'skillbox/code-review',
    );
    expect(catalog.get('skillbox/code-review@9.9.9')).toBeUndefined();
  });

  it('reports whether a name is present', async () => {
    const registry = await writeRegistry(dir, [{ name: 'code-review' }]);
    const catalog = await loadCatalog(registry);

    expect(catalog.has('skillbox/code-review')).toBe(true);
    expect(catalog.has('skillbox/nonexistent')).toBe(false);
  });

  it('returns an empty list for an unknown name', async () => {
    const registry = await writeRegistry(dir, [{ name: 'code-review' }]);
    const catalog = await loadCatalog(registry);

    expect(catalog.versionsOf('skillbox/nonexistent')).toEqual([]);
  });
});

describe('buildCatalog', () => {
  it('builds an empty catalog without touching the disk', () => {
    const catalog = buildCatalog('/virtual/root', []);

    expect(catalog.root).toBe('/virtual/root');
    expect(catalog.resources).toEqual([]);
    expect(catalog.failures).toEqual([]);
  });
});

describe('kindsInCatalog', () => {
  it('lists the distinct kinds present, sorted', async () => {
    const registry = await writeRegistry(dir, [
      { name: 'a-prompt', kind: 'prompt' },
      { name: 'b-prompt', kind: 'prompt' },
      { name: 'a-script', kind: 'script' },
    ]);

    const catalog = await loadCatalog(registry);

    expect(kindsInCatalog(catalog)).toEqual(['prompt', 'script']);
  });
});

describe('error shape', () => {
  it('throws SkillboxError instances that carry a code and hint', async () => {
    try {
      await loadCatalog(dir.resolve('absent'));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(SkillboxError.is(error)).toBe(true);
      const skillboxError = error as SkillboxError;
      expect(skillboxError.code).toBe('IO_ERROR');
      expect(skillboxError.hint).toBeTruthy();
    }
  });
});
