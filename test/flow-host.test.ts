import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { commitOf, dirtyPaths, headCommit, isAncestor, rangeCommits } from '../src/lib/git';
import { isFlowError, planFlowRun, runIdFor, startFlowRun, type FlowHostDeps, type FlowStartRequest, type FlowWrite } from '../src/lib/flow-host';
import { loadFlowCatalog } from '../src/lib/flow-package';
import { readFlowRunDocument } from '../src/lib/flow-run-markdown';
import { Registry } from '../src/lib/roots';
import { repoToplevel } from '../src/lib/scan';

const DOC = resolve(import.meta.dir, '../doc');
const PKG = 'recent-commits-review';
const DEST = 'Plans/flows/recent-commits-review.md';

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
  };
  const queues = new Map<string, Promise<unknown>>();
  const io: FlowWrite = {
    queue: (key, run) => {
      const next = (queues.get(key) ?? Promise.resolve()).then(run);
      queues.set(key, next.catch(() => {}));
      return next;
    },
    writeFile: (path, text) => registry.writeFile(path, text),
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
    const started = await startFlowRun(t.deps, t.io, { token: p.token });
    expect(started).toEqual({ status: 'held', runPath: p.runPath, url: t.registry.docUrl(t.root, p.runPath), created: true });
    expect(await readFile(join(t.p, p.runPath), 'utf8')).toBe(p.doc);

    const again = await t.plan(t.req({ kind: 'baseline', commit: c[0]! }));
    expect(await startFlowRun(t.deps, t.io, { token: again.token })).toMatchObject({ reason: 'open-run', run: { url: t.registry.docUrl(t.root, p.runPath), status: 'held' } });
    // The same token twice: its run is the open one.
    expect(await startFlowRun(t.deps, t.io, { token: p.token })).toMatchObject({ reason: 'open-run' });
  });

  test('two starts at once: one writes, the other is open-run — never stale, whatever the timing', async () => {
    const t = await setup();
    const a = await t.plan(t.req({ kind: 'baseline', commit: c[0]! }));
    const b = await t.plan(t.req({ kind: 'baseline', commit: c[1]! }));
    const out = await Promise.all([startFlowRun(t.deps, t.io, { token: a.token }), startFlowRun(t.deps, t.io, { token: b.token })]);
    expect(out.map((r) => (isFlowError(r) ? r.reason : r.status)).sort()).toEqual(['held', 'open-run']);
  });

  test('stale when HEAD or the uncommitted set moved since the preview', async () => {
    const t = await setup();
    const fresh = () => t.plan(t.req({ kind: 'baseline', commit: c[0]! }));

    let p = await fresh();
    await writeFile(join(t.p, 'later.md'), '# later\n');
    expect(await startFlowRun(t.deps, t.io, { token: p.token })).toMatchObject({ reason: 'stale' });

    p = await fresh();
    git(t.p, 'add', '-A');
    git(t.p, 'commit', '-qm', 'c4');
    expect(await startFlowRun(t.deps, t.io, { token: p.token })).toMatchObject({ reason: 'stale' });
  });

  test('a forged or altered token is invalid; nothing is written', async () => {
    const t = await setup();
    const p = await t.plan(t.req({ kind: 'baseline', commit: c[0]! }));
    const [data, mac] = p.token.split('.') as [string, string];
    const body = JSON.parse(Buffer.from(data, 'base64url').toString()) as { req: FlowStartRequest };
    body.req.trigger = { kind: 'manual', actor: 'someone else' };
    const altered = `${Buffer.from(JSON.stringify(body)).toString('base64url')}.${mac}`;
    for (const token of ['', 'x', `${data}.`, `${data}.${'A'.repeat(mac.length)}`, altered]) {
      expect(await startFlowRun(t.deps, t.io, { token })).toMatchObject({ reason: 'invalid' });
    }
    const other = { ...t.deps, key: Buffer.alloc(32, 8) };
    expect(await startFlowRun(other, t.io, { token: p.token })).toMatchObject({ reason: 'invalid' });
    expect(await Bun.file(join(t.p, p.runPath)).exists()).toBe(false);
  });

  test('a read-only project is not-writable', async () => {
    const t = await setup({ writable: false });
    const p = await t.plan(t.req({ kind: 'baseline', commit: c[0]! }));
    expect(await startFlowRun(t.deps, t.io, { token: p.token })).toMatchObject({ reason: 'not-writable' });
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
