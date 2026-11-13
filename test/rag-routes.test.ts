import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Prefs } from '../src/lib/prefs';
import { Registry } from '../src/lib/roots';
import { serve } from '../src/server';

const NOTE = '# Notes\n\n## Plan\n\nfirst\nsecond\n';
const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const RAG = '#rag/notes@h';

const rec = (source: string, hash: string, excerpt: string, more: Record<string, unknown> = {}) => ({
  namespace: 'notes', tableName: 'md', id: source, source, content_hash: hash, indexed_at: '2026-11-06T00:00:00Z', chunk_index: 0, excerpt, scores: { bm25: 2.5 }, ...more,
});

/**
 * A fake `agent-busd` on a temp unix socket with a JSON key-value store: the handshake, register (412),
 * token, kv list/get, send and a filtered consume. A send to the RAG is answered with `answer(body)`,
 * held until `release()` when `hold` is on.
 */
async function fakeDaemon() {
  const dir = await mkdtemp(join(tmpdir(), 'mdhouse-rag-routes-'));
  const socket = join(dir, 'bus.sock');
  const kv = new Map<string, unknown>();
  const calls: string[] = [];
  const asked: Array<{ to: string; body: Record<string, unknown> }> = [];
  type Reply = { message_id: string; from: string; to: string; tag: string; topic: string; body: string };
  const inbox: Reply[] = [];
  let held: Reply[] = [];
  const state = { hold: false, answer: (_: Record<string, unknown>): string => '', sent: 0 };
  let agent = '';
  const server = Bun.serve({
    unix: socket,
    fetch: async (req) => {
      const url = new URL(req.url);
      const token = req.headers.get('x-agent-bus-token') ?? '';
      if (url.pathname === '/identity') return Response.json({ protocol: 1, protocol_min: 1 });
      if (url.pathname === '/status') return Response.json({ you: token === 'agent' && agent ? agent : 'test' });
      calls.push(`${req.method} ${url.pathname}`);
      if (url.pathname === '/register') return new Response('exists', { status: 412 });
      if (url.pathname === '/token') {
        agent = ((await req.json()) as { name: string }).name;
        return Response.json({ token: 'agent' });
      }
      if (url.pathname === '/kv/list') {
        const json = [...kv.keys()].map((name) => ({ name, size: 2, preview: '{}' }));
        return Response.json({ values: { string: [], int: [], json } });
      }
      if (url.pathname === '/kv') {
        const name = url.searchParams.get('name') ?? '';
        return kv.has(name) ? Response.json({ value: kv.get(name) }) : Response.json({ error: 'no such name', kind: 'not_found' }, { status: 404 });
      }
      if (url.pathname === '/send') {
        const m = (await req.json()) as { to: string; tag: string; topic: string; body: string };
        const body = JSON.parse(m.body) as Record<string, unknown>;
        asked.push({ to: m.to, body });
        const reply = { message_id: `r${++state.sent}`, from: m.to, to: agent, tag: m.tag, topic: m.topic, body: state.answer(body) };
        if (state.hold) held.push(reply);
        else inbox.push(reply);
        return Response.json({ message_id: `m${state.sent}`, from: agent, ...m });
      }
      if (url.pathname === '/consume') {
        const tag = url.searchParams.get('tag');
        if (!tag) return new Response('untagged read', { status: 400 });
        const i = inbox.findIndex((m) => m.tag === tag);
        return i < 0 ? new Response(null, { status: 204 }) : Response.json(inbox.splice(i, 1)[0]);
      }
      return new Response('not found', { status: 404 });
    },
  });
  return {
    socket, kv, calls, asked, state,
    release: () => {
      inbox.push(...held);
      held = [];
    },
    stop: async () => {
      server.stop(true);
      await rm(dir, { recursive: true, force: true });
    },
  };
}

let cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

async function start(port: number, o: { ab?: boolean } = {}) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-rag-ui-')));
  const root = join(dir, 'notes');
  const other = join(dir, 'other');
  const ref = join(dir, 'ref');
  for (const d of [root, other, ref]) await mkdir(d);
  await writeFile(join(root, 'a.md'), NOTE);
  await writeFile(join(other, 'b.md'), '# b\n');
  await writeFile(join(ref, 'rag-sync.md'), '# guide\n');
  const bus = await fakeDaemon();
  const prefs = await Prefs.load(join(dir, 'prefs.json'));
  if (o.ab !== false) await prefs.setAgentBus({ enabled: true, socket: bus.socket });
  const registry = await Registry.create([root, other]);
  await registry.addReference(ref, '_ref');
  const s = await serve({ registry, prefs, port, hostname: '127.0.0.1', noGit: true });
  cleanups.push(async () => {
    s.server.stop(true);
    s.watcher.close();
    s.control?.stop();
    await bus.stop();
    await rm(dir, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${port}`;
  const idOf = (path: string) => registry.list().find((r) => r.path === path)!.id;
  const rid = idOf(root);
  const source = { v: 1, root: { path: root, dev: '1', ino: '2' }, filescan: '#filescan/notes@h', rag: RAG, namespace: 'notes', table: 'md', createdAt: '2026-11-06T00:00:00Z', by: '#mdhouse@h' };
  const last = { v: 1, startedAt: '2026-11-06T10:00:00.000Z', endedAt: '2026-11-06T10:00:30.000Z', rounds: 2, untilDone: true, result: 'incomplete', exit: 5, confirmed: 12, remaining: 3, sent: 4 };
  const register = () => {
    bus.kv.set('rag/source/notes/md', source);
    bus.kv.set('rag/last/notes/md', last);
  };
  const get = (path: string, headers: Record<string, string> = {}) => fetch(origin + path, { headers });
  const search = (q: string, extra = '', headers: Record<string, string> = {}) =>
    get(`/api/rag/search?root=${rid}&q=${encodeURIComponent(q)}${extra}`, { 'x-mdhouse': '1', ...headers });
  return { origin, bus, root, rid, otherId: idOf(other), refId: idOf(ref), source, last, register, get, search, registry, prefs };
}

const answer = (records: unknown[]) => JSON.stringify({ mode: 'keyword', records });

describe('GET /api/rag — the status', () => {
  test('Agent Bus off: {enabled:false}, and the bus is not touched', async () => {
    const t = await start(61851, { ab: false });
    expect(await (await t.get(`/api/rag?root=${t.rid}`)).json()).toEqual({ enabled: false });
    expect(t.bus.calls).toEqual([]);
  });

  test('an unknown root and the reference root are 404', async () => {
    const t = await start(61852);
    expect((await t.get('/api/rag?root=nope')).status).toBe(404);
    expect((await t.get(`/api/rag?root=${t.refId}`)).status).toBe(404);
  });

  test('no registered source: enabled, source null, with the root path and the guide link, nothing else', async () => {
    const t = await start(61853);
    expect(await (await t.get(`/api/rag?root=${t.rid}`)).json()).toEqual({ enabled: true, path: t.root, guide: `/${t.refId}/rag-sync.md`, source: null, last: null });
  });

  test('a registered source and its latest run; the RAG and FileScan names stay on the server', async () => {
    const t = await start(61854);
    t.register();
    const body = await (await t.get(`/api/rag?root=${t.rid}`)).json();
    expect(body).toEqual({
      enabled: true,
      path: t.root,
      guide: `/${t.refId}/rag-sync.md`,
      source: { sid: 'notes/md', namespace: 'notes', table: 'md' },
      last: { startedAt: t.last.startedAt, endedAt: t.last.endedAt, result: 'incomplete', confirmed: 12, remaining: 3, rounds: 2 },
    });
    expect(JSON.stringify(body)).not.toContain('filescan');
    expect(JSON.stringify(body)).not.toContain('#rag');
  });

  test('a source registered for another folder is not this project\'s', async () => {
    const t = await start(61855);
    t.register();
    expect(((await (await t.get(`/api/rag?root=${t.otherId}`)).json()) as { source: unknown }).source).toBeNull();
  });

  test('a source without a run yet: last null', async () => {
    const t = await start(61856);
    t.register();
    t.bus.kv.delete('rag/last/notes/md');
    expect(((await (await t.get(`/api/rag?root=${t.rid}`)).json()) as { last: unknown }).last).toBeNull();
  });

  test('the KV is read once per 15 s', async () => {
    const t = await start(61857);
    t.register();
    await t.get(`/api/rag?root=${t.rid}`);
    await t.get(`/api/rag?root=${t.rid}`);
    expect(t.bus.calls.filter((c) => c === 'GET /kv/list')).toHaveLength(1);
  });

  test('an unreachable bus is an error in a 200, in safe words', async () => {
    const t = await start(61858);
    await t.bus.stop();
    const res = await t.get(`/api/rag?root=${t.rid}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { enabled: boolean; error: string };
    expect(body.enabled).toBe(true);
    expect(body.error).toMatch(/agent bus/);
    expect(body.error).not.toContain('/tmp');
  });
});

describe('GET /api/rag/search', () => {
  test('Agent Bus off is 404, like the other /api/ab* writes', async () => {
    const t = await start(61861, { ab: false });
    const res = await t.search('plan');
    expect(res.status).toBe(404);
    expect(t.bus.calls).toEqual([]);
  });

  test('a query is 1–1024 characters; an unknown root is 404; a project with no source is 404', async () => {
    const t = await start(61862);
    expect((await t.search('')).status).toBe(400);
    expect((await t.search('   ')).status).toBe(400);
    expect((await t.search('x'.repeat(1025))).status).toBe(400);
    expect((await t.get('/api/rag/search?root=nope&q=a', { 'x-mdhouse': '1' })).status).toBe(404);
    expect((await t.search('plan')).status).toBe(404);
    expect(t.bus.asked).toEqual([]);
  });

  test('keyword only, to the source\'s RAG: the request cannot choose the target, the mode, the namespace or the table', async () => {
    const t = await start(61863);
    t.register();
    t.bus.state.answer = () => answer([]);
    const res = await t.search('plan', '&limit=3&mode=semantic&paid=1&rag=%23evil%40x&namespace=x&table=y&tableName=z');
    expect(res.status).toBe(200);
    expect(t.bus.asked).toEqual([{ to: RAG, body: { method: 'search', namespace: 'notes', tableName: 'md', query: 'plan', mode: 'keyword', limit: 3 } }]);
  });

  test.each([['99', 16], ['0', 8], ['-4', 1], ['abc', 8], ['', 8], ['5', 5]])('limit %p is sent as %p', async (asked, sent) => {
    const t = await start(61864);
    t.register();
    t.bus.state.answer = () => answer([]);
    await t.search('plan', `&limit=${asked}`);
    expect(t.bus.asked[0]!.body.limit).toBe(sent);
  });

  test('hits are cited from the local file and link to the document at the line; a changed file is stale', async () => {
    const t = await start(61865);
    t.register();
    await writeFile(join(t.root, 'old.md'), '# Old\n\ntext\n');
    t.bus.state.answer = () =>
      answer([
        rec('a.md', sha(NOTE), 'first\nsecond\n'),
        rec('old.md', sha('# something else\n'), 'text'),
        rec('gone.md', sha(NOTE), 'first', { heading_path: ['X'], lines: [7, 8] }),
      ]);
    const res = await t.search('first');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const body = (await res.json()) as { hits: Array<Record<string, unknown>>; count: number; took: number };
    expect(body.count).toBe(3);
    expect(typeof body.took).toBe('number');
    expect(body.hits[0]).toEqual({ source: 'a.md', url: `/${t.rid}/a.md#L5`, lines: [5, 6], heading_path: ['Notes', 'Plan'], excerpt: 'first\nsecond\n', score: 2.5 });
    expect(body.hits[1]).toEqual({ source: 'old.md', url: `/${t.rid}/old.md`, excerpt: 'text', stale: true, score: 2.5 });
    expect(body.hits[2]).toMatchObject({ source: 'gone.md', url: `/${t.rid}/gone.md#L7`, lines: [7, 8], heading_path: ['X'] });
  });

  test('a long excerpt is cut and says so', async () => {
    const t = await start(61866);
    t.register();
    t.bus.state.answer = () => answer([rec('a.md', sha(NOTE), 'x'.repeat(700))]);
    const body = (await (await t.search('x')).json()) as { hits: Array<{ excerpt: string; truncated?: boolean }> };
    expect(body.hits[0]!.excerpt).toHaveLength(600);
    expect(body.hits[0]!.truncated).toBe(true);
  });

  test('a reply that does not validate is 503 and nothing from it is shown', async () => {
    const t = await start(61867);
    t.register();
    for (const bad of ['not json', JSON.stringify({ error: { code: 'x', text: 'denied' } }), answer([rec('../x.md', sha(NOTE), 'x')]), answer([rec('a.md', sha(NOTE), 'x', { namespace: 'other' })])]) {
      t.bus.state.answer = () => bad;
      const res = await t.search('plan');
      expect(res.status).toBe(503);
      expect(await res.text()).not.toContain('denied');
    }
  });

  test('a cross-site request is refused before anything is sent', async () => {
    const t = await start(61868);
    t.register();
    t.bus.state.answer = () => answer([]);
    expect((await t.search('plan', '', { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await t.search('plan', '', { origin: 'http://evil.example' })).status).toBe(403);
    expect(t.bus.asked).toEqual([]);
    expect((await t.search('plan', '', { origin: t.origin })).status).toBe(200);
  });

  test('without the page\'s x-mdhouse: 1 header it is 403 before anything is sent', async () => {
    const t = await start(61871);
    t.register();
    t.bus.state.answer = () => answer([]);
    for (const h of [undefined, '', '0', 'yes']) {
      const res = await t.get(`/api/rag/search?root=${t.rid}&q=plan`, h === undefined ? {} : { 'x-mdhouse': h });
      expect(res.status).toBe(403);
    }
    expect(t.bus.asked).toEqual([]);
  });

  test('a Viewer still searches: searching is reading', async () => {
    const t = await start(61872);
    t.register();
    t.bus.state.answer = () => answer([]);
    await t.prefs.setMode('viewer');
    const res = await t.search('plan');
    expect(res.status).toBe(200);
    expect(t.bus.asked).toHaveLength(1);
  });

  test('the source is found past the 50th of 60 registered ones', async () => {
    const t = await start(61873);
    for (let i = 0; i < 59; i++) t.bus.kv.set(`rag/source/ns${String(i).padStart(2, '0')}/md`, { ...t.source, root: { path: `/elsewhere/${i}` }, namespace: `ns${String(i).padStart(2, '0')}` });
    t.register(); // rag/source/notes/md sorts after every ns..
    expect([...t.bus.kv.keys()].filter((k) => k.startsWith('rag/source/')).indexOf('rag/source/notes/md')).toBe(59);
    const status = (await (await t.get(`/api/rag?root=${t.rid}`)).json()) as { source: { sid: string } | null };
    expect(status.source?.sid).toBe('notes/md');
  });

  test('concurrent first requests share one KV lookup', async () => {
    const t = await start(61874);
    t.register();
    const all = await Promise.all(Array.from({ length: 5 }, () => t.get(`/api/rag?root=${t.rid}`)));
    for (const r of all) expect(r.status).toBe(200);
    expect(t.bus.calls.filter((c) => c === 'GET /kv/list')).toHaveLength(1);
    expect(t.bus.calls.filter((c) => c === 'GET /kv').length).toBe(2); // the source, its last run
  });

  test('at most two searches run at once; the third is 429 and the first two finish', async () => {
    const t = await start(61869);
    t.register();
    t.bus.state.hold = true;
    t.bus.state.answer = () => answer([]);
    const first = [t.search('a'), t.search('b')];
    while (t.bus.asked.length < 2) await Bun.sleep(5);
    expect((await t.search('c')).status).toBe(429);
    t.bus.release();
    for (const r of await Promise.all(first)) expect(r.status).toBe(200);
    t.bus.state.hold = false;
    expect((await t.search('d')).status).toBe(200);
  });

  test('an unreachable bus is 503 in safe words', async () => {
    const t = await start(61870);
    await t.bus.stop();
    const res = await t.search('plan');
    expect(res.status).toBe(503);
    expect(await res.text()).toMatch(/agent bus/);
  });
});

describe('/rag page', () => {
  test('is served like /settings, and `rag` can never be a project id', async () => {
    const t = await start(61871);
    const res = await t.get('/rag');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(t.registry.list().some((r) => r.id === 'rag')).toBe(false);
  });
});
