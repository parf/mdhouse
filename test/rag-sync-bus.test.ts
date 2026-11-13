import { afterAll, describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUS_LIMITS, openBus, RagBusError, rootId, type BusOptions } from '../src/lib/rag-sync-bus';

const base = mkdtempSync(join(tmpdir(), 'mdhouse-rag-bus-'));
afterAll(() => rmSync(base, { recursive: true, force: true }));
let n = 0;

const ME = '#mdhouse@h';
const FS = '#filescan/notes@h';
const RAG = '#rag/notes@h';
const TOKEN = 'SECRET-TOKEN-1234';

type Msg = Record<string, unknown>;

/**
 * A fake `agent-busd` on a temp unix socket (mode 600): the account is `parf`, `TOKEN` is
 * `#mdhouse@h`. `reply(msg)` gives the envelopes queued for a send; consume serves them by topic and
 * tag only and advances the fake clock by its wait when nothing matches.
 */
function fakeDaemon(o: {
  you?: string;
  me?: unknown;
  lookup?: number;
  token?: string;
  self?: string;
  config?: unknown;
  send?: (msg: Msg) => Response | undefined;
  /** Status every key-value route answers with instead of working. */
  kvStatus?: number;
  reply?: (msg: Msg, id: string) => Msg[];
  mode?: number;
} = {}) {
  const dir = join(base, `d${++n}`);
  mkdirSync(dir);
  const socket = join(dir, 'user-parf.sock');
  const calls: string[] = [];
  const sent: Msg[] = [];
  const queue: Msg[] = [];
  const kv = new Map<string, unknown>();
  const clock = { t: 1_000_000 };
  const server = Bun.serve({
    unix: socket,
    fetch: async (req) => {
      const url = new URL(req.url);
      const tok = req.headers.get('x-agent-bus-token') ?? '';
      // the client's protocol handshake: answered, not logged
      if (url.pathname === '/identity') return Response.json({ protocol: 1, protocol_min: 1 });
      calls.push(`${req.method} ${url.pathname}${url.search}${tok ? (tok === TOKEN ? ' +token' : ' +other') : ''}`);
      const route = `${req.method} ${url.pathname}`;
      if (route === 'GET /status') return Response.json({ you: tok === TOKEN ? (o.self ?? ME) : (o.you ?? 'parf'), up: true });
      if (route === 'GET /lookup') {
        if (o.lookup) return Response.json({ error: 'no such name', kind: 'not_found' }, { status: o.lookup });
        return Response.json(o.me ?? { name: ME, kind: 'agent', owner: 'parf', status: 'active' });
      }
      if (route === 'POST /token') return Response.json({ token: o.token ?? TOKEN });
      if (route === 'GET /config') return Response.json(o.config === undefined ? null : o.config);
      if (route === 'POST /send') {
        const msg = (await req.json()) as Msg;
        sent.push(msg);
        const r = o.send?.(msg);
        if (r) return r;
        const id = `m${sent.length}`;
        for (const e of o.reply?.(msg, id) ?? []) queue.push({ topic: msg.topic, tag: msg.tag, to: ME, from: msg.to, ...e });
        return Response.json({ message_id: id, from: ME, to: msg.to, topic: msg.topic, tag: msg.tag });
      }
      if (route.includes(' /kv') && o.kvStatus) return Response.json({ error: 'refused', kind: 'acl' }, { status: o.kvStatus });
      if (route === 'GET /kv') {
        const key = `${url.searchParams.get('kind')}:${url.searchParams.get('name')}`;
        return kv.has(key) ? Response.json({ value: kv.get(key) }) : Response.json({ error: 'no such name', kind: 'not_found' }, { status: 404 });
      }
      if (route === 'POST /kv/set') {
        const b = (await req.json()) as Msg;
        const key = `${b.kind}:${b.name}`;
        if (b.how === 'add' && kv.has(key)) return Response.json({ error: 'name taken', kind: 'name-taken' }, { status: 412 });
        kv.set(key, b.value);
        return Response.json({ record: b.record, kind: b.kind, name: b.name });
      }
      if (route === 'POST /kv/delete') {
        const b = (await req.json()) as Msg;
        return Response.json({ deleted: kv.delete(`${b.kind}:${b.name}`) });
      }
      if (route === 'GET /kv/list') {
        const of = (kind: string) => [...kv.keys()].filter((k) => k.startsWith(`${kind}:`)).map((k) => ({ name: k.slice(kind.length + 1), size: 2, preview: '{}' }));
        return Response.json({ values: { string: of('string'), int: of('int'), json: of('json') } });
      }
      if (route === 'GET /consume') {
        const topic = url.searchParams.get('topic');
        const tag = url.searchParams.get('tag');
        if (!topic || !tag) return Response.json({ error: 'unfiltered' }, { status: 400 });
        const i = queue.findIndex((m) => m.topic === topic && m.tag === tag);
        if (i < 0) {
          clock.t += Number.parseInt(url.searchParams.get('wait') ?? '0', 10) * 1000;
          return new Response(null, { status: 204 });
        }
        return Response.json(queue.splice(i, 1)[0]);
      }
      return Response.json({ error: 'not here' }, { status: 404 });
    },
  });
  chmodSync(socket, o.mode ?? 0o600);
  const root = join(dir, 'root');
  mkdirSync(root);
  return {
    socket,
    calls,
    sent,
    kv,
    clock,
    root,
    stop: () => server.stop(true),
    async open(extra: Partial<BusOptions> = {}) {
      return openBus({ socket, me: ME, replyMs: 120_000, root: (await rootId(root))!, targets: [FS, RAG], now: () => clock.t, ...extra });
    },
  };
}

const refused = async (p: Promise<unknown>, step: string) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(RagBusError);
  expect((err as RagBusError).step).toBe(step);
  expect((err as Error).message).not.toContain(TOKEN);
};

describe('openBus — who it talks as', () => {
  test('proves account, record, token and identity; never registers or reads unfiltered', async () => {
    const d = fakeDaemon();
    try {
      const bus = await d.open();
      expect(bus.me).toBe(ME);
      expect(bus.account).toBe('parf');
      expect(d.calls).toEqual(['GET /status', `GET /lookup?name=${encodeURIComponent(ME)}`, 'POST /token', 'GET /status +token']);
      expect(JSON.stringify(bus)).not.toContain(TOKEN);
    } finally {
      d.stop();
    }
  });

  test('the socket: local, a socket, the login own, closed to others, not a symlink', async () => {
    const d = fakeDaemon();
    try {
      await refused(d.open({ socket: 'http://127.0.0.1:6767' }), 'socket');
      await refused(d.open({ uid: (process.getuid?.() ?? 0) + 1 }), 'socket');
      const link = join(base, `l${++n}.sock`);
      symlinkSync(d.socket, link);
      await refused(d.open({ socket: link }), 'socket');
      const file = join(base, `f${++n}.sock`);
      writeFileSync(file, '');
      await refused(d.open({ socket: file }), 'socket');
      chmodSync(d.socket, 0o660);
      await refused(d.open(), 'socket');
      expect(d.calls).toEqual([]);
    } finally {
      d.stop();
    }
  });

  test.each([
    ['an agent as the account', { you: '#claude/x@h' }, 'account'],
    ['no record', { lookup: 404 }, 'agent'],
    ['another kind', { me: { name: ME, kind: 'queue', owner: 'parf' } }, 'agent'],
    ['another owner', { me: { name: ME, kind: 'agent', owner: 'eve' } }, 'agent'],
    ['inactive', { me: { name: ME, kind: 'agent', owner: 'parf', status: 'inactive' } }, 'agent'],
    ['no token', { token: '' }, 'token'],
    ['a token for someone else', { self: '#other@h' }, 'identity'],
  ])('refuses %s, before any message', async (_, o, step) => {
    const d = fakeDaemon(o as Parameters<typeof fakeDaemon>[0]);
    try {
      await refused(d.open(), step);
      expect(d.calls.some((c) => c.startsWith('POST /send') || c.startsWith('POST /register'))).toBe(false);
    } finally {
      d.stop();
    }
  });

  test('a daemon that is not there is a setup refusal', async () => {
    const d = fakeDaemon();
    d.stop();
    // a stopped daemon removes its socket
    await refused(d.open(), 'socket');
  });
});

describe('ownerConfig', () => {
  test('reads the Configuration as the account; keeps every key; binds the dir identity', async () => {
    const d = fakeDaemon({ config: { dir: '', include: ['*.md'], mode: 'demand', extra: { x: 1 } } });
    try {
      const bus = await d.open();
      const dd = fakeDaemon({ config: { dir: d.root, include: ['*.md'], mode: 'demand', extra: { x: 1 } } });
      try {
        const b2 = await dd.open();
        const oc = await b2.ownerConfig(FS);
        expect(oc).toEqual({ filescan: FS, root: (await rootId(d.root))!, config: { dir: d.root, include: ['*.md'], mode: 'demand', extra: { x: 1 } } });
        expect(dd.calls.at(-1)).toBe(`GET /config?name=${encodeURIComponent(FS)}`);
      } finally {
        dd.stop();
      }
      await refused(bus.ownerConfig(FS), 'config');
      await refused(bus.ownerConfig('not a name'), 'config');
    } finally {
      d.stop();
    }
  });

  test.each([[null], [[]], [{ dir: 'rel/path' }], [{ dir: '/nonexistent/x' }]])('refuses %p', async (config) => {
    const d = fakeDaemon({ config });
    try {
      await refused((await d.open()).ownerConfig(FS), 'config');
    } finally {
      d.stop();
    }
  });
});

describe('store — the agent\'s own JSON key-value store and log', () => {
  test('add, get, set, delete and names, each as the agent on its own record and the json kind', async () => {
    const d = fakeDaemon();
    try {
      const { store } = await d.open();
      expect(await store.get('rag/last/a')).toBeNull();
      expect(await store.add('rag/last/a', { v: 1 })).toBe(true);
      expect(await store.add('rag/last/a', { v: 2 })).toBe(false);
      expect(await store.get('rag/last/a')).toEqual({ v: 1 });
      await store.set('rag/last/a', { v: 3 });
      expect(await store.get('rag/last/a')).toEqual({ v: 3 });
      await store.set('rag/hist/a/1', {});
      d.kv.set('string:rag/hist/a/str', 'x');
      expect(await store.names('rag/hist/a/')).toEqual(['rag/hist/a/1']);
      expect(await store.delete('rag/hist/a/1')).toBe(true);
      expect(await store.delete('rag/hist/a/1')).toBe(false);
      expect([...d.kv.keys()].sort()).toEqual(['json:rag/last/a', 'string:rag/hist/a/str']);
      expect(d.calls.filter((c) => c.includes('/kv')).every((c) => c.endsWith(' +token'))).toBe(true);
    } finally {
      d.stop();
    }
  });

  test('a refused store is a store step with the status, never the token', async () => {
    const d = fakeDaemon({ kvStatus: 403 });
    try {
      const { store } = await d.open();
      for (const run of [() => store.get('k'), () => store.add('k', {}), () => store.set('k', {}), () => store.delete('k'), () => store.names('k')]) await refused(run(), 'store');
      await expect(store.get('k')).rejects.toThrow('store: HTTP 403');
    } finally {
      d.stop();
    }
  });

  test('log writes one line to the agent log through #bus and waits for no answer', async () => {
    const d = fakeDaemon();
    try {
      const { store } = await d.open();
      await store.log('warning', 'rag-sync notes/md: incomplete, 2 remaining');
      expect(d.sent).toHaveLength(1);
      expect(d.sent[0]).toMatchObject({ to: '#bus', body: `write ${ME} warning rag-sync notes/md: incomplete, 2 remaining` });
      expect(d.sent[0]).not.toHaveProperty('wait');
    } finally {
      d.stop();
    }
  });

  test('a log the daemon refuses is a log step', async () => {
    const d = fakeDaemon({ send: () => Response.json({ error: 'no', kind: 'acl' }, { status: 403 }) });
    try {
      await refused((await d.open()).store.log('notice', 'x'), 'log');
    } finally {
      d.stop();
    }
  });
});

describe('request — one exchange, own labels only', () => {
  test('sends with fresh random labels; skips ack, strangers and other re; returns the raw body', async () => {
    const raw = '{"result":"failed","result":"confirmed"}';
    const d = fakeDaemon({
      reply: (_, id) => [
        { receipt: 'ack', re: id, body: '' },
        { from: '#eve@h', body: '{"result":"confirmed"}' },
        { re: 'm999', body: '{"result":"confirmed"}' },
        { to: '#other@h', body: 'x' },
        { re: id, body: raw },
      ],
    });
    try {
      const bus = await d.open();
      expect(await bus.request({ target: FS, body: 'sync #rag/notes@h as rag n t' })).toEqual({ kind: 'reply', body: raw });
      expect(await bus.request({ target: RAG, ask: 'status' })).toEqual({ kind: 'reply', body: raw });
      const [a, b] = d.sent as [Msg, Msg];
      expect(a).toMatchObject({ to: FS, body: 'sync #rag/notes@h as rag n t', wait: '120s' });
      expect(b).toMatchObject({ to: RAG, ask: 'status', body: '' });
      expect(a.topic).toMatch(/^mdhouse-rag-[0-9a-f-]{36}$/);
      expect(a.tag).toMatch(/^[0-9a-f-]{36}$/);
      expect(a.topic).not.toBe(b.topic);
      expect(a.tag).not.toBe(b.tag);
      // every read is filtered by this exchange's labels, with the agent's token
      for (const c of d.calls.filter((c) => c.startsWith('GET /consume'))) expect(c).toMatch(/topic=mdhouse-rag-.*&tag=.*&wait=\d+s \+token$/);
    } finally {
      d.stop();
    }
  });

  test('a typed body goes as JSON text', async () => {
    const d = fakeDaemon({ reply: () => [{ body: 'ok' }] });
    try {
      await (await d.open()).request({ target: RAG, body: { method: 'search', query: 'q' } });
      expect(d.sent[0]!.body).toBe('{"method":"search","query":"q"}');
    } finally {
      d.stop();
    }
  });

  test('no answer by the deadline is unknown, sent; done is not an answer', async () => {
    const d = fakeDaemon({ reply: (_, id) => [{ receipt: 'done', re: id, body: '' }] });
    try {
      const bus = await d.open({ replyMs: 120_000 });
      expect(await bus.request({ target: FS, body: 'sync' })).toEqual({ kind: 'uncertain', sent: true, reason: 'done without an answer' });
      expect(await bus.request({ target: FS, ask: 'status' })).toMatchObject({ kind: 'uncertain', sent: true, reason: 'done without an answer' });
      const d2 = fakeDaemon();
      try {
        expect(await (await d2.open()).request({ target: FS, body: 'sync' })).toEqual({ kind: 'uncertain', sent: true, reason: 'no answer before the deadline' });
        // waits of at most 55 s, until the 120 s are spent
        expect(d2.calls.filter((c) => c.startsWith('GET /consume')).map((c) => /wait=(\d+)s/.exec(c)![1])).toEqual(['55', '55', '10']);
      } finally {
        d2.stop();
      }
    } finally {
      d.stop();
    }
  });

  test.each([
    ['a 4xx refusal is not sent', () => Response.json({ error: 'acl' }, { status: 403 }), { sent: false, reason: 'send refused: HTTP 403' }],
    ['a full queue is not sent', () => Response.json({ error: 'full' }, { status: 429 }), { sent: false, reason: 'send refused: HTTP 429' }],
    ['a 5xx may have been accepted', () => new Response('boom', { status: 500 }), { sent: true, reason: 'send: HTTP 500' }],
    ['a malformed acceptance may have been accepted', () => new Response('not json'), { sent: true }],
    ['an envelope for another target', () => Response.json({ message_id: 'm', from: ME, to: '#eve@h' }), { sent: true }],
    ['an envelope from someone else', () => Response.json({ message_id: 'm', from: '#eve@h', to: FS }), { sent: true }],
  ])('%s', async (_, send, want) => {
    const d = fakeDaemon({ send });
    try {
      expect(await (await d.open()).request({ target: FS, body: 'sync' })).toMatchObject({ kind: 'uncertain', ...want });
      expect(d.calls.some((c) => c.startsWith('GET /consume'))).toBe(false);
    } finally {
      d.stop();
    }
  });

  test('a daemon gone before the send: not sent; gone after it: unknown', async () => {
    const d = fakeDaemon();
    const bus = await d.open();
    d.stop();
    expect(await bus.request({ target: FS, body: 'sync' })).toMatchObject({ kind: 'uncertain', sent: false });
    const d2 = fakeDaemon({ send: () => undefined, reply: () => [] });
    const bus2 = await d2.open();
    const gone = d2.stop;
    // the send is accepted, then the daemon disappears while the answer is awaited
    const p = bus2.request({ target: FS, body: 'sync' });
    await Bun.sleep(5);
    gone();
    expect(await p).toMatchObject({ kind: 'uncertain', sent: true });
  });

  test('an answer over the byte bound is unknown, never truncated', async () => {
    const d = fakeDaemon({ reply: () => [{ body: 'x'.repeat(BUS_LIMITS.bytes + 1) }] });
    try {
      expect(await (await d.open()).request({ target: FS, body: 'sync' })).toEqual({ kind: 'uncertain', sent: true, reason: 'reply: answer too large' });
    } finally {
      d.stop();
    }
  });

  test('only the session targets; a body or an ask, not both', async () => {
    const d = fakeDaemon();
    try {
      const bus = await d.open();
      for (const target of ['#ai@h', '#rag@h', 'parf', '#filescan/other@h']) {
        expect(await bus.request({ target, body: 'x' })).toEqual({ kind: 'uncertain', sent: false, reason: 'target not in this session' });
      }
      expect(await bus.request({ target: FS })).toMatchObject({ kind: 'uncertain', sent: false });
      expect(await bus.request({ target: FS, body: 'x', ask: 'status' })).toMatchObject({ kind: 'uncertain', sent: false });
      expect(d.sent).toEqual([]);
    } finally {
      d.stop();
    }
  });

  test('a root replaced since the plan: nothing with a body is sent', async () => {
    const d = fakeDaemon({ reply: () => [{ body: 'ok' }] });
    try {
      const bus = await d.open();
      renameSync(d.root, `${d.root}.old`);
      mkdirSync(d.root);
      expect(await bus.request({ target: FS, body: 'sync' })).toEqual({ kind: 'uncertain', sent: false, reason: 'root-changed' });
      expect(d.sent).toEqual([]);
      // a status ask carries no work
      expect(await bus.request({ target: FS, ask: 'status' })).toEqual({ kind: 'reply', body: 'ok' });
    } finally {
      d.stop();
    }
  });

  test('a request over the byte bound is not sent', async () => {
    const d = fakeDaemon();
    try {
      expect(await (await d.open()).request({ target: FS, body: 'x'.repeat(BUS_LIMITS.bytes) })).toEqual({ kind: 'uncertain', sent: false, reason: 'request too large' });
      expect(d.sent).toEqual([]);
    } finally {
      d.stop();
    }
  });

  test('no reason or error carries the token', async () => {
    const d = fakeDaemon({ send: () => Response.json({ error: `bad ${TOKEN}` }, { status: 401 }) });
    try {
      const r = await (await d.open()).request({ target: FS, body: 'sync' });
      expect(JSON.stringify(r)).not.toContain(TOKEN);
    } finally {
      d.stop();
    }
  });
});
