import path from 'node:path';

import { validateDirectory, type ValidationReport } from '@skillbox/core';

import type { CommandContext } from '../context.js';
import { EXIT_CODES, type ExitCode } from '../exit-codes.js';
import { pluralize } from '../output.js';

export interface ValidateCommandOptions {
  readonly strict?: boolean | undefined;
}

/**
 * `skillbox validate [path]` — validate resources.
 *
 * With no path, validates the catalog. With a path, validates that resource or
 * every resource beneath it.
 */
export async function validateCommand(
  context: CommandContext,
  target: string | undefined,
  options: ValidateCommandOptions = {},
): Promise<ExitCode> {
  const { writer } = context;

  const catalog = await context.catalog();
  const directory =
    target === undefined ? catalog.root : path.resolve(context.cwd, target);

  const report = await validateDirectory({ directory, catalog });

  if (writer.isJson) {
    writer.json({
      ok: report.ok && !(options.strict === true && report.warnings > 0),
      command: 'validate',
      data: {
        directory,
        errors: report.errors,
        warnings: report.warnings,
        targets: report.targets,
      },
    });
    return exitFor(report, options.strict === true);
  }

  writer.line();

  const withFindings = report.targets.filter((entry) => entry.diagnostics.length > 0);

  for (const entry of withFindings) {
    writer.line(writer.style('bold', relativeTo(context.cwd, entry.location)));
    writer.line();

    for (const diagnostic of entry.diagnostics) {
      const label =
        diagnostic.severity === 'error'
          ? writer.style('red', 'error')
          : writer.style('yellow', 'warn ');

      const location = diagnostic.path.length === 0 ? '<document>' : diagnostic.path;

      writer.line(
        `  ${label}  ${writer.style('cyan', location)}  ${diagnostic.message}`,
      );

      if (diagnostic.hint !== undefined) {
        writer.line(`         ${writer.style('dim', diagnostic.hint)}`);
      }
    }

    writer.line();
  }

  const summary = [
    report.errors > 0
      ? writer.style('red', pluralize(report.errors, 'error'))
      : undefined,
    report.warnings > 0
      ? writer.style('yellow', pluralize(report.warnings, 'warning'))
      : undefined,
  ].filter((part): part is string => part !== undefined);

  if (summary.length === 0) {
    writer.line(
      writer.style(
        'green',
        `${pluralize(report.targets.length, 'resource')} validated with no findings.`,
      ),
    );
  } else {
    writer.line(summary.join(', '));
  }

  writer.line();

  return exitFor(report, options.strict === true);
}

function exitFor(report: ValidationReport, strict: boolean): ExitCode {
  if (report.errors > 0) return EXIT_CODES.VALIDATION;
  if (strict && report.warnings > 0) return EXIT_CODES.VALIDATION;

  return EXIT_CODES.SUCCESS;
}

/** Shorten a path for display when it sits under the working directory. */
function relativeTo(cwd: string, target: string): string {
  const relative = path.relative(cwd, target);

  return relative.startsWith('..') || path.isAbsolute(relative) ? target : relative;
}
