import { join } from 'node:path';

import { exists } from '../util/fs.js';
import { createDefaultTuiServices } from './dependencies.js';

/**
 * TUI dispatcher. Decides between Wizard (no `.devcontainer`) and StatusPanel (has one).
 * Lazy-imports React/Ink so cold-start `buckle <flags>` paths stay fast.
 *
 * The real TuiServices bag is constructed once here and passed down so the
 * components never directly instantiate makeContext or Driver.
 */
export async function runTui(initialIntent?: 'up'): Promise<number> {
  const cwd = process.cwd();
  const dcPath = join(cwd, '.devcontainer', 'devcontainer.json');
  const dcExists = await exists(dcPath);

  const services = createDefaultTuiServices();

  const { default: React } = await import('react');
  const { render } = await import('ink');

  if (dcExists) {
    const { StatusPanel } = await import('./StatusPanel.js');
    const ink = render(React.createElement(StatusPanel, { cwd, services }));
    await ink.waitUntilExit();
  } else {
    const { Wizard } = await import('./Wizard.js');
    const intentProp = initialIntent === 'up' ? { initialIntent: 'up' as const } : {};
    const ink = render(React.createElement(Wizard, { cwd, services, ...intentProp }));
    await ink.waitUntilExit();
  }
  return 0;
}
