import { MANIFEST_FILENAME } from '@skillbox/schema';
import {
  createTempDir,
  writeRegistry,
  writeResource,
  type TempDir,
} from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadCatalog } from './catalog.js';
import { validateDirectory } from './validate.js';

let dir: TempDir;

beforeEach(async () => {
  dir = await createTempDir();
});

afterEach(async () => {
  await dir.cleanup();
});

describe('validateDirectory', () => {
  it('reports a valid resource with no findings', async () => {
    const directory = await writeResource(dir, 'registry', { name: 'code-review' });

    const report = await validateDirectory({ directory: dir.resolve(directory) });

    expect(report.ok).toBe(true);
    expect(report.errors).toBe(0);
    expect(report.warnings).toBe(0);
  });

  it('validates every resource beneath a directory', async () => {
    const registry = await writeRegistry(dir, [
      { name: 'first-resource' },
      { name: 'second-resource', kind: 'script' },
    ]);

    const report = await validateDirectory({ directory: registry });

    expect(report.targets).toHaveLength(2);
    expect(report.ok).toBe(true);
  });

  it('reports a structural error with its field path', async () => {
    await dir.write(
      `broken/${MANIFEST_FILENAME}`,
      ['apiVersion: skillbox.dev/v1alpha1', 'kind: prompt', 'metadata: {}'].join('\n'),
    );

    const report = await validateDirectory({ directory: dir.resolve('broken') });

    expect(report.ok).toBe(false);
    expect(report.errors).toBeGreaterThan(0);
    expect(
      report.targets[0]?.diagnostics.some((d) => d.path.includes('metadata')),
    ).toBe(true);
  });

  it('warns about a file present but not declared', async () => {
    // A warning, not an error: an author may keep notes alongside a resource.
    const directory = await writeResource(dir, 'registry', {
      name: 'undeclared-file',
      files: ['entry.md', 'README.md'],
      contents: { 'notes.md': 'my private notes' },
    });

    const report = await validateDirectory({ directory: dir.resolve(directory) });

    expect(report.ok).toBe(true);
    expect(report.warnings).toBe(1);
    expect(report.targets[0]?.diagnostics[0]?.message).toContain('notes.md');
  });

  it('does not report the manifest itself as undeclared', async () => {
    const directory = await writeResource(dir, 'registry', { name: 'code-review' });

    const report = await validateDirectory({ directory: dir.resolve(directory) });

    expect(report.warnings).toBe(0);
  });

  it('rejects a path that does not exist', async () => {
    await expect(
      validateDirectory({ directory: dir.resolve('nope') }),
    ).rejects.toMatchObject({ code: 'IO_ERROR' });
  });

  it('rejects a file rather than a directory', async () => {
    await dir.write('a-file.txt', 'x');

    await expect(
      validateDirectory({ directory: dir.resolve('a-file.txt') }),
    ).rejects.toMatchObject({ code: 'IO_ERROR' });
  });

  it('rejects a directory containing no resources', async () => {
    await dir.mkdir('empty');

    await expect(
      validateDirectory({ directory: dir.resolve('empty') }),
    ).rejects.toMatchObject({ code: 'IO_ERROR' });
  });

  it('hints that the manifest is required when none is found', async () => {
    await dir.mkdir('empty');

    await expect(
      validateDirectory({ directory: dir.resolve('empty') }),
    ).rejects.toMatchObject({ hint: expect.stringContaining(MANIFEST_FILENAME) });
  });

  describe('with a catalog', () => {
    it('reports a dependency that is not in the catalog', async () => {
      const registry = await writeRegistry(dir, [
        {
          name: 'needs-absent',
          dependencies: [{ resource: 'skillbox/absent-resource', version: '^0.1.0' }],
        },
      ]);

      const report = await validateDirectory({
        directory: registry,
        catalog: await loadCatalog(registry),
      });

      expect(report.ok).toBe(false);
      expect(
        report.targets[0]?.diagnostics.some((d) =>
          d.message.includes('absent-resource'),
        ),
      ).toBe(true);
    });

    it('treats a missing optional dependency as a warning', async () => {
      const registry = await writeRegistry(dir, [
        {
          name: 'needs-optional',
          dependencies: [
            { resource: 'skillbox/absent-resource', version: '^0.1.0', optional: true },
          ],
        },
      ]);

      const report = await validateDirectory({
        directory: registry,
        catalog: await loadCatalog(registry),
      });

      expect(report.ok).toBe(true);
      expect(report.warnings).toBe(1);
    });

    it('reports a dependency range that nothing satisfies', async () => {
      const registry = await writeRegistry(dir, [
        {
          name: 'wants-newer',
          dependencies: [{ resource: 'skillbox/provider-resource', version: '^9.0.0' }],
        },
        { name: 'provider-resource', version: '0.1.0' },
      ]);

      const report = await validateDirectory({
        directory: registry,
        catalog: await loadCatalog(registry),
      });

      expect(report.ok).toBe(false);
      expect(
        report.targets.some((target) =>
          target.diagnostics.some((d) => d.message.includes('satisfies')),
        ),
      ).toBe(true);
    });

    it('accepts a dependency that resolves', async () => {
      const registry = await writeRegistry(dir, [
        {
          name: 'consumer-resource',
          dependencies: [{ resource: 'skillbox/provider-resource', version: '^0.1.0' }],
        },
        { name: 'provider-resource' },
      ]);

      const report = await validateDirectory({
        directory: registry,
        catalog: await loadCatalog(registry),
      });

      expect(report.ok).toBe(true);
    });

    it('warns when a workflow step is not declared as a dependency', async () => {
      // The step would not be installed, so the workflow breaks at use time.
      const registry = await writeRegistry(dir, [
        {
          name: 'undeclared-step',
          kind: 'workflow',
          spec: {
            steps: [
              {
                name: 'do-thing',
                uses: 'skillbox/provider-resource',
                description: 'Uses a resource that is not declared.',
              },
            ],
          },
        },
        { name: 'provider-resource' },
      ]);

      const report = await validateDirectory({
        directory: registry,
        catalog: await loadCatalog(registry),
      });

      expect(report.warnings).toBeGreaterThan(0);
      expect(
        report.targets.some((target) =>
          target.diagnostics.some((d) =>
            d.message.includes('not declared as a dependency'),
          ),
        ),
      ).toBe(true);
    });

    it('accepts a workflow that declares its steps as dependencies', async () => {
      const registry = await writeRegistry(dir, [
        {
          name: 'declared-step',
          kind: 'workflow',
          dependencies: [{ resource: 'skillbox/provider-resource', version: '^0.1.0' }],
          spec: {
            steps: [
              {
                name: 'do-thing',
                uses: 'skillbox/provider-resource',
                description: 'Uses a properly declared resource.',
              },
            ],
          },
        },
        { name: 'provider-resource' },
      ]);

      const report = await validateDirectory({
        directory: registry,
        catalog: await loadCatalog(registry),
      });

      expect(report.ok).toBe(true);
      expect(report.warnings).toBe(0);
    });

    it('warns when an agent prompt is not declared as a dependency', async () => {
      const registry = await writeRegistry(dir, [
        {
          name: 'undeclared-prompt',
          kind: 'agent',
          spec: {
            role: 'Plans work using a prompt it does not declare.',
            prompts: ['skillbox/provider-resource'],
          },
        },
        { name: 'provider-resource' },
      ]);

      const report = await validateDirectory({
        directory: registry,
        catalog: await loadCatalog(registry),
      });

      expect(
        report.targets.some((target) =>
          target.diagnostics.some((d) => d.path.startsWith('spec.prompts')),
        ),
      ).toBe(true);
    });
  });
});
