/**
 * Regenerate the committed JSON Schema artifacts under `schemas/`.
 *
 * Usage:
 *   pnpm schema:generate
 *
 * Zod is the source of truth; these files are derived. A drift test fails if the
 * committed output no longer matches the schemas (ADR-0002).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateJsonSchemas, serializeJsonSchema } from '@skillbox/schema';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(repositoryRoot, 'schemas');

async function main(): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });

  const generated = generateJsonSchemas();

  for (const artifact of generated) {
    const destination = path.join(outputDirectory, artifact.filename);
    await writeFile(destination, serializeJsonSchema(artifact), 'utf8');
    console.log(`wrote schemas/${artifact.filename}`);
  }

  console.log(`Generated ${String(generated.length)} JSON Schema artifacts.`);
}

await main();
