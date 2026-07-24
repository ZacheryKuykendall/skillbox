/**
 * Tests for the component.
 *
 * Ship these with the component so a consumer inherits its coverage rather than
 * having to reconstruct it. Written for Vitest; the assertions translate to any
 * runner with minimal change.
 */
import { describe, expect, it } from 'vitest';

import { createTodo } from './index.js';

describe('createTodo', () => {
  it('TODO describes the happy path', () => {
    const todo = createTodo({ now: () => new Date('2026-01-01T00:00:00.000Z') });

    expect(todo.doSomething('input')).toBe('input at 2026-01-01T00:00:00.000Z');
  });

  it('TODO describes an edge case', () => {
    // Every new behavior needs at least one happy path and one edge case.
    const todo = createTodo({ now: () => new Date('2026-01-01T00:00:00.000Z') });

    expect(todo.doSomething('')).toBe(' at 2026-01-01T00:00:00.000Z');
  });

  it('TODO describes a failure path', () => {
    // The failure paths are where most real bugs live.
    expect(createTodo()).toBeDefined();
  });
});
