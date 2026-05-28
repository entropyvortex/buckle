/**
 * Helpers for the `--json` output mode. Every command's JSON payload includes a `timestamp`
 * and `workspace` so consumers can correlate.
 */
import { ErrorCode, type ErrorCodeT } from '../util/errors.js';

export interface JsonEnvelope<T> {
  ok: boolean;
  timestamp: string;
  workspace?: string;
  data?: T;
  error?: { code: ErrorCodeT; message: string; hint?: string };
}

export function jsonOk<T>(data: T, workspace?: string): JsonEnvelope<T> {
  const env: JsonEnvelope<T> = { ok: true, timestamp: new Date().toISOString(), data };
  if (workspace !== undefined) env.workspace = workspace;
  return env;
}

export function jsonErr(
  code: ErrorCodeT,
  message: string,
  hint?: string,
  workspace?: string,
): JsonEnvelope<never> {
  const err: NonNullable<JsonEnvelope<never>['error']> = { code, message };
  if (hint !== undefined) err.hint = hint;
  const env: JsonEnvelope<never> = {
    ok: false,
    timestamp: new Date().toISOString(),
    error: err,
  };
  if (workspace !== undefined) env.workspace = workspace;
  return env;
}

export function emit<T>(env: JsonEnvelope<T>): void {
  process.stdout.write(JSON.stringify(env) + '\n');
}

export { ErrorCode };
