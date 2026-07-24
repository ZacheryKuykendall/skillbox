/**
 * @skillbox/cli — the presentation layer.
 *
 * Parses arguments, calls into `@skillbox/core`, renders the result, and returns
 * an exit code. Deliberately thin: a command handler that starts making
 * decisions is a signal the logic belongs in core (ADR-0001).
 */

export { EXIT_CODES, exitCodeFor } from './exit-codes.js';
export type { ExitCode } from './exit-codes.js';
export { createProgram, run } from './run.js';
export { CLI_VERSION } from './version.js';
