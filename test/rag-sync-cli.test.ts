import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { citeRecords } from '../src/lib/rag-cite';
import { RagBusError, type BusOptions, type RagBus, type RagStore } from '../src/lib/rag-sync-bus';
import { BACKOFF, STALLED_ROUNDS, EXCLUDE_GLOBS, EXIT, inventory, main, parseArgs, planInput, REPLY_MS, resultExit, untilDone } from '../src/rag-sync-cli';

const base = mkdtempSync(join(tmpdir(), 'mdhouse-rag-sync-'));
afterAll(() => rmSync(base, { recursive: true, force: true }));
let n = 0;
const tree = (files: Record<string, string>) => {
  const root = join(base, `t${++n}`);
  mkdirSync(root);
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
};

const io = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (t: string) => void out.push(t), err: (t: string) => void err.push(t) } };
};

const TARGET = ['--filescan', '#filescan/notes@box', '--rag', '#rag/notes@box', '--namespace', 'notes', '--table', 'md'];

// Any network attempt fails the test that made it.
const realFetch = globalThis.fetch;
let fetched = 0;
beforeEach(() => {
  fetched = 0;
  globalThis.fetch = (() => {
    fetched++;
    throw new Error('network');
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  expect(fetched).toBe(0);
});

describe('parseArgs', () => {
  test('takes the target flags in both forms', () => {
    const a = parseArgs('plan', ['--root', '/x', '--filescan=#filescan/a@h', '--rag', '#rag/a@h', '--namespace=ns', '--table', 't_1']);
    expect(a).toEqual({ root: '/x', filescan: '#filescan/a@h', rag: '#rag/a@h', namespace: 'ns', table: 't_1', apply: false, untilDone: false, paid: false });
  });

  test('sync and search switches', () => {
    expect(() => parseArgs('sync', ['--root', '/x', ...TARGET, '--apply', '--resend-unknown'])).toThrow('unknown option --resend-unknown');
    expect(parseArgs('search', ['--root', '/x', ...TARGET, '--query', 'q'])).toMatchObject({ query: 'q', paid: false });
    expect(parseArgs('search', ['--root', '/x', ...TARGET, '--query=q', '--mode', 'hybrid', '--paid', '--limit', '16'])).toMatchObject({ mode: 'hybrid', paid: true, limit: 16 });
  });

  test.each([
    ['plan', ['--root', '/x', ...TARGET, '--token=SECRET'], 'unknown option --token'],
    ['plan', ['--root', '/x', ...TARGET, 'SECRET'], 'unexpected argument 11'],
    ['plan', ['--root', '/x', ...TARGET, '--Tok=SECRET'], 'unexpected argument 11'],
    ['plan', ['--root', '/x', '--root', '/y', ...TARGET], '--root given twice'],
    ['plan', TARGET, '--root is required'],
    ['plan', ['--root', '/x', ...TARGET.slice(0, 7), 'SECRET table'], '--table must be'],
    ['plan', ['--root', '/x', '--filescan', 'SECRET', ...TARGET.slice(2)], '--filescan must be a #filescan/'],
    ['plan', ['--root', '/x', ...TARGET, '--apply'], 'unknown option --apply'],
    ['sync', ['--root', '/x', ...TARGET], 'add --apply'],
    ['sync', ['--root', '/x', ...TARGET, '--apply=SECRET'], '--apply takes no value'],
    ['sync', ['--root', '/x', ...TARGET, '--apply', '--paid'], 'unknown option --paid'],
    ['search', ['--root', '/x', ...TARGET], '--query is required'],
    ['search', ['--root', '/x', ...TARGET, '--query', 'SECRET', '--mode', 'semantic'], 'is paid: add --paid'],
    ['search', ['--root', '/x', ...TARGET, '--query', 'SECRET', '--mode', 'SECRET'], '--mode must be one of'],
    ['search', ['--root', '/x', ...TARGET, '--query', 'SECRET', '--limit', '17'], '--limit must be 1–16'],
    ['search', ['--root', '/x', ...TARGET, '--query', 'SECRET', '--apply'], 'unknown option --apply'],
  ] as const)('%s refuses %p without echoing a value', (cmd, args, msg) => {
    expect(() => parseArgs(cmd, args)).toThrow(msg);
    try {
      parseArgs(cmd, args);
    } catch (err) {
      expect((err as Error).message).not.toContain('SECRET');
    }
  });

  test.each([
    ['#filescan@box', '#rag/a@box'],
    ['#rag/a@box', '#rag/a@box'],
    ['#filescan/a@box', '#rag@box'],
    ['#filescan/a@box', '#ai@box'],
    ['#filescan/a@box', 'parf'],
    ['#filescan/a@box', '#filescan/a@box'],
  ])('only exact #filescan/<i>@<r> and #rag/<i>@<r>: refuses %p %p', (fs, rag) => {
    expect(() => parseArgs('plan', ['--root', '/x', '--filescan', fs, '--rag', rag, '--namespace', 'n', '--table', 't'])).toThrow(/must be a #/);
  });
});

describe('inventory', () => {
  test('lists *.md by metadata, sorted; skips dot entries and dependency trees at any depth', async () => {
    const root = tree({
      'a.md': '# a',
      'b.txt': 'x',
      'sub/c.md': 'cc',
      'sub/C.MD': 'upper',
      'b.Md': 'mixed',
      '.hidden.md': 'h',
      '.git/x.md': 'g',
      'node_modules/p/r.md': 'n',
      'sub/deep/bower_components/r.md': 'b',
      'sub/jspm_packages/r.md': 'j',
    });
    const inv = await inventory(root);
    expect(inv.complete).toBe(true);
    expect(inv.issues).toEqual([]);
    expect(inv.sources.map((s) => s.path)).toEqual(['a.md', 'sub/c.md']);
    expect(inv.sources[0]).toEqual({ path: 'a.md', size: 3, mtimeMs: statSync(join(root, 'a.md')).mtimeMs });
    const rst = statSync(root, { bigint: true });
    expect(inv.root).toEqual({ path: root, dev: String(rst.dev), ino: String(rst.ino) });
  });

  test('never follows symlinks or special files: unsupported issues, incomplete', async () => {
    const outside = tree({ 'secret.md': 's' });
    const root = tree({ 'a.md': 'a', 'd/b.md': 'b' });
    symlinkSync(join(outside, 'secret.md'), join(root, 'out.md'));
    symlinkSync(join(root, 'a.md'), join(root, 'in.md'));
    symlinkSync(outside, join(root, 'dirlink'));
    spawnSync('mkfifo', [join(root, 'pipe.md')]);
    const inv = await inventory(root);
    expect(inv.sources.map((s) => s.path)).toEqual(['a.md', 'd/b.md']);
    expect(inv.issues).toEqual([
      { path: 'dirlink', reason: 'unsupported' },
      { path: 'in.md', reason: 'unsupported' },
      { path: 'out.md', reason: 'unsupported' },
      { path: 'pipe.md', reason: 'unsupported' },
    ]);
    expect(inv.complete).toBe(false);
  });

  test('a directory named *.md is an issue, not walked: FileScan would send every file under it', async () => {
    const root = tree({ 'a.md': '', 'notes.md/b.txt': '', 'notes.md/c.md': '', 'x.MD/d.md': '' });
    const inv = await inventory(root);
    expect(inv.sources.map((s) => s.path)).toEqual(['a.md', 'x.MD/d.md']);
    expect(inv.issues).toEqual([{ path: 'notes.md', reason: 'unsupported' }]);
    expect(inv.complete).toBe(false);
  });

  test('a root given through a symlink is listed by its real path', async () => {
    const root = tree({ 'a.md': 'a' });
    const link = join(base, `link${++n}`);
    symlinkSync(root, link);
    const inv = await inventory(link);
    expect(inv.root.path).toBe(root);
    expect(inv.sources.map((s) => s.path)).toEqual(['a.md']);
  });

  test('bounds stop the walk with a limit issue, never a silent cut', async () => {
    const root = tree({ 'a.md': '', 'b.md': '', 'c.md': '', 'd/e/f/g.md': '' });
    const files = await inventory(root, { files: 2, dirs: 50, depth: 32 });
    expect(files.sources.map((s) => s.path)).toEqual(['a.md', 'b.md']);
    expect(files.issues).toEqual([{ path: 'c.md', reason: 'limit' }]);
    expect(files.complete).toBe(false);
    const depth = await inventory(root, { files: 50, dirs: 50, depth: 1 });
    expect(depth.issues).toEqual([{ path: 'd/e', reason: 'limit' }]);
    expect(depth.complete).toBe(false);
    const dirs = await inventory(root, { files: 50, dirs: 2, depth: 32 });
    expect(dirs.issues).toEqual([{ path: 'd/e', reason: 'limit' }]);
  });

  test.skipIf(process.getuid?.() === 0)('an unreadable directory is an issue; the rest is listed', async () => {
    const root = tree({ 'a.md': '', 'locked/b.md': '' });
    const { chmodSync } = await import('node:fs');
    chmodSync(join(root, 'locked'), 0o000);
    try {
      const inv = await inventory(root);
      expect(inv.sources.map((s) => s.path)).toEqual(['a.md']);
      expect(inv.issues).toEqual([{ path: 'locked', reason: 'unreadable' }]);
      expect(inv.complete).toBe(false);
    } finally {
      chmodSync(join(root, 'locked'), 0o755);
    }
  });

  test('refuses a root that is not a directory', async () => {
    const root = tree({ 'a.md': '' });
    await expect(inventory(join(root, 'a.md'))).rejects.toThrow('--root is not a readable directory');
    await expect(inventory(join(root, 'missing'))).rejects.toThrow('--root is not a readable directory');
  });
});

test('planInput carries the agreed planner fields', async () => {
  const root = tree({ 'a.md': 'a' });
  const inv = await inventory(root);
  const args = parseArgs('plan', ['--root', root, ...TARGET]);
  expect(planInput(args, inv, '#mdhouse@box')).toEqual({
    caller: '#mdhouse@box',
    target: { filescan: '#filescan/notes@box', rag: '#rag/notes@box', namespace: 'notes', table: 'md' },
    root: inv.root,
    include: ['*.md'],
    exclude: ['**/.*', '**/node_modules/**', '**/bower_components/**', '**/jspm_packages/**'],
    inventory: { root: inv.root, complete: true, issues: [] },
    sources: [...inv.sources],
    oversizeLimit: 32768,
  });
  expect(EXCLUDE_GLOBS).toEqual(planInput(args, inv, 'x').exclude);
});

describe('main', () => {
  test('help: exit 0; no command: help on exit 2', async () => {
    const a = io();
    expect(await main(['--help'], a.io)).toBe(EXIT.ok);
    expect(a.out.join('')).toContain('mdhouse-rag-sync sync   <target> --apply');
    const b = io();
    expect(await main([], b.io)).toBe(EXIT.usage);
  });

  test.each(['sync', 'search'])('%s: an incomplete listing never reaches the bus', async (cmd) => {
    const root = tree({ 'a.md': '' });
    symlinkSync(join(root, 'a.md'), join(root, 'l.md'));
    const a = io();
    let opened = 0;
    const extra = cmd === 'sync' ? ['--apply'] : ['--query', 'q'];
    expect(await main([cmd, '--root', root, ...TARGET, ...extra], a.io, { openBus: async () => (opened++, ({}) as RagBus) })).toBe(EXIT.runtime);
    expect(opened).toBe(0);
    expect(a.err.join('')).toContain('nothing was sent');
  });

  test.each(['sync', 'search'])('%s: a refused bus setup is exit 1, nothing sent, the session bound to the plan', async (cmd) => {
    const root = tree({ 'a.md': '' });
    const a = io();
    let got: BusOptions | null = null;
    const openBus = async (o: BusOptions): Promise<RagBus> => {
      got = o;
      throw new RagBusError('agent', '#mdhouse@box is not a registered agent');
    };
    const extra = cmd === 'sync' ? ['--apply'] : ['--query', 'SECRET'];
    expect(await main([cmd, '--root', root, ...TARGET, ...extra], a.io, { openBus })).toBe(EXIT.runtime);
    expect(a.err.join('')).toBe(`mdhouse-rag-sync: ${cmd} refused: agent: #mdhouse@box is not a registered agent; nothing was sent\n`);
    expect(got!).toMatchObject({ replyMs: REPLY_MS[cmd as 'sync' | 'search'], root: (await inventory(root)).root, targets: ['#filescan/notes@box', '#rag/notes@box'] });
    expect(a.out.join('') + a.err.join('')).not.toContain('SECRET');
  });

  test('an unknown command or bad flag is usage, without echoing it', async () => {
    const a = io();
    expect(await main(['SECRET'], a.io)).toBe(EXIT.usage);
    const b = io();
    expect(await main(['plan', '--root', '/x', ...TARGET, '--token=SECRET'], b.io)).toBe(EXIT.usage);
    expect(a.err.join('') + b.err.join('')).not.toContain('SECRET');
  });

  test('plan prints JSON; exit 0 when complete, 1 with issues', async () => {
    const root = tree({ 'a.md': 'a' });
    const a = io();
    expect(await main(['plan', '--root', root, ...TARGET], a.io)).toBe(EXIT.ok);
    const plan = JSON.parse(a.out.join(''));
    expect(plan).toMatchObject({ kind: 'local-plan-only', execution: 'not-performed', root: { path: root } });
    expect(plan.coverage).toMatchObject({ status: 'metadata-only', inventoryComplete: true, total: 1, eligible: 1, issues: 0 });
    expect(plan.digest).toMatch(/^[0-9a-f]{64}$/);
    symlinkSync(join(root, 'a.md'), join(root, 'l.md'));
    const b = io();
    expect(await main(['plan', '--root', root, ...TARGET], b.io)).toBe(EXIT.runtime);
    expect(JSON.parse(b.out.join('')).coverage).toMatchObject({ status: 'partial', issues: 1 });
    expect(b.err.join('')).toContain('incomplete');
  });

  test('only lowercase *.md matches, as the planner include does: .MD is ignored, not a refusal', async () => {
    const root = tree({ 'a.md': 'a', 'UPPER.MD': 'b' });
    const a = io();
    expect(await main(['plan', '--root', root, ...TARGET], a.io)).toBe(EXIT.ok);
    const plan = JSON.parse(a.out.join(''));
    expect(plan.sources.map((s: { path: string }) => s.path)).toEqual(['a.md']);
    expect(plan.inventory.issues).toEqual([]);
  });

  test('plan never reads file content', async () => {
    const root = tree({ 'a.md': 'CONTENT-MARKER' });
    const a = io();
    await main(['plan', '--root', root, ...TARGET], a.io);
    expect(a.out.join('')).not.toContain('CONTENT-MARKER');
  });

  test('a missing root is exit 1', async () => {
    const a = io();
    expect(await main(['plan', '--root', join(base, 'nope'), ...TARGET], a.io)).toBe(EXIT.runtime);
  });
});

describe('sync and search through the runtime, against a fake bus', () => {
  const EXCL = ['node_modules/**', '*/node_modules/**', '.*', '*/.*', 'bower_components/**', '*/bower_components/**', 'jspm_packages/**', '*/jspm_packages/**'];
  const STATUS = { mode: 'demand', effective_mode: 'demand', fallback: null, tracked: 1, last_scan: null, skipped: [], state_bytes: 0, state_max: 1, subscribers: [], paused: null, skipped_for_rag: {} };
  const CAPS = {
    version: '0.4.2', methods: ['upsert', 'get', 'search'], modes: ['keyword'], embedding_model: 'm', dimensions: 1024,
    limits: { body_bytes: 1048576, record_bytes: 1, data_bytes: 32768, chunks: 1, embedding_scalars: 1, query_bytes: 1024, page_records: 16, catalogue_bytes: 1, namespaces: 1, tables_per_namespace: 1 },
  };
  type Req = { target: string; body?: unknown; ask?: string };
  /** The agent's KV and log, in memory; `down` makes every step fail as an unreachable daemon would. */
  const memStore = (down = false) => {
    const kv = new Map<string, Record<string, unknown>>();
    const logs: Array<[string, string]> = [];
    const gate = () => {
      if (down) throw new RagBusError('store', 'daemon unreachable');
    };
    const store: RagStore = {
      get: async (n) => (gate(), kv.has(n) ? structuredClone(kv.get(n)!) : null),
      add: async (n, v) => (gate(), kv.has(n) ? false : (kv.set(n, structuredClone(v)), true)),
      set: async (n, v) => (gate(), void kv.set(n, structuredClone(v))),
      delete: async (n) => (gate(), kv.delete(n)),
      names: async (prefix) => (gate(), [...kv.keys()].filter((k) => k.startsWith(prefix))),
      log: async (level, text) => (gate(), void logs.push([level, text])),
    };
    return { store, kv, logs };
  };
  /** A RagBus whose answers come from `answer`; records every request. */
  const fakeBus = (root: string, answer: (r: Req) => unknown, config: Record<string, unknown> = {}, mem = memStore()) => {
    const reqs: Req[] = [];
    const openBus = async (o: BusOptions): Promise<RagBus> => ({
      me: '#mdhouse@box',
      account: 'parf',
      store: mem.store,
      ownerConfig: async (filescan) => ({ filescan, root: o.root, config: { dir: root, include: ['*.md'], exclude: EXCL, namespace: 'notes', table: 'md', mode: 'demand', ...config } }),
      request: async (r) => {
        reqs.push(r);
        return answer(r) as never;
      },
    });
    return { reqs, openBus, mem };
  };
  const reply = (v: unknown) => ({ kind: 'reply', body: typeof v === 'string' ? v : JSON.stringify(v) });
  const preflightThen = (sync: unknown) => (r: Req) =>
    r.body === 'status' ? reply(STATUS) : r.ask === 'status' ? reply('ok: collection verified (RAG 0.4.2)') : (r.body as { method?: string })?.method === 'capabilities' ? reply(CAPS) : sync;
  const run = async (args: string[], bus: ReturnType<typeof fakeBus>) => {
    const a = io();
    const code = await main(args, a.io, { openBus: bus.openBus });
    return { code, out: a.out.join(''), err: a.err.join('') };
  };

  test.each([
    ['confirmed', reply({ result: 'confirmed', confirmed: 1, remaining: 0, capped: false, sent: 1, files: [] }), EXIT.ok],
    ['incomplete', reply({ result: 'incomplete', confirmed: 0, remaining: 1, capped: true, sent: 1, files: [] }), EXIT.incomplete],
    ['unknown', reply({ result: 'unknown', confirmed: 0, remaining: 1, capped: false, sent: 1, files: [{ path: 'a.md', state: 'unknown', reason: 'lost' }] }), EXIT.unknown],
    ['failed', reply({ result: 'failed', confirmed: 0, remaining: 1, capped: false, sent: 1, files: [{ path: 'a.md', state: 'failed', reason: 'refused' }] }), EXIT.runtime],
    ['a lost answer', { kind: 'uncertain', sent: true, reason: 'no answer before the deadline' }, EXIT.unknown],
    ['a refused send', { kind: 'uncertain', sent: false, reason: 'send refused: HTTP 403' }, EXIT.runtime],
    ['a malformed answer', reply('{"result":"confirmed","result":"confirmed"}'), EXIT.unknown],
  ])('sync: %s', async (_, syncAnswer, code) => {
    const root = tree({ 'a.md': 'a' });
    const bus = fakeBus(root, preflightThen(syncAnswer));
    const r = await run(['sync', '--root', root, ...TARGET, '--apply'], bus);
    expect(r.code).toBe(code);
    expect(JSON.parse(r.out)).toHaveProperty('effect');
    // one sync, after the preflight
    const syncs = bus.reqs.filter((q) => typeof q.body === 'string' && q.body.startsWith('sync '));
    expect(syncs).toEqual([{ target: '#filescan/notes@box', body: 'sync #rag/notes@box as rag notes md resend:true' }]);
  });

  test('sync --until-done repeats with back-off until confirmed', async () => {
    const root = tree({ 'a.md': 'a', 'b.md': 'b' });
    const rep = (result: string, confirmed: number) => reply({ result, confirmed, remaining: 2 - confirmed, capped: false, sent: 1, files: [] });
    const syncs = [rep('incomplete', 1), rep('failed', 1), { kind: 'uncertain', sent: true, reason: 'lost' }, rep('failed', 1), rep('incomplete', 1), rep('confirmed', 2)];
    const bus = fakeBus(root, preflightThen(null));
    const answer = preflightThen(null);
    const waits: number[] = [];
    const a = io();
    const openBus = async (o: BusOptions) => ({ ...(await bus.openBus(o)), request: async (r: Req) => (bus.reqs.push(r), (typeof r.body === 'string' && r.body.startsWith('sync ') ? syncs.shift() : answer(r)) as never) });
    const code = await main(['sync', '--root', root, ...TARGET, '--apply', '--until-done'], a.io, { openBus, sleep: async (ms) => void waits.push(ms) });
    expect(code).toBe(EXIT.ok);
    expect(waits).toEqual([5_000, 10_000, 20_000, 40_000, 80_000]);
    expect(JSON.parse(a.out.join('')).result).toBe('confirmed');
    expect(a.err.join('').split('\n').filter(Boolean)).toHaveLength(6);
  });

  test('sync --until-done stops on a first-round refusal and caps the wait', async () => {
    const root = tree({ 'a.md': 'a' });
    const refused = fakeBus(root, preflightThen({ kind: 'uncertain', sent: false, reason: 'send refused: HTTP 403' }));
    const waits: number[] = [];
    const a = io();
    expect(await main(['sync', '--root', root, ...TARGET, '--apply', '--until-done'], a.io, { openBus: refused.openBus, sleep: async (ms) => void waits.push(ms) })).toBe(EXIT.runtime);
    expect(waits).toEqual([]);
    let n = 0;
    const once = async () => (++n < 9 ? { effect: 'unknown' as const, result: 'unknown' as const, report: null, reason: 'lost' } : { effect: 'reported' as const, result: 'confirmed' as const, report: null, reason: null });
    const w: number[] = [];
    expect(await untilDone(once, io().io, async (ms) => void w.push(ms))).toBe(EXIT.ok);
    expect(Math.max(...w)).toBe(BACKOFF.maxMs);
  });

  describe('--until-done', () => {
    const rep = (result: 'incomplete' | 'unknown' | 'failed' | 'confirmed', confirmed: number) => ({
      effect: 'reported' as const,
      result,
      reason: null,
      report: { result, confirmed, remaining: result === 'confirmed' ? 0 : 1, sent: 1, capped: false, files: [] },
    });
    const script = (rounds: Array<ReturnType<typeof rep>>) => {
      let i = 0;
      return async () => {
        if (i > 100) throw new Error('still looping after 100 rounds');
        return rounds[Math.min(i++, rounds.length - 1)]!;
      };
    };
    const waitsOf = async (once: () => Promise<never>) => {
      const waits: number[] = [];
      const a = io();
      const code = await untilDone(once, a.io, async (ms) => void waits.push(ms));
      return { code, waits, out: a.out.join(''), err: a.err.join('') };
    };

    test.each([
      ['incomplete', EXIT.incomplete],
      ['unknown', EXIT.unknown],
      ['failed', EXIT.runtime],
    ] as const)('%s with nothing more confirmed: gives up after the rounds at the cap, with the last result and exit %p', async (result, exit) => {
      const r = await waitsOf(script([rep(result, 1)]) as never);
      expect(r.code).toBe(exit);
      const atCap = r.waits.filter((w) => w === BACKOFF.maxMs);
      expect(atCap).toHaveLength(STALLED_ROUNDS);
      expect(r.waits).toEqual([5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 320_000, 640_000, 900_000, 900_000, 900_000]);
      expect(JSON.parse(r.out)).toMatchObject({ effect: 'reported', result });
      expect(r.err).toContain('giving up');
    });

    test('a round that confirms more resets the count and the wait', async () => {
      const seq = Array.from({ length: 9 }, () => rep('incomplete', 1));
      const rounds = [...seq, rep('incomplete', 1), rep('incomplete', 1), rep('incomplete', 2), ...Array.from({ length: 20 }, () => rep('incomplete', 2))];
      const r = await waitsOf(script(rounds) as never);
      expect(r.code).toBe(EXIT.incomplete);
      const i = r.waits.indexOf(5_000, 1);
      expect(i).toBeGreaterThan(8);
      expect(r.waits.slice(i)).toEqual([5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 320_000, 640_000, 900_000, 900_000, 900_000, 900_000].slice(0, r.waits.length - i));
      expect(r.waits.slice(i).filter((w) => w === BACKOFF.maxMs)).toHaveLength(STALLED_ROUNDS);
    });

    test('a first round with nothing confirmed is not progress', async () => {
      const r = await waitsOf(script([rep('incomplete', 0), rep('incomplete', 0), rep('incomplete', 1), rep('incomplete', 1), rep('confirmed', 2)]) as never);
      expect(r.code).toBe(EXIT.ok);
      expect(r.waits).toEqual([10_000, 20_000, 5_000, 10_000]);
    });

    const untilBus = (root: string, syncs: unknown[]) => {
      const bus = fakeBus(root, preflightThen(null));
      const answer = preflightThen(null);
      let configs = 0;
      const openBus = async (o: BusOptions) => {
        const b = await bus.openBus(o);
        return {
          ...b,
          ownerConfig: async (f: string) => (configs++, b.ownerConfig(f)),
          request: async (r: Req) => (bus.reqs.push(r), (typeof r.body === 'string' && r.body.startsWith('sync ') ? syncs.shift() : answer(r)) as never),
        };
      };
      const syncCount = () => bus.reqs.filter((q) => typeof q.body === 'string' && q.body.startsWith('sync ')).length;
      return { openBus, configs: () => configs, syncCount };
    };
    const incomplete = reply({ result: 'incomplete', confirmed: 1, remaining: 1, capped: false, sent: 1, files: [] });
    const confirmed = reply({ result: 'confirmed', confirmed: 2, remaining: 0, capped: false, sent: 1, files: [] });

    test('every round lists the root, plans and reads the owner configuration again', async () => {
      const root = tree({ 'a.md': 'a' });
      const t = untilBus(root, [incomplete, confirmed]);
      const a = io();
      let sleeps = 0;
      const code = await main(['sync', '--root', root, ...TARGET, '--apply', '--until-done'], a.io, {
        openBus: t.openBus,
        sleep: async () => {
          // a file that grows past the sync limit between rounds is caught by the new plan, not sent
          if (++sleeps === 1) writeFileSync(join(root, 'big.md'), 'x'.repeat(1_048_577));
          else unlinkSync(join(root, 'big.md'));
        },
      });
      expect(code).toBe(EXIT.ok);
      expect(t.configs()).toBe(3);
      expect(t.syncCount()).toBe(2);
      expect(a.err.join('')).toContain('sync-preflight-refused');
    });

    test('a listing that becomes incomplete stops it like round 1: exit 1, nothing more sent', async () => {
      const root = tree({ 'a.md': 'a' });
      const t = untilBus(root, [incomplete, confirmed]);
      const a = io();
      const code = await main(['sync', '--root', root, ...TARGET, '--apply', '--until-done'], a.io, {
        openBus: t.openBus,
        sleep: async () => symlinkSync(join(root, 'a.md'), join(root, 'link.md')),
      });
      expect(code).toBe(EXIT.runtime);
      expect(t.syncCount()).toBe(1);
      expect(a.err.join('')).toContain('the listing is incomplete');
      expect(a.out.join('')).toBe('');
    });

    test('another directory at the root path stops it', async () => {
      const root = tree({ 'a.md': 'a' });
      const t = untilBus(root, [incomplete, confirmed]);
      const a = io();
      const code = await main(['sync', '--root', root, ...TARGET, '--apply', '--until-done'], a.io, {
        openBus: t.openBus,
        sleep: async () => {
          renameSync(root, `${root}.old`);
          mkdirSync(root);
          writeFileSync(join(root, 'a.md'), 'a');
        },
      });
      expect(code).toBe(EXIT.runtime);
      expect(t.syncCount()).toBe(1);
      expect(a.err.join('')).toContain('the root changed');
    });

    test('the owner configuration read for a round is the one it is checked against', async () => {
      const root = tree({ 'a.md': 'a' });
      const t = untilBus(root, [incomplete, confirmed]);
      let n = 0;
      const openBus = async (o: BusOptions) => {
        const b = await t.openBus(o);
        return {
          ...b,
          ownerConfig: async (f: string) => {
            const c = await b.ownerConfig(f);
            return ++n > 1 ? { ...c, config: { ...c.config, namespace: 'other' } } : c;
          },
        };
      };
      const a = io();
      expect(await main(['sync', '--root', root, ...TARGET, '--apply', '--until-done'], a.io, { openBus, sleep: async () => {} })).toBe(EXIT.runtime);
      expect(t.syncCount()).toBe(1);
      expect(a.err.join('')).toContain('sync-preflight-refused');
    });

    test('a refused owner configuration mid-run stops it with exit 1', async () => {
      const root = tree({ 'a.md': 'a' });
      const t = untilBus(root, [incomplete, confirmed]);
      let n = 0;
      const openBus = async (o: BusOptions) => {
        const b = await t.openBus(o);
        return { ...b, ownerConfig: async (f: string) => (++n > 1 ? Promise.reject(new RagBusError('owner config', 'unavailable')) : b.ownerConfig(f)) };
      };
      const a = io();
      expect(await main(['sync', '--root', root, ...TARGET, '--apply', '--until-done'], a.io, { openBus, sleep: async () => {} })).toBe(EXIT.runtime);
      expect(t.syncCount()).toBe(1);
      expect(a.err.join('')).toContain('owner config: unavailable');
    });
  });

  describe('source registry, history and log on the agent\'s KV', () => {
    const done = (result: string, confirmed: number, remaining: number, files: unknown[] = []) => reply({ result, confirmed, remaining, capped: false, sent: 1, files });
    const confirmed1 = done('confirmed', 1, 0);
    const hist = (mem: ReturnType<typeof memStore>) => [...mem.kv.entries()].filter(([k]) => k.startsWith('rag/hist/notes/md/'));
    const sync = (root: string, bus: ReturnType<typeof fakeBus>, ...extra: string[]) => run(['sync', '--root', root, ...TARGET, '--apply', ...extra], bus);

    test('the first sync registers the source and records the run and one notice; the next finds it', async () => {
      const root = tree({ 'a.md': 'a' });
      const mem = memStore();
      const bus = fakeBus(root, preflightThen(confirmed1), {}, mem);
      expect((await sync(root, bus)).code).toBe(EXIT.ok);
      expect(mem.kv.get('rag/source/notes/md')).toMatchObject({ v: 1, filescan: '#filescan/notes@box', rag: '#rag/notes@box', namespace: 'notes', table: 'md', by: '#mdhouse@box', root: { path: (await inventory(root)).root.path } });
      expect(mem.kv.get('rag/last/notes/md')).toMatchObject({ v: 1, rounds: 1, untilDone: false, result: 'confirmed', exit: 0, confirmed: 1, remaining: 0, sent: 1 });
      expect(hist(mem)).toHaveLength(1);
      expect(hist(mem)[0]![0]).toMatch(/^rag\/hist\/notes\/md\/\d{8}T\d{6}Z-[0-9a-f]{4}$/);
      expect(mem.logs).toEqual([['notice', 'rag-sync notes/md: confirmed 1 files in 1 rounds']]);
      const created = (mem.kv.get('rag/source/notes/md') as { createdAt: string }).createdAt;
      expect((await sync(root, bus)).code).toBe(EXIT.ok);
      expect(hist(mem)).toHaveLength(2);
      expect((mem.kv.get('rag/source/notes/md') as { createdAt: string }).createdAt).toBe(created);
    });

    test('a source the registry holds for another folder is refused before anything is sent', async () => {
      const root = tree({ 'a.md': 'a' });
      const mem = memStore();
      mem.kv.set('rag/source/notes/md', { v: 1, root: { path: '/somewhere/else' }, filescan: '#filescan/notes@box', rag: '#rag/notes@box', namespace: 'notes', table: 'md' });
      const bus = fakeBus(root, preflightThen(confirmed1), {}, mem);
      const r = await sync(root, bus);
      expect(r.code).toBe(EXIT.runtime);
      expect(r.out).toBe('');
      expect(r.err).toContain('another folder, FileScan or RAG; nothing was sent');
      expect(bus.reqs).toEqual([]);
      expect([...mem.kv.keys()]).toEqual(['rag/source/notes/md']);
      expect(mem.logs).toEqual([['alert', 'rag-sync notes/md: refused, the registry holds another folder, FileScan or RAG for it']]);
    });

    test('a failed or unfinished sync is recorded with its exit, its unconfirmed files and a warning', async () => {
      const root = tree({ 'a.md': 'a', 'b.md': 'b' });
      const mem = memStore();
      const bus = fakeBus(root, preflightThen(done('failed', 1, 1, [{ path: 'b.md', state: 'failed', reason: 'refused' }])), {}, mem);
      expect((await sync(root, bus)).code).toBe(EXIT.runtime);
      expect(mem.kv.get('rag/last/notes/md')).toMatchObject({ result: 'failed', exit: EXIT.runtime, confirmed: 1, remaining: 1 });
      expect(hist(mem)[0]![1]).toMatchObject({ files: [{ path: 'b.md', state: 'failed' }] });
      expect(mem.kv.get('rag/last/notes/md')).not.toHaveProperty('files');
      expect(mem.logs).toEqual([['warning', 'rag-sync notes/md: failed, 1 remaining']]);
    });

    test('--until-done records its rounds once; giving up is an alert', async () => {
      const root = tree({ 'a.md': 'a', 'b.md': 'b' });
      const mem = memStore();
      const bus = fakeBus(root, preflightThen(done('incomplete', 1, 1)), {}, mem);
      const a = io();
      const code = await main(['sync', '--root', root, ...TARGET, '--apply', '--until-done'], a.io, { openBus: bus.openBus, sleep: async () => {} });
      expect(code).toBe(EXIT.incomplete);
      expect(mem.kv.get('rag/last/notes/md')).toMatchObject({ untilDone: true, result: 'incomplete', exit: EXIT.incomplete, rounds: 12 });
      expect(hist(mem)).toHaveLength(1);
      expect(mem.logs).toEqual([['alert', 'rag-sync notes/md: gave up after 3 rounds at the 15 min wait']]);
    });

    test('--until-done confirmed after some rounds: one notice with the rounds', async () => {
      const root = tree({ 'a.md': 'a' });
      const mem = memStore();
      const syncs = [done('incomplete', 0, 1), confirmed1];
      const bus = fakeBus(root, (r) => (typeof r.body === 'string' && r.body.startsWith('sync ') ? syncs.shift() : preflightThen(null)(r)), {}, mem);
      const a = io();
      expect(await main(['sync', '--root', root, ...TARGET, '--apply', '--until-done'], a.io, { openBus: bus.openBus, sleep: async () => {} })).toBe(EXIT.ok);
      expect(mem.kv.get('rag/last/notes/md')).toMatchObject({ rounds: 2, result: 'confirmed' });
      expect(mem.logs).toEqual([['notice', 'rag-sync notes/md: confirmed 1 files in 2 rounds']]);
    });

    test('an unreachable KV is said once and changes neither the result, the output nor the exit', async () => {
      const root = tree({ 'a.md': 'a' });
      const up = fakeBus(root, preflightThen(confirmed1));
      const down = fakeBus(root, preflightThen(confirmed1), {}, memStore(true));
      const good = await sync(root, up);
      const bad = await sync(root, down);
      expect(bad.code).toBe(good.code);
      expect(bad.out).toBe(good.out);
      expect(down.reqs).toEqual(up.reqs);
      expect(bad.err.split('\n').filter(Boolean)).toEqual(['mdhouse-rag-sync: the KV registry is unavailable (store: daemon unreachable); continuing without it']);
      expect(good.err).toBe('');
    });

    test('a KV that fails only on writes does not fail the sync either', async () => {
      const root = tree({ 'a.md': 'a' });
      const mem = memStore();
      const real = mem.store.set;
      mem.store.set = async () => {
        throw new RagBusError('store', 'HTTP 503');
      };
      const bus = fakeBus(root, preflightThen(confirmed1), {}, mem);
      const r = await sync(root, bus);
      expect(r.code).toBe(EXIT.ok);
      expect(JSON.parse(r.out).result).toBe('confirmed');
      expect(r.err).toContain('store: HTTP 503');
      expect(mem.kv.has('rag/source/notes/md')).toBe(true);
      expect(mem.logs).toEqual([]);
      mem.store.set = real;
    });

    test('plan and search keep and log nothing', async () => {
      const root = tree({ 'a.md': 'a' });
      const mem = memStore();
      const bus = fakeBus(root, () => reply({ mode: 'keyword', records: [] }), {}, mem);
      expect((await run(['search', '--root', root, ...TARGET, '--query', 'q'], bus)).code).toBe(EXIT.ok);
      expect((await run(['plan', '--root', root, ...TARGET], bus)).code).toBe(EXIT.ok);
      expect(mem.kv.size).toBe(0);
      expect(mem.logs).toEqual([]);
    });
  });

  test('sync always asks the FileScan to resend unconfirmed files', async () => {
    const root = tree({ 'a.md': 'a' });
    const bus = fakeBus(root, preflightThen(reply({ result: 'confirmed', confirmed: 1, remaining: 0, capped: false, sent: 1, files: [] })));
    expect((await run(['sync', '--root', root, ...TARGET, '--apply'], bus)).code).toBe(EXIT.ok);
    expect(bus.reqs.at(-1)).toEqual({ target: '#filescan/notes@box', body: 'sync #rag/notes@box as rag notes md resend:true' });
  });

  test.each([
    ['another dir', { dir: '/elsewhere' }],
    ['a watching FileScan', { mode: 'both' }],
    ['another namespace', { namespace: 'other' }],
    ['an unknown exclude rule', { exclude: [...EXCL.slice(1), 'x/**'] }],
  ])('sync: owner config with %s sends nothing', async (_, config) => {
    const root = tree({ 'a.md': 'a' });
    const bus = fakeBus(root, preflightThen(reply({})), config);
    const r = await run(['sync', '--root', root, ...TARGET, '--apply'], bus);
    expect(r.code).toBe(EXIT.runtime);
    expect(bus.reqs).toEqual([]);
  });

  test('search: keyword by default, one request to the RAG', async () => {
    const root = tree({ 'a.md': 'a' });
    const rec = { namespace: 'notes', tableName: 'md', id: 'a.md', source: 'a.md', content_hash: 'a'.repeat(64), indexed_at: '2026-11-06T00:00:00Z', chunk_index: 0, excerpt: 'x', scores: { bm25: 1 } };
    const bus = fakeBus(root, () => reply({ mode: 'keyword', records: [rec] }));
    const r = await run(['search', '--root', root, ...TARGET, '--query', 'q'], bus);
    expect(r.code).toBe(EXIT.ok);
    expect(bus.reqs).toEqual([{ target: '#rag/notes@box', body: { method: 'search', namespace: 'notes', tableName: 'md', query: 'q', mode: 'keyword', limit: 5 } }]);
    const lost = fakeBus(root, () => ({ kind: 'uncertain', sent: true, reason: 'x' }));
    expect((await run(['search', '--root', root, ...TARGET, '--query', 'q'], lost)).code).toBe(EXIT.unknown);
  });

  describe('search citations computed from the local file', () => {
    const sha = (t: string) => createHash('sha256').update(t).digest('hex');
    const rec = (source: string, hash: string, excerpt: string, more: Record<string, unknown> = {}) => ({
      namespace: 'notes', tableName: 'md', id: source, source, content_hash: hash, indexed_at: '2026-11-06T00:00:00Z', chunk_index: 0, excerpt, scores: { bm25: 1 }, ...more,
    });
    const search = async (root: string, records: unknown[]) => {
      const bus = fakeBus(root, () => reply({ mode: 'keyword', records }));
      const r = await run(['search', '--root', root, ...TARGET, '--query', 'q'], bus);
      return { ...r, records: r.out ? (JSON.parse(r.out).result?.records as Array<Record<string, unknown>> | undefined) : undefined };
    };
    const NOTE = '# Notes\n\n## Plan\n\nfirst\nsecond\n';

    test('a record without a location gets lines and the heading chain; one with a location is untouched', async () => {
      const root = tree({ 'a.md': NOTE, 'b.md': NOTE });
      const given = rec('b.md', sha(NOTE), 'first', { heading_path: ['X'], lines: [9, 9] });
      const r = await search(root, [rec('a.md', sha(NOTE), 'first\nsecond\n'), given]);
      expect(r.code).toBe(EXIT.ok);
      expect(r.records![0]).toMatchObject({ source: 'a.md', lines: [5, 6], heading_path: ['Notes', 'Plan'] });
      expect(r.records![0]).not.toHaveProperty('stale');
      expect(r.records![1]).toEqual(given);
    });

    test('a changed file is stale: no lines, no heading path', async () => {
      const root = tree({ 'a.md': NOTE });
      const r = await search(root, [rec('a.md', sha('# Old\n'), 'first')]);
      expect(r.records![0]).toMatchObject({ source: 'a.md', stale: true });
      expect(r.records![0]).not.toHaveProperty('lines');
      expect(r.records![0]).not.toHaveProperty('heading_path');
    });

    test('an excerpt the file does not hold, or a missing file, leaves the record as it was', async () => {
      const root = tree({ 'a.md': NOTE });
      const lost = rec('a.md', sha(NOTE), 'not in the file');
      const gone = rec('gone.md', sha(NOTE), 'first');
      expect((await search(root, [lost, gone])).records).toEqual([lost, gone]);
    });

    test('a source outside the root is not read: the reply is refused whole, and citeRecords itself leaves it as it was', async () => {
      const root = tree({ 'a.md': NOTE });
      writeFileSync(join(root, '..', 'x.md'), NOTE);
      const r = await search(root, [rec('../x.md', sha(NOTE), 'first')]);
      expect(r.code).toBe(EXIT.unknown);
      expect(JSON.parse(r.out)).toMatchObject({ effect: 'unknown', result: null });

      const escape = rec('../x.md', sha(NOTE), 'first');
      const abs = rec('/etc/hostname', sha(NOTE), 'first');
      expect(await citeRecords([escape as never, abs as never], root)).toEqual([escape, abs]);
    });

    test('a symlink out of the root, a non-Markdown source and an oversized file are not read', async () => {
      const root = tree({ 'a.md': NOTE, 'b.txt': NOTE, 'big.md': `# Big\n\n${'x'.repeat(1_048_577)}\n` });
      writeFileSync(join(root, '..', 'outside.md'), NOTE);
      symlinkSync(join(root, '..', 'outside.md'), join(root, 'link.md'));
      const records = [rec('link.md', sha(NOTE), 'first'), rec('b.txt', sha(NOTE), 'first'), rec('big.md', sha('#'), 'x')];
      expect(await citeRecords(records as never, root)).toEqual(records);
    });
  });
});

test('exit codes: 0 only for a confirmed sync or a reported search', () => {
  expect(resultExit('sync', { effect: 'reported', result: 'confirmed' })).toBe(EXIT.ok);
  expect(resultExit('sync', { effect: 'reported', result: 'incomplete' })).toBe(EXIT.incomplete);
  expect(resultExit('sync', { effect: 'reported', result: 'unknown' })).toBe(EXIT.unknown);
  expect(resultExit('sync', { effect: 'reported', result: 'failed' })).toBe(EXIT.runtime);
  expect(resultExit('sync', { effect: 'reported', result: null })).toBe(EXIT.runtime);
  expect(resultExit('sync', { effect: 'unknown', result: null })).toBe(EXIT.unknown);
  expect(resultExit('sync', { effect: 'notsent', result: null })).toBe(EXIT.runtime);
  expect(resultExit('search', { effect: 'reported', result: {} })).toBe(EXIT.ok);
  expect(resultExit('search', { effect: 'reported', result: null })).toBe(EXIT.runtime);
  expect(resultExit('search', { effect: 'unknown', result: null })).toBe(EXIT.unknown);
  expect(resultExit('search', { effect: 'notsent', result: null })).toBe(EXIT.runtime);
});

test('the bin runs under Bun: help 0; sync without --apply is usage, before any listing', () => {
  const bin = join(import.meta.dir, '../bin/mdhouse-rag-sync');
  expect(spawnSync(bin, ['--help'], { encoding: 'utf8' }).status).toBe(0);
  const r = spawnSync(bin, ['sync', '--root', '/nonexistent', ...TARGET], { encoding: 'utf8' });
  expect(r.status).toBe(2);
  expect(r.stderr).toContain('add --apply');
});
