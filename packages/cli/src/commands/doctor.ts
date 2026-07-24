import { runDoctor } from '@skillbox/core';

import type { CommandContext } from '../context.js';
import { EXIT_CODES, type ExitCode } from '../exit-codes.js';
import { pluralize } from '../output.js';

export interface DoctorCommandOptions {
  readonly strict?: boolean | undefined;
}

/**
 * `skillbox doctor` — diagnose the current project.
 *
 * Environment variables are reported by name only; no value is read (SR-7).
 */
export async function doctorCommand(
  context: CommandContext,
  options: DoctorCommandOptions = {},
): Promise<ExitCode> {
  const { writer } = context;

  const catalog = await context.catalog();
  const project = await context.project();

  const report = await runDoctor({ project, catalog });

  if (writer.isJson) {
    writer.json({
      ok: report.errors === 0,
      command: 'doctor',
      data: {
        healthy: report.healthy,
        errors: report.errors,
        warnings: report.warnings,
        checks: report.checks,
      },
    });
    return exitFor(report.errors, report.warnings, options.strict === true);
  }

  writer.line();
  writer.line(writer.style('bold', 'Skillbox doctor'));
  writer.line();

  for (const check of report.checks) {
    const label =
      check.status === 'ok'
        ? writer.style('green', 'ok   ')
        : check.status === 'warning'
          ? writer.style('yellow', 'warn ')
          : writer.style('red', 'error');

    writer.line(`  ${label}  ${check.message}`);

    for (const detail of check.details) {
      writer.line(`           ${writer.style('dim', detail)}`);
    }

    if (check.hint !== undefined && check.status !== 'ok') {
      writer.line(`           ${writer.style('cyan', check.hint)}`);
    }
  }

  writer.line();

  if (report.healthy) {
    writer.line(writer.style('green', 'No problems found.'));
  } else {
    const parts = [
      report.errors > 0 ? pluralize(report.errors, 'error') : undefined,
      report.warnings > 0 ? pluralize(report.warnings, 'warning') : undefined,
    ].filter((part): part is string => part !== undefined);

    writer.line(parts.join(', '));
  }

  writer.line();

  return exitFor(report.errors, report.warnings, options.strict === true);
}

function exitFor(errors: number, warnings: number, strict: boolean): ExitCode {
  if (errors > 0) return EXIT_CODES.GENERAL;
  if (strict && warnings > 0) return EXIT_CODES.VALIDATION;

  return EXIT_CODES.SUCCESS;
}
