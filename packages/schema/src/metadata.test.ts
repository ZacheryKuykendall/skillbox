import { describe, expect, it } from 'vitest';

import { deprecationSchema, metadataSchema, tagsSchema } from './metadata.js';

const base = {
  namespace: 'skillbox',
  name: 'code-review',
  version: '0.1.0',
  description: 'Reviews a code change and produces actionable findings.',
};

describe('metadataSchema', () => {
  it('accepts the minimum required fields', () => {
    expect(metadataSchema.safeParse(base).success).toBe(true);
  });

  it('accepts every optional field', () => {
    expect(
      metadataSchema.safeParse({
        ...base,
        tags: ['development'],
        license: 'MIT',
        homepage: 'https://example.com/code-review',
        deprecated: { reason: 'Superseded.', replacement: 'skillbox/other-resource' },
      }).success,
    ).toBe(true);
  });

  it.each(['namespace', 'name', 'version', 'description'])('requires %s', (field) => {
    const manifest: Record<string, unknown> = { ...base };
    delete manifest[field];

    expect(metadataSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects an unknown field', () => {
    expect(metadataSchema.safeParse({ ...base, author: 'someone' }).success).toBe(
      false,
    );
  });

  describe('description', () => {
    it('rejects one that is too short to be useful in search results', () => {
      const result = metadataSchema.safeParse({ ...base, description: 'short' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('search results');
      }
    });

    it('rejects one that exceeds 200 characters', () => {
      expect(
        metadataSchema.safeParse({ ...base, description: 'a'.repeat(201) }).success,
      ).toBe(false);
    });

    it('accepts exactly 200 characters', () => {
      expect(
        metadataSchema.safeParse({ ...base, description: 'a'.repeat(200) }).success,
      ).toBe(true);
    });

    it('rejects a multi-line description', () => {
      const result = metadataSchema.safeParse({
        ...base,
        description: 'A description\nspanning two lines.',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('single line'))).toBe(
          true,
        );
      }
    });
  });

  describe('homepage', () => {
    it.each(['https://example.com', 'http://example.com/path?query=1'])(
      'accepts %s',
      (homepage) => {
        expect(metadataSchema.safeParse({ ...base, homepage }).success).toBe(true);
      },
    );

    it.each([
      ['example.com', 'there is no scheme'],
      ['ftp://example.com', 'the scheme is not http or https'],
      ['file:///etc/passwd', 'a file URL is not a homepage'],
      ['javascript:alert(1)', 'a javascript URL is not a homepage'],
      ['not a url at all', 'it is not parseable as a URL'],
      ['', 'it is empty'],
    ])('rejects %s because %s', (homepage) => {
      expect(metadataSchema.safeParse({ ...base, homepage }).success).toBe(false);
    });

    it('explains the accepted schemes', () => {
      const result = metadataSchema.safeParse({
        ...base,
        homepage: 'ftp://example.com',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('http or https');
      }
    });
  });

  describe('license', () => {
    it('accepts an SPDX expression', () => {
      expect(metadataSchema.safeParse({ ...base, license: 'Apache-2.0' }).success).toBe(
        true,
      );
    });

    it('rejects an empty license', () => {
      expect(metadataSchema.safeParse({ ...base, license: '' }).success).toBe(false);
    });
  });
});

describe('tagsSchema', () => {
  it('accepts a list of identifiers', () => {
    expect(tagsSchema.safeParse(['development', 'code-review']).success).toBe(true);
  });

  it('accepts an empty list', () => {
    expect(tagsSchema.safeParse([]).success).toBe(true);
  });

  it('deduplicates while preserving first-seen order', () => {
    const result = tagsSchema.safeParse(['b-tag', 'a-tag', 'b-tag']);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(['b-tag', 'a-tag']);
    }
  });

  it('rejects more than ten tags', () => {
    const result = tagsSchema.safeParse(
      Array.from({ length: 11 }, (_, i) => `tag-${String(i)}`),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('10');
    }
  });

  it('accepts exactly ten tags', () => {
    expect(
      tagsSchema.safeParse(Array.from({ length: 10 }, (_, i) => `tag-${String(i)}`))
        .success,
    ).toBe(true);
  });

  it('rejects a tag that is not a valid identifier', () => {
    expect(tagsSchema.safeParse(['Development']).success).toBe(false);
  });

  it('reports the index of the offending tag', () => {
    const result = tagsSchema.safeParse(['ok-tag', 'Bad_Tag']);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual([1]);
    }
  });
});

describe('deprecationSchema', () => {
  it('accepts a reason alone', () => {
    expect(
      deprecationSchema.safeParse({ reason: 'No longer maintained.' }).success,
    ).toBe(true);
  });

  it('accepts a reason with a replacement', () => {
    expect(
      deprecationSchema.safeParse({
        reason: 'Superseded.',
        replacement: 'skillbox/other-resource',
      }).success,
    ).toBe(true);
  });

  it('requires a reason', () => {
    expect(deprecationSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an empty reason', () => {
    expect(deprecationSchema.safeParse({ reason: '' }).success).toBe(false);
  });

  it('rejects a replacement that is not a qualified name', () => {
    expect(
      deprecationSchema.safeParse({ reason: 'Superseded.', replacement: 'other' })
        .success,
    ).toBe(false);
  });

  it('rejects a replacement carrying a version', () => {
    expect(
      deprecationSchema.safeParse({
        reason: 'Superseded.',
        replacement: 'skillbox/other@1.0.0',
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown field', () => {
    expect(
      deprecationSchema.safeParse({ reason: 'Superseded.', since: '0.2.0' }).success,
    ).toBe(false);
  });
});
