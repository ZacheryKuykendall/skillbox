import { ERROR_CODES } from '@skillbox/core';
import { describe, expect, it } from 'vitest';

import { EXIT_CODES, exitCodeFor } from './exit-codes.js';

describe('EXIT_CODES', () => {
  it('reserves 0 for success', () => {
    expect(EXIT_CODES.SUCCESS).toBe(0);
  });

  it('matches the documented values', () => {
    // These are part of the CLI contract: scripts test the exit code rather than
    // parse output, so changing one is a breaking change.
    expect(EXIT_CODES).toEqual({
      SUCCESS: 0,
      GENERAL: 1,
      VALIDATION: 2,
      NOT_FOUND: 3,
      CONFLICT: 4,
      NOT_INITIALIZED: 5,
      DEPENDENCY: 6,
      USAGE: 7,
    });
  });
});

describe('exitCodeFor', () => {
  it('maps every error code to a non-zero exit status', () => {
    // A failure that exits 0 would be invisible to a script (FR-13.6).
    for (const code of ERROR_CODES) {
      expect(exitCodeFor(code)).toBeGreaterThan(0);
    }
  });

  it('maps every error code to a known exit status', () => {
    const known = new Set<number>(Object.values(EXIT_CODES));

    for (const code of ERROR_CODES) {
      expect(known.has(exitCodeFor(code))).toBe(true);
    }
  });

  it.each([
    ['VALIDATION_FAILED', EXIT_CODES.VALIDATION],
    ['RESOURCE_NOT_FOUND', EXIT_CODES.NOT_FOUND],
    ['VERSION_NOT_FOUND', EXIT_CODES.NOT_FOUND],
    ['FILE_CONFLICT', EXIT_CODES.CONFLICT],
    ['ALREADY_INITIALIZED', EXIT_CODES.CONFLICT],
    ['PROJECT_NOT_INITIALIZED', EXIT_CODES.NOT_INITIALIZED],
    ['CIRCULAR_DEPENDENCY', EXIT_CODES.DEPENDENCY],
    ['MISSING_DEPENDENCY', EXIT_CODES.DEPENDENCY],
    ['USAGE_ERROR', EXIT_CODES.USAGE],
    ['IO_ERROR', EXIT_CODES.GENERAL],
  ] as const)('maps %s to %i', (code, expected) => {
    expect(exitCodeFor(code)).toBe(expected);
  });
});
