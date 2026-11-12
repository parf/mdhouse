import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RagBusError, type BusOptions, type RagBus } from '../src/lib/rag-sync-bus';
import { BACKOFF, EXCLUDE_GLOBS, EXIT, inventory, main, parseArgs, planInput, REPLY_MS, resultExit, untilDone } from '../src/rag-sync-cli';

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
  /** A RagBus whose answers come from `answer`; records every request. */
  const fakeBus = (root: string, answer: (r: Req) => unknown, config: Record<string, unknown> = {}) => {
    const reqs: Req[] = [];
    const openBus = async (o: BusOptions): Promise<RagBus> => ({
      me: '#mdhouse@box',
      account: 'parf',
      ownerConfig: async (filescan) => ({ filescan, root: o.root, config: { dir: root, include: ['*.md'], exclude: EXCL, namespace: 'notes', table: 'md', mode: 'demand', ...config } }),
      request: async (r) => {
        reqs.push(r);
        return answer(r) as never;
      },
    });
    return { reqs, openBus };
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
