import { MANIFEST_FILENAME } from '@skillbox/schema';
import { createTempDir, writeResource, type TempDir } from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  loadResource,
  loadResourceOrThrow,
  readResourceFiles,
} from './manifest-loader.js';

let dir: TempDir;

beforeEach(async () => {
  dir = await createTempDir();
});

afterEach(async () => {
  await dir.cleanup();
});

describe('loadResource', () => {
  it('loads a valid resource with its derived fields', async () => {
    const directory = await writeResource(dir, 'registry', {
      name: 'code-review',
      kind: 'prompt',
    });

    const result = await loadResource(dir.resolve(directory));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resource.identifier).toBe('skillbox/code-review@0.1.0');
      expect(result.resource.qualifiedName).toBe('skillbox/code-review');
      expect(result.resource.target).toBe('.skillbox/prompts/code-review');
      expect(result.resource.manifestPath).toContain(MANIFEST_FILENAME);
      expect(result.resource.warnings).toEqual([]);
    }
  });

  it('reports a missing manifest rather than throwing', async () => {
    // Returning a result lets catalog discovery continue past one bad resource.
    await dir.mkdir('empty-resource');

    const result = await loadResource(dir.resolve('empty-resource'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.diagnostics[0]?.message).toContain('Could not read');
      expect(result.failure.diagnostics[0]?.hint).toContain(MANIFEST_FILENAME);
    }
  });

  it('reports a nonexistent directory', async () => {
    const result = await loadResource(dir.resolve('does-not-exist'));

    expect(result.ok).toBe(false);
  });

  describe('malformed YAML', () => {
    it('reports a parse failure with the line and column', async () => {
      // "Invalid YAML" alone leaves a user hunting; a line number does not.
      await dir.write(
        `broken/${MANIFEST_FILENAME}`,
        [
          'apiVersion: skillbox.dev/v1alpha1',
          'kind: prompt',
          '  bad: indentation',
        ].join('\n'),
      );

      const result = await loadResource(dir.resolve('broken'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.diagnostics[0]?.message).toContain('Could not parse');
        expect(result.failure.diagnostics[0]?.message).toMatch(/line \d+/);
      }
    });

    it('hints about quoting version ranges', async () => {
      await dir.write(`broken/${MANIFEST_FILENAME}`, 'a: [unclosed');

      const result = await loadResource(dir.resolve('broken'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.diagnostics[0]?.hint).toContain('quoted');
      }
    });
  });

  it('reports a structurally invalid manifest', async () => {
    await dir.write(
      `invalid/${MANIFEST_FILENAME}`,
      ['apiVersion: skillbox.dev/v1alpha1', 'kind: prompt', 'metadata: {}'].join('\n'),
    );

    const result = await loadResource(dir.resolve('invalid'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.diagnostics.length).toBeGreaterThan(0);
      expect(
        result.failure.diagnostics.some((d) => d.path.startsWith('metadata')),
      ).toBe(true);
    }
  });

  it('reports an unsupported apiVersion as a single diagnostic', async () => {
    await dir.write(
      `wrong-version/${MANIFEST_FILENAME}`,
      ['apiVersion: skillbox.dev/v99', 'kind: prompt'].join('\n'),
    );

    const result = await loadResource(dir.resolve('wrong-version'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.diagnostics).toHaveLength(1);
      expect(result.failure.diagnostics[0]?.path).toBe('apiVersion');
    }
  });

  describe('filesystem checks', () => {
    it('reports a declared file that does not exist', async () => {
      await dir.write(
        `missing-file/${MANIFEST_FILENAME}`,
        [
          'apiVersion: skillbox.dev/v1alpha1',
          'kind: prompt',
          'metadata:',
          '  namespace: skillbox',
          '  name: missing-file',
          '  version: 0.1.0',
          '  description: A fixture whose declared file is absent from disk.',
          'spec:',
          '  entrypoint: entry.md',
          '  files:',
          '    - entry.md',
          '    - absent.md',
          '',
        ].join('\n'),
      );
      await dir.write('missing-file/entry.md', 'present');

      const result = await loadResource(dir.resolve('missing-file'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        const diagnostic = result.failure.diagnostics.find((d) =>
          d.message.includes('absent.md'),
        );
        expect(diagnostic?.message).toContain('does not exist');
        expect(diagnostic?.hint).toContain('remove it from spec.files');
      }
    });

    it('reports a declared file that is a directory', async () => {
      await dir.write(
        `directory-file/${MANIFEST_FILENAME}`,
        [
          'apiVersion: skillbox.dev/v1alpha1',
          'kind: prompt',
          'metadata:',
          '  namespace: skillbox',
          '  name: directory-file',
          '  version: 0.1.0',
          '  description: A fixture that declares a directory as one of its files.',
          'spec:',
          '  entrypoint: entry.md',
          '  files:',
          '    - entry.md',
          '    - subdir',
          '',
        ].join('\n'),
      );
      await dir.write('directory-file/entry.md', 'present');
      await dir.mkdir('directory-file/subdir');

      const result = await loadResource(dir.resolve('directory-file'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(
          result.failure.diagnostics.some((d) =>
            d.message.includes('not a regular file'),
          ),
        ).toBe(true);
      }
    });

    it('reports the index of the offending file', async () => {
      await dir.write(
        `indexed/${MANIFEST_FILENAME}`,
        [
          'apiVersion: skillbox.dev/v1alpha1',
          'kind: prompt',
          'metadata:',
          '  namespace: skillbox',
          '  name: indexed-resource',
          '  version: 0.1.0',
          '  description: A fixture used to check diagnostic path indices.',
          'spec:',
          '  entrypoint: entry.md',
          '  files:',
          '    - entry.md',
          '    - absent.md',
          '',
        ].join('\n'),
      );
      await dir.write('indexed/entry.md', 'present');

      const result = await loadResource(dir.resolve('indexed'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.diagnostics.some((d) => d.path === 'spec.files[1]')).toBe(
          true,
        );
      }
    });
  });
});

describe('loadResourceOrThrow', () => {
  it('returns the resource when valid', async () => {
    const directory = await writeResource(dir, 'registry', { name: 'code-review' });

    const resource = await loadResourceOrThrow(dir.resolve(directory));

    expect(resource.qualifiedName).toBe('skillbox/code-review');
  });

  it('throws with the diagnostics as details when invalid', async () => {
    await dir.write(`invalid/${MANIFEST_FILENAME}`, 'apiVersion: nope');

    try {
      await loadResourceOrThrow(dir.resolve('invalid'));
      expect.unreachable('should have thrown');
    } catch (error) {
      const skillboxError = error as {
        code: string;
        details: readonly string[];
        hint?: string;
      };
      expect(skillboxError.code).toBe('INVALID_MANIFEST');
      expect(skillboxError.details.length).toBeGreaterThan(0);
      expect(skillboxError.hint).toContain('skillbox validate');
    }
  });

  it('prefixes each detail with its field path', async () => {
    await dir.write(
      `invalid/${MANIFEST_FILENAME}`,
      ['apiVersion: skillbox.dev/v1alpha1', 'kind: prompt', 'metadata: {}'].join('\n'),
    );

    try {
      await loadResourceOrThrow(dir.resolve('invalid'));
      expect.unreachable('should have thrown');
    } catch (error) {
      const details = (error as { details: readonly string[] }).details;
      expect(details.some((detail) => detail.includes('metadata'))).toBe(true);
    }
  });
});

describe('readResourceFiles', () => {
  it('reads every declared file keyed by POSIX-relative path', async () => {
    const directory = await writeResource(dir, 'registry', {
      name: 'code-review',
      files: ['entry.md', 'README.md'],
      contents: { 'entry.md': 'entry body', 'README.md': 'readme body' },
    });

    const resource = await loadResourceOrThrow(dir.resolve(directory));
    const files = await readResourceFiles(resource);

    expect([...files.keys()].sort()).toEqual(['README.md', 'entry.md']);
    expect(files.get('entry.md')?.toString('utf8')).toBe('entry body');
  });

  it('uses forward slashes for nested paths on every platform', async () => {
    const directory = await writeResource(dir, 'registry', {
      name: 'nested-resource',
      entrypoint: 'src/deep/entry.md',
      files: ['src/deep/entry.md'],
    });

    const resource = await loadResourceOrThrow(dir.resolve(directory));
    const files = await readResourceFiles(resource);

    expect([...files.keys()]).toEqual(['src/deep/entry.md']);
  });

  it('wraps a read failure as an IO_ERROR naming the resource', async () => {
    const directory = await writeResource(dir, 'registry', {
      name: 'vanishing-resource',
      files: ['entry.md'],
      entrypoint: 'entry.md',
    });

    const resource = await loadResourceOrThrow(dir.resolve(directory));

    const { rm } = await import('node:fs/promises');
    await rm(dir.resolve(`${directory}/entry.md`));

    try {
      await readResourceFiles(resource);
      expect.unreachable('should have thrown');
    } catch (error) {
      const skillboxError = error as { code: string; message: string };
      expect(skillboxError.code).toBe('IO_ERROR');
      expect(skillboxError.message).toContain('skillbox/vanishing-resource');
    }
  });
});
