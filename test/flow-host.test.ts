import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { commitOf, dirtyPaths, headCommit, isAncestor, rangeCommits } from '../src/lib/git';
import { applyFlowAction, docFlow, isFlowError, verifyRun, planFlowRun, sealKeyAt, runIdFor, startFlowRun, TOKEN_TTL_MS, type FlowActed, type FlowHostDeps, type FlowStartRequest, type FlowWrite } from '../src/lib/flow-host';
import { loadFlowCatalog } from '../src/lib/flow-package';
import { advanceDestination, markerOf, readFlowRunDocument, readFlowRunMeta } from '../src/lib/flow-run-markdown';
import { Registry } from '../src/lib/roots';
import { repoToplevel } from '../src/lib/scan';

const DOC = resolve(import.meta.dir, '../doc');
const PKG = 'recent-commits-review';
const DEST = 'Plans/flows/recent-commits-review.md';
const tester = async () => 'tester';

function git(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

let dir = '';
let proj = '';
const c: string[] = [];
const catalog = loadFlowCatalog(join(DOC, 'flows'));

beforeAll(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-flow-host-')));
  proj = join(dir, 'proj');
  await mkdir(proj);
  git(proj, 'init', '-q', '-b', 'main');
  for (const n of [1, 2, 3]) {
    await writeFile(join(proj, `n${n}.md`), `# ${n}\n`);
    git(proj, 'add', '-A');
    git(proj, 'commit', '-qm', `c${n}`);
    c.push(git(proj, 'rev-parse', 'HEAD'));
  }
  // A commit off main: not an ancestor of HEAD.
  git(proj, 'checkout', '-qb', 'side', c[0]!);
  await writeFile(join(proj, 'side.md'), '# side\n');
  git(proj, 'add', '-A');
  git(proj, 'commit', '-qm', 'side');
  c.push(git(proj, 'rev-parse', 'HEAD'));
  git(proj, 'checkout', '-q', 'main');
});
afterAll(() => rm(dir, { recursive: true, force: true }));

/** A fresh copy of the repo per test, served RW (or RO), with the reference catalog. */
async function setup(opts: { writable?: boolean } = {}) {
  const p = await realpath(await mkdtemp(join(dir, 'p-')));
  git(dir, 'clone', '-q', '--no-hardlinks', proj, p);
  git(p, 'fetch', '-q', 'origin', 'side:side');
  const registry = await Registry.create([{ path: p, mode: opts.writable === false ? 'ro' : 'rw' }]);
  await registry.addReference(DOC);
  const root = registry.list().find((r) => r.kind === 'project')!;
  const deps: FlowHostDeps = {
    registry,
    catalog: () => catalog,
    git: { repoOf: (r) => repoToplevel(r.path), head: headCommit, commitOf, isAncestor, commits: rangeCommits, dirty: (repo, r) => dirtyPaths(repo, r.path) },
    key: Buffer.alloc(32, 7),
    sealKey: async () => Buffer.alloc(32, 9),
  };
  const queues = new Map<string, Promise<unknown>>();
  const io: FlowWrite = {
    queue: (key, run) => {
      const next = (queues.get(key) ?? Promise.resolve()).then(run);
      queues.set(key, next.catch(() => {}));
      return next;
    },
    writeFile: (path, text) => registry.writeFile(path, text, { parents: true }),
  };
  const req = (range: FlowStartRequest['range'], packageId = PKG): FlowStartRequest => ({ rootId: root.id, packageId, range, trigger: { kind: 'manual', actor: 'tester' } });
  const plan = async (r: FlowStartRequest) => {
    const v = await planFlowRun(deps, r);
    if (isFlowError(v)) throw new Error(`${v.reason}: ${v.error}`);
    return v;
  };
  return { p, registry, root, deps, io, req, plan };
}

describe('planFlowRun: the range', () => {
  test('a first run needs a baseline; a destination without a marker, or with an unreachable one, too', async () => {
    const t = await setup();
    expect(await planFlowRun(t.deps, t.req({ kind: 'since-last-run' }))).toMatchObject({ reason: 'no-baseline', why: 'first-run' });
    await mkdir(join(t.p, 'Plans/flows'), { recursive: true });
    await writeFile(join(t.p, DEST), '# review\n');
    expect(await planFlowRun(t.deps, t.req({ kind: 'since-last-run' }))).toMatchObject({ reason: 'no-baseline', why: 'marker-missing' });
    await writeFile(join(t.p, DEST), `# review\n\n<!-- last-commit-id: ${'ab'.repeat(20)} -->\n`);
    expect(await planFlowRun(t.deps, t.req({ kind: 'since-last-run' }))).toMatchObject({ reason: 'no-baseline', why: 'marker-unreachable' });
  });

  test('since-last-run starts at the destination marker', async () => {
    const t = await setup();
    await mkdir(join(t.p, 'Plans/flows'), { recursive: true });
    await writeFile(join(t.p, DEST), `# review\n\n<!-- last-commit-id: ${c[1]} -->\n`);
    const p = await t.plan(t.req({ kind: 'since-last-run' }));
    expect([p.base, p.target, p.commits]).toEqual([c[1]!, c[2]!, [`${c[2]} c3`]]);
  });

  test('a baseline: short hash expanded, its commits oldest first, the marker is the base', async () => {
    const t = await setup();
    const p = await t.plan(t.req({ kind: 'baseline', commit: c[0]!.slice(0, 7) }));
    expect([p.base, p.target]).toEqual([c[0]!, c[2]!]);
    expect(p.commits).toEqual([`${c[1]} c2`, `${c[2]} c3`]);
    expect(p.doc).toContain(`<!-- last-commit-id: ${c[0]} -->`);
    expect(p.runPath).toMatch(/^Plans\/flows\/runs\/recent-commits-review\/\d{8}T\d{6}Z-[0-9a-f]{8}\.md$/);
    expect(readFlowRunDocument(p.doc)?.state.input.selection).toMatchObject({ base: c[0], target: c[2] });
  });

  test('bad baselines: not hex, no commit, not an ancestor of HEAD', async () => {
    const t = await setup();
    for (const commit of ['HEAD', 'main', '--all', 'abc', 'g'.repeat(7), 'a'.repeat(41)]) {
      expect([commit, await planFlowRun(t.deps, t.req({ kind: 'baseline', commit }))]).toMatchObject([commit, { reason: 'bad-baseline' }]);
    }
    expect(await planFlowRun(t.deps, t.req({ kind: 'baseline', commit: 'abcdef0' }))).toMatchObject({ reason: 'bad-baseline', error: 'the baseline names no commit' });
    expect(await planFlowRun(t.deps, t.req({ kind: 'baseline', commit: c[3]! }))).toMatchObject({ reason: 'bad-baseline', error: 'the baseline is not an ancestor of HEAD' });
  });

  test('uncommitted paths are listed apart from the range, any file type', async () => {
    const t = await setup();
    await writeFile(join(t.p, 'n1.md'), '# changed\n');
    await writeFile(join(t.p, 'new.txt'), 'x\n');
    const p = await t.plan(t.req({ kind: 'baseline', commit: c[1]! }));
    expect(p.commits).toEqual([`${c[2]} c3`]);
    expect(p.dirty).toEqual(['n1.md', 'new.txt']);
    expect(readFlowRunDocument(p.doc)?.state.input.selection.dirtySourceIds).toEqual(['uncommitted-1', 'uncommitted-2']);
  });

  test('refusals: unknown or non-runnable package, reference root, malformed request', async () => {
    const t = await setup();
    expect(await planFlowRun(t.deps, t.req({ kind: 'baseline', commit: c[0]! }, 'nope'))).toMatchObject({ reason: 'unknown-package' });
    expect(await planFlowRun(t.deps, t.req({ kind: 'baseline', commit: c[0]! }, 'delivery'))).toMatchObject({ reason: 'unknown-package' });
    expect(await planFlowRun(t.deps, { ...t.req({ kind: 'baseline', commit: c[0]! }), rootId: '_mdhouse' })).toMatchObject({ reason: 'no-root' });
    expect(await planFlowRun(t.deps, { rootId: t.root.id })).toMatchObject({ reason: 'invalid' });
    expect(await planFlowRun(t.deps, { ...t.req({ kind: 'since-last-run' }), range: { kind: 'all' } })).toMatchObject({ reason: 'invalid' });
  });

  test('a folder outside any repository is no-git', async () => {
    const plain = await realpath(await mkdtemp(join(dir, 'plain-')));
    const registry = await Registry.create([{ path: plain, mode: 'rw' }]);
    await registry.addReference(DOC);
    const t = await setup();
    const deps = { ...t.deps, registry };
    const root = registry.list().find((r) => r.kind === 'project')!;
    expect(await planFlowRun(deps, { rootId: root.id, packageId: PKG, range: { kind: 'since-last-run' }, trigger: { kind: 'manual', actor: 'x' } })).toMatchObject({ reason: 'no-git' });
  });
});

describe('startFlowRun', () => {
  test('writes exactly the previewed document, held on missing evidence; a second start is open-run', async () => {
    const t = await setup();
    const p = await t.plan(t.req({ kind: 'baseline', commit: c[0]! }));
    const started = await startFlowRun(t.deps, t.io, { token: p.token, actor: tester });
    expect(started).toEqual({ status: 'held', runPath: p.runPath, url: t.registry.docUrl(t.root, p.runPath), created: true });
    expect(await readFile(join(t.p, p.runPath), 'utf8')).toBe(p.doc);

    const again = await t.plan(t.req({ kind: 'baseline', commit: c[0]! }));
    expect(await startFlowRun(t.deps, t.io, { token: again.token, actor: tester })).toMatchObject({ reason: 'open-run', run: { url: t.registry.docUrl(t.root, p.runPath), status: 'held' } });
    // The same token twice: its run is the open one.
    expect(await startFlowRun(t.deps, t.io, { token: p.token, actor: tester })).toMatchObject({ reason: 'open-run' });
  });

  test('an open run this host cannot act on (another key) blocks nothing: a new run starts', async () => {
    const t = await setup();
    const p = await t.plan(t.req({ kind: 'baseline', commit: c[0]! }));
    expect(await startFlowRun(t.deps, t.io, { token: p.token, actor: tester })).toMatchObject({ status: 'held' });
    const here = { ...t.deps, sealKey: async () => Buffer.alloc(32, 3) };
    const q = await planFlowRun(here, t.req({ kind: 'baseline', commit: c[1]! }));
    if (isFlowError(q)) throw new Error(q.error);
    expect(await startFlowRun(here, t.io, { token: q.token, actor: tester })).toMatchObject({ status: 'held', created: true, runPath: q.runPath });
    // Its own run blocks the next one again.
    const r = await planFlowRun(here, t.req({ kind: 'baseline', commit: c[0]! }));
    if (isFlowError(r)) throw new Error(r.error);
    expect(await startFlowRun(here, t.io, { token: r.token, actor: tester })).toMatchObject({ reason: 'open-run', run: { url: t.registry.docUrl(t.root, q.runPath) } });
  });

  test('two starts at once: one writes, the other is open-run — never stale, whatever the timing', async () => {
    const t = await setup();
    const a = await t.plan(t.req({ kind: 'baseline', commit: c[0]! }));
    const b = await t.plan(t.req({ kind: 'baseline', commit: c[1]! }));
    const out = await Promise.all([startFlowRun(t.deps, t.io, { token: a.token, actor: tester }), startFlowRun(t.deps, t.io, { token: b.token, actor: tester })]);
    expect(out.map((r) => (isFlowError(r) ? r.reason : r.status)).sort()).toEqual(['held', 'open-run']);
  });

  test('a destination write waits for a start in progress: none lands between its re-plan and its write', async () => {
    const t = await setup();
    const p = await t.plan(t.req({ kind: 'baseline', commit: c[0]! }));
    const dest = (await t.registry.resolve(`${t.root.id}/${DEST}`))!;
    const order: string[] = [];
    let competitor: Promise<unknown> | null = null;
    const deps: FlowHostDeps = {
      ...t.deps,
      git: {
        ...t.deps.git,
        // The start's re-plan reads HEAD inside its queues: a document write to the destination asks now.
        head: (repo) => {
          competitor ??= t.io.queue(dest.abs, async () => {
            order.push('destination write');
          });
          return t.deps.git.head(repo);
        },
      },
    };
    const io: FlowWrite = { ...t.io, writeFile: async (path, text) => (order.push('run write'), t.io.writeFile(path, text)) };
    expect(await startFlowRun(deps, io, { token: p.token, actor: tester })).toMatchObject({ status: 'held' });
    await competitor;
    expect(order).toEqual(['run write', 'destination write']);
  });

  test('stale when HEAD or the uncommitted set moved since the preview', async () => {
    const t = await setup();
    const fresh = () => t.plan(t.req({ kind: 'baseline', commit: c[0]! }));

    let p = await fresh();
    await writeFile(join(t.p, 'later.md'), '# later\n');
    expect(await startFlowRun(t.deps, t.io, { token: p.token, actor: tester })).toMatchObject({ reason: 'stale' });

    p = await fresh();
    git(t.p, 'add', '-A');
    git(t.p, 'commit', '-qm', 'c4');
    expect(await startFlowRun(t.deps, t.io, { token: p.token, actor: tester })).toMatchObject({ reason: 'stale' });
  });

  test('a forged or altered token is invalid; nothing is written', async () => {
    const t = await setup();
    const p = await t.plan(t.req({ kind: 'baseline', commit: c[0]! }));
    const [data, mac] = p.token.split('.') as [string, string];
    const body = JSON.parse(Buffer.from(data, 'base64url').toString()) as { req: FlowStartRequest };
    body.req.trigger = { kind: 'manual', actor: 'someone else' };
    const altered = `${Buffer.from(JSON.stringify(body)).toString('base64url')}.${mac}`;
    for (const token of ['', 'x', `${data}.`, `${data}.${'A'.repeat(mac.length)}`, altered]) {
      expect(await startFlowRun(t.deps, t.io, { token, actor: tester })).toMatchObject({ reason: 'invalid' });
    }
    const other = { ...t.deps, key: Buffer.alloc(32, 8) };
    expect(await startFlowRun(other, t.io, { token: p.token, actor: tester })).toMatchObject({ reason: 'invalid' });
    expect(await Bun.file(join(t.p, p.runPath)).exists()).toBe(false);
  });

  test('a read-only project is not-writable, before an open run is looked for', async () => {
    const rw = await setup();
    const open = await rw.plan(rw.req({ kind: 'baseline', commit: c[0]! }));
    const t = await setup({ writable: false });
    await mkdir(join(t.p, 'Plans/flows/runs', PKG), { recursive: true });
    await writeFile(join(t.p, open.runPath), open.doc);
    const p = await t.plan(t.req({ kind: 'baseline', commit: c[0]! }));
    expect(await startFlowRun(t.deps, t.io, { token: p.token, actor: tester })).toMatchObject({ reason: 'not-writable' });
  });

  test('a token is good for 10 minutes, and for the actor who previewed', async () => {
    const t = await setup();
    const p = await t.plan(t.req({ kind: 'baseline', commit: c[0]! }));
    const at = Date.parse(p.startedAt);
    const late = { ...t.deps, now: () => new Date(at + TOKEN_TTL_MS + 1) };
    expect(await startFlowRun(late, t.io, { token: p.token, actor: tester })).toMatchObject({ reason: 'stale', error: 'the preview expired — preview again' });
    const early = { ...t.deps, now: () => new Date(at - 1) };
    expect(await startFlowRun(early, t.io, { token: p.token, actor: tester })).toMatchObject({ reason: 'stale' });
    expect(await startFlowRun(t.deps, t.io, { token: p.token, actor: async () => 'someone else' })).toMatchObject({ reason: 'stale' });
    expect(await startFlowRun({ ...t.deps, now: () => new Date(at + TOKEN_TTL_MS) }, t.io, { token: p.token, actor: tester })).toMatchObject({ status: 'held' });
  });

  test('a schedule slot runs once: a repeat returns its run, its id fixed by the slot', async () => {
    const t = await setup();
    const sched = (slot: string): FlowStartRequest => ({ rootId: t.root.id, packageId: PKG, range: { kind: 'baseline', commit: c[0]! }, trigger: { kind: 'schedule', id: 'nightly', slot } });
    const first = await startFlowRun(t.deps, t.io, { request: sched('2026-11-12') });
    expect(first).toMatchObject({ status: 'held', created: true });
    const runId = runIdFor({ kind: 'schedule', id: 'nightly', slot: '2026-11-12' });
    expect(runId).toMatch(/^run-[0-9a-f]{16}$/);
    expect((first as { runPath: string }).runPath).toEndWith(`-${runId.slice(4, 12)}.md`);
    expect(await startFlowRun(t.deps, t.io, { request: sched('2026-11-12') })).toEqual({ ...(first as object), created: false } as never);
    expect(await startFlowRun(t.deps, t.io, { request: sched('2026-11-13') })).toMatchObject({ reason: 'open-run' });
    // A request start is for schedules only.
    expect(await startFlowRun(t.deps, t.io, { request: t.req({ kind: 'baseline', commit: c[0]! }) })).toMatchObject({ reason: 'invalid' });
  });
});

describe('applyFlowAction: one assertion on an open run', () => {
  /** A run document for c0..c2 and a stepper that applies actions in order, failing on a refusal. */
  async function run() {
    const t = await setup();
    const p = await t.plan(t.req({ kind: 'baseline', commit: c[0]! }));
    const at = { rootId: t.root.id, rel: p.runPath };
    let doc = p.doc;
    let n = 0;
    const act = (action: unknown, over: Record<string, unknown> = {}) => {
      const state = readFlowRunDocument(doc)!.state;
      return applyFlowAction(doc, at, { expectedVersion: state.version, clientId: `client-${String(++n).padStart(4, '0')}`, action, ...over });
    };
    const ok = (action: unknown) => {
      const r = act(action);
      if (isFlowError(r)) throw new Error(`${r.reason}: ${r.error}`);
      doc = r.doc!;
      return r;
    };
    return { t, p, at, act, ok, doc: () => doc, setDoc: (d: string) => (doc = d) };
  }
  const supplyAll = (r: Awaited<ReturnType<typeof run>>) => {
    r.ok({ type: 'evidence', label: 'diffs and reproduction evidence', status: 'supplied', note: 'diffs read' });
    return r.ok({ type: 'evidence', label: 'linked plans documentation and task state', status: 'supplied', note: 'TODO read' });
  };

  test('evidence releases the hold; the page view follows', async () => {
    const r = await run();
    const first = docFlow(readFlowRunDocument(r.doc())!.state, true);
    expect(first).toMatchObject({ version: 0, status: 'held', node: { id: 'scope', title: 'Scope', outcomes: ['complete', 'blocked', 'failed'] }, canAct: true });
    expect(first.evidence.map((e) => [e.status, e.required])).toEqual([['supplied', true], ['missing', true], ['missing', true]]);
    const done = supplyAll(r);
    expect([done.state.status, done.state.version, done.state.holds]).toEqual(['running', 2, []]);
    expect(done.state.evidence[1]).toEqual({ label: 'diffs and reproduction evidence', status: 'supplied', sourceIds: ['run-document'], note: 'diffs read' });
    expect(docFlow(done.state, false).canAct).toBe(false);
  });

  test('complete while held is `held`; every step complete ends the run and advances the marker to the target', async () => {
    const r = await run();
    expect(r.act({ type: 'outcome', outcome: 'complete', text: 'done' })).toMatchObject({ reason: 'held' });
    supplyAll(r);
    let last: FlowActed | undefined;
    for (const step of ['scope', 'summaries', 'risks', 'delivery-sync', 'report']) {
      expect(readFlowRunDocument(r.doc())!.state.nodeId).toBe(step);
      last = r.ok({ type: 'outcome', outcome: 'complete', text: `${step} done` });
      if (step !== 'report') expect(last.advance).toBeNull();
    }
    expect([last!.state.status, last!.advance]).toEqual(['complete', c[2]!]);
    expect(markerOf(r.doc())).toBe(c[2]!);
    expect(docFlow(last!.state, true).canAct).toBe(false);
    // Ended: any further action is stale.
    expect(r.act({ type: 'cancel', reason: 'late' })).toMatchObject({ reason: 'stale' });
  });

  test('blocked and cancel end the run; the marker stays the base', async () => {
    const a = await run();
    expect(a.ok({ type: 'outcome', outcome: 'blocked', text: 'cannot read diffs' }).state.status).toBe('blocked');
    expect(markerOf(a.doc())).toBe(c[0]!);
    const b = await run();
    const x = b.ok({ type: 'cancel', reason: 'wrong range' });
    expect([x.state.status, x.advance]).toEqual(['cancelled', null]);
  });

  test('a retry of the same action is answered from the record; another action with that clientId, or an old version, is refused', async () => {
    const r = await run();
    const action = { type: 'evidence', label: 'diffs and reproduction evidence', status: 'supplied', note: 'n' };
    const first = applyFlowAction(r.doc(), r.at, { expectedVersion: 0, clientId: 'retry-0001', action }) as FlowActed;
    r.setDoc(first.doc!);
    expect(applyFlowAction(r.doc(), r.at, { expectedVersion: 0, clientId: 'retry-0001', action })).toMatchObject({ doc: null, state: { version: 1 } });
    expect(applyFlowAction(r.doc(), r.at, { expectedVersion: 0, clientId: 'retry-0001', action: { ...action, note: 'other' } })).toMatchObject({ reason: 'invalid' });
    expect(applyFlowAction(r.doc(), r.at, { expectedVersion: 0, clientId: 'retry-0002', action })).toMatchObject({ reason: 'stale' });
    expect(applyFlowAction(r.doc(), r.at, { expectedVersion: 2, clientId: 'retry-0003', action })).toMatchObject({ reason: 'stale' });
  });

  test('malformed requests are invalid', async () => {
    const r = await run();
    const good = { type: 'cancel', reason: 'x' };
    for (const over of [{ clientId: 'short' }, { clientId: 'has space here' }, { clientId: 7 }, { expectedVersion: '0' }, { action: null }, { action: { type: 'merge' } }]) {
      expect([over, r.act(good, over)]).toMatchObject([over, { reason: 'invalid' }]);
    }
    expect(r.act({ type: 'evidence', label: 'not a label', status: 'missing', note: 'n' })).toMatchObject({ reason: 'invalid' });
    expect(r.act({ type: 'cancel', reason: '' })).toMatchObject({ reason: 'invalid' });
    expect(r.act({ type: 'question', questionId: 'Q1', status: 'answered', turn: 'yes' })).toMatchObject({ reason: 'invalid' });
  });

  test('verifyRun: the run’s own document passes; a package no longer installed or runnable does not', async () => {
    const r = await run();
    const state = readFlowRunDocument(r.doc())!.state;
    const meta = readFlowRunMeta(r.doc());
    expect(await verifyRun(r.t.deps, r.t.root, r.p.runPath, state, meta)).toBeNull();
    expect(await verifyRun({ ...r.t.deps, catalog: async () => [] }, r.t.root, r.p.runPath, state, meta)).toMatchObject({ reason: 'tampered', error: expect.stringContaining('not installed') });
  });

  test('verifyRun: the seal binds the run input; another key is another machine; no seal is tampered', async () => {
    const r = await run();
    const state = readFlowRunDocument(r.doc())!.state;
    const meta = readFlowRunMeta(r.doc())!;
    expect([meta.seal?.key, meta.seal?.mac]).toEqual([expect.stringMatching(/^[0-9a-f]{16}$/), expect.stringMatching(/^[0-9a-f]{64}$/)]);
    const edited = (f: (s: typeof state) => void) => {
      const copy = structuredClone(state);
      f(copy);
      return copy;
    };
    expect(await verifyRun({ ...r.t.deps, sealKey: async () => Buffer.alloc(32, 1) }, r.t.root, r.p.runPath, state, meta)).toMatchObject({ reason: 'foreign', error: expect.stringContaining('another machine') });
    expect(await verifyRun(r.t.deps, r.t.root, r.p.runPath, state, { ...meta, seal: undefined })).toMatchObject({ reason: 'tampered' });
    expect(await verifyRun(r.t.deps, r.t.root, r.p.runPath, state, null)).toMatchObject({ reason: 'tampered' });
    expect(await verifyRun(r.t.deps, r.t.root, r.p.runPath, edited((x) => (x.input.selection.target = c[1]!)), meta)).toMatchObject({ reason: 'tampered', error: expect.stringContaining('input') });
    expect(await verifyRun(r.t.deps, r.t.root, r.p.runPath, edited((x) => (x.input.selection.base = c[1]!)), meta)).toMatchObject({ reason: 'tampered' });
    expect(await verifyRun(r.t.deps, r.t.root, `${r.p.runPath}x`, state, meta)).toMatchObject({ reason: 'tampered' });
    expect(await verifyRun(r.t.deps, r.t.root, r.p.runPath, state, { ...meta, commits: [] })).toMatchObject({ reason: 'tampered', error: expect.stringContaining('commit list') });
    // The commit list swapped consistently (its digest too), base and target kept: still the seal.
    const fewer = [meta.commits[0]!];
    const swapped = edited((x) => (x.input.selection.sources.find((y) => y.id === 'commit-range')!.digest = createHash('sha256').update(fewer.join('\n')).digest('hex')));
    expect(await verifyRun(r.t.deps, r.t.root, r.p.runPath, swapped, { ...meta, commits: fewer })).toMatchObject({ reason: 'tampered', error: expect.stringContaining('input') });
  });

  test('sealKeyAt: created 0600 on first use, read after; a malformed key throws; two first uses agree', async () => {
    const d = await mkdtemp(join(dir, 'seal-'));
    const path = join(d, 'cfg', 'flow-seal.key');
    const [a, b] = await Promise.all([sealKeyAt(path), sealKeyAt(path)]);
    expect(a.length).toBe(32);
    expect(b.equals(a)).toBe(true);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await sealKeyAt(path)).equals(a)).toBe(true);
    expect((await readdir(join(d, 'cfg'))).sort()).toEqual(['flow-seal.key']);
    await writeFile(path, 'short');
    await expect(sealKeyAt(path)).rejects.toThrow('not a flow seal key');
  });

  test('verifyRun: ancestry is asked once per range and HEAD', async () => {
    const r = await run();
    const state = readFlowRunDocument(r.doc())!.state;
    const meta = readFlowRunMeta(r.doc());
    let asked = 0;
    const deps = { ...r.t.deps, ancestry: new Map<string, boolean>(), git: { ...r.t.deps.git, isAncestor: (repo: string, a: string, b: string) => (asked++, isAncestor(repo, a, b)) } };
    for (let i = 0; i < 3; i++) expect(await verifyRun(deps, r.t.root, r.p.runPath, state, meta)).toBeNull();
    expect(asked).toBe(2);
  });

  test('the analyst sections survive; a document without them, moved, or with an edited state is refused', async () => {
    const r = await run();
    const mine = '## Findings\n\n- 🟠 something found, with `code`\n\n## Checks\n\n- bun test: 12 pass\n\n';
    r.setDoc(r.doc().replace(/^## Findings$[\s\S]*?(?=^## Transitions$)/m, mine));
    r.ok({ type: 'evidence', label: 'diffs and reproduction evidence', status: 'supplied', note: 'n' });
    expect(r.doc()).toContain(mine);
    expect(readFlowRunDocument(r.doc())!.state.version).toBe(1);

    const gone = r.doc().replace('## Transitions', '## Moves');
    expect(applyFlowAction(gone, r.at, { expectedVersion: 1, clientId: 'gone-0001', action: { type: 'cancel', reason: 'x' } })).toMatchObject({ reason: 'invalid' });
    expect(applyFlowAction(r.doc(), { ...r.at, rel: 'elsewhere.md' }, { expectedVersion: 1, clientId: 'moved-001', action: { type: 'cancel', reason: 'x' } })).toMatchObject({ reason: 'invalid' });
    const edited = r.doc().replace('"version": 1', '"version": 5');
    expect(applyFlowAction(edited, r.at, { expectedVersion: 1, clientId: 'edit-0001', action: { type: 'cancel', reason: 'x' } })).toMatchObject({ reason: 'invalid' });
    expect(applyFlowAction('# just a page\n', r.at, { expectedVersion: 0, clientId: 'page-0001', action: { type: 'cancel', reason: 'x' } })).toMatchObject({ reason: 'invalid' });
  });
});

describe('markers', () => {
  const A = 'a'.repeat(40);
  const B = 'b'.repeat(40);
  test('a marker in fenced code is not the document\'s', () => {
    expect(markerOf(`# x\n\n\`\`\`\n<!-- last-commit-id: ${A} -->\n\`\`\`\n`)).toBeNull();
    expect(markerOf(`# x\n\n~~~md\n<!-- last-commit-id: ${A} -->\n~~~\n\n<!-- last-commit-id: ${B} -->\n`)).toBe(B);
    expect(markerOf(`# x\n\n> <!-- last-commit-id: ${A} -->\n`)).toBeNull();
    expect(markerOf(`<!-- last-commit-id: ${A} -->`)).toBe(A);
  });

  test('advanceDestination: created, replaced in place, inserted under the title; a fenced marker untouched', () => {
    const run = { title: 'Review recent commits', target: B, base: A, runId: 'run-1', url: '/p/Plans/flows/runs/x/r.md' };
    const last = `Last run: [run-1](</p/Plans/flows/runs/x/r.md>) — complete · \`${A.slice(0, 12)}..${B.slice(0, 12)}\``;
    const created = advanceDestination(null, run);
    expect(created).toBe(`# Review recent commits\n\n<!-- last-commit-id: ${B} -->\n\n${last}\n`);
    const older = created.replace(new RegExp(B, 'g'), A).replace('run-1', 'run-0') + '\nMy notes.\n';
    const again = advanceDestination(older, run);
    expect(again).toBe(`${created}\nMy notes.\n`);
    const fencedOnly = `# Mine\n\n\`\`\`\n<!-- last-commit-id: ${A} -->\n\`\`\`\n`;
    expect(advanceDestination(fencedOnly, run)).toBe(`# Mine\n\n<!-- last-commit-id: ${B} -->\n\n${last}\n\n\`\`\`\n<!-- last-commit-id: ${A} -->\n\`\`\`\n`);
    expect(markerOf(advanceDestination(fencedOnly, run))).toBe(B);
  });
});
