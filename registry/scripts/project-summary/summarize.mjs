#!/usr/bin/env node
/**
 * Summarize a project's structure as a Markdown report.
 *
 * Reads only. Never writes, never executes anything it finds, and makes no
 * network requests.
 *
 * Usage:
 *   node summarize.mjs [--root <path>] [--depth <n>]
 */
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

/** Directories never worth descending into. */
const SKIPPED = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '__pycache__',
  '.venv',
  'venv',
]);

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      root: { type: 'string' },
      depth: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: false,
  });

  if (values.help === true) {
    process.stdout.write(
      [
        'Summarize a project structure as Markdown.',
        '',
        'Usage: node summarize.mjs [--root <path>] [--depth <n>]',
        '',
        '  --root   Directory to summarize. Defaults to the working directory.',
        '  --depth  How many directory levels to descend. Defaults to 3.',
        '',
      ].join('\n'),
    );
    process.exit(0);
  }

  const depth = values.depth === undefined ? 3 : Number.parseInt(values.depth, 10);

  if (Number.isNaN(depth) || depth < 1) {
    process.stderr.write('error: --depth must be a positive whole number\n');
    process.exit(1);
  }

  return { root: path.resolve(values.root ?? process.cwd()), depth };
}

/** Walk a directory, collecting a tree and per-extension counts. */
async function walk(directory, depth, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);

  const lines = [];
  const counts = new Map();
  let files = 0;

  const sorted = [...entries].sort((a, b) => {
    // Directories first, then alphabetical, so the shape is legible.
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of sorted) {
    if (entry.name.startsWith('.') && entry.name !== '.skillbox') continue;

    if (entry.isDirectory()) {
      if (SKIPPED.has(entry.name)) continue;

      lines.push(`${prefix}${entry.name}/`);

      if (depth > 1) {
        const nested = await walk(
          path.join(directory, entry.name),
          depth - 1,
          `${prefix}  `,
        );

        lines.push(...nested.lines);
        files += nested.files;

        for (const [extension, count] of nested.counts) {
          counts.set(extension, (counts.get(extension) ?? 0) + count);
        }
      }
    } else if (entry.isFile()) {
      files += 1;

      const extension = path.extname(entry.name).toLowerCase() || '(none)';
      counts.set(extension, (counts.get(extension) ?? 0) + 1);
    }
  }

  return { lines, counts, files };
}

function renderReport(root, result) {
  const byCount = [...result.counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );

  const lines = [
    `# Project summary: ${path.basename(root)}`,
    '',
    `${String(result.files)} ${result.files === 1 ? 'file' : 'files'} across ${String(byCount.length)} ${byCount.length === 1 ? 'extension' : 'extensions'}.`,
    '',
    '## Structure',
    '',
    '```text',
    ...(result.lines.length > 0 ? result.lines : ['(no directories)']),
    '```',
    '',
    '## Files by extension',
    '',
    '| Extension | Count |',
    '| --- | --- |',
    ...byCount.map(([extension, count]) => `| \`${extension}\` | ${String(count)} |`),
    '',
  ];

  return lines.join('\n');
}

async function main() {
  const { root, depth } = parseOptions(process.argv.slice(2));

  const stats = await stat(root).catch(() => undefined);

  if (stats === undefined || !stats.isDirectory()) {
    process.stderr.write(`error: "${root}" is not a directory\n`);
    process.exit(1);
  }

  process.stdout.write(renderReport(root, await walk(root, depth)));
}

await main();
