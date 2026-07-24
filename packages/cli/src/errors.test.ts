import { SkillboxError } from '@skillbox/core';
import { describe, expect, it } from 'vitest';

import { renderError } from './errors.js';
import { EXIT_CODES } from './exit-codes.js';
import { createWriter } from './output.js';

function capture(json = false) {
  let stdout = '';
  let stderr = '';

  const writer = createWriter({
    json,
    color: false,
    env: {},
    isTty: false,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });

  return {
    writer,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
  };
}

describe('renderError', () => {
  describe('text output', () => {
    it('writes the message to stderr', () => {
      const captured = capture();

      renderError(
        captured.writer,
        new SkillboxError({ code: 'IO_ERROR', message: 'Something failed.' }),
        'add',
      );

      expect(captured.stderr).toContain('Something failed.');
      expect(captured.stderr).toContain('error');
      expect(captured.stdout).toBe('');
    });

    it('includes the location when present', () => {
      const captured = capture();

      renderError(
        captured.writer,
        new SkillboxError({
          code: 'INVALID_MANIFEST',
          message: 'Invalid.',
          location: 'registry/prompts/x/skillbox.yaml',
        }),
        'validate',
      );

      expect(captured.stderr).toContain('registry/prompts/x/skillbox.yaml');
    });

    it('lists every detail', () => {
      const captured = capture();

      renderError(
        captured.writer,
        new SkillboxError({
          code: 'FILE_CONFLICT',
          message: 'Conflicts found.',
          details: ['first.md', 'second.md'],
        }),
        'add',
      );

      expect(captured.stderr).toContain('first.md');
      expect(captured.stderr).toContain('second.md');
    });

    it('shows the hint, since that is what makes an error actionable', () => {
      const captured = capture();

      renderError(
        captured.writer,
        new SkillboxError({
          code: 'FILE_CONFLICT',
          message: 'Conflicts found.',
          hint: 'Pass --force to overwrite.',
        }),
        'add',
      );

      expect(captured.stderr).toContain('hint');
      expect(captured.stderr).toContain('Pass --force to overwrite.');
    });

    it('omits the hint section when there is no hint', () => {
      const captured = capture();

      renderError(
        captured.writer,
        new SkillboxError({ code: 'IO_ERROR', message: 'Failed.' }),
        'add',
      );

      expect(captured.stderr).not.toContain('hint');
    });

    it('returns the exit code mapped from the error code', () => {
      const captured = capture();

      expect(
        renderError(
          captured.writer,
          new SkillboxError({ code: 'RESOURCE_NOT_FOUND', message: 'Missing.' }),
          'inspect',
        ),
      ).toBe(EXIT_CODES.NOT_FOUND);
    });
  });

  describe('JSON output', () => {
    it('emits a machine-readable error document on stdout', () => {
      const captured = capture(true);

      renderError(
        captured.writer,
        new SkillboxError({
          code: 'RESOURCE_NOT_FOUND',
          message: 'Not found.',
          hint: 'Run skillbox search.',
        }),
        'inspect',
      );

      expect(JSON.parse(captured.stdout)).toEqual({
        ok: false,
        command: 'inspect',
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Not found.',
          hint: 'Run skillbox search.',
        },
      });
    });

    it('writes nothing to stderr in JSON mode', () => {
      const captured = capture(true);

      renderError(
        captured.writer,
        new SkillboxError({ code: 'IO_ERROR', message: 'Failed.' }),
        'add',
      );

      expect(captured.stderr).toBe('');
    });

    it('returns the same exit code as text mode', () => {
      const captured = capture(true);

      expect(
        renderError(
          captured.writer,
          new SkillboxError({
            code: 'PROJECT_NOT_INITIALIZED',
            message: 'No project.',
          }),
          'list',
        ),
      ).toBe(EXIT_CODES.NOT_INITIALIZED);
    });
  });

  describe('unexpected errors', () => {
    it('reports a plain Error as an internal error', () => {
      // An unexpected error is a bug, not a user mistake, and should say so.
      const captured = capture();

      const code = renderError(captured.writer, new Error('boom'), 'add');

      expect(code).toBe(EXIT_CODES.GENERAL);
      expect(captured.stderr).toContain('boom');
      expect(captured.stderr).toContain('unexpected');
    });

    it('includes the stack so a bug can be diagnosed', () => {
      const captured = capture();

      renderError(captured.writer, new Error('boom'), 'add');

      expect(captured.stderr).toContain('at ');
    });

    it('handles a thrown non-Error value', () => {
      const captured = capture();

      const code = renderError(captured.writer, 'just a string', 'add');

      expect(code).toBe(EXIT_CODES.GENERAL);
      expect(captured.stderr).toContain('just a string');
    });

    it('emits an INTERNAL_ERROR document in JSON mode', () => {
      const captured = capture(true);

      renderError(captured.writer, new Error('boom'), 'add');

      expect(JSON.parse(captured.stdout)).toMatchObject({
        ok: false,
        command: 'add',
        error: { code: 'INTERNAL_ERROR', message: 'boom' },
      });
    });

    it('does not include a stack in JSON output', () => {
      const captured = capture(true);

      renderError(captured.writer, new Error('boom'), 'add');

      expect(captured.stdout).not.toContain('at ');
    });
  });
});
