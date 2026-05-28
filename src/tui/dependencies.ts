import type { CliContext, CliFlags } from '../cli/context.js';
import { makeContext } from '../cli/context.js';
import { Driver, type DriverOptions } from '../docker/driver.js';
import type { RenderArgs, RenderOutcome } from '../cli/render.js';
import { renderTemplate } from '../cli/render.js';

/**
 * Lightweight dependency bag for the TUI components.
 *
 * Goal: remove the previous smell where Wizard and StatusPanel directly called
 * makeContext({}) and new Driver(...) inside effects and callbacks.
 *
 * This is deliberately minimal — no full DI container, just the exact collaborators
 * the TUI needs. Mirrors the existing `makeContext` factory pattern used everywhere else.
 */

export interface TuiContextFactory {
  (flags?: Partial<CliFlags>): CliContext;
}

export interface DriverFactory {
  (opts: Pick<DriverOptions, 'templateName'>): Driver;
}

export interface TuiRenderTemplate {
  (ctx: CliContext, args: RenderArgs): Promise<RenderOutcome>;
}

export interface TuiServices {
  makeContext: TuiContextFactory;
  createDriver: DriverFactory;
  renderTemplate: TuiRenderTemplate;
}

/**
 * Production defaults. Used by runTui when no overrides are supplied.
 */
export function createDefaultTuiServices(): TuiServices {
  return {
    makeContext: (flags = {}) => makeContext(flags as CliFlags),

    createDriver: ({ templateName }) =>
      new Driver({
        workspaceFolder: process.cwd(),
        templateName,
        logger: makeContext({}).logger,
      }),

    renderTemplate: (ctx, args) => renderTemplate(ctx, args),
  };
}

/**
 * Helper for components: resolve a service from the optional bag or fall back to the default.
 * Keeps call sites clean: `const ctx = getContext(props.services);`
 */
export function getContext(services?: Partial<TuiServices>, flags?: Partial<CliFlags>): CliContext {
  const factory = services?.makeContext ?? createDefaultTuiServices().makeContext;
  return factory(flags);
}

export function getDriver(services: Partial<TuiServices> | undefined, templateName: string): Driver {
  const factory = services?.createDriver ?? createDefaultTuiServices().createDriver;
  return factory({ templateName });
}

export function getRenderTemplate(services?: Partial<TuiServices>): TuiRenderTemplate {
  return services?.renderTemplate ?? createDefaultTuiServices().renderTemplate;
}
