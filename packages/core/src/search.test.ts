import { createTempDir, writeRegistry, type TempDir } from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadCatalog, type Catalog } from './catalog.js';
import { search } from './search.js';

let dir: TempDir;
let catalog: Catalog;

beforeEach(async () => {
  dir = await createTempDir();

  const registry = await writeRegistry(dir, [
    {
      name: 'code-review',
      kind: 'prompt',
      description: 'Reviews a code change and produces actionable findings.',
      tags: ['development', 'code-review'],
    },
    {
      name: 'technical-documentation',
      kind: 'skill',
      description: 'Writes and reviews technical documentation for a codebase.',
      tags: ['documentation'],
    },
    {
      name: 'structured-logger',
      kind: 'component',
      description: 'A dependency-free structured JSON logger for Node services.',
      tags: ['logging', 'observability'],
    },
    {
      name: 'reviewer-notes',
      kind: 'prompt',
      description: 'Collects reviewer notes into a single summary document.',
      tags: ['development'],
    },
  ]);

  catalog = await loadCatalog(registry);
});

afterEach(async () => {
  await dir.cleanup();
});

describe('search', () => {
  it('lists everything for an empty query', () => {
    expect(search(catalog)).toHaveLength(4);
    expect(search(catalog, { query: '' })).toHaveLength(4);
    expect(search(catalog, { query: '   ' })).toHaveLength(4);
  });

  it('matches a name substring', () => {
    const hits = search(catalog, { query: 'logger' });

    expect(hits.map((h) => h.resource.manifest.metadata.name)).toEqual([
      'structured-logger',
    ]);
  });

  it('matches a description substring', () => {
    const hits = search(catalog, { query: 'json' });

    expect(hits.map((h) => h.resource.manifest.metadata.name)).toEqual([
      'structured-logger',
    ]);
  });

  it('matches a tag', () => {
    const hits = search(catalog, { query: 'observability' });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.matchedFields).toContain('tags');
  });

  it('matches a kind', () => {
    const hits = search(catalog, { query: 'component' });

    expect(hits.map((h) => h.resource.manifest.metadata.name)).toContain(
      'structured-logger',
    );
  });

  it('matches a namespace', () => {
    expect(search(catalog, { query: 'skillbox' })).toHaveLength(4);
  });

  it('is case-insensitive', () => {
    expect(search(catalog, { query: 'LOGGER' })).toHaveLength(1);
    expect(
      search(catalog, { query: 'Code-Review' })[0]?.resource.manifest.metadata.name,
    ).toBe('code-review');
  });

  it('returns nothing for a query that matches nothing', () => {
    // Finding nothing is a valid outcome, not an error.
    expect(search(catalog, { query: 'kubernetes' })).toEqual([]);
  });

  describe('ranking', () => {
    it('ranks an exact name match first', () => {
      const hits = search(catalog, { query: 'code-review' });

      expect(hits[0]?.resource.manifest.metadata.name).toBe('code-review');
    });

    it('ranks a name match above a description-only match', () => {
      // Someone searching "review" wants the review resources, not everything
      // whose description mentions reviewing.
      const hits = search(catalog, { query: 'review' });
      const names = hits.map((h) => h.resource.manifest.metadata.name);

      expect(names.indexOf('reviewer-notes')).toBeLessThan(
        names.indexOf('technical-documentation'),
      );
    });

    it('is deterministic for equal scores', () => {
      const first = search(catalog, { query: 'skillbox' }).map(
        (h) => h.resource.identifier,
      );
      const second = search(catalog, { query: 'skillbox' }).map(
        (h) => h.resource.identifier,
      );

      expect(first).toEqual(second);
      expect(first).toEqual([...first].sort());
    });

    it('reports which fields matched', () => {
      const hits = search(catalog, { query: 'code-review' });

      expect(hits[0]?.matchedFields).toContain('name');
      expect(hits[0]?.matchedFields).toContain('tags');
    });
  });

  describe('filters', () => {
    it('narrows by kind', () => {
      const hits = search(catalog, { kind: 'prompt' });

      expect(hits).toHaveLength(2);
      expect(hits.every((h) => h.resource.manifest.kind === 'prompt')).toBe(true);
    });

    it('narrows by tag', () => {
      const hits = search(catalog, { tags: ['development'] });

      expect(hits.map((h) => h.resource.manifest.metadata.name).sort()).toEqual([
        'code-review',
        'reviewer-notes',
      ]);
    });

    it('requires every requested tag', () => {
      expect(search(catalog, { tags: ['development', 'code-review'] })).toHaveLength(1);
      expect(search(catalog, { tags: ['development', 'logging'] })).toHaveLength(0);
    });

    it('is case-insensitive for tags', () => {
      expect(search(catalog, { tags: ['DEVELOPMENT'] })).toHaveLength(2);
    });

    it('combines a query with a kind filter', () => {
      expect(search(catalog, { query: 'review', kind: 'prompt' })).toHaveLength(2);
      expect(search(catalog, { query: 'review', kind: 'component' })).toHaveLength(0);
    });

    it('applies the filter before scoring, so it narrows rather than reorders', () => {
      const unfiltered = search(catalog, { query: 'skillbox' });
      const filtered = search(catalog, { query: 'skillbox', kind: 'skill' });

      expect(unfiltered.length).toBeGreaterThan(filtered.length);
      expect(filtered).toHaveLength(1);
    });
  });

  describe('limit', () => {
    it('caps the number of results', () => {
      expect(search(catalog, { limit: 2 })).toHaveLength(2);
    });

    it('returns nothing for a limit of zero', () => {
      expect(search(catalog, { limit: 0 })).toEqual([]);
    });

    it('treats a negative limit as zero', () => {
      expect(search(catalog, { limit: -5 })).toEqual([]);
    });

    it('returns everything when the limit exceeds the result count', () => {
      expect(search(catalog, { limit: 100 })).toHaveLength(4);
    });
  });

  describe('allVersions', () => {
    it('lists only the newest of each name by default', () => {
      // A search result listing five versions of one resource is noise.
      expect(search(catalog, { allVersions: false })).toHaveLength(4);
    });

    it('lists every version when asked', () => {
      expect(search(catalog, { allVersions: true })).toHaveLength(4);
    });
  });

  it('matches a resource that declares no tags', () => {
    const hits = search(catalog, { query: 'reviewer-notes' });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.matchedFields).toContain('name');
  });

  it('excludes a resource with no tags from a tag filter', () => {
    expect(search(catalog, { tags: ['nonexistent-tag'] })).toEqual([]);
  });

  it('scores a name prefix above a plain substring', () => {
    // "review" prefixes "reviewer-notes" but only appears mid-word elsewhere.
    const hits = search(catalog, { query: 'review' });
    const prefixHit = hits.find(
      (h) => h.resource.manifest.metadata.name === 'reviewer-notes',
    );
    const substringHit = hits.find(
      (h) => h.resource.manifest.metadata.name === 'code-review',
    );

    expect(prefixHit?.score).toBeGreaterThan(substringHit?.score ?? 0);
  });
});
