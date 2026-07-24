import { styleText } from 'node:util';

/**
 * Terminal and JSON output.
 *
 * The only module permitted to write to stdout. Color comes from Node's built-in
 * `util.styleText`, so no color dependency is needed (ADR-0006).
 */

export type Style = 'bold' | 'dim' | 'red' | 'yellow' | 'green' | 'cyan' | 'blue';

export interface OutputOptions {
  /** Emit a single JSON document instead of human-readable text. */
  readonly json?: boolean | undefined;
  /** Force color off. Also inferred from `NO_COLOR` and non-TTY output. */
  readonly color?: boolean | undefined;
}

export interface Writer {
  /** Write a line to stdout. */
  line(text?: string): void;
  /** Write a line to stderr. */
  errorLine(text?: string): void;
  /** Apply a style, or return the text unchanged when color is off. */
  style(style: Style, text: string): string;
  /** Emit the final JSON document. No-op when not in JSON mode. */
  json(payload: unknown): void;
  /** Is JSON mode active? */
  readonly isJson: boolean;
}

/**
 * Should color be used?
 *
 * `NO_COLOR` takes precedence over everything, per the informal standard at
 * no-color.org. Non-TTY output is uncolored so piping produces clean text.
 */
export function shouldUseColor(options: {
  readonly explicit?: boolean | undefined;
  readonly isTty: boolean;
  readonly env: Readonly<Record<string, string | undefined>>;
}): boolean {
  if (options.env.NO_COLOR !== undefined && options.env.NO_COLOR !== '') {
    return false;
  }
  if (options.explicit === false) return false;
  if (options.explicit === true) return true;

  return options.isTty;
}

export interface CreateWriterOptions extends OutputOptions {
  readonly stdout?: ((text: string) => void) | undefined;
  readonly stderr?: ((text: string) => void) | undefined;
  readonly isTty?: boolean | undefined;
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
}

/** Create a writer. */
export function createWriter(options: CreateWriterOptions = {}): Writer {
  const isJson = options.json === true;

  const write = options.stdout ?? ((text: string) => void process.stdout.write(text));
  const writeError =
    options.stderr ?? ((text: string) => void process.stderr.write(text));

  const useColor = shouldUseColor({
    explicit: options.color,
    isTty: options.isTty ?? process.stdout.isTTY === true,
    env: options.env ?? process.env,
  });

  return {
    isJson,

    line(text = ''): void {
      // In JSON mode stdout carries exactly one document, so human-readable
      // lines are suppressed rather than interleaved.
      if (isJson) return;
      write(`${text}\n`);
    },

    errorLine(text = ''): void {
      writeError(`${text}\n`);
    },

    style(style: Style, text: string): string {
      // validateStream is disabled because the color decision is already made
      // above, accounting for NO_COLOR, --no-color, and TTY detection. Leaving it
      // on would re-check process.stdout and silently override an explicit
      // --color, or a caller writing to a captured stream.
      return useColor ? styleText(style, text, { validateStream: false }) : text;
    },

    json(payload: unknown): void {
      if (!isJson) return;
      write(`${JSON.stringify(payload, null, 2)}\n`);
    },
  };
}

/** Pad a string to a column width, for aligned table output. */
export function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

/**
 * Render aligned rows.
 *
 * Column widths are computed from content, and the final column is not padded so
 * there is no trailing whitespace.
 */
export function table(rows: readonly (readonly string[])[]): string[] {
  if (rows.length === 0) return [];

  const columnCount = Math.max(...rows.map((row) => row.length));
  const widths: number[] = [];

  for (let column = 0; column < columnCount; column += 1) {
    widths[column] = Math.max(...rows.map((row) => (row[column] ?? '').length));
  }

  return rows.map((row) =>
    row
      .map((cell, column) =>
        column === row.length - 1 ? cell : pad(cell, widths[column] ?? 0),
      )
      .join('  ')
      .trimEnd(),
  );
}

/** "1 resource" or "3 resources". */
export function pluralize(count: number, singular: string, plural?: string): string {
  return `${String(count)} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}
