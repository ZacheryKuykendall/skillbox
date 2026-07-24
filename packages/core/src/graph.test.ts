import { createTempDir, writeRegistry, type TempDir } from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadCatalog, type Catalog } from './catalog.js';
import { buildGraph, dependentsOf } from './graph.js';

let dir: TempDir;

beforeEach(async () => {
  dir = await createTempDir();
});

afterEach(async () => {
  await dir.cleanup();
});

/** Build a catalog from resource specs written into the temp registry. */
async function catalogOf(
  resources: Parameters<typeof writeRegistry>[1],
): Promise<Catalog> {
  const registry = await writeRegistry(dir, resources);
  return loadCatalog(registry);
}

describe('buildGraph', () => {
  it('resolves a single resource with no dependencies', async () => {
    const catalog = await catalogOf([{ name: 'standalone-resource' }]);

    const graph = buildGraph(catalog, [{ reference: 'skillbox/standalone-resource' }]);

    expect(graph.order).toHaveLength(1);
    expect(graph.order[0]?.direct).toBe(true);
    expect(graph.order[0]?.requestedBy).toBe('direct');
  });

  it('resolves a transitive chain', async () => {
    const catalog = await catalogOf([
      {
        name: 'top-resource',
        dependencies: [{ resource: 'skillbox/middle-resource', version: '^0.1.0' }],
      },
      {
        name: 'middle-resource',
        dependencies: [{ resource: 'skillbox/bottom-resource', version: '^0.1.0' }],
      },
      { name: 'bottom-resource' },
    ]);

    const graph = buildGraph(catalog, [{ reference: 'skillbox/top-resource' }]);

    expect(graph.order.map((n) => n.resource.qualifiedName)).toEqual([
      'skillbox/bottom-resource',
      'skillbox/middle-resource',
      'skillbox/top-resource',
    ]);
  });

  it('orders dependencies before the resources that need them', async () => {
    const catalog = await catalogOf([
      {
        name: 'consumer-resource',
        dependencies: [{ resource: 'skillbox/provider-resource', version: '^0.1.0' }],
      },
      { name: 'provider-resource' },
    ]);

    const graph = buildGraph(catalog, [{ reference: 'skillbox/consumer-resource' }]);
    const names = graph.order.map((n) => n.resource.qualifiedName);

    expect(names.indexOf('skillbox/provider-resource')).toBeLessThan(
      names.indexOf('skillbox/consumer-resource'),
    );
  });

  it('records which resource requested each dependency', async () => {
    const catalog = await catalogOf([
      {
        name: 'requester-resource',
        dependencies: [{ resource: 'skillbox/needed-resource', version: '^0.1.0' }],
      },
      { name: 'needed-resource' },
    ]);

    const graph = buildGraph(catalog, [{ reference: 'skillbox/requester-resource' }]);

    expect(graph.nodes.get('skillbox/needed-resource')?.requestedBy).toBe(
      'skillbox/requester-resource',
    );
    expect(graph.nodes.get('skillbox/needed-resource')?.direct).toBe(false);
  });

  it('installs a diamond dependency exactly once', async () => {
    // Reached by two paths, so a naive traversal would install it twice (FR-5.5).
    const catalog = await catalogOf([
      {
        name: 'diamond-top',
        dependencies: [
          { resource: 'skillbox/diamond-left', version: '^0.1.0' },
          { resource: 'skillbox/diamond-right', version: '^0.1.0' },
        ],
      },
      {
        name: 'diamond-left',
        dependencies: [{ resource: 'skillbox/diamond-base', version: '^0.1.0' }],
      },
      {
        name: 'diamond-right',
        dependencies: [{ resource: 'skillbox/diamond-base', version: '^0.1.0' }],
      },
      { name: 'diamond-base' },
    ]);

    const graph = buildGraph(catalog, [{ reference: 'skillbox/diamond-top' }]);
    const names = graph.order.map((n) => n.resource.qualifiedName);

    expect(names).toHaveLength(4);
    expect(names.filter((n) => n === 'skillbox/diamond-base')).toHaveLength(1);
    expect(names.indexOf('skillbox/diamond-base')).toBe(0);
  });

  it('deduplicates two directly requested resources sharing a dependency', async () => {
    const catalog = await catalogOf([
      {
        name: 'first-consumer',
        dependencies: [{ resource: 'skillbox/shared-resource', version: '^0.1.0' }],
      },
      {
        name: 'second-consumer',
        dependencies: [{ resource: 'skillbox/shared-resource', version: '^0.1.0' }],
      },
      { name: 'shared-resource' },
    ]);

    const graph = buildGraph(catalog, [
      { reference: 'skillbox/first-consumer' },
      { reference: 'skillbox/second-consumer' },
    ]);

    expect(graph.order).toHaveLength(3);
  });

  describe('missing dependencies', () => {
    it('names both the missing resource and the requester', async () => {
      // "Something is missing" is much less useful than knowing who asked for it.
      const catalog = await catalogOf([
        {
          name: 'needs-absent',
          dependencies: [{ resource: 'skillbox/absent-resource', version: '^0.1.0' }],
        },
      ]);

      expect(() =>
        buildGraph(catalog, [{ reference: 'skillbox/needs-absent' }]),
      ).toThrowError(expect.objectContaining({ code: 'MISSING_DEPENDENCY' }));

      try {
        buildGraph(catalog, [{ reference: 'skillbox/needs-absent' }]);
        expect.unreachable('should have thrown');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('skillbox/needs-absent');
        expect(message).toContain('skillbox/absent-resource');
      }
    });

    it('reports a directly requested missing resource as not found', async () => {
      const catalog = await catalogOf([{ name: 'present-resource' }]);

      expect(() =>
        buildGraph(catalog, [{ reference: 'skillbox/absent-resource' }]),
      ).toThrowError(expect.objectContaining({ code: 'RESOURCE_NOT_FOUND' }));
    });

    it('warns rather than failing for a missing optional dependency', async () => {
      const catalog = await catalogOf([
        {
          name: 'needs-optional',
          dependencies: [
            { resource: 'skillbox/absent-resource', version: '^0.1.0', optional: true },
          ],
        },
      ]);

      const graph = buildGraph(catalog, [{ reference: 'skillbox/needs-optional' }]);

      expect(graph.order).toHaveLength(1);
      expect(graph.missingOptional).toEqual(['skillbox/absent-resource']);
    });
  });

  describe('circular dependencies', () => {
    it('detects a two-resource cycle and reports the full path', async () => {
      const catalog = await catalogOf([
        {
          name: 'cycle-a',
          dependencies: [{ resource: 'skillbox/cycle-b', version: '^0.1.0' }],
        },
        {
          name: 'cycle-b',
          dependencies: [{ resource: 'skillbox/cycle-a', version: '^0.1.0' }],
        },
      ]);

      try {
        buildGraph(catalog, [{ reference: 'skillbox/cycle-a' }]);
        expect.unreachable('should have thrown');
      } catch (error) {
        const skillboxError = error as { code: string; message: string };
        expect(skillboxError.code).toBe('CIRCULAR_DEPENDENCY');
        // The full path is what makes a cycle actionable (FR-5.4).
        expect(skillboxError.message).toContain('skillbox/cycle-a');
        expect(skillboxError.message).toContain('skillbox/cycle-b');
        expect(skillboxError.message).toContain('->');
      }
    });

    it('detects a three-resource cycle', async () => {
      const catalog = await catalogOf([
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
          dependencies: [{ resource: 'skillbox/ring-one', version: '^0.1.0' }],
        },
      ]);

      expect(() =>
        buildGraph(catalog, [{ reference: 'skillbox/ring-one' }]),
      ).toThrowError(expect.objectContaining({ code: 'CIRCULAR_DEPENDENCY' }));
    });

    it('detects a self-dependency', async () => {
      const catalog = await catalogOf([
        {
          name: 'self-referential',
          dependencies: [{ resource: 'skillbox/self-referential', version: '^0.1.0' }],
        },
      ]);

      try {
        buildGraph(catalog, [{ reference: 'skillbox/self-referential' }]);
        expect.unreachable('should have thrown');
      } catch (error) {
        const skillboxError = error as { code: string; message: string };
        expect(skillboxError.code).toBe('CIRCULAR_DEPENDENCY');
        expect(skillboxError.message).toContain('depends on itself');
      }
    });

    it('does not mistake a diamond for a cycle', async () => {
      const catalog = await catalogOf([
        {
          name: 'safe-top',
          dependencies: [
            { resource: 'skillbox/safe-left', version: '^0.1.0' },
            { resource: 'skillbox/safe-right', version: '^0.1.0' },
          ],
        },
        {
          name: 'safe-left',
          dependencies: [{ resource: 'skillbox/safe-base', version: '^0.1.0' }],
        },
        {
          name: 'safe-right',
          dependencies: [{ resource: 'skillbox/safe-base', version: '^0.1.0' }],
        },
        { name: 'safe-base' },
      ]);

      expect(() =>
        buildGraph(catalog, [{ reference: 'skillbox/safe-top' }]),
      ).not.toThrow();
    });
  });

  describe('version conflicts', () => {
    it('reports two requirements that cannot be met by one version', async () => {
      const catalog = await catalogOf([
        {
          name: 'wants-old',
          dependencies: [{ resource: 'skillbox/shared-dep', version: '0.1.0' }],
        },
        {
          name: 'wants-new',
          dependencies: [{ resource: 'skillbox/shared-dep', version: '9.9.9' }],
        },
        { name: 'shared-dep', version: '0.1.0' },
      ]);

      expect(() =>
        buildGraph(catalog, [
          { reference: 'skillbox/wants-old' },
          { reference: 'skillbox/wants-new' },
        ]),
      ).toThrowError(
        expect.objectContaining({
          code: expect.stringMatching(/VERSION_CONFLICT|MISSING_DEPENDENCY/),
        }),
      );
    });

    it('accepts two compatible requirements for one resource', async () => {
      const catalog = await catalogOf([
        {
          name: 'wants-caret',
          dependencies: [{ resource: 'skillbox/shared-dep', version: '^0.1.0' }],
        },
        {
          name: 'wants-tilde',
          dependencies: [{ resource: 'skillbox/shared-dep', version: '~0.1.0' }],
        },
        { name: 'shared-dep', version: '0.1.0' },
      ]);

      const graph = buildGraph(catalog, [
        { reference: 'skillbox/wants-caret' },
        { reference: 'skillbox/wants-tilde' },
      ]);

      expect(graph.order).toHaveLength(3);
    });
  });

  it('honors an explicit range on a direct request', async () => {
    const catalog = await catalogOf([{ name: 'ranged-resource', version: '0.1.0' }]);

    const graph = buildGraph(catalog, [
      { reference: 'skillbox/ranged-resource', range: '^0.1.0' },
    ]);

    expect(graph.order[0]?.resource.manifest.metadata.version).toBe('0.1.0');
  });

  it('produces a deterministic order for the same graph', async () => {
    const catalog = await catalogOf([
      {
        name: 'root-resource',
        dependencies: [
          { resource: 'skillbox/dep-alpha', version: '^0.1.0' },
          { resource: 'skillbox/dep-beta', version: '^0.1.0' },
          { resource: 'skillbox/dep-gamma', version: '^0.1.0' },
        ],
      },
      { name: 'dep-alpha' },
      { name: 'dep-beta' },
      { name: 'dep-gamma' },
    ]);

    const first = buildGraph(catalog, [{ reference: 'skillbox/root-resource' }]);
    const second = buildGraph(catalog, [{ reference: 'skillbox/root-resource' }]);

    expect(first.order.map((n) => n.resource.qualifiedName)).toEqual(
      second.order.map((n) => n.resource.qualifiedName),
    );
  });

  it('returns an empty graph for no requests', async () => {
    const catalog = await catalogOf([{ name: 'unused-resource' }]);

    const graph = buildGraph(catalog, []);

    expect(graph.order).toEqual([]);
    expect(graph.nodes.size).toBe(0);
  });
});

describe('dependentsOf', () => {
  it('lists the resources depending on a given one', async () => {
    const catalog = await catalogOf([
      {
        name: 'consumer-one',
        dependencies: [{ resource: 'skillbox/shared-base', version: '^0.1.0' }],
      },
      {
        name: 'consumer-two',
        dependencies: [{ resource: 'skillbox/shared-base', version: '^0.1.0' }],
      },
      { name: 'shared-base' },
    ]);

    const graph = buildGraph(catalog, [
      { reference: 'skillbox/consumer-one' },
      { reference: 'skillbox/consumer-two' },
    ]);

    expect(dependentsOf(graph, 'skillbox/shared-base')).toEqual([
      'skillbox/consumer-one',
      'skillbox/consumer-two',
    ]);
  });

  it('returns an empty list for a resource nothing depends on', async () => {
    const catalog = await catalogOf([{ name: 'lonely-resource' }]);
    const graph = buildGraph(catalog, [{ reference: 'skillbox/lonely-resource' }]);

    expect(dependentsOf(graph, 'skillbox/lonely-resource')).toEqual([]);
  });
});
