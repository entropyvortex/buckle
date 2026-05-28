import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function isFile(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

export async function isDir(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

export async function readText(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

export async function readTextOrUndefined(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
}

/**
 * Write a file atomically (best-effort).
 *
 * Strategy:
 *   1. Write contents to a sibling temp file in the same directory (guarantees same filesystem).
 *   2. fsync the temp file for durability where supported.
 *   3. rename(2) over the final destination (atomic on POSIX; best-effort on Windows).
 *
 * On cross-device rename failure (very rare for user files) we fall back to a direct write.
 * On any error the temp file is cleaned up.
 *
 * This eliminates the previous naming lie where the function was just mkdir+writeFile.
 */
export async function writeTextAtomic(path: string, contents: string): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });

  const name = basename(path);
  // Same-directory temp file is critical for atomic rename.
  const tmp = join(dir, `.${name}.${randomBytes(6).toString('hex')}.buckle-tmp`);

  try {
    await writeFile(tmp, contents, 'utf8');

    // Best-effort durability sync. Ignore failures (some platforms / FDs don't support it).
    try {
      const fh = await open(tmp, 'r+');
      await fh.sync();
      await fh.close();
    } catch {
      // ignore
    }

    try {
      await rename(tmp, path);
    } catch (renameErr: unknown) {
      const err = renameErr as NodeJS.ErrnoException | undefined;
      // Cross-device or Windows target-exists edge cases → fall back to direct write.
      // This is still safe (we have the data) but no longer atomic.
      if (err && (err.code === 'EXDEV' || err.code === 'EACCES' || err.code === 'EPERM')) {
        try {
          await writeFile(path, contents, 'utf8');
        } finally {
          try { await unlink(tmp); } catch { /* ignore */ }
        }
        return;
      }
      throw renameErr;
    }
  } catch (err) {
    try { await unlink(tmp); } catch { /* ignore cleanup errors */ }
    throw err;
  }
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}
