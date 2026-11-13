import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { chmodSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, open, realpath, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { askAdminRevoke, askDaemon, askRemove } from '../src/lib/control';
import { AgentBus, BusError, safeError, validEndpoint, type AbEvent } from '../src/lib/agent-bus';
import { Prefs } from '../src/lib/prefs';
import { Registry } from '../src/lib/roots';
import { serve } from '../src/server';
import { adminLogin } from './admin-login';
import { testPort } from './ports';

const tmp = async (prefix: string) => realpath(await mkdtemp(join(tmpdir(), prefix)));
const disk = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

/**
 * A fake `agent-busd` on a temp unix socket. Calls are logged with the credential they carried; the
 * client's identity/status handshake is answered, not logged.
 * Replies to a send are queued under its tag, and held back until `release()` when `hold` is set.
 * A consume with no tag is refused: mdhouse reads only its own call's topic and tag.
 * `echo`: every refusal's body repeats the credential it was sent.
 */
async function fakeDaemon(name: string, o: { hold?: boolean; echo?: boolean; tokenFor?: string } = {}) {
  const dir = await mkdtemp(join(tmpdir(), `mdhouse-ab-${name}-`));
  const socket = join(dir, 'bus.sock');
  const calls: string[] = [];
  type Reply = { message_id: string; from: string; to: string; tag: string; body: string; topic: string };
  const inbox: Reply[] = [];
  let held: Reply[] = [];
  let sent = 0;
  let agent = '';
  const agentToken = o.tokenFor ?? `agent-${name}`;
  const refuse = (status: number, why: string, token: string) =>
    Response.json({ error: o.echo ? `${why}; you sent ${token}` : why }, { status });
  const server = Bun.serve({
    unix: socket,
    fetch: async (req) => {
      const url = new URL(req.url);
      const token = req.headers.get('x-agent-bus-token') ?? '';
      if (url.pathname === '/identity') return Response.json({ protocol: 1, protocol_min: 1 });
      if (url.pathname === '/status') return Response.json({ you: token === agentToken && agent ? agent : 'test' });
      calls.push(`${req.method} ${url.pathname}${token ? ` +${token}` : ''}`);
      if (o.echo && url.pathname === '/register') return refuse(401, 'bad credential', token);
      if (url.pathname === '/register') return new Response('exists', { status: 412 });
      if (url.pathname === '/token') {
        agent = ((await req.json()) as { name: string }).name;
        return Response.json({ token: agentToken });
      }
      if (url.pathname === '/ls') return Response.json([{ name: `#claude/${name}@h`, kind: 'agent', readers: 1 }]);
      if (url.pathname === '/send') {
        const m = (await req.json()) as { to: string; tag: string; topic: string };
        if (m.to === '#nobody@x') return refuse(404, 'no such receiver', token);
        const id = `m${++sent}`;
        const reply = { message_id: `${id}-r`, from: m.to, to: agent, tag: m.tag, topic: m.topic, body: `${name} read it` };
        if (o.hold) held.push(reply);
        else inbox.push(reply);
        return Response.json({ message_id: id, from: agent, ...m });
      }
      if (url.pathname === '/consume') {
        const tag = url.searchParams.get('tag');
        if (!tag) return new Response('untagged read', { status: 400 });
        const i = inbox.findIndex((m) => m.topic === url.searchParams.get('topic') && m.tag === tag);
        return i < 0 ? new Response(null, { status: 204 }) : Response.json(inbox.splice(i, 1)[0]);
      }
      return new Response('not found', { status: 404 });
    },
  });
  return {
    socket,
    calls,
    sends: () => calls.filter((c) => c.startsWith('POST /send')),
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

/** Collects events; `until` resolves once `pred` holds. */
function collector() {
  const events: AbEvent[] = [];
  let wake = () => {};
  return {
    events,
    emit: (ev: AbEvent) => {
      events.push(ev);
      wake();
    },
    until: async (pred: () => boolean) => {
      while (!pred()) await new Promise<void>((r) => (wake = r));
    },
  };
}

describe('endpoint and error words', () => {
  test('an endpoint is an absolute socket or an http(s) address with nothing secret in it', () => {
    for (const ok of ['/run/agent-bus/user-a.sock', 'http://127.0.0.1:6767', 'https://bus.example/x', 'http://[::1]:6767/']) expect(validEndpoint(ok)).toBe(true);
    for (const bad of ['', 'bus.sock', './bus.sock', 'http://u:p@h:1', 'http://u@h', 'http://h/?t=1', 'http://h/#t', 'ftp://h', 'http://h/\nx', `/${'a'.repeat(1100)}`, 5, null]) {
      expect(validEndpoint(bad)).toBe(false);
    }
  });

  test('a failure becomes bounded words, never the daemon text', () => {
    for (const status of [0, 400, 401, 403, 404, 408, 429, 500, 502]) {
      const words = safeError(new BusError(status, 'secret-tok-123 leaked'));
      expect(words).not.toContain('secret-tok-123');
      expect(words.length).toBeLessThan(80);
    }
    expect(safeError(new Error('secret-tok-123'))).not.toContain('secret');
  });
});

describe('AgentBus pool — one connection per endpoint and credential, one job store', () => {
  test('two endpoints at once: each job answered by its own daemon; credentials never cross', async () => {
    const a = await fakeDaemon('a');
    const b = await fakeDaemon('b');
    const c = collector();
    try {
      const bus = new AgentBus(() => ({ addr: a.socket, token: 'inst-cred' }), c.emit, { me: '#mdhouse@h', answerMs: 2000 });
      const [ja, jb] = await Promise.all([bus.ask(['#claude/x@h'], 'hi'), bus.ask(['#claude/x@h'], 'hi', { addr: b.socket, token: 'space-cred' })]);
      await c.until(() => c.events.filter((e) => e.kind === 'answer').length === 2);
      expect(bus.job(ja)!.at(-1)).toMatchObject({ kind: 'answer', body: 'a read it' });
      expect(bus.job(jb)!.at(-1)).toMatchObject({ kind: 'answer', body: 'b read it' });
      expect(a.calls.some((x) => x.includes('space-cred'))).toBe(false);
      expect(b.calls.some((x) => x.includes('inst-cred'))).toBe(false);
    } finally {
      await a.stop();
      await b.stop();
    }
  });

  test('a new credential for the same daemon while a reply is pending: the new connection takes nothing, the job is answered', async () => {
    const a = await fakeDaemon('a', { hold: true });
    const c = collector();
    try {
      const bus = new AgentBus(() => ({ addr: a.socket, token: 'old-cred' }), c.emit, { me: '#mdhouse@h', answerMs: 3000 });
      const job = await bus.ask(['#claude/x@h'], 'hi');
      await c.until(() => c.events.some((e) => e.kind === 'sent'));
      for (let i = 0; i < 200 && !a.sends().length; i++) await Bun.sleep(5); // `sent` is the hand-over; wait for the daemon
      a.release(); // the reply is in the inbox now
      // rotated: a connection of its own on the same daemon and identity
      expect(await bus.status({ addr: a.socket, token: 'new-cred' })).toEqual({ connected: true });
      await c.until(() => c.events.some((e) => e.kind === 'answer' || e.kind === 'timeout'));
      expect(bus.job(job)!.at(-1)).toMatchObject({ kind: 'answer', body: 'a read it' });
    } finally {
      await a.stop();
    }
  });

  test('a daemon that echoes the credential: status and job events carry safe words only', async () => {
    const a = await fakeDaemon('a', { echo: true });
    const c = collector();
    try {
      const bus = new AgentBus(() => ({ addr: a.socket, token: 'echo-secret-1' }), c.emit, { me: '#mdhouse@h', answerMs: 200 });
      const st = await bus.status();
      expect(st.connected).toBe(false);
      expect(JSON.stringify(st)).not.toContain('echo-secret-1');
    } finally {
      await a.stop();
    }
  });
});

describe('Prefs — a project Agent Bus entry', () => {
  test('credential kept beside the same endpoint, dropped when it changes or clears; all empty removes the entry', async () => {
    const dir = await tmp('mdhouse-ab-prefs-');
    try {
      const f = join(dir, 'prefs.json');
      const p = join(dir, 'p');
      await mkdir(p);
      const prefs = await Prefs.load(f);
      await prefs.addSaved(p);
      await writeFile(f, JSON.stringify({ ...disk(f), agentBusSpaces: { [p]: { endpoint: '/run/b.sock', credential: 'cred-1', default: ['#a@h'] } }, extra: 1 }));
      expect(prefs.spaceAb(p)).toEqual({ endpoint: '/run/b.sock', credential: 'cred-1', default: ['#a@h'] });
      await prefs.commitSpaceAb(p, { endpoint: '/run/b.sock', default: ['#b@h'] }, () => null);
      expect(disk(f)).toMatchObject({ agentBusSpaces: { [p]: { endpoint: '/run/b.sock', credential: 'cred-1', default: ['#b@h'] } }, extra: 1 });
      await prefs.commitSpaceAb(p, { endpoint: 'http://127.0.0.1:1', default: ['#b@h'] }, () => null);
      expect((disk(f).agentBusSpaces as Record<string, unknown>)[p]).toEqual({ endpoint: 'http://127.0.0.1:1', default: ['#b@h'] });
      await prefs.commitSpaceAb(p, { endpoint: null, default: null }, () => null);
      expect(disk(f)).not.toHaveProperty('agentBusSpaces');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('malformed: an entry reads as null, a malformed map refuses any change and stays byte for byte; unsave drops a good entry', async () => {
    const dir = await tmp('mdhouse-ab-prefs2-');
    try {
      const f = join(dir, 'prefs.json');
      const p = join(dir, 'p');
      await mkdir(p);
      const prefs = await Prefs.load(f);
      await prefs.addSaved(p);
      const base = disk(f);
      for (const entry of [{ endpoint: 'http://u:p@h' }, { credential: 'c' }, { endpoint: '/s', token: 'x' }, { default: 'x' }, 'x']) {
        await writeFile(f, JSON.stringify({ ...base, agentBusSpaces: { [p]: entry } }));
        expect(prefs.spaceAb(p)).toBeNull();
      }
      const text = JSON.stringify({ ...base, agentBusSpaces: ['bad'] });
      await writeFile(f, text);
      expect(prefs.spaceAb(p)).toBeNull();
      await expect(prefs.commitSpaceAb(p, { endpoint: '/s', default: null }, () => null)).rejects.toThrow(/malformed/);
      expect(readFileSync(f, 'utf8')).toBe(text);
      await writeFile(f, JSON.stringify({ ...base, agentBusSpaces: { [p]: { endpoint: '/s' }, '/other': { endpoint: '/o' } } }));
      await prefs.removeSaved(p);
      expect(disk(f).agentBusSpaces).toEqual({ '/other': { endpoint: '/o' } });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

type Cfg = {
  enabled: boolean;
  instance: { endpoint: string; hasCredential: boolean; default: string[]; filter: string[] };
  roots: Record<string, { endpoint?: string; hasCredential: boolean; default?: string[]; rev: string; error?: string }>;
};

/** A server with AB on (instance daemon `inst`), a saved project `keep`, an unsaved `ses`, and a reference root. */
async function start(port: number, o: { echo?: boolean; hold?: boolean } = {}) {
  const dir = await tmp('mdhouse-ab-srv-');
  const inst = await fakeDaemon('inst', { hold: o.hold });
  const space = await fakeDaemon('space', { echo: o.echo, hold: o.hold });
  const keep = join(dir, 'keep');
  const ses = join(dir, 'ses');
  for (const d of [keep, ses, join(dir, 'ref')]) await mkdir(d);
  await writeFile(join(keep, 'a.md'), '# keep\n');
  await writeFile(join(ses, 'b.md'), '# ses\n');
  const prefsPath = join(dir, 'prefs.json');
  const prefs = await Prefs.load(prefsPath);
  await prefs.addSaved(keep);
  // control off: these tests count the routes' own daemon traffic; serving is ab-control-serve.test.ts
  await prefs.setAgentBus({ enabled: true, socket: inst.socket, token: 'inst-cred', default: ['#claude/inst@h'], control: 'off' });
  const registry = await Registry.create([keep, ses]);
  await registry.addReference(join(dir, 'ref'), '_ref');
  const s = await serve({ registry, prefs, port, hostname: '127.0.0.1', noGit: true });
  const origin = `http://127.0.0.1:${port}`;
  const idOf = (path: string) => registry.list().find((r) => r.path === path)!.id;
  const config = async () => (await (await fetch(`${origin}/api/ab/config`)).json()) as Cfg;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body) });
  const setAb = async (path: string, endpoint: string, def: string[], cookie: string, rev?: string) =>
    post('/api/roots/ab', { id: idOf(path), endpoint, default: def, rev: rev ?? (await config()).roots[idOf(path)]!.rev }, { cookie });
  const send = (path: string, file: string, targets = ['#claude/x@h']) => post('/api/ab/send', { p: `${idOf(path)}/${file}`, targets, action: 'review' });
  /** Writes a credential for `path`'s endpoint into prefs, as an operator would — the only way one gets there. */
  const provision = async (path: string, credential: string) => {
    const data = disk(prefsPath);
    const spaces = (data.agentBusSpaces ?? {}) as Record<string, Record<string, unknown>>;
    spaces[path] = { ...spaces[path], credential };
    await writeFile(prefsPath, JSON.stringify({ ...data, agentBusSpaces: spaces }, null, 2));
    prefs.refresh();
  };
  const stop = async () => {
    s.server.stop(true);
    s.watcher.close();
    s.control?.stop();
    await inst.stop();
    await space.stop();
    await rm(dir, { recursive: true, force: true });
  };
  return { ...s, dir, inst, space, keep, ses, prefs, prefsPath, registry, origin, idOf, config, post, setAb, send, provision, stop };
}

const busCalls = (t: { inst: { calls: string[] }; space: { calls: string[] } }) => t.inst.calls.length + t.space.calls.length;

describe('GET /api/ab/config and POST /api/roots/ab', () => {
  test('config: every project root, nothing secret, no connection; a save neither', async () => {
    const t = await start(testPort(61700));
    try {
      const cookie = await adminLogin(testPort(61700));
      const cfg = await t.config();
      expect(cfg.enabled).toBe(true);
      expect(cfg.instance).toEqual({ endpoint: t.inst.socket, hasCredential: true, default: ['#claude/inst@h'], filter: expect.any(Array) });
      expect(Object.keys(cfg.roots).sort()).toEqual([t.idOf(t.keep), t.idOf(t.ses)].sort());
      for (const r of Object.values(cfg.roots)) expect(r).toEqual({ hasCredential: false, rev: expect.stringMatching(/^[0-9a-f]{64}$/) });
      expect((await t.setAb(t.keep, t.space.socket, ['#claude/space@h'], cookie)).status).toBe(200);
      await t.provision(t.keep, 'space-secret-9');
      const after = await t.config();
      expect(after.roots[t.idOf(t.keep)]).toMatchObject({ endpoint: t.space.socket, hasCredential: true, default: ['#claude/space@h'] });
      expect(JSON.stringify(after)).not.toContain('space-secret-9');
      expect(JSON.stringify(after)).not.toContain('inst-cred');
      expect(busCalls(t)).toBe(0);
    } finally {
      await t.stop();
    }
  });

  test('refusals change nothing: 400 shape/token field/bad endpoint/default, 401, forged, cross-origin 403, reference 403, 404, stale 409', async () => {
    const t = await start(testPort(61701));
    try {
      const cookie = await adminLogin(testPort(61701));
      const id = t.idOf(t.keep);
      const rev = (await t.config()).roots[id]!.rev;
      const before = [readFileSync(t.prefsPath, 'utf8'), JSON.stringify(await t.config())];
      for (const bad of [
        null,
        { id, endpoint: '/s', default: [] },
        { id, endpoint: '/s', rev },
        { id, endpoint: '/s', default: [], rev, token: 'x' },
        { id, endpoint: '/s', default: [], rev, credential: 'x' },
        { id, endpoint: 'http://u:p@h', default: [], rev },
        { id, endpoint: 'http://h/?token=x', default: [], rev },
        { id, endpoint: 'rel.sock', default: [], rev },
        { id, endpoint: '/s', default: ['Bad Name'], rev },
        { id, endpoint: '/s', default: '#a@h', rev },
        { id, endpoint: null, default: [], rev },
        { id, endpoint: '/s', default: [], rev: 'x' },
      ]) {
        expect((await t.post('/api/roots/ab', bad, { cookie })).status).toBe(400);
      }
      expect((await t.post('/api/roots/ab', { id, endpoint: '/s', default: [], rev })).status).toBe(401);
      expect((await t.post('/api/roots/ab', { id, endpoint: '/s', default: [], rev }, { cookie: `${cookie.split('=')[0]}=forged` })).status).toBe(401);
      expect((await t.post('/api/roots/ab', { id, endpoint: '/s', default: [], rev }, { cookie, origin: 'http://evil.example' })).status).toBe(403);
      expect((await t.post('/api/roots/ab', { id: '_ref', endpoint: '/s', default: [], rev }, { cookie })).status).toBe(403);
      expect((await t.post('/api/roots/ab', { id: 'nope', endpoint: '/s', default: [], rev }, { cookie })).status).toBe(404);
      const stale = await t.post('/api/roots/ab', { id, endpoint: '/s', default: [], rev: '0'.repeat(64) }, { cookie });
      expect([stale.status, ((await stale.json()) as { reason: string }).reason]).toEqual([409, 'stale']);
      expect([readFileSync(t.prefsPath, 'utf8'), JSON.stringify(await t.config())]).toEqual(before);
    } finally {
      await t.stop();
    }
  });

  test('saved: persisted; same endpoint keeps the provisioned credential, a new endpoint drops it; clearing removes the entry', async () => {
    const t = await start(testPort(61702));
    try {
      const cookie = await adminLogin(testPort(61702));
      expect((await t.setAb(t.keep, t.space.socket, [], cookie)).status).toBe(200);
      await t.provision(t.keep, 'space-secret-1');
      expect((await t.setAb(t.keep, t.space.socket, ['#claude/space@h'], cookie)).status).toBe(200);
      expect((disk(t.prefsPath).agentBusSpaces as Record<string, unknown>)[t.keep]).toEqual({ endpoint: t.space.socket, credential: 'space-secret-1', default: ['#claude/space@h'] });
      expect((await t.setAb(t.keep, '/run/elsewhere.sock', ['#claude/space@h'], cookie)).status).toBe(200);
      expect((disk(t.prefsPath).agentBusSpaces as Record<string, unknown>)[t.keep]).toEqual({ endpoint: '/run/elsewhere.sock', default: ['#claude/space@h'] });
      expect((await t.setAb(t.keep, '', [], cookie)).status).toBe(200);
      expect(disk(t.prefsPath)).not.toHaveProperty('agentBusSpaces');
      expect((await t.config()).roots[t.idOf(t.keep)]).toEqual({ hasCredential: false, rev: expect.any(String) });
    } finally {
      await t.stop();
    }
  });

  test('session: in memory only; save carries it with mode and name in one write; an AB change makes the old saveRev stale', async () => {
    const t = await start(testPort(61703));
    try {
      const cookie = await adminLogin(testPort(61703));
      const id = t.idOf(t.ses);
      const text = readFileSync(t.prefsPath, 'utf8');
      const rootsOf = async () => ((await (await fetch(`${t.origin}/api/roots`)).json()) as { roots: Array<{ id: string; saveRev?: string; mode?: string; accessRev?: string }> }).roots.find((r) => r.id === id)!;
      const before = await rootsOf();
      expect((await t.setAb(t.ses, t.space.socket, ['#claude/space@h'], cookie)).status).toBe(200);
      expect(readFileSync(t.prefsPath, 'utf8')).toBe(text);
      expect((await t.config()).roots[id]).toMatchObject({ endpoint: t.space.socket, default: ['#claude/space@h'], hasCredential: false });
      const after = await rootsOf();
      expect(after.saveRev).not.toBe(before.saveRev);
      expect((await t.post('/api/roots/save', { id, rev: before.saveRev }, { cookie })).status).toBe(409);
      await t.post('/api/roots/name', { id, name: 'Session AB' }, { cookie });
      const named = await rootsOf();
      expect((await t.post('/api/roots/mode', { id, mode: 'ro', rev: named.accessRev }, { cookie })).status).toBe(200);
      expect((await t.post('/api/roots/save', { id, rev: (await rootsOf()).saveRev }, { cookie })).status).toBe(200);
      expect(disk(t.prefsPath)).toMatchObject({
        readonly: [t.ses],
        names: { [t.ses]: 'Session AB' },
        agentBusSpaces: { [t.ses]: { endpoint: t.space.socket, default: ['#claude/space@h'] } },
      });
      expect((await t.config()).roots[id]).toMatchObject({ endpoint: t.space.socket, default: ['#claude/space@h'] });
    } finally {
      await t.stop();
    }
  });

  test('under the lock: another process changes the entry → 409; an administrator signed out → 401; IO failure → 500; nothing changes', async () => {
    const t = await start(testPort(61704));
    try {
      let cookie = await adminLogin(testPort(61704));
      const id = t.idOf(t.keep);
      const rev = (await t.config()).roots[id]!.rev;
      const lock = `${t.prefsPath}.lock`;
      const hold = async () => {
        const fh = await open(lock, 'wx', 0o600);
        await fh.close();
        return () => unlink(lock);
      };
      let release = await hold();
      let pending = t.post('/api/roots/ab', { id, endpoint: t.space.socket, default: [], rev }, { cookie });
      await Bun.sleep(100);
      const changed = JSON.stringify({ ...disk(t.prefsPath), agentBusSpaces: { [t.keep]: { default: ['#claude/other@h'] } } });
      await writeFile(`${t.prefsPath}.x`, changed);
      await rename(`${t.prefsPath}.x`, t.prefsPath);
      await release();
      expect((await pending).status).toBe(409);
      expect(readFileSync(t.prefsPath, 'utf8')).toBe(changed);

      const rev2 = (await t.config()).roots[id]!.rev;
      release = await hold();
      pending = t.post('/api/roots/ab', { id, endpoint: t.space.socket, default: [], rev: rev2 }, { cookie });
      await Bun.sleep(100);
      await askAdminRevoke(testPort(61704));
      await release();
      expect((await pending).status).toBe(401);
      expect(readFileSync(t.prefsPath, 'utf8')).toBe(changed);

      cookie = await adminLogin(testPort(61704));
      chmodSync(t.dir, 0o500);
      let res: Response;
      try {
        res = await t.post('/api/roots/ab', { id, endpoint: t.space.socket, default: [], rev: rev2 }, { cookie });
      } finally {
        chmodSync(t.dir, 0o700);
      }
      expect(res.status).toBe(500);
      expect(readFileSync(t.prefsPath, 'utf8')).toBe(changed);
      expect((await t.config()).roots[id]!.rev).toBe(rev2);
    } finally {
      await t.stop();
    }
  });
});

describe('unsaved: the memory install after the locked check', () => {
  test('a sign-out, or a save by another process, between the check and the install: refused, nothing kept', async () => {
    const t = await start(testPort(61710));
    try {
      let cookie = await adminLogin(testPort(61710));
      const id = t.idOf(t.ses);
      const check = t.prefs.check.bind(t.prefs);
      // the guard has passed under the lock; then, before the route resumes, the world moves
      let after: () => Promise<unknown> = async () => askAdminRevoke(testPort(61710));
      const spy = spyOn(t.prefs, 'check').mockImplementation(async (dir, guard) => {
        const r = await check(dir, guard);
        await after();
        return r;
      });
      const before = (await t.config()).roots[id]!;
      expect((await t.setAb(t.ses, t.space.socket, [], cookie, before.rev)).status).toBe(401);
      expect((await t.config()).roots[id]).toEqual(before);

      cookie = await adminLogin(testPort(61710));
      after = async () => {
        await writeFile(t.prefsPath, JSON.stringify({ ...disk(t.prefsPath), saved: [...(disk(t.prefsPath).saved as string[]), t.ses].sort() }));
      };
      const res = await t.setAb(t.ses, t.space.socket, [], cookie, before.rev);
      expect([res.status, ((await res.json()) as { reason?: string }).reason]).toEqual([409, 'stale']);
      spy.mockRestore();
      expect((await t.config()).roots[id]).toEqual({ hasCredential: false, rev: expect.any(String) });
    } finally {
      await t.stop();
    }
  });
});

describe('lifetime through the CLI', () => {
  test('-p saves a session entry; --rm drops a saved one; the last project, unsaved, keeps it in memory without its credential', async () => {
    const t = await start(testPort(61709));
    try {
      const cookie = await adminLogin(testPort(61709));
      expect((await t.setAb(t.keep, t.space.socket, [], cookie)).status).toBe(200);
      await t.provision(t.keep, 'space-secret-5');
      expect((await t.setAb(t.ses, '/run/ses.sock', ['#claude/ses@h'], cookie)).status).toBe(200);
      expect(await askDaemon(testPort(61709), { dirs: [t.ses], rw: false, save: true })).not.toHaveProperty('error');
      expect((disk(t.prefsPath).agentBusSpaces as Record<string, unknown>)[t.ses]).toEqual({ endpoint: '/run/ses.sock', default: ['#claude/ses@h'] });
      expect(await askRemove(testPort(61709), { dirs: [t.keep] })).not.toHaveProperty('error');
      expect(disk(t.prefsPath).agentBusSpaces).toEqual({ [t.ses]: { endpoint: '/run/ses.sock', default: ['#claude/ses@h'] } });
      await t.provision(t.ses, 'ses-secret-6');
      const removed = (await askRemove(testPort(61709), { dirs: [t.ses] })) as { results: Array<{ kept?: boolean }> };
      expect(removed.results[0]).toMatchObject({ kept: true });
      expect(disk(t.prefsPath)).not.toHaveProperty('agentBusSpaces');
      expect((await t.config()).roots[t.idOf(t.ses)]).toEqual({ endpoint: '/run/ses.sock', hasCredential: false, default: ['#claude/ses@h'], rev: expect.any(String) });
    } finally {
      await t.stop();
    }
  });
});

describe('routing: the document root picks the bus', () => {
  afterEach(() => {});

  test('instance vs project endpoint at once; the project credential goes only to its daemon; status says where', async () => {
    const t = await start(testPort(61705));
    try {
      const cookie = await adminLogin(testPort(61705));
      expect((await t.setAb(t.ses, t.space.socket, ['#claude/space@h'], cookie)).status).toBe(200);
      const [ra, rb] = await Promise.all([t.send(t.keep, 'a.md'), t.send(t.ses, 'b.md')]);
      expect([ra.status, rb.status]).toEqual([200, 200]);
      // jobs run after the reply: wait for their sends
      for (let i = 0; i < 200 && (!t.inst.sends().length || !t.space.sends().length); i++) await Bun.sleep(5);
      expect(t.inst.sends()).toHaveLength(1);
      expect(t.space.sends()).toHaveLength(1);
      expect(t.space.calls.some((c) => c.includes('inst-cred'))).toBe(false);

      const st = (await (await fetch(`${t.origin}/api/ab?root=${t.idOf(t.ses)}`)).json()) as Record<string, unknown>;
      expect(st).toMatchObject({ enabled: true, connected: true, endpoint: t.space.socket, source: 'space', default: ['#claude/inst@h'], spaceDefault: ['#claude/space@h'] });
      const inst = (await (await fetch(`${t.origin}/api/ab?root=${t.idOf(t.keep)}`)).json()) as Record<string, unknown>;
      expect(inst).toMatchObject({ endpoint: t.inst.socket, source: 'instance', default: ['#claude/inst@h'] });
      expect(inst).not.toHaveProperty('spaceDefault');
      expect((await fetch(`${t.origin}/api/ab?root=nope`)).status).toBe(404);
    } finally {
      await t.stop();
    }
  });

  test('a project endpoint that fails, or a malformed entry: 503 in safe words, never the instance in its place', async () => {
    const t = await start(testPort(61706));
    try {
      const cookie = await adminLogin(testPort(61706));
      expect((await t.setAb(t.keep, '/nonexistent/bus.sock', [], cookie)).status).toBe(200);
      const res = await t.send(t.keep, 'a.md');
      expect(res.status).toBe(503);
      expect(((await res.json()) as { error: string }).error).toBe('the agent bus is unreachable');
      const st = (await (await fetch(`${t.origin}/api/ab?root=${t.idOf(t.keep)}`)).json()) as Record<string, unknown>;
      expect(st).toMatchObject({ connected: false, error: 'the agent bus is unreachable', endpoint: '/nonexistent/bus.sock', source: 'space', agents: [] });
      await writeFile(t.prefsPath, JSON.stringify({ ...disk(t.prefsPath), agentBusSpaces: { [t.keep]: { endpoint: 'http://u:p@h' } } }));
      t.prefs.refresh();
      const bad = await t.send(t.keep, 'a.md');
      expect(bad.status).toBe(503);
      expect(JSON.stringify(await bad.json())).not.toContain('u:p');
      expect((await t.config()).roots[t.idOf(t.keep)]!.error).toBeString();
      expect(t.inst.calls).toEqual([]);
    } finally {
      await t.stop();
    }
  });

  test('an echoing daemon: its credential reaches no response, WebSocket event or log', async () => {
    const t = await start(testPort(61707), { echo: true });
    const logs: string[] = [];
    const spies = (['error', 'log', 'warn'] as const).map((k) => spyOn(console, k).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(' '))));
    try {
      const cookie = await adminLogin(testPort(61707));
      expect((await t.setAb(t.keep, t.space.socket, [], cookie)).status).toBe(200);
      await t.provision(t.keep, 'echo-secret-77');
      const ws = new WebSocket(`ws://127.0.0.1:${testPort(61707)}/ws`);
      const frames: string[] = [];
      ws.onmessage = (e) => frames.push(String(e.data));
      await new Promise((r) => (ws.onopen = r));
      const res = await t.send(t.keep, 'a.md');
      const st = await (await fetch(`${t.origin}/api/ab?root=${t.idOf(t.keep)}`)).text();
      await Bun.sleep(100);
      ws.close();
      const seen = [await res.text(), st, ...frames, ...logs].join('\n');
      expect(t.space.calls.some((c) => c.includes('echo-secret-77'))).toBe(true); // it was used
      expect(seen).not.toContain('echo-secret-77');
    } finally {
      for (const s of spies) s.mockRestore();
      await t.stop();
    }
  });

  test('a job outlives its project endpoint changing: /api/ab/job still has it, and its answer arrives', async () => {
    const t = await start(testPort(61708), { hold: true });
    try {
      const cookie = await adminLogin(testPort(61708));
      expect((await t.setAb(t.ses, t.space.socket, [], cookie)).status).toBe(200);
      const { job } = (await (await t.send(t.ses, 'b.md')).json()) as { job: string };
      expect((await t.setAb(t.ses, '', [], cookie)).status).toBe(200); // back to the instance bus
      expect(t.space.calls.filter((c) => c.startsWith('POST /register'))).toHaveLength(1); // the save connected nowhere
      t.space.release();
      let events: AbEvent[] = [];
      for (let i = 0; i < 100 && !events.some((e) => e.kind === 'answer'); i++) {
        await Bun.sleep(50);
        events = ((await (await fetch(`${t.origin}/api/ab/job?id=${job}`)).json()) as { events: AbEvent[] }).events;
      }
      expect(events.at(-1)).toMatchObject({ kind: 'answer', body: 'space read it' });
    } finally {
      await t.stop();
    }
  });
});
