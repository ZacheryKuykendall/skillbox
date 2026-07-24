import { describe, expect, it } from 'vitest';

import {
  isTextPath,
  referencedVariables,
  substituteInFile,
  substituteVariables,
} from './variables.js';

const CONTEXT = { location: 'entry.md' };

describe('isTextPath', () => {
  it.each([
    'entry.md',
    'README.markdown',
    'notes.txt',
    'config.yaml',
    'config.yml',
    'data.json',
    'client.ts',
    'component.tsx',
    'script.mjs',
    'run.py',
    'setup.sh',
    'setup.ps1',
    'UPPER.MD',
  ])('treats %s as text', (filePath) => {
    expect(isTextPath(filePath)).toBe(true);
  });

  it.each([
    'logo.png',
    'archive.zip',
    'font.woff2',
    'binary.bin',
    'Makefile',
    'LICENSE',
  ])('treats %s as non-text', (filePath) => {
    expect(isTextPath(filePath)).toBe(false);
  });
});

describe('referencedVariables', () => {
  it('finds a single reference', () => {
    expect(referencedVariables('Hello {{skillbox.name}}')).toEqual(['name']);
  });

  it('finds several references in order of first appearance', () => {
    expect(referencedVariables('{{skillbox.b-var}} {{skillbox.a-var}}')).toEqual([
      'b-var',
      'a-var',
    ]);
  });

  it('deduplicates repeated references', () => {
    expect(referencedVariables('{{skillbox.name}} {{skillbox.name}}')).toEqual([
      'name',
    ]);
  });

  it('tolerates whitespace inside the braces', () => {
    expect(referencedVariables('{{ skillbox.name }}')).toEqual(['name']);
  });

  it('ignores a placeholder without the skillbox namespace', () => {
    // Namespacing means a resource can ship a genuine handlebars template
    // without Skillbox interfering with it.
    expect(referencedVariables('{{name}} {{other.name}}')).toEqual([]);
  });

  it('returns an empty list for text with no placeholders', () => {
    expect(referencedVariables('plain text')).toEqual([]);
  });
});

describe('substituteVariables', () => {
  it('replaces a declared variable', () => {
    expect(
      substituteVariables(
        'Service: {{skillbox.service-name}}',
        { 'service-name': 'billing' },
        CONTEXT,
      ),
    ).toBe('Service: billing');
  });

  it('replaces every occurrence', () => {
    expect(
      substituteVariables(
        '{{skillbox.name}}/{{skillbox.name}}',
        { name: 'x' },
        CONTEXT,
      ),
    ).toBe('x/x');
  });

  it('replaces several distinct variables', () => {
    expect(
      substituteVariables(
        '{{skillbox.first}} and {{skillbox.second}}',
        { first: 'a', second: 'b' },
        CONTEXT,
      ),
    ).toBe('a and b');
  });

  it('leaves text without placeholders unchanged', () => {
    expect(substituteVariables('plain text', { name: 'x' }, CONTEXT)).toBe(
      'plain text',
    );
  });

  it('leaves a non-namespaced placeholder alone', () => {
    expect(substituteVariables('{{name}}', { name: 'x' }, CONTEXT)).toBe('{{name}}');
  });

  it('fails on an undeclared reference rather than substituting empty', () => {
    // An empty string would surface as a confusing failure much later.
    expect(() => substituteVariables('{{skillbox.missing}}', {}, CONTEXT)).toThrowError(
      expect.objectContaining({ code: 'UNDECLARED_VARIABLE' }),
    );
  });

  it('names every undeclared variable', () => {
    try {
      substituteVariables('{{skillbox.one}} {{skillbox.two}}', {}, CONTEXT);
      expect.unreachable('should have thrown');
    } catch (error) {
      const skillboxError = error as { message: string; details: readonly string[] };
      expect(skillboxError.message).toContain('one');
      expect(skillboxError.message).toContain('two');
      expect(skillboxError.details).toEqual(['{{skillbox.one}}', '{{skillbox.two}}']);
    }
  });

  it('reports the file location and how to fix it', () => {
    try {
      substituteVariables('{{skillbox.missing}}', {}, { location: 'src/client.ts' });
      expect.unreachable('should have thrown');
    } catch (error) {
      const skillboxError = error as { location?: string; hint?: string };
      expect(skillboxError.location).toBe('src/client.ts');
      expect(skillboxError.hint).toContain('spec.variables');
    }
  });

  it('uses singular wording for one missing variable', () => {
    expect(() => substituteVariables('{{skillbox.one}}', {}, CONTEXT)).toThrow(
      /a project variable that is not declared/,
    );
  });
});

describe('substituteInFile', () => {
  it('substitutes into a text file', () => {
    const result = substituteInFile(
      'entry.md',
      Buffer.from('Name: {{skillbox.name}}', 'utf8'),
      { name: 'value' },
    );

    expect(result.toString('utf8')).toBe('Name: value');
  });

  it('returns a binary file untouched', () => {
    // Rewriting bytes that happen to match the pattern would corrupt the file.
    const original = Buffer.from([0x00, 0x01, 0x02, 0xff]);

    expect(substituteInFile('logo.png', original, { name: 'x' })).toBe(original);
  });

  it('skips work entirely when no variables are declared', () => {
    const original = Buffer.from('{{skillbox.name}}', 'utf8');

    // Returning the same buffer proves no copy was made.
    expect(substituteInFile('entry.md', original, {})).toBe(original);
  });

  it('returns the same buffer when a text file has no placeholders', () => {
    const original = Buffer.from('no placeholders here', 'utf8');

    expect(substituteInFile('entry.md', original, { name: 'x' })).toBe(original);
  });

  it('propagates an undeclared variable error with the file path', () => {
    expect(() =>
      substituteInFile('src/client.ts', Buffer.from('{{skillbox.missing}}', 'utf8'), {
        other: 'x',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'UNDECLARED_VARIABLE',
        location: 'src/client.ts',
      }),
    );
  });

  it('does not substitute environment values, only project variables', () => {
    // Project variables are configuration; secrets come from the environment and
    // never enter a Skillbox artifact (SR-7).
    const contents = Buffer.from('Token: {{skillbox.token}}', 'utf8');

    expect(() =>
      substituteInFile('entry.md', contents, { 'other-var': 'x' }),
    ).toThrow();
  });
});
