/**
 * Buckle entry point. Imported by bin/buckle.mjs; also exported as a library so embedders can
 * call `main(['node', 'buckle', ...])`.
 */
import { dispatch } from './cli/parse.js';
import { jsonErr, emit } from './cli/json-out.js';
import { isBuckleError, toBuckleError } from './util/errors.js';
import { makeLogger } from './util/log.js';

export { dispatch } from './cli/parse.js';
export * from './templates/schema.js';
export * from './generators/devcontainer.js';
export { resolve } from './templates/resolver.js';
export { detectProject } from './templates/autodetect.js';
export { Driver } from './docker/driver.js';

export async function main(argv: string[]): Promise<number> {
  const wantsJson = argv.includes('--json');
  try {
    const result = await dispatch(argv);
    if (result.tui) {
      // Lazy-load Ink to keep cold start light.
      const { runTui } = await import('./tui/run.js');
      return await runTui(result.tuiIntent);
    }
    return result.exitCode;
  } catch (err) {
    const be = toBuckleError(err);
    if (wantsJson) {
      emit(jsonErr(be.code, be.message, be.hint));
    } else {
      const logger = makeLogger();
      logger.error(`${be.code}: ${be.message}`);
      if (be.hint) logger.info(`hint: ${be.hint}`);
    }
    if (!isBuckleError(err) && err && (err as Error).stack && process.env['BUCKLE_DEBUG']) {
      // Surface real stack only on opt-in to keep UX clean.
       
      console.error((err as Error).stack);
    }
    return 1;
  }
}

// Allow running `node dist/index.js` directly during dev.
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv).then((code) => process.exit(code));
}
