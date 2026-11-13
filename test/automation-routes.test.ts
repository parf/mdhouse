import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Prefs } from '../src/lib/prefs';
import { Registry } from '../src/lib/roots';
import { serve } from '../src/server';
import { testPort } from './ports';

const DOC = join(import.meta.dir, '../doc');

function git(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd });
  return r.stdout.toString().trim();
}

/** A daemon that answers the handshake and keeps the schedules of one record. */
async function fakeDaemon() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-auto-bus-')));
  const socket = join(dir, 'bus.sock');
  const schedules = new Map<string, Record<string, unknown>>();
  const added: Array<Record<string, unknown>> = [];
  const deleted: string[] = [];
  const kv = new Map<string, Record<string, unknown>>();
  const state = { refuse: '', kvDown: false, kvSetDown: false };
  let n = 0;
  let agent = '';
  const server = Bun.serve({
    unix: socket,
    fetch: async (req) => {
      const url = new URL(req.url);
      const token = req.headers.get('x-agent-bus-token') ?? '';
      if (url.pathname === '/identity') return Response.json({ protocol: 1, protocol_min: 1 });
      if (url.pathname === '/status') return Response.json({ you: token === 'agent' && agent ? agent : 'test' });
      if (url.pathname === '/register') return new Response('exists', { status: 412 });
      if (url.pathname === '/token') {
        agent = ((await req.json()) as { name: string }).name;
        return Response.json({ token: 'agent' });
      }
      if (url.pathname === '/schedule/add') {
        if (state.refuse) return Response.json({ error: state.refuse }, { status: 400 });
        const spec = (await req.json()) as Record<string, unknown>;
        added.push(spec);
        const s = { id: `sch-${++n}`, holder: spec.record, kind: spec.expr ? 'recurring' : 'once', ...spec, enabled: true, next: '2026-11-14T08:30:00Z', runs: 0, sent: 0, dropped: 0, creator: agent, created: '', changed: '' };
        schedules.set(s.id, s);
        return Response.json({ schedule: s, warning: '' });
      }
      if (url.pathname.startsWith('/kv')) {
        if (state.kvDown) return Response.json({ error: 'kv unavailable' }, { status: 500 });
        const q = url.searchParams;
        if (url.pathname === '/kv') return kv.has(q.get('name')!) ? Response.json({ value: kv.get(q.get('name')!) }) : Response.json({ error: 'not found', kind: 'not_found' }, { status: 404 });
        if (url.pathname === '/kv/list') return Response.json({ values: { string: [], int: [], json: [...kv.keys()].map((name) => ({ name })) } });
        const b = (await req.json()) as { name: string; value?: Record<string, unknown> };
        if (url.pathname === '/kv/set' && state.kvSetDown) return Response.json({ error: 'kv full' }, { status: 500 });
        if (url.pathname === '/kv/set') return kv.set(b.name, b.value!), Response.json({});
        if (url.pathname === '/kv/delete') return Response.json({ deleted: kv.delete(b.name) });
      }
      if (url.pathname === '/schedule/list') return Response.json({ schedules: [...schedules.values()] });
      if (url.pathname === '/schedule/delete') {
        const { id } = (await req.json()) as { id: string };
        deleted.push(id);
        return Response.json({ deleted: schedules.delete(id) });
      }
      return new Response('not found', { status: 404 });
    },
  });
  return { socket, schedules, added, deleted, state, kv, stop: async () => (server.stop(true), rm(dir, { recursive: true, force: true })) };
}

const REG = { id: 'review', flow: 'recent-commits-review', range: 'since-last-run', when: { cron: '30 8 * * 1-5' }, maxLate: '30m' };

let cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

async function start(port: number) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-auto-routes-')));
  const proj = join(dir, 'proj');
  await mkdir(join(proj, '.mdhouse/automation'), { recursive: true });
  await mkdir(join(proj, 'Plans/flows'), { recursive: true });
  git(proj, 'init', '-q', '-b', 'main');
  const c: string[] = [];
  for (const i of [1, 2]) {
    await writeFile(join(proj, `n${i}.md`), `# ${i}\n`);
    git(proj, 'add', '-A');
    git(proj, 'commit', '-qm', `c${i}`);
    c.push(git(proj, 'rev-parse', 'HEAD'));
  }
  // The marker a since-last-run range starts at; committed, so the tree is clean.
  await writeFile(join(proj, 'Plans/flows/recent-commits-review.md'), `# Review\n\n<!-- last-commit-id: ${c[0]} -->\n`);
  const regText = JSON.stringify(REG, null, 2) + '\n';
  await writeFile(join(proj, '.mdhouse/automation/review.json'), regText);
  await writeFile(join(proj, '.mdhouse/automation/Bad Name.json'), '{}');
  git(proj, 'add', '-A');
  git(proj, 'commit', '-qm', 'setup');
  const bus = await fakeDaemon();
  await mkdir(join(dir, 'cfg'));
  const prefs = await Prefs.load(join(dir, 'cfg/prefs.json'));
  await prefs.setAgentBus({ enabled: true, socket: bus.socket });
  const registry = await Registry.create([{ path: proj, mode: 'rw' }]);
  await registry.addReference(DOC);
  const s = await serve({ registry, prefs, port: testPort(port), hostname: '127.0.0.1', localAdmin: true });
  cleanups.push(async () => {
    s.server.stop(true);
    s.watcher.close();
    s.control?.stop();
    await s.stopAutomation();
    await s.stopAbControl();
    await bus.stop();
    await rm(dir, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${testPort(port)}`;
  const id = registry.list().find((r) => r.kind === 'project')!.id;
  const post = async (path: string, body: unknown, headers: Record<string, string> = { origin }) => {
    const res = await fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return [res.status, await res.json()] as const;
  };
  const list = async () => (await (await fetch(`${origin}/api/automation?root=${id}`)).json()) as { root: string; canApprove: boolean; registrations: Array<Record<string, any>>; errors: unknown[]; busError?: string };
  const fire = (scheduleId: string, slot = '2026-11-13T08:30:00Z') =>
    s.automation.handle({ from: '#bus', schedule: { id: scheduleId, by: '#mdhouse@h', slot }, body: JSON.stringify({ v: 1, op: 'run', project: id, registration: 'review' }) }).then((r) => JSON.parse(r));
  return { s, proj, prefs, bus, id, c, post, list, fire, regText };
}

describe('/api/automation — this machine approves a registration file', () => {
  test('listed → approved (a bus schedule made) → fires → a changed file stops it → revoked', async () => {
    const t = await start(61988);
    const first = await t.list();
    expect([first.root, first.canApprove]).toEqual([t.id, true]);
    expect(first.registrations[0]!.file).toBe('.mdhouse/automation/review.json');
    expect(first.errors).toEqual([{ file: 'Bad Name.json', error: expect.any(String) }]);
    expect(first.registrations).toEqual([expect.objectContaining({ id: 'review', flow: 'recent-commits-review', maxLate: '30m', overlap: 'skip', approval: 'none', schedule: null, disabled: false, startedToday: 0, runs: [] })]);
    const hash = first.registrations[0]!.hash as string;

    // Not approved: a firing reaches nothing.
    expect(await t.fire('sch-x')).toMatchObject({ ok: false, error: { code: 'not-approved' } });

    expect(await t.post('/api/automation/approve', { root: t.id, registration: 'review', hash: 'ab'.repeat(32) })).toEqual([409, { error: expect.stringContaining('changed'), reason: 'stale' }]);
    const [st, ok] = await t.post('/api/automation/approve', { root: t.id, registration: 'review', hash });
    expect([st, ok]).toEqual([200, { registration: 'review', approval: 'approved', hash, approved: { hash, scheduleId: 'sch-1' }, schedule: { id: 'sch-1', enabled: true, next: '2026-11-14T08:30:00Z' } }]);
    expect(t.bus.added).toEqual([{ record: expect.stringMatching(/^#mdhouse@/), expr: '30 8 * * 1-5', body: JSON.stringify({ v: 1, op: 'run', project: t.id, registration: 'review' }), max_late: '1800s', target: expect.stringMatching(/^#mdhouse@/) }]);
    expect((await t.list()).registrations[0]).toMatchObject({ approval: 'approved', approvedHash: hash, approved: { scheduleId: 'sch-1' }, schedule: { id: 'sch-1', enabled: true } });
    // Kept in the record's key-value store, keyed by the folder, not the root id.
    expect([...t.bus.kv.keys()].filter((k) => k.startsWith('auto/approval/'))).toEqual([expect.stringMatching(/^auto\/approval\/[0-9a-f]{16}\/review$/)]);

    // Another schedule on the record is not the approved one.
    expect(await t.fire('sch-other')).toMatchObject({ ok: false, error: { code: 'not-approved' } });
    const ran = await t.fire('sch-1');
    expect({ ...ran }).toMatchObject({ ok: true, status: 'held', created: true, runPath: expect.stringMatching(/^Plans\/flows\/runs\/recent-commits-review\//) });
    expect(await readFile(join(t.proj, ran.runPath), 'utf8')).toContain('schedule');
    expect((await t.list()).registrations[0]).toMatchObject({ startedToday: expect.any(Number), lastStartAt: expect.any(String) });
    expect((await t.list()).registrations[0]!.runs).toEqual(expect.arrayContaining([expect.objectContaining({ outcome: 'started', runPath: ran.runPath }), expect.objectContaining({ outcome: 'refused', why: 'not approved' })]));

    // A pull changed the file: it stops until approved again.
    await writeFile(join(t.proj, '.mdhouse/automation/review.json'), t.regText.replace('30m', '45m'));
    expect((await t.list()).registrations[0]).toMatchObject({ approval: 'changed' });
    expect(await t.fire('sch-1', '2026-11-14T08:30:00Z')).toMatchObject({ ok: false, error: { code: 'not-approved' } });

    // Approved again: a new schedule, the old one deleted.
    const again = (await t.list()).registrations[0]!.hash as string;
    expect((await t.post('/api/automation/approve', { root: t.id, registration: 'review', hash: again }))[1]).toMatchObject({ approved: { scheduleId: 'sch-2' } });
    expect(t.bus.deleted).toEqual(['sch-1']);

    expect(await t.post('/api/automation/revoke', { root: t.id, registration: 'review' })).toEqual([200, { registration: 'review', approval: 'none', revoked: true }]);
    expect(t.bus.deleted).toEqual(['sch-1', 'sch-2']);
    expect((await t.list()).registrations[0]).toMatchObject({ approval: 'none', schedule: null });
    expect(await t.post('/api/automation/revoke', { root: t.id, registration: 'review' })).toEqual([404, { error: 'not approved on this machine', reason: 'not-found' }]);
  });

  test('refusals keep nothing: bus refusal, bad bodies, unknown names, another site, a Viewer', async () => {
    const t = await start(61989);
    const hash = (await t.list()).registrations[0]!.hash as string;
    const ask = { root: t.id, registration: 'review', hash };
    t.bus.state.refuse = 'bad cron';
    expect(await t.post('/api/automation/approve', ask)).toEqual([409, { error: expect.stringContaining('refused the schedule') }]);
    t.bus.state.refuse = '';
    expect((await t.list()).registrations[0]).toMatchObject({ approval: 'none' });
    for (const bad of [{}, { root: t.id, registration: 'review' }, { root: 1, registration: 'review', hash }]) expect([bad, (await t.post('/api/automation/approve', bad))[0]]).toEqual([bad, 400]);
    expect((await t.post('/api/automation/approve', { ...ask, registration: 'nope' }))).toEqual([404, { error: 'no such registration', reason: 'not-found' }]);
    expect((await t.post('/api/automation/approve', { ...ask, root: 'nope' }))).toEqual([404, { error: 'no such project', reason: 'no-root' }]);
    expect((await t.post('/api/automation/approve', ask, { origin: 'http://evil.example' }))[0]).toBe(403);
    await t.prefs.setMode('viewer');
    // A Viewer has no local administrator, and its gate refuses an administrator too.
    expect([401, 403]).toContain((await t.post('/api/automation/approve', ask))[0]);
    expect(t.bus.added).toEqual([]);
  });

  test('the store unreachable: the list says so, approve keeps no schedule, a firing is refused', async () => {
    const t = await start(61990);
    const hash = (await t.list()).registrations[0]!.hash as string;
    t.bus.state.kvDown = true;
    const listed = await t.list();
    expect([listed.registrations[0]!.approval, typeof listed.busError]).toEqual(['unknown', 'string']);
    expect((await t.post('/api/automation/approve', { root: t.id, registration: 'review', hash }))[0]).toBe(503);
    expect((await t.post('/api/automation/revoke', { root: t.id, registration: 'review' }))[0]).toBe(503);
    expect(t.bus.schedules.size).toBe(0);
    expect(await t.fire('sch-1')).toMatchObject({ ok: false });
    // Read works, the write fails: the schedule just made is deleted again.
    t.bus.state.kvDown = false;
    t.bus.state.kvSetDown = true;
    expect((await t.post('/api/automation/approve', { root: t.id, registration: 'review', hash }))[0]).toBe(503);
    expect([t.bus.added.length, t.bus.schedules.size]).toEqual([1, 0]);
  });
});
