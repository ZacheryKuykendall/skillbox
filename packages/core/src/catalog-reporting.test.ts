import { MANIFEST_FILENAME } from '@skillbox/schema';
import { createTempDir, writeRegistry, type TempDir } from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { failureDiagnostics, loadCatalog } from './catalog.js';

let dir: TempDir;

beforeEach(async () => {
  dir = await createTempDir();
});

afterEach(async () => {
  await dir.cleanup();
});

describe('failureDiagnostics', () => {
  it('returns an empty list for a healthy catalog', async () => {
    const registry = await writeRegistry(dir, [{ name: 'good-resource' }]);

    expect(failureDiagnostics(await loadCatalog(registry))).toEqual([]);
  });

  it('pairs each failure with the manifest path that produced it', async () => {
    // A validation error is only actionable if the reader knows which file it
    // came from.
    const registry = await writeRegistry(dir, [{ name: 'good-resource' }]);

    await dir.write(
      `registry/prompts/broken-resource/${MANIFEST_FILENAME}`,
      'a: [oops',
    );

    const reported = failureDiagnostics(await loadCatalog(registry));

    expect(reported).toHaveLength(1);
    expect(reported[0]?.location).toContain(MANIFEST_FILENAME);
    expect(reported[0]?.location).toContain('broken-resource');
    expect(reported[0]?.diagnostics.length).toBeGreaterThan(0);
  });

  it('reports every failure when several resources are invalid', async () => {
    const registry = await writeRegistry(dir, [{ name: 'good-resource' }]);

    await dir.write(`registry/prompts/broken-one/${MANIFEST_FILENAME}`, 'a: [oops');
    await dir.write(`registry/prompts/broken-two/${MANIFEST_FILENAME}`, 'b: [oops');

    const reported = failureDiagnostics(await loadCatalog(registry));

    expect(reported).toHaveLength(2);
  });
});
