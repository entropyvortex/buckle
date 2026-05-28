/**
 * Stable, machine-readable error codes. Surface in --json mode and in user-visible messages.
 * Add new codes here, never repurpose existing ones (semver-stable).
 */
export const ErrorCode = {
  E_DOCKER_DOWN: 'E_DOCKER_DOWN',
  E_TEMPLATE_NOT_FOUND: 'E_TEMPLATE_NOT_FOUND',
  E_TEMPLATE_INVALID: 'E_TEMPLATE_INVALID',
  E_TEMPLATE_CONFLICT: 'E_TEMPLATE_CONFLICT',
  E_HOOK_FAILED: 'E_HOOK_FAILED',
  E_BUILD_FAILED: 'E_BUILD_FAILED',
  E_PORT_CONFLICT: 'E_PORT_CONFLICT',
  E_HASH_MISMATCH: 'E_HASH_MISMATCH',
  E_CYCLE: 'E_CYCLE',
  E_PERMISSION: 'E_PERMISSION',
  E_NO_GIT: 'E_NO_GIT',
  E_USER_ABORT: 'E_USER_ABORT',
  E_INSTALL_FAILED: 'E_INSTALL_FAILED',
  E_UNSUPPORTED: 'E_UNSUPPORTED',
  E_INTERNAL: 'E_INTERNAL',
} as const;

export type ErrorCodeT = (typeof ErrorCode)[keyof typeof ErrorCode];

export class BuckleError extends Error {
  public override readonly name = 'BuckleError';
  constructor(
    public readonly code: ErrorCodeT,
    message: string,
    public readonly hint?: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
  }

  toJSON(): { code: ErrorCodeT; message: string; hint?: string } {
    return this.hint
      ? { code: this.code, message: this.message, hint: this.hint }
      : { code: this.code, message: this.message };
  }
}

export function isBuckleError(e: unknown): e is BuckleError {
  return e instanceof BuckleError;
}

/** Convert any thrown value into a BuckleError so the CLI surface is uniform. */
export function toBuckleError(e: unknown): BuckleError {
  if (isBuckleError(e)) return e;
  if (e instanceof Error) {
    return new BuckleError(ErrorCode.E_INTERNAL, e.message, undefined, e);
  }
  return new BuckleError(ErrorCode.E_INTERNAL, String(e));
}
