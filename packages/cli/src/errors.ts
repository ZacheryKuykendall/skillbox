import { SkillboxError } from '@skillbox/core';

import { EXIT_CODES, exitCodeFor, type ExitCode } from './exit-codes.js';
import type { Writer } from './output.js';

/**
 * Rendering user-facing errors.
 *
 * One renderer for every failure, so error output is consistent and no path can
 * accidentally print a secret value (SR-8).
 */

/** Render an error and return the exit code to use. */
export function renderError(writer: Writer, error: unknown, command: string): ExitCode {
  if (SkillboxError.is(error)) {
    if (writer.isJson) {
      writer.json({ ok: false, command, error: error.toJSON() });
    } else {
      writer.errorLine();
      writer.errorLine(`${writer.style('red', 'error')}  ${error.message}`);

      if (error.location !== undefined) {
        writer.errorLine(`       ${writer.style('dim', error.location)}`);
      }

      for (const detail of error.details) {
        writer.errorLine(`       ${writer.style('dim', detail)}`);
      }

      if (error.hint !== undefined) {
        writer.errorLine();
        writer.errorLine(`${writer.style('cyan', 'hint')}   ${error.hint}`);
      }

      writer.errorLine();
    }

    return exitCodeFor(error.code);
  }

  // An unexpected error is a bug. Report it plainly rather than pretending it is
  // a user error, and include the stack so it can be diagnosed.
  const message = error instanceof Error ? error.message : String(error);

  if (writer.isJson) {
    writer.json({
      ok: false,
      command,
      error: {
        code: 'INTERNAL_ERROR',
        message,
        hint: 'This is unexpected. Please report it with the command you ran.',
      },
    });
  } else {
    writer.errorLine();
    writer.errorLine(`${writer.style('red', 'error')}  ${message}`);
    writer.errorLine();
    writer.errorLine(
      `${writer.style('cyan', 'hint')}   This is unexpected. Please report it with the command you ran.`,
    );

    if (error instanceof Error && error.stack !== undefined) {
      writer.errorLine();
      writer.errorLine(writer.style('dim', error.stack));
    }

    writer.errorLine();
  }

  return EXIT_CODES.GENERAL;
}
