import {
  INVALID_MANIFESTS,
  manifestWith,
  manifestWithMetadata,
  manifestWithSpec,
  validManifest,
} from '@skillbox/testing';
import { describe, expect, it } from 'vitest';

import { API_VERSION, RESOURCE_KINDS } from './constants.js';
import {
  checkEnvelope,
  describeEnvelopeProblem,
  isDeprecated,
  isResourceKind,
  MANIFEST_SCHEMAS,
  manifestIdentifier,
  manifestQualifiedName,
  resolveInstallTarget,
} from './manifest.js';
import { parseManifest, validateManifest } from './validate-manifest.js';

describe('validateManifest', () => {
  describe('every resource kind', () => {
    it.each(RESOURCE_KINDS)('accepts a valid %s manifest', (kind) => {
      const result = validateManifest(validManifest(kind));

      if (!result.ok) {
        throw new Error(
          `expected the ${kind} fixture to validate, got: ${JSON.stringify(result.diagnostics, null, 2)}`,
        );
      }
      expect(result.value.kind).toBe(kind);
    });

    it('has a schema for every kind', () => {
      for (const kind of RESOURCE_KINDS) {
        expect(MANIFEST_SCHEMAS[kind]).toBeDefined();
      }
    });
  });

  describe('documented failure modes', () => {
    it.each(INVALID_MANIFESTS.map((f) => [f.label, f.reason, f.manifest] as const))(
      'rejects %s because %s',
      (_label, _reason, manifest) => {
        const result = validateManifest(manifest);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.diagnostics.length).toBeGreaterThan(0);
        }
      },
    );
  });

  describe('apiVersion gating', () => {
    it('names the supported version when apiVersion is unsupported', () => {
      const result = validateManifest(manifestWith({ apiVersion: 'skillbox.dev/v2' }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // One clear message beats a cascade from a schema that was never
        // going to match.
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0]?.path).toBe('apiVersion');
        expect(result.diagnostics[0]?.message).toContain(API_VERSION);
      }
    });

    it('reports a missing apiVersion against the apiVersion path', () => {
      const manifest = validManifest('prompt');
      delete manifest.apiVersion;

      const result = validateManifest(manifest);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.path).toBe('apiVersion');
      }
    });
  });

  describe('kind gating', () => {
    it('lists the valid kinds when the kind is unknown', () => {
      const result = validateManifest(manifestWith({ kind: 'plugin' }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0]?.path).toBe('kind');
        for (const kind of RESOURCE_KINDS) {
          expect(result.diagnostics[0]?.message).toContain(kind);
        }
      }
    });
  });

  describe('unknown fields', () => {
    it('rejects an unknown top-level field', () => {
      const result = validateManifest(manifestWith({ extra: 1 }));

      expect(result.ok).toBe(false);
    });

    it('rejects an unknown metadata field', () => {
      const result = validateManifest(manifestWithMetadata({ author: 'someone' }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics.some((d) => d.path.startsWith('metadata'))).toBe(
          true,
        );
      }
    });

    it('rejects an unknown spec field', () => {
      const result = validateManifest(manifestWithSpec({ entryPoints: ['a.md'] }));

      expect(result.ok).toBe(false);
    });

    it('suggests checking for a typo', () => {
      const result = validateManifest(manifestWithSpec({ entrypoints: 'prompt.md' }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics.some((d) => d.hint?.includes('typo') === true)).toBe(
          true,
        );
      }
    });
  });

  describe('cross-field rules', () => {
    it('requires the entrypoint to appear in files', () => {
      const result = validateManifest(
        manifestWithSpec({
          entrypoint: 'missing.md',
          files: ['prompt.md', 'README.md'],
        }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(
          result.diagnostics.some((d) => d.message.includes('must also be listed')),
        ).toBe(true);
      }
    });

    it('accepts an entrypoint that is listed', () => {
      const result = validateManifest(
        manifestWithSpec({
          entrypoint: 'README.md',
          files: ['prompt.md', 'README.md'],
        }),
      );

      expect(result.ok).toBe(true);
    });
  });

  describe('tag normalization', () => {
    it('deduplicates tags', () => {
      const result = validateManifest(
        manifestWithMetadata({ tags: ['a-tag', 'a-tag', 'b-tag'] }),
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.tags).toEqual(['a-tag', 'b-tag']);
      }
    });
  });

  describe('kind-specific fields', () => {
    it('rejects a prompt that declares a script interpreter', () => {
      // No kind may borrow another kind's fields (FR-1.12).
      expect(validateManifest(manifestWithSpec({ interpreter: 'node' })).ok).toBe(
        false,
      );
    });

    it('requires a script to declare an interpreter', () => {
      const manifest = validManifest('script');
      delete (manifest.spec as Record<string, unknown>).interpreter;

      expect(validateManifest(manifest).ok).toBe(false);
    });

    it('requires an agent to declare a role', () => {
      const manifest = validManifest('agent');
      delete (manifest.spec as Record<string, unknown>).role;

      expect(validateManifest(manifest).ok).toBe(false);
    });

    it('requires a workflow to declare at least one step', () => {
      const manifest = validManifest('workflow');
      (manifest.spec as Record<string, unknown>).steps = [];

      const result = validateManifest(manifest);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics.some((d) => d.message.includes('at least one'))).toBe(
          true,
        );
      }
    });

    it('rejects duplicate workflow step names', () => {
      const manifest = validManifest('workflow');
      const spec = manifest.spec as Record<string, unknown>;
      spec.steps = [
        { name: 'plan', uses: 'skillbox/a-resource', description: 'First.' },
        { name: 'plan', uses: 'skillbox/b-resource', description: 'Second.' },
      ];

      const result = validateManifest(manifest);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(
          result.diagnostics.some((d) => d.message.includes('duplicate step')),
        ).toBe(true);
      }
    });

    it('requires a component to declare a language', () => {
      const manifest = validManifest('component');
      delete (manifest.spec as Record<string, unknown>).language;

      expect(validateManifest(manifest).ok).toBe(false);
    });

    it('requires an api to declare a protocol', () => {
      const manifest = validManifest('api');
      delete (manifest.spec as Record<string, unknown>).protocol;

      expect(validateManifest(manifest).ok).toBe(false);
    });
  });
});

describe('checkEnvelope', () => {
  it('returns undefined for a well-formed envelope', () => {
    expect(checkEnvelope(validManifest('prompt'))).toBeUndefined();
  });

  it.each([
    ['a string', 'just a string', 'not-an-object'],
    ['null', null, 'not-an-object'],
    ['an array', [], 'not-an-object'],
    ['a number', 42, 'not-an-object'],
  ] as const)('reports %s as %s', (_label, value, expected) => {
    expect(checkEnvelope(value)?.kind).toBe(expected);
  });

  it('reports a missing apiVersion', () => {
    expect(checkEnvelope({ kind: 'prompt' })?.kind).toBe('missing-api-version');
  });

  it('reports an unsupported apiVersion with the value found', () => {
    const problem = checkEnvelope({ apiVersion: 'other/v1', kind: 'prompt' });

    expect(problem).toEqual({ kind: 'unsupported-api-version', found: 'other/v1' });
  });

  // A bare String() would render a mapping as "[object Object]", telling the
  // reader nothing about what they actually wrote.
  it.each([
    [42, '42'],
    [true, 'true'],
    [null, 'null'],
    [{ nested: 1 }, 'a mapping'],
    [['a'], 'a list'],
  ])('describes a non-string apiVersion %s as %s', (apiVersion, expected) => {
    const problem = checkEnvelope({ apiVersion, kind: 'prompt' });

    expect(problem?.kind).toBe('unsupported-api-version');
    expect(problem).toMatchObject({ found: expected });
  });

  it('describes a symbol apiVersion by its type', () => {
    const problem = checkEnvelope({ apiVersion: Symbol('x'), kind: 'prompt' });

    expect(problem).toMatchObject({ found: 'symbol' });
  });

  it('reports a missing kind', () => {
    expect(checkEnvelope({ apiVersion: API_VERSION })?.kind).toBe('missing-kind');
  });

  it('reports an unknown kind with the value found', () => {
    const problem = checkEnvelope({ apiVersion: API_VERSION, kind: 'plugin' });

    expect(problem).toEqual({ kind: 'unknown-kind', found: 'plugin' });
  });

  it('reports a non-string kind as unknown', () => {
    expect(checkEnvelope({ apiVersion: API_VERSION, kind: 7 })?.kind).toBe(
      'unknown-kind',
    );
  });
});

describe('describeEnvelopeProblem', () => {
  it.each([
    { kind: 'not-an-object' } as const,
    { kind: 'missing-api-version' } as const,
    { kind: 'unsupported-api-version', found: 'x' } as const,
    { kind: 'missing-kind' } as const,
    { kind: 'unknown-kind', found: 'x' } as const,
  ])('describes $kind', (problem) => {
    const message = describeEnvelopeProblem(problem);

    expect(message.length).toBeGreaterThan(20);
    expect(message.endsWith('.')).toBe(true);
  });
});

describe('isResourceKind', () => {
  it.each(RESOURCE_KINDS)('accepts %s', (kind) => {
    expect(isResourceKind(kind)).toBe(true);
  });

  it.each([['plugin'], ['Prompt'], [''], [null], [undefined], [42]])(
    'rejects %s',
    (value) => {
      expect(isResourceKind(value)).toBe(false);
    },
  );
});

describe('manifestIdentifier', () => {
  it('formats namespace/name@version', () => {
    const result = validateManifest(validManifest('prompt'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(manifestIdentifier(result.value)).toBe('skillbox/code-review@0.1.0');
      expect(manifestQualifiedName(result.value)).toBe('skillbox/code-review');
    }
  });
});

describe('resolveInstallTarget', () => {
  it('uses a declared target', () => {
    const result = validateManifest(
      manifestWithSpec({ install: { target: 'custom/place' } }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(resolveInstallTarget(result.value)).toBe('custom/place');
    }
  });

  it('falls back to the kind default with the resource name appended', () => {
    const manifest = validManifest('prompt');
    delete (manifest.spec as Record<string, unknown>).install;

    const result = validateManifest(manifest);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(resolveInstallTarget(result.value)).toBe('.skillbox/prompts/code-review');
    }
  });

  it('defaults a component into project source', () => {
    const manifest = validManifest('component');
    delete (manifest.spec as Record<string, unknown>).install;

    const result = validateManifest(manifest);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(resolveInstallTarget(result.value)).toBe(
        'src/components/structured-logger',
      );
    }
  });
});

describe('isDeprecated', () => {
  it('is false without a deprecation block', () => {
    const result = validateManifest(validManifest('prompt'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(isDeprecated(result.value)).toBe(false);
    }
  });

  it('is true with a deprecation block', () => {
    const result = validateManifest(
      manifestWithMetadata({
        deprecated: { reason: 'Superseded.', replacement: 'skillbox/other-resource' },
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(isDeprecated(result.value)).toBe(true);
    }
  });

  it('requires a reason when deprecated is present', () => {
    expect(validateManifest(manifestWithMetadata({ deprecated: {} })).ok).toBe(false);
  });
});

describe('parseManifest', () => {
  it('returns the manifest when valid', () => {
    expect(parseManifest(validManifest('prompt')).kind).toBe('prompt');
  });

  it('throws with a summary when invalid', () => {
    expect(() => parseManifest({ apiVersion: 'nope' })).toThrow(
      /Invalid resource manifest/,
    );
  });

  it('includes the field path in the thrown message', () => {
    expect(() => parseManifest(manifestWith({ apiVersion: 'nope' }))).toThrow(
      /apiVersion/,
    );
  });
});
