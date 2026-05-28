 

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

type Color = keyof typeof COLORS;

function colorEnabled(): boolean {
  if (process.env['NO_COLOR']) return false;
  if (process.env['BUCKLE_NO_COLOR']) return false;
  if (!process.stdout.isTTY) return false;
  return true;
}

function paint(text: string, color: Color): string {
  if (!colorEnabled()) return text;
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  success(msg: string): void;
  debug(msg: string): void;
  line(): void;
  raw(msg: string): void;
}

export interface LoggerOptions {
  json?: boolean;
  verbose?: boolean;
  silent?: boolean;
}

class TextLogger implements Logger {
  constructor(private readonly opts: LoggerOptions = {}) {}

  info(msg: string): void {
    if (this.opts.silent) return;
    console.error(`${paint('•', 'cyan')} ${msg}`);
  }

  warn(msg: string): void {
    if (this.opts.silent) return;
    console.error(`${paint('!', 'yellow')} ${msg}`);
  }

  error(msg: string): void {
    console.error(`${paint('✗', 'red')} ${msg}`);
  }

  success(msg: string): void {
    if (this.opts.silent) return;
    console.error(`${paint('✓', 'green')} ${msg}`);
  }

  debug(msg: string): void {
    if (!this.opts.verbose) return;
    console.error(`${paint(`[debug]`, 'gray')} ${msg}`);
  }

  line(): void {
    if (this.opts.silent) return;
    console.error('');
  }

  raw(msg: string): void {
    process.stdout.write(msg);
  }
}

class JsonLogger implements Logger {
  info(_msg: string): void {
    /* swallowed in JSON mode */
  }
  warn(_msg: string): void {
    /* swallowed in JSON mode */
  }
  success(_msg: string): void {
    /* swallowed */
  }
  debug(_msg: string): void {
    /* swallowed */
  }
  line(): void {
    /* swallowed */
  }
  error(msg: string): void {
    process.stderr.write(`${msg}\n`);
  }
  raw(msg: string): void {
    process.stdout.write(msg);
  }
}

export function makeLogger(opts: LoggerOptions = {}): Logger {
  return opts.json ? new JsonLogger() : new TextLogger(opts);
}

export const styles = {
  bold: (s: string) => paint(s, 'bold'),
  dim: (s: string) => paint(s, 'dim'),
  cyan: (s: string) => paint(s, 'cyan'),
  green: (s: string) => paint(s, 'green'),
  yellow: (s: string) => paint(s, 'yellow'),
  red: (s: string) => paint(s, 'red'),
  gray: (s: string) => paint(s, 'gray'),
};
