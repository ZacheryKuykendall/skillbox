import { describe, expect, it } from 'vitest';

import { createWriter, pad, pluralize, shouldUseColor, table } from './output.js';

/** A writer with captured streams. */
function capture(options: Parameters<typeof createWriter>[0] = {}) {
  let stdout = '';
  let stderr = '';

  const writer = createWriter({
    ...options,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    isTty: options.isTty ?? false,
    env: options.env ?? {},
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

describe('shouldUseColor', () => {
  it('is on for a TTY with no overrides', () => {
    expect(shouldUseColor({ isTty: true, env: {} })).toBe(true);
  });

  it('is off when output is not a TTY, so piped output stays clean', () => {
    expect(shouldUseColor({ isTty: false, env: {} })).toBe(false);
  });

  it('is off when NO_COLOR is set, even on a TTY', () => {
    // NO_COLOR takes precedence over everything, per no-color.org.
    expect(shouldUseColor({ isTty: true, env: { NO_COLOR: '1' } })).toBe(false);
  });

  it('ignores an empty NO_COLOR', () => {
    expect(shouldUseColor({ isTty: true, env: { NO_COLOR: '' } })).toBe(true);
  });

  it('honors an explicit false even on a TTY', () => {
    expect(shouldUseColor({ explicit: false, isTty: true, env: {} })).toBe(false);
  });

  it('honors an explicit true even without a TTY', () => {
    expect(shouldUseColor({ explicit: true, isTty: false, env: {} })).toBe(true);
  });

  it('lets NO_COLOR override an explicit true', () => {
    expect(
      shouldUseColor({ explicit: true, isTty: true, env: { NO_COLOR: '1' } }),
    ).toBe(false);
  });
});

describe('createWriter', () => {
  it('writes lines to stdout with a newline', () => {
    // Kept as an object rather than destructured, so the live getter is read.
    const captured = capture();
    captured.writer.line('hello');

    expect(captured.stdout).toBe('hello\n');
  });

  it('writes an empty line with no argument', () => {
    const captured = capture();
    captured.writer.line();

    expect(captured.stdout).toBe('\n');
  });

  it('writes error lines to stderr', () => {
    const captured = capture();
    captured.writer.errorLine('problem');

    expect(captured.stderr).toBe('problem\n');
    expect(captured.stdout).toBe('');
  });

  it('applies no styling when color is off', () => {
    const { writer } = capture({ color: false });

    expect(writer.style('red', 'text')).toBe('text');
  });

  it('applies styling when color is on, even for a non-TTY stream', () => {
    // The color decision is made by shouldUseColor, so an explicit --color must
    // win rather than being re-gated by styleText's own stream check.
    const { writer } = capture({ color: true });
    const styled = writer.style('red', 'text');

    expect(styled).not.toBe('text');
    expect(styled).toContain('text');
    expect(styled).toContain('\u001b[31m');
  });

  describe('JSON mode', () => {
    it('suppresses human-readable lines', () => {
      // stdout carries exactly one document, so text lines must not interleave.
      const captured = capture({ json: true });
      captured.writer.line('should not appear');

      expect(captured.stdout).toBe('');
    });

    it('still writes error lines to stderr', () => {
      const captured = capture({ json: true });
      captured.writer.errorLine('diagnostic');

      expect(captured.stderr).toBe('diagnostic\n');
    });

    it('emits the JSON document', () => {
      const captured = capture({ json: true });
      captured.writer.json({ ok: true });

      expect(JSON.parse(captured.stdout)).toEqual({ ok: true });
    });

    it('reports isJson', () => {
      expect(capture({ json: true }).writer.isJson).toBe(true);
      expect(capture().writer.isJson).toBe(false);
    });
  });

  it('does not emit JSON outside JSON mode', () => {
    const captured = capture();
    captured.writer.json({ ok: true });

    expect(captured.stdout).toBe('');
  });
});

describe('pad', () => {
  it('pads to the requested width', () => {
    expect(pad('ab', 5)).toBe('ab   ');
  });

  it('leaves text longer than the width unchanged', () => {
    expect(pad('abcdef', 3)).toBe('abcdef');
  });

  it('leaves text exactly at the width unchanged', () => {
    expect(pad('abc', 3)).toBe('abc');
  });
});

describe('table', () => {
  it('returns nothing for no rows', () => {
    expect(table([])).toEqual([]);
  });

  it('aligns columns to their widest content', () => {
    expect(
      table([
        ['a', 'x'],
        ['bbbb', 'y'],
      ]),
    ).toEqual(['a     x', 'bbbb  y']);
  });

  it('does not pad the final column, so there is no trailing whitespace', () => {
    for (const line of table([
      ['a', 'x'],
      ['bbbb', 'yyyy'],
    ])) {
      expect(line).toBe(line.trimEnd());
    }
  });

  it('handles rows of differing length', () => {
    expect(table([['a', 'b', 'c'], ['d']])).toEqual(['a  b  c', 'd']);
  });

  it('handles a single column', () => {
    expect(table([['one'], ['two']])).toEqual(['one', 'two']);
  });
});

describe('pluralize', () => {
  it('uses the singular for one', () => {
    expect(pluralize(1, 'resource')).toBe('1 resource');
  });

  it('uses the plural for zero', () => {
    expect(pluralize(0, 'resource')).toBe('0 resources');
  });

  it('uses the plural for many', () => {
    expect(pluralize(3, 'resource')).toBe('3 resources');
  });

  it('accepts an irregular plural', () => {
    expect(pluralize(2, 'entry', 'entries')).toBe('2 entries');
    expect(pluralize(1, 'entry', 'entries')).toBe('1 entry');
  });
});
