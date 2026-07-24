import { manifestWithSpec } from '@skillbox/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  formatDiagnostics,
  formatPath,
  isRedactedPath,
  REDACTED_PLACEHOLDER,
  toDiagnostics,
  validate,
} from './errors.js';
import { validateManifest } from './validate-manifest.js';

describe('formatPath', () => {
  it('renders an empty path as an empty string', () => {
    expect(formatPath([])).toBe('');
  });

  it('joins object keys with dots', () => {
    expect(formatPath(['metadata', 'name'])).toBe('metadata.name');
  });

  it('renders array indices in brackets', () => {
    expect(formatPath(['spec', 'files', 1])).toBe('spec.files[1]');
  });

  it('renders a leading index without a dot', () => {
    expect(formatPath([0, 'name'])).toBe('[0].name');
  });

  it('handles nested arrays', () => {
    expect(formatPath(['spec', 'steps', 2, 'with', 'key'])).toBe(
      'spec.steps[2].with.key',
    );
  });
});

describe('isRedactedPath', () => {
  it.each([
    'spec.env',
    'spec.env[0]',
    'spec.env[0].name',
    'spec.auth.tokenEnv',
    'spec.baseUrlEnv',
    'spec.env[1].secret',
  ])('treats %s as sensitive', (path) => {
    expect(isRedactedPath(path)).toBe(true);
  });

  it.each(['metadata.name', 'spec.files[0]', 'spec.entrypoint', 'spec.permissions'])(
    'treats %s as safe to echo',
    (path) => {
      expect(isRedactedPath(path)).toBe(false);
    },
  );
});

describe('toDiagnostics', () => {
  it('produces a diagnostic per issue with a dotted path', () => {
    const schema = z.object({ a: z.string(), b: z.number() });
    const result = schema.safeParse({ a: 1, b: 'x' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const diagnostics = toDiagnostics(result.error);

      expect(diagnostics).toHaveLength(2);
      expect(diagnostics.map((d) => d.path)).toEqual(['a', 'b']);
      expect(diagnostics.every((d) => d.severity === 'error')).toBe(true);
    }
  });

  it('orders diagnostics deterministically', () => {
    // Stable ordering keeps CI logs readable and makes assertions reliable.
    const schema = z.object({ z: z.string(), a: z.string(), m: z.string() });
    const result = schema.safeParse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toDiagnostics(result.error).map((d) => d.path)).toEqual(['a', 'm', 'z']);
    }
  });

  it('produces the same output for the same input across runs', () => {
    const schema = z.object({ a: z.string(), b: z.string() });
    const first = schema.safeParse({});
    const second = schema.safeParse({});

    if (!first.success && !second.success) {
      expect(toDiagnostics(first.error)).toEqual(toDiagnostics(second.error));
    }
  });

  it('adds a hint for a missing required field', () => {
    const result = z.object({ name: z.string() }).safeParse({});

    if (!result.success) {
      const [diagnostic] = toDiagnostics(result.error);
      expect(diagnostic?.hint).toContain('Add the required field');
    }
  });

  it('lists the valid options for an invalid enum value', () => {
    const result = z.object({ mode: z.enum(['a', 'b']) }).safeParse({ mode: 'c' });

    if (!result.success) {
      const [diagnostic] = toDiagnostics(result.error);
      expect(diagnostic?.hint).toContain('a, b');
    }
  });

  it('names the unknown keys for a strict object', () => {
    const result = z.object({ a: z.string() }).strict().safeParse({ a: 'x', bogus: 1 });

    if (!result.success) {
      const [diagnostic] = toDiagnostics(result.error);
      expect(diagnostic?.hint).toContain('bogus');
      expect(diagnostic?.hint).toContain('typo');
    }
  });

  it('reports the minimum for a too-short value', () => {
    const result = z.object({ a: z.string().min(5) }).safeParse({ a: 'ab' });

    if (!result.success) {
      const [diagnostic] = toDiagnostics(result.error);
      expect(diagnostic?.hint).toContain('5');
    }
  });

  it('reports the maximum for a too-long array', () => {
    const result = z.object({ a: z.array(z.string()).max(2) }).safeParse({
      a: ['x', 'y', 'z'],
    });

    if (!result.success) {
      const [diagnostic] = toDiagnostics(result.error);
      expect(diagnostic?.hint).toContain('items');
    }
  });
});

describe('secret redaction', () => {
  // A resource author might paste a real token where a variable *name* belongs.
  // If validation echoed the received value, the secret would reach logs and CI
  // output (SR-8).
  const SENTINEL = 'ghp_REALLOOKINGSECRETVALUE123456789';

  it('does not echo a value supplied to an env name field', () => {
    const result = validateManifest(
      manifestWithSpec({
        env: [{ name: SENTINEL, description: 'Pasted a value by mistake.' }],
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const serialized = JSON.stringify(result.diagnostics);
      expect(serialized).not.toContain(SENTINEL);
    }
  });

  it('does not echo a value supplied to tokenEnv', () => {
    const manifest = manifestWithSpec({});
    const result = validateManifest({
      ...manifest,
      kind: 'api',
      spec: {
        entrypoint: 'prompt.md',
        files: ['prompt.md', 'README.md'],
        protocol: 'rest',
        auth: { type: 'bearer', tokenEnv: SENTINEL },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(JSON.stringify(result.diagnostics)).not.toContain(SENTINEL);
    }
  });

  it('does not echo a value supplied to baseUrlEnv', () => {
    const result = validateManifest({
      ...manifestWithSpec({}),
      kind: 'api',
      spec: {
        entrypoint: 'prompt.md',
        files: ['prompt.md', 'README.md'],
        protocol: 'rest',
        baseUrlEnv: `https://user:${SENTINEL}@api.example.com`,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(JSON.stringify(result.diagnostics)).not.toContain(SENTINEL);
    }
  });

  it('substitutes a placeholder rather than dropping the message', () => {
    const schema = z.object({ tokenEnv: z.literal('EXPECTED') });
    const result = schema.safeParse({ tokenEnv: SENTINEL });

    expect(result.success).toBe(false);
    if (!result.success) {
      const [diagnostic] = toDiagnostics(result.error);
      expect(diagnostic?.message).not.toContain(SENTINEL);
      expect(diagnostic?.message).toContain(REDACTED_PLACEHOLDER);
    }
  });

  it('withholds hints on sensitive paths, since a hint may quote the input', () => {
    const schema = z.object({ tokenEnv: z.string().min(100) });
    const result = schema.safeParse({ tokenEnv: SENTINEL });

    if (!result.success) {
      expect(toDiagnostics(result.error)[0]?.hint).toBeUndefined();
    }
  });

  it('still echoes values on non-sensitive paths, which aids debugging', () => {
    const result = validateManifest(
      manifestWithSpec({ files: ['prompt.md', '../../escape'] }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((d) => d.path.includes('files'))).toBe(true);
    }
  });
});

describe('formatDiagnostics', () => {
  it('renders one line per diagnostic', () => {
    const output = formatDiagnostics([
      { severity: 'error', path: 'metadata.name', message: 'is required' },
      { severity: 'warning', path: 'metadata.tags', message: 'was normalized' },
    ]);

    expect(output.split('\n')).toHaveLength(2);
    expect(output).toContain('metadata.name');
    expect(output).toContain('metadata.tags');
  });

  it('renders a hint on a continuation line', () => {
    const output = formatDiagnostics([
      { severity: 'error', path: 'a', message: 'bad', hint: 'do this instead' },
    ]);

    expect(output.split('\n')).toHaveLength(2);
    expect(output).toContain('do this instead');
  });

  it('labels a document-level diagnostic', () => {
    const output = formatDiagnostics([
      { severity: 'error', path: '', message: 'not a mapping' },
    ]);

    expect(output).toContain('<document>');
  });

  it('renders an empty list as an empty string', () => {
    expect(formatDiagnostics([])).toBe('');
  });
});

describe('validate', () => {
  it('returns the parsed value on success', () => {
    const result = validate(z.object({ a: z.string() }), { a: 'x' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ a: 'x' });
    }
  });

  it('returns diagnostics instead of throwing on failure', () => {
    const result = validate(z.object({ a: z.string() }), {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics).toHaveLength(1);
    }
  });
});
