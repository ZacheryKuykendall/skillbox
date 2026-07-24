import { MANIFEST_FILENAME } from '@skillbox/schema';
import { createTempDir, writeRegistry, type TempDir } from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadCatalog, type Catalog } from './catalog.js';
import {
  availableVersions,
  parseResourceReference,
  resolve,
  tryResolve,
} from './resolve.js';

let dir: TempDir;
let catalog: Catalog;

/** Write an extra version of a resource into its own directory. */
async function writeVersion(
  target: TempDir,
  name: string,
  version: string,
): Promise<void> {
  const directory = `registry/prompts/${name}-${version}`;

  await target.write(
    `${directory}/${MANIFEST_FILENAME}`,
    [
      'apiVersion: skillbox.dev/v1alpha1',
      'kind: prompt',
      'metadata:',
      '  namespace: skillbox',
      `  name: ${name}`,
      `  version: ${version}`,
      `  description: Version ${version} of the ${name} fixture resource.`,
      'spec:',
      '  entrypoint: entry.md',
      '  files:',
      '    - entry.md',
      '',
    ].join('\n'),
  );
  await target.write(`${directory}/entry.md`, `version ${version}`);
}

beforeEach(async () => {
  dir = await createTempDir();

  await writeRegistry(dir, [{ name: 'other-resource', version: '1.0.0' }]);

  for (const version of ['0.1.0', '0.1.5', '0.2.0', '1.0.0', '1.1.0-beta.1']) {
    await writeVersion(dir, 'code-review', version);
  }

  catalog = await loadCatalog(dir.resolve('registry'));
});

afterEach(async () => {
  await dir.cleanup();
});

describe('parseResourceReference', () => {
  it('parses a valid reference', () => {
    expect(parseResourceReference('skillbox/code-review@^0.1.0').qualifiedName).toBe(
      'skillbox/code-review',
    );
  });

  it('converts a parse failure into a SkillboxError with a hint', () => {
    expect(() => parseResourceReference('nope')).toThrowError(
      expect.objectContaining({ code: 'INVALID_REFERENCE' }),
    );
  });
});

describe('resolve', () => {
  describe('with no version requested', () => {
    it('chooses the highest stable version', () => {
      // 1.1.0-beta.1 is higher but is a prerelease, so it must not be chosen.
      expect(resolve(catalog, 'skillbox/code-review').manifest.metadata.version).toBe(
        '1.0.0',
      );
    });

    it('falls back to a prerelease when no stable version exists', async () => {
      const scratch = await createTempDir();
      try {
        await writeRegistry(scratch, []);
        await writeVersion(scratch, 'alpha-only', '1.0.0-alpha.1');

        const scratchCatalog = await loadCatalog(scratch.resolve('registry'));

        expect(
          resolve(scratchCatalog, 'skillbox/alpha-only').manifest.metadata.version,
        ).toBe('1.0.0-alpha.1');
      } finally {
        await scratch.cleanup();
      }
    });
  });

  describe('with an exact version', () => {
    it('resolves that version', () => {
      expect(
        resolve(catalog, 'skillbox/code-review@0.1.5').manifest.metadata.version,
      ).toBe('0.1.5');
    });

    it('resolves a prerelease when requested exactly', () => {
      expect(
        resolve(catalog, 'skillbox/code-review@1.1.0-beta.1').manifest.metadata.version,
      ).toBe('1.1.0-beta.1');
    });

    it('fails when the version is absent', () => {
      expect(() => resolve(catalog, 'skillbox/code-review@9.9.9')).toThrowError(
        expect.objectContaining({ code: 'VERSION_NOT_FOUND' }),
      );
    });
  });

  describe('with a range', () => {
    it.each([
      ['^0.1.0', '0.1.5'],
      ['^0.2.0', '0.2.0'],
      ['^1.0.0', '1.0.0'],
      ['~0.1.0', '0.1.5'],
      ['>=0.1.0 <1.0.0', '0.2.0'],
      ['0.1.x', '0.1.5'],
      ['*', '1.0.0'],
    ])('resolves %s to the highest satisfying version %s', (range, expected) => {
      expect(
        resolve(catalog, `skillbox/code-review@${range}`).manifest.metadata.version,
      ).toBe(expected);
    });

    it('does not let a prerelease satisfy a plain range', () => {
      // Without this, `^1.0.0` could silently install 1.1.0-beta.1 (FR-4.5).
      expect(
        resolve(catalog, 'skillbox/code-review@^1.0.0').manifest.metadata.version,
      ).toBe('1.0.0');
    });

    it('fails for an unsatisfiable range', () => {
      expect(() => resolve(catalog, 'skillbox/code-review@^5.0.0')).toThrowError(
        expect.objectContaining({ code: 'VERSION_NOT_FOUND' }),
      );
    });

    it('lists the available versions when nothing satisfies', () => {
      // Listing what exists turns a dead end into a next step (FR-4.4).
      try {
        resolve(catalog, 'skillbox/code-review@^5.0.0');
        expect.unreachable('should have thrown');
      } catch (error) {
        const details = (error as { details: readonly string[] }).details.join(' ');
        expect(details).toContain('1.0.0');
        expect(details).toContain('0.1.0');
      }
    });
  });

  describe('when the name is unknown', () => {
    it('reports RESOURCE_NOT_FOUND', () => {
      expect(() => resolve(catalog, 'skillbox/nonexistent-thing')).toThrowError(
        expect.objectContaining({ code: 'RESOURCE_NOT_FOUND' }),
      );
    });

    it('suggests a close name for a likely typo', () => {
      try {
        resolve(catalog, 'skillbox/code-reviw');
        expect.unreachable('should have thrown');
      } catch (error) {
        expect((error as { hint?: string }).hint).toContain('skillbox/code-review');
      }
    });

    it('does not suggest anything for an unrelated name', () => {
      try {
        resolve(catalog, 'skillbox/kubernetes-operator');
        expect.unreachable('should have thrown');
      } catch (error) {
        expect((error as { hint?: string }).hint).not.toContain('Did you mean');
      }
    });
  });

  it('accepts a pre-parsed reference', () => {
    const reference = parseResourceReference('skillbox/code-review@0.2.0');

    expect(resolve(catalog, reference).manifest.metadata.version).toBe('0.2.0');
  });
});

describe('tryResolve', () => {
  it('returns the resource when resolvable', () => {
    expect(tryResolve(catalog, 'skillbox/code-review')?.qualifiedName).toBe(
      'skillbox/code-review',
    );
  });

  it('returns undefined instead of throwing', () => {
    expect(tryResolve(catalog, 'skillbox/nonexistent-thing')).toBeUndefined();
    expect(tryResolve(catalog, 'malformed')).toBeUndefined();
  });
});

describe('availableVersions', () => {
  it('lists versions highest first', () => {
    expect(availableVersions(catalog, 'skillbox/code-review')).toEqual([
      '1.1.0-beta.1',
      '1.0.0',
      '0.2.0',
      '0.1.5',
      '0.1.0',
    ]);
  });

  it('returns an empty list for an unknown name', () => {
    expect(availableVersions(catalog, 'skillbox/nonexistent-thing')).toEqual([]);
  });
});
