/**
 * Validate every resource in the catalog.
 *
 * Usage:
 *   pnpm validate:registry
 *
 * Fails when any resource is invalid, or when a supported kind has no example.
 * The second check is what keeps the "one working example of every kind" promise
 * from quietly lapsing.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { kindsInCatalog, loadCatalog, validateDirectory } from '@skillbox/core';
import { RESOURCE_KINDS } from '@skillbox/schema';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryRoot = path.join(repositoryRoot, 'registry');

function relative(target: string): string {
  return path.relative(repositoryRoot, target).split(path.sep).join('/');
}

async function main(): Promise<void> {
  const catalog = await loadCatalog(registryRoot);
  const report = await validateDirectory({ directory: registryRoot, catalog });

  for (const target of report.targets) {
    if (target.diagnostics.length === 0) continue;

    console.log(relative(target.location));

    for (const diagnostic of target.diagnostics) {
      const location = diagnostic.path.length === 0 ? '<document>' : diagnostic.path;
      console.log(`  ${diagnostic.severity}  ${location}  ${diagnostic.message}`);

      if (diagnostic.hint !== undefined) {
        console.log(`         ${diagnostic.hint}`);
      }
    }

    console.log('');
  }

  const present = new Set(kindsInCatalog(catalog));
  const missing = RESOURCE_KINDS.filter((kind) => !present.has(kind));

  if (missing.length > 0) {
    console.error(
      `error: no example resource exists for: ${missing.join(', ')}.\n` +
        'The MVP requires one working example of every supported kind.',
    );
    process.exitCode = 1;
    return;
  }

  if (report.errors > 0) {
    console.error(
      `error: ${String(report.errors)} validation ${report.errors === 1 ? 'error' : 'errors'} in the catalog.`,
    );
    process.exitCode = 1;
    return;
  }

  const summary = [
    `${String(catalog.resources.length)} resources`,
    `${String(present.size)} of ${String(RESOURCE_KINDS.length)} kinds`,
  ].join(', ');

  console.log(
    report.warnings === 0
      ? `Catalog valid: ${summary}.`
      : `Catalog valid with ${String(report.warnings)} warning(s): ${summary}.`,
  );
}

await main();
