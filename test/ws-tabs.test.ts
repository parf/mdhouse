import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserOf, Tabs, type TabSink } from '../src/lib/ws-tabs';

const KEY = Buffer.alloc(32, 7);
const sink = (): TabSink & { got: string[] } => {
  const got: string[] = [];
  return { got, send: (d: string) => got.push(d) };
};
const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

describe('Tabs — ids', () => {
  test('a fresh socket gets a new opaque id and its proof', () => {
    const tabs = new Tabs(KEY);
    const a = tabs.open(sink(), null, CHROME);
    const b = tabs.open(sink(), null, CHROME);
    expect(a.clientId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a.clientId).not.toBe(b.clientId);
    expect(a.resume).not.toBe(b.resume);
  });

  test('a reconnect with a valid proof keeps its id once the old socket closed', () => {
    const tabs = new Tabs(KEY);
    const s1 = sink();
    const a = tabs.open(s1, null, CHROME);
    tabs.close(a.clientId, s1);
    expect(tabs.open(sink(), `${a.clientId}.${a.resume}`, CHROME)).toEqual(a);
  });

  test('a forged, foreign-key or malformed proof gets a fresh id', () => {
    const tabs = new Tabs(KEY);
    const s1 = sink();
    const a = tabs.open(s1, null, CHROME);
    tabs.close(a.clientId, s1);
    const other = new Tabs(Buffer.alloc(32, 9)).open(sink(), null, CHROME);
    for (const asked of [`${a.clientId}.x`, `${a.clientId}.${other.resume}`, `${other.clientId}.${other.resume}`, a.clientId, '', 'a.b.c', `../x.${a.resume}`])
      expect(tabs.open(sink(), asked, CHROME).clientId).not.toBe(a.clientId);
  });

  test('an id a live socket holds is not given to a second one (a duplicated tab)', () => {
    const tabs = new Tabs(KEY);
    const a = tabs.open(sink(), null, CHROME);
    expect(tabs.open(sink(), `${a.clientId}.${a.resume}`, CHROME).clientId).not.toBe(a.clientId);
  });

  test('closing an older socket leaves the newer one holding the id', () => {
    const tabs = new Tabs(KEY);
    const s1 = sink();
    const a = tabs.open(s1, null, CHROME);
    tabs.close(a.clientId, s1);
    const s2 = sink();
    tabs.open(s2, `${a.clientId}.${a.resume}`, CHROME);
    tabs.close(a.clientId, s1);
    expect(tabs.navigate(a.clientId, '/r/a.md')).toBe(true);
    expect(s2.got).toEqual([JSON.stringify({ t: 'open', url: '/r/a.md' })]);
  });
});

describe('Tabs — presence and navigation', () => {
  test('`at` sets page, title and busy; the label is the browser and the title', () => {
    let now = 10;
    const tabs = new Tabs(KEY, () => now);
    const a = tabs.open(sink(), null, CHROME);
    now = 20;
    expect(tabs.message(a.clientId, JSON.stringify({ t: 'at', page: '/r/a.md', title: 'a — mdhouse', busy: true }))).toBe(true);
    expect(tabs.list()).toEqual([{ clientId: a.clientId, label: 'Chrome · a — mdhouse', page: '/r/a.md', busy: true, since: 10, lastSeen: 20 }]);
  });

  test('bad frames change nothing', () => {
    const tabs = new Tabs(KEY);
    const a = tabs.open(sink(), null, CHROME);
    for (const raw of ['nope', '{"t":"x"}', '{"t":"at","page":"relative"}', `{"t":"at","page":"/${'x'.repeat(2000)}"}`, 'null', JSON.stringify({ t: 'at', page: '/a', title: 'x'.repeat(5000) })])
      expect(tabs.message(a.clientId, raw)).toBe(false);
    expect(tabs.message('unknown', JSON.stringify({ t: 'at', page: '/a' }))).toBe(false);
    expect(tabs.list()[0]).toMatchObject({ label: 'Chrome', busy: false });
    expect(tabs.list()[0]!.page).toBeUndefined();
  });

  test('a long title is cut', () => {
    const tabs = new Tabs(KEY);
    const a = tabs.open(sink(), null, CHROME);
    tabs.message(a.clientId, JSON.stringify({ t: 'at', page: '/a', title: 't'.repeat(300) }));
    expect(tabs.list()[0]!.label.length).toBe('Chrome · '.length + 200);
  });

  test('navigate reaches only that tab; a closed or unknown one is false', () => {
    const tabs = new Tabs(KEY);
    const s1 = sink();
    const s2 = sink();
    const a = tabs.open(s1, null, CHROME);
    tabs.open(s2, null, CHROME);
    expect(tabs.navigate(a.clientId, '/r/a.md')).toBe(true);
    expect(s1.got.length).toBe(1);
    expect(s2.got).toEqual([]);
    tabs.close(a.clientId, s1);
    expect(tabs.navigate(a.clientId, '/r/a.md')).toBe(false);
    expect(tabs.navigate('nope', '/r/a.md')).toBe(false);
  });

  test('browser families', () => {
    expect(browserOf(CHROME)).toBe('Chrome');
    expect(browserOf('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0')).toBe('Firefox');
    expect(browserOf('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')).toBe('Safari');
    expect(browserOf(`${CHROME} Edg/140.0`)).toBe('Edge');
    expect(browserOf('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0 Safari/537.36')).toBe('Chrome');
    expect(browserOf('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1')).toBe('Chrome');
    expect(browserOf('')).toBe('Browser');
  });
});

describe('/ws and control, through serve()', () => {
  test('hello names the tab; resume keeps it; open moves only the named tab', async () => {
    const { Registry } = await import('../src/lib/roots');
    const { Prefs } = await import('../src/lib/prefs');
    const { serve } = await import('../src/server');
    const dir = await mkdtemp(join(tmpdir(), 'mdhouse-ctl-'));
    await writeFile(join(dir, 'a.md'), '# a\n');
    const prefs = await Prefs.load(join(dir, 'prefs.json'));
    const port = 61960;
    const registry = await Registry.create([dir]);
    const id = registry.list()[0]!.id;
    const { server, watcher, control, abControl, stopAbControl } = await serve({ registry, prefs, port, hostname: '127.0.0.1', noGit: true });
    const origin = `http://127.0.0.1:${port}`;
    const sockets: WebSocket[] = [];
    const connect = async (asked = '') => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws${asked ? `?client=${encodeURIComponent(asked)}` : ''}`, { headers: { origin } } as unknown as string[]);
      sockets.push(ws);
      const got: Array<Record<string, unknown>> = [];
      ws.onmessage = (ev) => got.push(JSON.parse(String(ev.data)));
      for (let i = 0; i < 100 && !got.length; i++) await Bun.sleep(10);
      return { ws, got, hello: got[0] as { t: string; clientId: string; resume: string } };
    };
    const ask = async (body: unknown) => JSON.parse(await abControl.handle('#claude/x@host', JSON.stringify(body)));
    try {
      const a = await connect();
      const b = await connect();
      expect(a.hello).toMatchObject({ t: 'hello', roots: [id] });
      expect(a.hello.clientId).not.toBe(b.hello.clientId);

      a.ws.send(JSON.stringify({ t: 'at', page: `/${id}/a.md`, title: 'a', busy: false }));
      await Bun.sleep(30);
      const inv = await ask({ v: 1, op: 'inventory', requestId: 'i' });
      expect(inv.roots).toEqual([{ rootId: id, label: registry.list()[0]!.name, kind: 'project', writable: false }]);
      expect(inv.clients.find((c: { clientId: string }) => c.clientId === a.hello.clientId)).toMatchObject({ page: `/${id}/a.md`, label: 'Browser · a' });

      const r = await ask({ v: 1, op: 'open', requestId: 'o1', rootId: id, path: 'a.md', clientId: b.hello.clientId });
      expect(r).toEqual({ v: 1, requestId: 'o1', ok: true, url: `/${id}/a.md`, opened: true });
      await Bun.sleep(30);
      expect(b.got.at(-1)).toEqual({ t: 'open', url: `/${id}/a.md` });
      expect(a.got.some((m) => m.t === 'open')).toBe(false);

      // a reconnect with its proof keeps the id, so the next open reaches the new socket
      b.ws.close();
      await Bun.sleep(30);
      expect((await ask({ v: 1, op: 'open', requestId: 'o2', rootId: id, path: 'a.md', clientId: b.hello.clientId })).opened).toBe(false);
      const b2 = await connect(`${b.hello.clientId}.${b.hello.resume}`);
      expect(b2.hello.clientId).toBe(b.hello.clientId);
      expect((await ask({ v: 1, op: 'open', requestId: 'o3', rootId: id, path: 'a.md', clientId: b.hello.clientId })).opened).toBe(true);

      // a busy tab is not moved; with users configured none is
      a.ws.send(JSON.stringify({ t: 'at', page: `/${id}/a.md`, busy: true }));
      await Bun.sleep(30);
      expect(await ask({ v: 1, op: 'open', requestId: 'o4', rootId: id, path: 'a.md', clientId: a.hello.clientId })).toMatchObject({ opened: false, reason: 'busy' });
      await prefs.setUser('ann', 'x');
      expect(await ask({ v: 1, op: 'open', requestId: 'o5', rootId: id, path: 'a.md', clientId: b.hello.clientId })).toMatchObject({ opened: false, reason: 'team' });
      await prefs.removeUser('ann');

      // the stored rule applies to the next request
      await prefs.setAgentBus({ control: 'off' });
      expect((await ask({ v: 1, op: 'inventory', requestId: 'i2' })).error.code).toBe('denied');
    } finally {
      for (const ws of sockets) ws.close();
      await stopAbControl();
      server.stop(true);
      watcher.close();
      control?.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
