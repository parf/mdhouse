/**
 * `secrets.json` beside `prefs.json` (0600, dir 0700): the instance's Agent Bus token, each project's Agent Bus
 * credential and the Basic users' password hashes ([DATA.md](../../Plans/R3/DATA.md), step 1). `prefs.json` keeps
 * the rest, with `SECRET_MOVED` in place of each password hash: an older mdhouse still asks for a login and admits
 * nobody, rather than serving without one.
 *
 * Each secret is kept with what it belongs to — the token and a credential with their endpoint — and is used only
 * while `prefs.json` names the same one.
 */
import { readFileSync } from 'node:fs';
import { mkdir, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const SECRETS_VERSION = 1;

/** A password hash no mdhouse verifies (`Bun.password.verify` throws, every release counts that as a refusal). */
export const SECRET_MOVED = 'mdhouse:moved-to-secrets.json';

export interface Secrets {
  /** The instance's Agent Bus token, for `endpoint` (`agentBus.socket` as `prefs.json` holds it). */
  agentBus?: { endpoint: string; token: string };
  /** Canonical project path → its Agent Bus credential, for `endpoint`. */
  spaces?: Record<string, { endpoint: string; credential: string }>;
  /** Login → password hash. */
  users?: Record<string, string>;
}

/** `secrets.json` in the folder of `prefsPath`. */
export const secretsPath = (prefsPath: string): string => join(dirname(prefsPath), 'secrets.json');

const isStr = (v: unknown): v is string => typeof v === 'string' && v !== '';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The file now: `missing`, or why it cannot be used (`broken`, another version), or its secrets. Entries of the
 * wrong shape are dropped one by one.
 */
export function readSecrets(path: string): Secrets | 'missing' | { problem: string } {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    return { problem: 'unreadable' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { problem: 'not JSON' };
  }
  if (!isObj(raw)) return { problem: 'not an object' };
  if (raw.version !== SECRETS_VERSION) return { problem: typeof raw.version === 'number' && raw.version > SECRETS_VERSION ? `version ${raw.version}, from a newer mdhouse` : 'an unknown version' };
  const out: Secrets = {};
  const ab = raw.agentBus;
  if (isObj(ab) && typeof ab.endpoint === 'string' && isStr(ab.token)) out.agentBus = { endpoint: ab.endpoint, token: ab.token };
  if (isObj(raw.spaces)) {
    const spaces: NonNullable<Secrets['spaces']> = {};
    for (const [k, v] of Object.entries(raw.spaces)) if (isObj(v) && isStr(v.endpoint) && isStr(v.credential)) spaces[k] = { endpoint: v.endpoint, credential: v.credential };
    if (Object.keys(spaces).length) out.spaces = spaces;
  }
  if (isObj(raw.users)) {
    const users: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.users)) if (isStr(v)) users[k] = v;
    if (Object.keys(users).length) out.users = users;
  }
  return out;
}

let seq = 0;

/** Written aside (0600) and renamed over the file — at a symlink's target, so the link stays. */
export async function writeSecrets(path: string, s: Secrets): Promise<void> {
  const target = await realpath(path).catch(() => path);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const tmp = `${target}.${process.pid}.${++seq}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify({ version: SECRETS_VERSION, ...s }, null, 2) + '\n', { mode: 0o600 });
    await rename(tmp, target);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}
