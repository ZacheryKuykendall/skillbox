import { resolve } from '@skillbox/core';
import { resolveInstallTarget } from '@skillbox/schema';

import type { CommandContext } from '../context.js';
import { EXIT_CODES, type ExitCode } from '../exit-codes.js';
import { table } from '../output.js';

/**
 * `skillbox inspect <resource>` — show everything a resource declares.
 *
 * Environment variables appear by **name** only. No value is ever read or shown
 * (SR-7, SR-8, FR-13.4).
 */
export async function inspectCommand(
  context: CommandContext,
  reference: string,
): Promise<ExitCode> {
  const { writer } = context;

  const catalog = await context.catalog();
  const resource = resolve(catalog, reference);
  const { manifest } = resource;
  const { metadata, spec } = manifest;

  if (writer.isJson) {
    writer.json({
      ok: true,
      command: 'inspect',
      data: {
        resource: resource.qualifiedName,
        version: metadata.version,
        kind: manifest.kind,
        description: metadata.description,
        tags: metadata.tags ?? [],
        license: metadata.license ?? null,
        homepage: metadata.homepage ?? null,
        deprecated: metadata.deprecated ?? null,
        entrypoint: spec.entrypoint,
        files: spec.files,
        installTarget: resolveInstallTarget(manifest),
        inputs: spec.inputs ?? [],
        outputs: spec.outputs ?? [],
        dependencies: spec.dependencies ?? [],
        permissions: spec.permissions ?? [],
        // Names and descriptions only. There is no value field to expose.
        environment: (spec.env ?? []).map((variable) => ({
          name: variable.name,
          description: variable.description,
          required: variable.required !== false,
          secret: variable.secret === true,
        })),
        runtime: spec.runtime ?? null,
        compatibility: spec.compatibility ?? {},
      },
    });
    return EXIT_CODES.SUCCESS;
  }

  writer.line();
  writer.line(
    `${writer.style('bold', resource.qualifiedName)}@${metadata.version}  ${writer.style('dim', manifest.kind)}`,
  );
  writer.line(metadata.description);
  writer.line();

  if (metadata.deprecated !== undefined) {
    writer.line(
      `${writer.style('yellow', 'deprecated')}  ${metadata.deprecated.reason}`,
    );
    if (metadata.deprecated.replacement !== undefined) {
      writer.line(`            Use ${metadata.deprecated.replacement} instead.`);
    }
    writer.line();
  }

  const facts: string[][] = [
    ['Entrypoint', spec.entrypoint],
    ['Install to', resolveInstallTarget(manifest)],
  ];

  if ((metadata.tags ?? []).length > 0) {
    facts.push(['Tags', (metadata.tags ?? []).join(', ')]);
  }
  if (metadata.license !== undefined) facts.push(['License', metadata.license]);
  if (metadata.homepage !== undefined) facts.push(['Homepage', metadata.homepage]);
  if (spec.runtime !== undefined) {
    facts.push([
      'Runtime',
      spec.runtime.version === undefined
        ? spec.runtime.type
        : `${spec.runtime.type} ${spec.runtime.version}`,
    ]);
  }

  for (const row of table(facts)) writer.line(`  ${row}`);
  writer.line();

  section(
    writer,
    'Files',
    spec.files.map((file) => [file]),
  );

  if ((spec.inputs ?? []).length > 0) {
    section(
      writer,
      'Inputs',
      (spec.inputs ?? []).map((input) => [
        input.name,
        input.type,
        input.required === true ? 'required' : 'optional',
        input.description,
      ]),
    );
  }

  if ((spec.outputs ?? []).length > 0) {
    section(
      writer,
      'Outputs',
      (spec.outputs ?? []).map((output) => [
        output.name,
        output.type,
        output.description,
      ]),
    );
  }

  section(
    writer,
    'Dependencies',
    (spec.dependencies ?? []).map((dependency) => [
      dependency.resource,
      dependency.version,
      dependency.optional === true ? 'optional' : 'required',
    ]),
    'none',
  );

  // Permissions are declared by the author, not enforced by Skillbox. Saying so
  // here prevents the list being read as a sandbox guarantee.
  section(
    writer,
    'Permissions requested',
    (spec.permissions ?? []).map((permission) => [permission]),
    'none',
  );

  if ((spec.env ?? []).length > 0) {
    section(
      writer,
      'Environment',
      (spec.env ?? []).map((variable) => [
        variable.name,
        variable.required === false ? 'optional' : 'required',
        variable.secret === true ? 'secret' : '',
        variable.description,
      ]),
    );
    writer.line(
      writer.style(
        'dim',
        '  Skillbox records these names only. It never reads or stores their values.',
      ),
    );
    writer.line();
  }

  if ((spec.permissions ?? []).length > 0) {
    writer.line(
      writer.style(
        'dim',
        '  Permissions are declared by the resource author. Skillbox shows them but does not enforce them.',
      ),
    );
    writer.line();
  }

  return EXIT_CODES.SUCCESS;
}

function section(
  writer: CommandContext['writer'],
  heading: string,
  rows: readonly (readonly string[])[],
  emptyText?: string,
): void {
  if (rows.length === 0 && emptyText === undefined) return;

  writer.line(writer.style('bold', heading));

  if (rows.length === 0) {
    writer.line(`  ${writer.style('dim', emptyText ?? 'none')}`);
  } else {
    for (const row of table(rows)) writer.line(`  ${row}`);
  }

  writer.line();
}
