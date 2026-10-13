import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abTargets, AgentBus, badPatterns, isAlive, passes, ownName, requestText, validTarget, type AbEvent, type Envelope } from '../src/lib/agent-bus';

/**
 * A fake `agent-busd` on a temp unix socket: register (412 when it exists), token, ls, send, and a
 * filtered consume served from what `reply` queued for a tag.
 */
async function fakeDaemon(opts: { exists?: boolean; agents?: object[]; stale?: number; tcp?: number; reply?: (to: string) => Partial<Envelope>[] } = {}) {
  let stale = opts.stale ?? 0;
  const dir = await mkdtemp(join(tmpdir(), 'mdhouse-ab-'));
  const socket = join(dir, 'user-test.sock');
  const calls: string[] = [];
  const queued = new Map<string, Partial<Envelope>[]>();
  const handler = async (req: Request): Promise<Response> => {
      const url = new URL(req.url);
      const token = req.headers.get('x-agent-bus-token') ?? '';
      calls.push(`${req.method} ${url.pathname}${token === 'tok' ? ' +token' : token ? ` +${token}` : ''}`);
      if (url.pathname === '/register') {
        if (opts.exists && req.headers.get('if-none-match') === '*') return new Response('exists', { status: 412 });
        return Response.json(await req.json());
      }
      if (url.pathname === '/token') return Response.json({ token: 'tok' });
      if (url.pathname === '/ls') return Response.json(opts.agents ?? []);
      if (url.pathname === '/send') {
        const m = (await req.json()) as { to: string; tag: string; topic: string };
        if (m.to === '#nobody@x') return Response.json({ error: 'no such receiver: #nobody@x (no such name)' }, { status: 404 });
        queued.set(m.tag, (opts.reply?.(m.to) ?? []).map((r) => ({ topic: m.topic, tag: m.tag, ...r })));
        return Response.json({ message_id: 'm1', ...m });
      }
      if (url.pathname === '/consume') {
        if (!url.searchParams.get('tag')) return stale-- > 0 ? Response.json({ body: 'old reply' }) : new Response(null, { status: 204 });
        const next = queued.get(url.searchParams.get('tag') ?? '')?.shift();
        return next ? Response.json(next) : new Response(null, { status: 204 });
      }
      return new Response('not found', { status: 404 });
  };
  const server = Bun.serve({ unix: socket, fetch: handler });
  const tcp = opts.tcp ? Bun.serve({ port: opts.tcp, hostname: '127.0.0.1', fetch: handler }) : null;
  return {
    socket,
    calls,
    stop: async () => {
      server.stop(true);
      tcp?.stop(true);
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/** Collects events; `until` resolves once `n` of them came. */
function collector() {
  const events: AbEvent[] = [];
  let wake = () => {};
  return {
    events,
    emit: (ev: AbEvent) => {
      events.push(ev);
      wake();
    },
    until: async (n: number) => {
      while (events.length < n) await new Promise<void>((r) => (wake = r));
    },
  };
}

describe('agent bus — helpers', () => {
  test('<!-- AB: … --> names the agents a page asks: several, in order, no repeats', () => {
    expect(abTargets('# x\n<!-- AB: #claude/a@h -->\ntext <!--AB: #claude/b@h, #Claude/A@h -->')).toEqual(['#claude/a@h', '#claude/b@h']);
    expect(abTargets('<!-- a comment -->')).toEqual([]);
    // shown as code: an example, not a comment
    expect(abTargets('- AI includes `<!-- AB: agent-bus name -->`; …\n')).toEqual([]);
    expect(abTargets('```md\n<!-- AB: #claude/x@h -->\n```\n<!-- AB: #claude/y@h -->\n')).toEqual(['#claude/y@h']);
    expect(abTargets('~~~\n<!-- AB: #claude/x@h -->\n')).toEqual([]);
  });

  test('own name: #mdhouse@<host>, in the bus alphabet', () => {
    expect(ownName('Parf.US')).toBe('#mdhouse@parf.us');
    expect(ownName('my box_1')).toBe('#mdhouse@my-box_1');
  });

  test('alive: a reader now, or the credential used within 90 s', () => {
    const now = Date.parse('2026-10-13T00:00:00Z');
    expect(isAlive({ readers: 1 }, now)).toBe(true);
    expect(isAlive({ readers: 0, last_used: '2026-10-12T23:59:30Z' }, now)).toBe(true);
    expect(isAlive({ readers: 0, last_used: '2026-10-12T23:50:00Z' }, now)).toBe(false);
    expect(isAlive({}, now)).toBe(false);
  });

  test('the request: the file by its path, the page by its URL, the note after', () => {
    expect(requestText('updated', '/n/a.md', 'http://h/r/a.md', ' see Q3 ')).toBe('mdhouse: /n/a.md was updated — read it and reply.\nPage: http://h/r/a.md\n\nsee Q3');
    expect(requestText('target', '/n/a.md', 'u')).toContain('🎯 items in /n/a.md');
  });

  test('the names filter: a regex per line, against the name without #, any case; none — all', () => {
    expect(passes('#claude/a@h', ['^claude', '^codex'])).toBe(true);
    expect(passes('#Codex/x@h', ['^codex'])).toBe(true);
    expect(passes('#ab-runner/x@h', ['^claude', '^codex'])).toBe(false);
    expect(passes('#ab-runner/x@h', [])).toBe(true);
    expect(passes('#claude/a@h', ['(', '^claude'])).toBe(true);
    expect(badPatterns(['^claude', '(', '[a-'])).toEqual(['(', '[a-']);
  });

  test('a target is a bus name', () => {
    for (const n of ['#claude/home-x@parf.us', 'parf', '@team']) expect(validTarget(n)).toBe(true);
    for (const n of ['', '#Claude', 'a b', '../x', 'x'.repeat(65), 3]) expect(validTarget(n)).toBe(false);
  });
});

describe('agent bus — the service, against a fake daemon', () => {
  test('connects as its own agent: registers (create only), mints a token, then talks with it', async () => {
    const d = await fakeDaemon({
      exists: true,
      stale: 2,
      agents: [
        { name: '#claude/b@h', kind: 'agent', readers: 0 },
        { name: '#claude/a@h', kind: 'agent', readers: 1, descr: 'a' },
        { name: '#mdhouse@h', kind: 'agent', readers: 0 },
      ],
    });
    try {
      const bus = new AgentBus(() => ({ addr: d.socket, token: '' }), () => {}, { me: '#mdhouse@h' });
      expect(await bus.agents()).toEqual([
        { name: '#claude/a@h', descr: 'a', alive: true },
        { name: '#claude/b@h', descr: '', alive: false },
      ]);
      // an existing record (412) is kept as is; every later call carries the agent's token
      // and drains the replies an earlier run left: two, then empty
      expect(d.calls).toEqual(['POST /register', 'POST /token', 'GET /consume +token', 'GET /consume +token', 'GET /consume +token', 'GET /ls +token']);
    } finally {
      await d.stop();
    }
  });

  test('ask: sent → ack → answer; done; a refused send is an error; no reply → timeout', async () => {
    const d = await fakeDaemon({
      reply: (to) =>
        to === '#claude/a@h' ? [{ receipt: 'ack' }, { body: 'read it — all good' }] : to === '#claude/b@h' ? [{ receipt: 'done' }] : [],
    });
    const c = collector();
    try {
      const bus = new AgentBus(() => ({ addr: d.socket, token: '' }), c.emit, { me: '#mdhouse@h', answerMs: 50, wait: '0s' });
      const job = await bus.ask(['#claude/a@h', '#claude/b@h', '#nobody@x', '#claude/c@h'], 'hi');
      await c.until(8);
      const by = (to: string) => c.events.filter((e) => e.to === to).map((e) => (e.body ? `${e.kind}: ${e.body}` : e.kind));
      expect(by('#claude/a@h')).toEqual(['sent', 'ack', 'answer: read it — all good']);
      expect(by('#claude/b@h')).toEqual(['sent', 'done']);
      // the daemon's JSON refusal, as its words
      expect(by('#nobody@x')).toEqual(['error: no such receiver: #nobody@x (no such name)']);
      expect(by('#claude/c@h')).toEqual(['sent', 'timeout']);
      expect(bus.job(job)).toHaveLength(8);
      expect(bus.job('nope')).toBeNull();
    } finally {
      await d.stop();
    }
  });

  test('over TCP: http://host:port, the configured token for the owner calls, then its own', async () => {
    const d = await fakeDaemon({ tcp: 61789, agents: [{ name: '#claude/a@h', kind: 'agent', readers: 1 }] });
    try {
      const bus = new AgentBus(() => ({ addr: 'http://127.0.0.1:61789/', token: 'user-tok' }), () => {}, { me: '#mdhouse@h' });
      expect((await bus.agents()).map((a) => a.name)).toEqual(['#claude/a@h']);
      expect(d.calls).toEqual(['POST /register +user-tok', 'POST /token +user-tok', 'GET /consume +token', 'GET /ls +token']);
    } finally {
      await d.stop();
    }
  });

  test('no daemon: status says why, and connecting is tried again next time', async () => {
    const bus = new AgentBus(() => ({ addr: '/nonexistent/agent-bus.sock', token: '' }), () => {});
    const st = await bus.status();
    expect(st.connected).toBe(false);
    expect(st.error).toContain('unreachable');
  });
});

describe('agent bus — routes', () => {
  test('off → 404; on: cross-origin 403, bad body 400, not a doc 404; the doc payload names its agents', async () => {
    const { Registry } = await import('../src/lib/roots');
    const { Prefs } = await import('../src/lib/prefs');
    const { serve } = await import('../src/server');
    const d = await fakeDaemon();
    const dir = await mkdtemp(join(tmpdir(), 'mdhouse-ab-serve-'));
    await writeFile(join(dir, 'a.md'), '# a\n<!-- AB: #claude/a@h -->\n');
    const prefs = await Prefs.load(join(dir, 'prefs.json'));
    const registry = await Registry.create([dir]);
    const id = registry.list()[0]!.id;
    const port = 61796;
    const { server, watcher, control } = await serve({ registry, prefs, port, hostname: '127.0.0.1', noGit: true });
    const at = (path: string) => `http://127.0.0.1:${port}${path}`;
    const post = (path: string, body: unknown, origin = at('')) =>
      fetch(at(path), { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });
    const send = { p: `${id}/a.md`, targets: ['#claude/a@h'], action: 'updated' };
    try {
      expect(await (await fetch(at('/api/ab'))).json()).toEqual({ enabled: false });
      expect((await post('/api/ab/send', send)).status).toBe(404);
      expect((await (await fetch(at(`/api/doc?p=${id}/a.md`))).json()).ab).toBeUndefined();

      await prefs.setAgentBus({ enabled: true, socket: d.socket });
      expect((await post('/api/ab/send', send, 'http://evil.example')).status).toBe(403);
      expect((await post('/api/ab/send', { ...send, targets: ['bad name'] })).status).toBe(400);
      expect((await post('/api/ab/send', { ...send, action: 'rm -rf' })).status).toBe(400);
      expect((await post('/api/ab/send', { ...send, p: `${id}/none.md` })).status).toBe(404);
      const ok = await post('/api/ab/send', send);
      expect(ok.status).toBe(200);
      expect(typeof ((await ok.json()) as { job: string }).job).toBe('string');
      expect((await (await fetch(at(`/api/doc?p=${id}/a.md`))).json()).ab).toEqual(['#claude/a@h']);

      expect((await post('/api/ab/filter', { lines: ['^claude', '('] })).status).toBe(400);
      expect((await post('/api/ab/filter', { lines: [' ^claude ', ''] })).status).toBe(200);
      expect(prefs.agentBus.filter).toEqual(['^claude']);
      expect((await post('/api/ab/default', { names: ['#claude/a@h'] })).status).toBe(200);
      expect(prefs.agentBus.default).toEqual(['#claude/a@h']);
      const info = (await (await fetch(at('/api/ab'))).json()) as { connected: boolean; default: string[] };
      expect(info.connected).toBe(true);
      expect(info.default).toEqual(['#claude/a@h']);
    } finally {
      server.stop(true);
      watcher.close();
      control?.stop();
      await d.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
