/**
 * Tests for the structured logger.
 *
 * Ships with the component so a consumer inherits its coverage rather than
 * having to reconstruct it. Written for Vitest; the assertions translate to any
 * runner with minimal change.
 */
import { describe, expect, it } from 'vitest';

import {
  createLogger,
  DEFAULT_REDACTED_FIELDS,
  LOG_LEVELS,
  REDACTED_PLACEHOLDER,
  type LogLevel,
} from './logger.js';

/** A logger that records the lines it would have written. */
function collecting(options: Parameters<typeof createLogger>[0] = {}) {
  const lines: { level: LogLevel; record: Record<string, unknown> }[] = [];

  const logger = createLogger({
    ...options,
    now: options.now ?? ((): Date => new Date('2026-01-01T00:00:00.000Z')),
    write: (line, level) => {
      lines.push({ level, record: JSON.parse(line) as Record<string, unknown> });
    },
  });

  return { logger, lines };
}

describe('createLogger', () => {
  it('emits one JSON object with time, level, and message', () => {
    const { logger, lines } = collecting();

    logger.info('server started');

    expect(lines).toHaveLength(1);
    expect(lines[0]?.record).toEqual({
      time: '2026-01-01T00:00:00.000Z',
      level: 'info',
      message: 'server started',
    });
  });

  it('includes supplied fields', () => {
    const { logger, lines } = collecting();

    logger.info('request handled', { method: 'GET', status: 200 });

    expect(lines[0]?.record).toMatchObject({ method: 'GET', status: 200 });
  });

  it('exposes every level', () => {
    const { logger, lines } = collecting({ level: 'debug' });

    for (const level of LOG_LEVELS) {
      logger[level](`a ${level} message`);
    }

    expect(lines.map((line) => line.level)).toEqual([...LOG_LEVELS]);
  });

  it('routes errors to stderr and everything else to stdout', () => {
    const { logger, lines } = collecting({ level: 'debug' });

    logger.error('failed');

    // The write callback receives the level so a caller can pick the stream.
    expect(lines[0]?.level).toBe('error');
  });
});

describe('level filtering', () => {
  it('suppresses levels below the threshold', () => {
    const { logger, lines } = collecting({ level: 'warn' });

    logger.debug('suppressed');
    logger.info('suppressed');
    logger.warn('emitted');
    logger.error('emitted');

    expect(lines.map((line) => line.level)).toEqual(['warn', 'error']);
  });

  it('defaults to info', () => {
    const { logger, lines } = collecting();

    logger.debug('suppressed');
    logger.info('emitted');

    expect(lines).toHaveLength(1);
  });

  it('reports whether a level is enabled, so callers can skip expensive work', () => {
    const { logger } = collecting({ level: 'warn' });

    expect(logger.isEnabled('debug')).toBe(false);
    expect(logger.isEnabled('info')).toBe(false);
    expect(logger.isEnabled('warn')).toBe(true);
    expect(logger.isEnabled('error')).toBe(true);
  });
});

describe('base fields', () => {
  it('attaches base fields to every line', () => {
    const { logger, lines } = collecting({ base: { service: 'billing' } });

    logger.info('first');
    logger.info('second');

    expect(lines.every((line) => line.record.service === 'billing')).toBe(true);
  });

  it('lets a per-call field override a base field', () => {
    const { logger, lines } = collecting({ base: { service: 'billing' } });

    logger.info('message', { service: 'override' });

    expect(lines[0]?.record.service).toBe('override');
  });
});

describe('child', () => {
  it('adds fields to every line from the child', () => {
    const { logger, lines } = collecting({ base: { service: 'billing' } });

    logger.child({ requestId: 'abc' }).info('handled');

    expect(lines[0]?.record).toMatchObject({ service: 'billing', requestId: 'abc' });
  });

  it('does not affect the parent', () => {
    const { logger, lines } = collecting();

    logger.child({ requestId: 'abc' }).info('child line');
    logger.info('parent line');

    expect(lines[0]?.record.requestId).toBe('abc');
    expect(lines[1]?.record.requestId).toBeUndefined();
  });

  it('nests', () => {
    const { logger, lines } = collecting();

    logger.child({ a: 1 }).child({ b: 2 }).info('nested');

    expect(lines[0]?.record).toMatchObject({ a: 1, b: 2 });
  });
});

describe('redaction', () => {
  // Deliberately not shaped like any real credential format. A fixture that
  // looks like a token trips secret scanners, including this repository's own.
  const SENTINEL = 'SENTINEL-VALUE-THAT-MUST-BE-REDACTED';

  it.each([...DEFAULT_REDACTED_FIELDS])('redacts %s by default', (field) => {
    const { logger, lines } = collecting();

    logger.info('message', { [field]: SENTINEL });

    expect(lines[0]?.record[field]).toBe(REDACTED_PLACEHOLDER);
    expect(JSON.stringify(lines[0]?.record)).not.toContain(SENTINEL);
  });

  it('matches field names case-insensitively', () => {
    const { logger, lines } = collecting();

    logger.info('message', { Authorization: SENTINEL, TOKEN: SENTINEL });

    expect(lines[0]?.record.Authorization).toBe(REDACTED_PLACEHOLDER);
    expect(lines[0]?.record.TOKEN).toBe(REDACTED_PLACEHOLDER);
  });

  it('redacts a nested field', () => {
    // This is how secrets actually reach logs: nested inside an object someone
    // logged casually. A shallow check would miss it.
    const { logger, lines } = collecting();

    logger.info('request', {
      request: { headers: { authorization: SENTINEL }, path: '/users' },
    });

    expect(JSON.stringify(lines[0]?.record)).not.toContain(SENTINEL);
    expect(JSON.stringify(lines[0]?.record)).toContain('/users');
  });

  it('redacts inside an array', () => {
    const { logger, lines } = collecting();

    logger.info('batch', { items: [{ token: SENTINEL }, { token: SENTINEL }] });

    expect(JSON.stringify(lines[0]?.record)).not.toContain(SENTINEL);
  });

  it('redacts a base field', () => {
    const { logger, lines } = collecting({ base: { token: SENTINEL } });

    logger.info('message');

    expect(JSON.stringify(lines[0]?.record)).not.toContain(SENTINEL);
  });

  it('redacts a field added through child', () => {
    const { logger, lines } = collecting();

    logger.child({ apikey: SENTINEL }).info('message');

    expect(JSON.stringify(lines[0]?.record)).not.toContain(SENTINEL);
  });

  it('accepts a custom list that replaces the defaults', () => {
    const { logger, lines } = collecting({ redact: ['customField'] });

    logger.info('message', { customField: SENTINEL, token: 'not-redacted-now' });

    expect(lines[0]?.record.customField).toBe(REDACTED_PLACEHOLDER);
    expect(lines[0]?.record.token).toBe('not-redacted-now');
  });

  it('extends the defaults when spread', () => {
    const { logger, lines } = collecting({
      redact: [...DEFAULT_REDACTED_FIELDS, 'customField'],
    });

    logger.info('message', { customField: SENTINEL, token: SENTINEL });

    expect(lines[0]?.record.customField).toBe(REDACTED_PLACEHOLDER);
    expect(lines[0]?.record.token).toBe(REDACTED_PLACEHOLDER);
  });

  it('leaves unredacted fields intact', () => {
    const { logger, lines } = collecting();

    logger.info('message', { userId: '42', path: '/users' });

    expect(lines[0]?.record).toMatchObject({ userId: '42', path: '/users' });
  });
});

describe('value handling', () => {
  it('serializes an Error with its name, message, and stack', () => {
    const { logger, lines } = collecting();

    logger.error('failed', { err: new Error('the cause') });

    expect(lines[0]?.record.err).toMatchObject({
      name: 'Error',
      message: 'the cause',
    });
  });

  it('serializes a bigint as a string rather than throwing', () => {
    // JSON.stringify throws on bigint, which would turn a log call into a crash.
    const { logger, lines } = collecting();

    logger.info('message', { count: 9007199254740993n });

    expect(lines[0]?.record.count).toBe('9007199254740993');
  });

  it('truncates a pathologically deep object rather than recursing forever', () => {
    const { logger, lines } = collecting();

    let deep: Record<string, unknown> = { end: true };
    for (let i = 0; i < 20; i += 1) deep = { nested: deep };

    expect(() => {
      logger.info('deep', deep);
    }).not.toThrow();
    expect(JSON.stringify(lines[0]?.record)).toContain('[truncated]');
  });

  it('preserves null', () => {
    const { logger, lines } = collecting();

    logger.info('message', { value: null });

    expect(lines[0]?.record.value).toBeNull();
  });

  it('handles no fields at all', () => {
    const { logger, lines } = collecting();

    logger.info('bare');

    expect(Object.keys(lines[0]?.record ?? {})).toEqual(['time', 'level', 'message']);
  });
});

describe('output format', () => {
  it('writes exactly one line per call', () => {
    const written: string[] = [];

    const logger = createLogger({
      write: (line) => {
        written.push(line);
      },
    });

    logger.info('one');
    logger.info('two');

    expect(written).toHaveLength(2);
    expect(written.every((line) => !line.includes('\n'))).toBe(true);
  });

  it('emits an ISO 8601 timestamp', () => {
    const { logger, lines } = collecting({
      now: () => new Date('2026-07-24T12:34:56.789Z'),
    });

    logger.info('message');

    expect(lines[0]?.record.time).toBe('2026-07-24T12:34:56.789Z');
  });
});
