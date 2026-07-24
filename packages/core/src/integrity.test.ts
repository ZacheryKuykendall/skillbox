import { createTempDir, type TempDir } from '@skillbox/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  aggregateDigest,
  digestOf,
  digestOfFile,
  digestsMatch,
  isDigest,
} from './integrity.js';

let dir: TempDir;

beforeEach(async () => {
  dir = await createTempDir();
});

afterEach(async () => {
  await dir.cleanup();
});

describe('digestOf', () => {
  it('produces an SRI-style sha256 digest', () => {
    expect(digestOf('')).toBe('sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=');
  });

  it('is stable for identical input', () => {
    expect(digestOf('hello')).toBe(digestOf('hello'));
  });

  it('differs for different input', () => {
    expect(digestOf('hello')).not.toBe(digestOf('world'));
  });

  it('detects a single-character change', () => {
    expect(digestOf('hello')).not.toBe(digestOf('hellp'));
  });

  it('accepts a buffer and matches the equivalent string', () => {
    expect(digestOf(Buffer.from('hello', 'utf8'))).toBe(digestOf('hello'));
  });

  it('produces a value that isDigest accepts', () => {
    expect(isDigest(digestOf('anything'))).toBe(true);
  });
});

describe('digestOfFile', () => {
  it('matches the digest of the file contents', async () => {
    await dir.write('file.txt', 'file contents');

    expect(await digestOfFile(dir.resolve('file.txt'))).toBe(digestOf('file contents'));
  });

  it('rejects when the file does not exist', async () => {
    await expect(digestOfFile(dir.resolve('absent.txt'))).rejects.toThrow();
  });

  it('changes when the file is edited', async () => {
    await dir.write('file.txt', 'before');
    const before = await digestOfFile(dir.resolve('file.txt'));

    await dir.write('file.txt', 'after');

    expect(await digestOfFile(dir.resolve('file.txt'))).not.toBe(before);
  });
});

describe('aggregateDigest', () => {
  it('is stable for the same file set', () => {
    const files = { 'a.md': digestOf('a'), 'b.md': digestOf('b') };

    expect(aggregateDigest(files)).toBe(aggregateDigest(files));
  });

  it('ignores insertion order', () => {
    // Discovery order must not change the digest, or lockfiles would churn.
    const forward = { 'a.md': digestOf('a'), 'b.md': digestOf('b') };
    const reverse = { 'b.md': digestOf('b'), 'a.md': digestOf('a') };

    expect(aggregateDigest(forward)).toBe(aggregateDigest(reverse));
  });

  it('changes when a file changes', () => {
    const before = aggregateDigest({ 'a.md': digestOf('a') });
    const after = aggregateDigest({ 'a.md': digestOf('a-modified') });

    expect(before).not.toBe(after);
  });

  it('changes when a file is added', () => {
    const before = aggregateDigest({ 'a.md': digestOf('a') });
    const after = aggregateDigest({ 'a.md': digestOf('a'), 'b.md': digestOf('b') });

    expect(before).not.toBe(after);
  });

  it('changes when a file is renamed, even with identical contents', () => {
    // The path is hashed alongside the digest, so a rename is visible.
    const before = aggregateDigest({ 'a.md': digestOf('same') });
    const after = aggregateDigest({ 'b.md': digestOf('same') });

    expect(before).not.toBe(after);
  });

  it('is not fooled by concatenation ambiguity between path and digest', () => {
    // A delimiter separates each path from its digest; without one, {"ab": "c"}
    // and {"a": "bc"} could hash identically.
    expect(aggregateDigest({ ab: 'c' })).not.toBe(aggregateDigest({ a: 'bc' }));
  });

  it('handles an empty file set', () => {
    expect(isDigest(aggregateDigest({}))).toBe(true);
  });
});

describe('isDigest', () => {
  it.each([digestOf(''), digestOf('x')])('accepts %s', (value) => {
    expect(isDigest(value)).toBe(true);
  });

  it.each([
    ['47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=', 'the prefix is missing'],
    ['sha256-short', 'the digest is too short'],
    ['md5-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=', 'the algorithm is wrong'],
    ['', 'the value is empty'],
    ['sha256-', 'there is no digest'],
  ])('rejects %s because %s', (value) => {
    expect(isDigest(value)).toBe(false);
  });
});

describe('digestsMatch', () => {
  it('reports identical digests as matching', () => {
    expect(digestsMatch(digestOf('x'), digestOf('x'))).toBe(true);
  });

  it('reports different digests as not matching', () => {
    expect(digestsMatch(digestOf('x'), digestOf('y'))).toBe(false);
  });
});
