import { describe, expect, it } from 'vitest';

import { ERROR_CODES, SkillboxError, wrapError } from './errors.js';

describe('SkillboxError', () => {
  it('carries the code, message, location, hint, and details', () => {
    const error = new SkillboxError({
      code: 'INVALID_MANIFEST',
      message: 'The manifest is not valid.',
      location: 'registry/prompts/example/skillbox.yaml',
      hint: 'Run skillbox validate for detail.',
      details: ['metadata.name is required'],
    });

    expect(error.code).toBe('INVALID_MANIFEST');
    expect(error.message).toBe('The manifest is not valid.');
    expect(error.location).toBe('registry/prompts/example/skillbox.yaml');
    expect(error.hint).toBe('Run skillbox validate for detail.');
    expect(error.details).toEqual(['metadata.name is required']);
  });

  it('is an Error with a stack', () => {
    const error = new SkillboxError({ code: 'IO_ERROR', message: 'Read failed.' });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SkillboxError');
    expect(error.stack).toBeTruthy();
  });

  it('defaults details to an empty array', () => {
    const error = new SkillboxError({ code: 'IO_ERROR', message: 'Read failed.' });

    expect(error.details).toEqual([]);
    expect(error.location).toBeUndefined();
    expect(error.hint).toBeUndefined();
  });

  it('preserves a cause', () => {
    const cause = new Error('ENOENT');
    const error = new SkillboxError({
      code: 'IO_ERROR',
      message: 'Read failed.',
      cause,
    });

    expect(error.cause).toBe(cause);
  });

  describe('is', () => {
    it('recognizes its own instances', () => {
      expect(
        SkillboxError.is(new SkillboxError({ code: 'IO_ERROR', message: 'x' })),
      ).toBe(true);
    });

    it.each([
      ['a plain Error', new Error('nope')],
      ['a string', 'nope'],
      ['null', null],
      ['undefined', undefined],
      ['a plain object', { code: 'IO_ERROR' }],
    ])('rejects %s', (_label, value) => {
      expect(SkillboxError.is(value)).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('omits absent optional fields rather than emitting undefined', () => {
      const error = new SkillboxError({ code: 'IO_ERROR', message: 'Read failed.' });

      expect(error.toJSON()).toEqual({ code: 'IO_ERROR', message: 'Read failed.' });
    });

    it('includes optional fields when present', () => {
      const error = new SkillboxError({
        code: 'FILE_CONFLICT',
        message: 'Destination exists.',
        location: 'src/index.ts',
        hint: 'Pass --force to overwrite.',
        details: ['src/index.ts'],
      });

      expect(error.toJSON()).toEqual({
        code: 'FILE_CONFLICT',
        message: 'Destination exists.',
        location: 'src/index.ts',
        hint: 'Pass --force to overwrite.',
        details: ['src/index.ts'],
      });
    });

    it('survives JSON.stringify', () => {
      const error = new SkillboxError({
        code: 'RESOURCE_NOT_FOUND',
        message: 'Not found.',
      });

      expect(JSON.parse(JSON.stringify(error))).toEqual({
        code: 'RESOURCE_NOT_FOUND',
        message: 'Not found.',
      });
    });
  });
});

describe('wrapError', () => {
  it('passes an existing SkillboxError through unchanged', () => {
    // The original code and hint are more specific than anything the wrapping
    // boundary knows, so they must survive.
    const original = new SkillboxError({
      code: 'UNSAFE_PATH',
      message: 'Escapes the project.',
      hint: 'Use a relative path.',
    });

    const wrapped = wrapError(original, {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    });

    expect(wrapped).toBe(original);
    expect(wrapped.code).toBe('UNSAFE_PATH');
  });

  it('wraps a plain Error and keeps its message as a detail', () => {
    const cause = new Error('ENOENT: no such file');

    const wrapped = wrapError(cause, {
      code: 'IO_ERROR',
      message: 'Could not read the manifest.',
      location: 'skillbox.yaml',
      hint: 'Check the file exists.',
    });

    expect(wrapped.code).toBe('IO_ERROR');
    expect(wrapped.message).toBe('Could not read the manifest.');
    expect(wrapped.location).toBe('skillbox.yaml');
    expect(wrapped.hint).toBe('Check the file exists.');
    expect(wrapped.details).toEqual(['ENOENT: no such file']);
    expect(wrapped.cause).toBe(cause);
  });

  it('stringifies a non-Error thrown value', () => {
    const wrapped = wrapError('just a string', {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected failure.',
    });

    expect(wrapped.details).toEqual(['just a string']);
  });
});

describe('ERROR_CODES', () => {
  it('contains no duplicates', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it('uses SCREAMING_SNAKE_CASE for every code', () => {
    for (const code of ERROR_CODES) {
      expect(code).toMatch(/^[A-Z][A-Z_]*$/);
    }
  });
});
