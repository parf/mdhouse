// The scratch environment the passive-content scripts run in. The process lifecycle is the shared safe-smoke
// launcher (scripts/safe-smoke.ts): own ports, own PIDs, the listener and the served root checked, own-only
// cleanup. What stays here is test content: the fixtures with the probe port filled in, and the probe listener.
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startSmoke } from './safe-smoke';

export interface Env {
  /** `http://127.0.0.1:<port>/<rootId>` — the served fixture repo. */
  base: string;
  /** The served repo's directory. */
  dir: string;
  /** Chrome's debugging port. */
  chrome: number;
  /** Requests the probe listener has seen: what a page was tricked into asking for. */
  probes: string[];
  stop(): Promise<void>;
}

/** Copy `from` into `to`, with `PROBE_PORT` in every file replaced by the probe's port. */
function copyFixtures(from: string, to: string, probe: number): void {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    if (statSync(src).isDirectory()) copyFixtures(src, join(to, name), probe);
    else writeFileSync(join(to, name), readFileSync(src, 'utf8').replaceAll('PROBE_PORT', String(probe)));
  }
}

/** `fixtures`: a directory served as a temp git repo. `src`: the source tree whose mdhouse runs; `rw`: writable. */
export async function startEnv(opts: { fixtures?: string; src?: string; rw?: boolean }): Promise<Env> {
  const probes: string[] = [];
  let probe: ReturnType<typeof Bun.serve> | undefined;
  let staged: string | undefined;
  let smoke: Awaited<ReturnType<typeof startSmoke>> | undefined;

  /** Closes what this module made — the launcher's processes, the probe, the staged temp — whatever fails along the way. */
  const stop = async () => {
    const errors: Error[] = [];
    const attempt = async (f: () => unknown) => {
      try {
        await f();
      } catch (e) {
        errors.push(e as Error);
      }
    };
    await attempt(() => smoke?.stop());
    await attempt(() => probe?.stop(true));
    await attempt(() => staged && rmSync(staged, { recursive: true, force: true }));
    if (errors.length) throw new AggregateError(errors, `cleanup failed: ${errors.map((e) => e.message).join('; ')}`);
  };

  try {
    staged = mkdtempSync(join(tmpdir(), 'mdhouse-fixtures-'));
    probe = Bun.serve({ port: 0, fetch: (req) => (probes.push(`${req.method} ${new URL(req.url).pathname}`), new Response('x', { headers: { 'content-type': 'text/css' } })) });
    const fixtures = join(staged, 'repo');
    mkdirSync(fixtures);
    writeFileSync(join(fixtures, 'README.md'), '# scratch\n');
    if (opts.fixtures) copyFixtures(opts.fixtures, fixtures, probe.port as number);
    smoke = await startSmoke({ fixtures, rw: opts.rw, src: opts.src, cdp: true });
    const roots = ((await (await fetch(`${smoke.base}/api/roots`)).json()) as { roots: Array<{ id: string; path: string }> }).roots;
    const mine = roots.find((r) => realpathSync(r.path) === realpathSync(smoke!.root));
    if (!mine) throw new Error(`the served roots do not include ${smoke.root}`);
    return { base: `${smoke.base}/${mine.id}`, dir: smoke.root, chrome: smoke.chromePort!, probes, stop };
  } catch (e) {
    // the cause stays first; a failed cleanup is added to it, never dropped
    const cleanup = await stop().then(() => null, (err) => err as Error);
    if (cleanup) throw new AggregateError([e, cleanup], `${(e as Error).message}; ${cleanup.message}`);
    throw e;
  }
}

/**
 * Runs `body` and always runs `env.stop()` afterwards, whether `body` returned or threw. Returns the process exit
 * code: `body`'s own on success, 2 when `body` threw or the cleanup failed. A failure of either is printed; when both
 * fail the body's error comes first. Nothing is reported green while something it started may still be there.
 */
export async function guarded(env: { stop(): Promise<void> }, body: () => Promise<number>): Promise<number> {
  let code = 0;
  let failure: Error | undefined;
  try {
    code = await body();
  } catch (e) {
    failure = e instanceof Error ? e : new Error(String(e));
  }
  try {
    await env.stop();
  } catch (e) {
    const cleanup = e instanceof Error ? e : new Error(String(e));
    failure = failure ? new AggregateError([failure, cleanup], `${failure.message}; ${cleanup.message}`) : cleanup;
  }
  if (failure) {
    console.error(`run failed: ${failure.message}`);
    return 2;
  }
  return code;
}

/** The checks P01 and P03 must report, each `true`: a missing check is a failure, not a pass. */
export const KEPT_KEYS = ['red', 'bold', 'bg', 'cls', 'fixedDropped', 'rgb', 'centre', 'urlDropped', 'italicUnderline'];
export const EDGE_KEYS = [
  'upperPropDropped', 'commentStripped', 'duplicateLastWins', 'importantKept', 'spacesKept', 'escapedPropDropped', 'escapedValueDropped',
  'mixedKeepsColour', 'hiddenDeclarationDropped', 'lastInvalidDropped', 'customCaseDropped', 'entityDecoded', 'upperValueKept',
];

/** Keys of `expected` that `actual` does not hold as exactly `true`, plus keys it holds that were not expected. A missing or non-object `actual` fails every key. */
export function unmet(actual: unknown, expected: string[]): string[] {
  const got = actual && typeof actual === 'object' && !Array.isArray(actual) ? (actual as Record<string, unknown>) : {};
  const missing = expected.filter((k) => got[k] !== true);
  const extra = Object.keys(got).filter((k) => !expected.includes(k));
  return [...missing, ...extra.map((k) => `unexpected:${k}`)];
}
