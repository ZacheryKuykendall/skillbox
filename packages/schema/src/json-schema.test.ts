import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { generateJsonSchemas, serializeJsonSchema } from './json-schema.js';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);
const schemasDirectory = path.join(repositoryRoot, 'schemas');

describe('generateJsonSchemas', () => {
  it('generates one artifact per configuration file', () => {
    expect(generateJsonSchemas().map((a) => a.filename)).toEqual([
      'resource-manifest.schema.json',
      'project-manifest.schema.json',
      'lockfile.schema.json',
    ]);
  });

  it('declares the draft and an identifier on every artifact', () => {
    for (const artifact of generateJsonSchemas()) {
      expect(artifact.schema.$schema).toBe(
        'https://json-schema.org/draft/2020-12/schema',
      );
      expect(artifact.schema.$id).toContain('skillbox.dev/v1alpha1');
      expect(artifact.schema.title).toBeTruthy();
      expect(artifact.schema.description).toContain('Generated from the Zod schemas');
    }
  });

  it('models the resource manifest as a choice between the seven kinds', () => {
    const [manifest] = generateJsonSchemas();
    const variants = manifest?.schema.oneOf;

    expect(Array.isArray(variants)).toBe(true);
    expect(variants as unknown[]).toHaveLength(7);
  });

  it('extracts reused definitions rather than inlining them seven times', () => {
    const [manifest] = generateJsonSchemas();

    expect(manifest?.schema.$defs).toBeDefined();
    // Inlining pushed the artifact past 70 kB, which is unreviewable in a diff.
    expect(serializeJsonSchema(manifest!).length).toBeLessThan(40_000);
  });

  it('is deterministic across calls', () => {
    const first = generateJsonSchemas().map(serializeJsonSchema);
    const second = generateJsonSchemas().map(serializeJsonSchema);

    expect(first).toEqual(second);
  });
});

describe('serializeJsonSchema', () => {
  it('ends with a single trailing newline', () => {
    const output = serializeJsonSchema(generateJsonSchemas()[0]!);

    expect(output.endsWith('}\n')).toBe(true);
    expect(output.endsWith('}\n\n')).toBe(false);
  });

  it('uses two-space indentation', () => {
    const output = serializeJsonSchema(generateJsonSchemas()[0]!);

    expect(output.split('\n')[1]).toMatch(/^ {2}"/);
  });

  it('produces parseable JSON', () => {
    for (const artifact of generateJsonSchemas()) {
      expect(() => {
        JSON.parse(serializeJsonSchema(artifact));
      }).not.toThrow();
    }
  });
});

describe('committed artifacts', () => {
  // Zod is the source of truth and these files are derived. Without this test the
  // two could disagree, and an editor would offer completion for a format the
  // validator no longer accepts (ADR-0002).
  it.each(generateJsonSchemas().map((a) => [a.filename, a] as const))(
    'schemas/%s matches the current schemas',
    async (filename, artifact) => {
      const committed = await readFile(path.join(schemasDirectory, filename), 'utf8');

      expect(
        committed,
        `schemas/${filename} is out of date. Run "pnpm schema:generate" and commit the result.`,
      ).toBe(serializeJsonSchema(artifact));
    },
  );
});
