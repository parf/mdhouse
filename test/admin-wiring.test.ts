import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, renameSync, symlinkSync, unlinkSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashPassword } from '../src/lib/access';
import { askAdminList, askAdminMint, askAdminRevoke, askPing, controlDir, controlInsecurity, controlPath } from '../src/lib/control';
import { CONFIG_DIR, Prefs } from '../src/lib/prefs';
import { Registry } from '../src/lib/roots';
import { localAdminOrigin, localExchange, serve } from '../src/server';
import { adminLogin } from './admin-login';
import { testPort } from './ports';

const CLI = join(import.meta.dir, '../src/cli.ts');

describe('localAdminOrigin — where a local administrator exchange can come from', () => {
  test('loopback and any-address binds have one; a network address or a name does not', () => {
    expect(localAdminOrigin('127.0.0.1', 7777)).toBe('http://127.0.0.1:7777');
    expect(localAdminOrigin('localhost', 7777)).toBe('http://localhost:7777');
    expect(localAdminOrigin('0.0.0.0', 7777)).toBe('http://127.0.0.1:7777');
    expect(localAdminOrigin('::', 7777)).toBe('http://[::1]:7777');
    expect(localAdminOrigin('::1', 7777)).toBe('http://[::1]:7777');
    for (const bound of ['192.168.1.5', '10.0.0.1', 'box', 'evil.example', '::ffff:10.0.0.1']) expect(localAdminOrigin(bound, 7777)).toBeNull();
  });
});

describe('localExchange — actual loopback peer, exact local Host and Origin', () => {
  const req = (headers: Record<string, string>) => new Request('http://127.0.0.1:7777/api/admin/session', { method: 'POST', headers });
  const ok = { host: '127.0.0.1:7777', origin: 'http://127.0.0.1:7777', 'sec-fetch-site': 'same-origin' };

  test('a page on this machine at a local origin passes, under every loopback name', () => {
    expect(localExchange(req(ok), '127.0.0.1', '127.0.0.1', 7777)).toBe(true);
    expect(localExchange(req({ host: 'localhost:7777', origin: 'http://localhost:7777' }), '::1', '127.0.0.1', 7777)).toBe(true);
    expect(localExchange(req({ host: '[::1]:7777', origin: 'http://[::1]:7777' }), '::ffff:127.0.0.1', '0.0.0.0', 7777)).toBe(true);
  });

  test('a network peer is refused, whatever forwarding headers claim', () => {
    expect(localExchange(req(ok), '192.168.1.9', '0.0.0.0', 7777)).toBe(false);
    expect(localExchange(req({ ...ok, 'x-forwarded-for': '127.0.0.1', 'x-real-ip': '127.0.0.1', forwarded: 'for=127.0.0.1' }), '10.0.0.2', '0.0.0.0', 7777)).toBe(false);
    expect(localExchange(req(ok), undefined, '127.0.0.1', 7777)).toBe(false);
  });

  test('missing, foreign or mismatched Origin, a rebound or proxy Host, another port, a cross-site fetch', () => {
    const bad: Array<Record<string, string>> = [
      { host: '127.0.0.1:7777' },
      { host: '127.0.0.1:7777', origin: 'null' },
      { host: '127.0.0.1:7777', origin: 'http://evil.example' },
      { host: '127.0.0.1:7777', origin: 'http://localhost:7777' },
      { host: 'evil.example:7777', origin: 'http://evil.example:7777' },
      { host: 'localhost.:7777', origin: 'http://localhost.:7777' },
      { host: '127.0.0.1', origin: 'http://127.0.0.1' },
      { host: '127.0.0.1:7778', origin: 'http://127.0.0.1:7778' },
      { host: '127.0.0.1:7777', origin: 'https://127.0.0.1:7777' },
      { ...ok, 'sec-fetch-site': 'cross-site' },
      { ...ok, 'sec-fetch-site': 'same-site' },
      { ...ok, 'sec-fetch-site': 'none' },
    ];
    for (const h of bad) expect(localExchange(req(h), '127.0.0.1', '127.0.0.1', 7777)).toBe(false);
  });

  test('a daemon bound to a network address or name has no local exchange', () => {
    expect(localExchange(req(ok), '127.0.0.1', '192.168.1.5', 7777)).toBe(false);
    expect(localExchange(req(ok), '127.0.0.1', 'box', 7777)).toBe(false);
  });
});

/** An in-process server on `port` with its control socket, Basic users optional. */
async function start(port: number, users: Record<string, string> = {}, localAdmin = false, hostNames: string[] = []) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-admin-')));
  await writeFile(join(base, 'a.md'), '# a\n');
  await writeFile(join(base, 'prefs.json'), JSON.stringify({ access: { allow: [], users, hostNames } }));
  const prefs = await Prefs.load(join(base, 'prefs.json'));
  const registry = await Registry.create([base, join(import.meta.dir, '../agents')]);
  const s = await serve({ registry, prefs, port, hostname: '127.0.0.1', noGit: true, localAdmin });
  const origin = `http://127.0.0.1:${port}`;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body) });
  const stop = async () => {
    s.server.stop(true);
    s.watcher.close();
    s.control?.stop();
    await rm(base, { recursive: true, force: true });
  };
  return { ...s, base, prefs, registry, origin, post, stop };
}

const ADMIN = { error: 'administrator session required', reason: 'admin' };

describe('local administrator (Personal, loopback peer)', () => {
  test('no users: a loopback request is the administrator, without a session', async () => {
    const t = await start(testPort(61775), {}, true);
    try {
      expect(await (await fetch(`${t.origin}/api/admin`)).json()).toEqual({ admin: true, local: true });
      expect((await t.post('/api/settings', { editLink: false, autoRw: false })).status).toBe(200);
      // same-origin still comes first
      expect((await t.post('/api/settings', { editLink: true, autoRw: false }, { origin: 'http://evil.example' })).status).toBe(403);
    } finally {
      await t.stop();
    }
  });

  test('no users: a loopback peer behind a host name and X-Forwarded-For is still the administrator', async () => {
    const t = await start(testPort(61777), {}, true, ['notes.example']);
    try {
      const proxied = { host: 'notes.example', 'x-forwarded-for': '203.0.113.7' };
      expect(await (await fetch(`${t.origin}/api/admin`, { headers: proxied })).json()).toEqual({ admin: true, local: true });
      const res = await t.post('/api/settings', { editLink: false, autoRw: false }, { ...proxied, origin: 'http://notes.example' });
      expect(res.status).toBe(200);
    } finally {
      await t.stop();
    }
  });

  test('configured users: loopback alone is not the administrator', async () => {
    const hash = await Bun.password.hash('pw');
    const t = await start(testPort(61776), { alice: hash }, true);
    try {
      const auth = { authorization: `Basic ${btoa('alice:pw')}` };
      expect(await (await fetch(`${t.origin}/api/admin`, { headers: auth })).json()).toEqual({ admin: false });
      const res = await t.post('/api/settings', { editLink: false, autoRw: false }, auth);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual(ADMIN);
    } finally {
      await t.stop();
    }
  });
});

describe('administrator session over HTTP', () => {
  test('protected writes without a real session are 401 reason:admin and change nothing', async () => {
    const t = await start(testPort(61760));
    try {
      expect(await (await fetch(`${t.origin}/api/admin`)).json()).toEqual({ admin: false });
      const before = await readFile(join(t.base, 'prefs.json'), 'utf8');
      const ids = t.registry.list().map((r) => r.id);
      const spoofed = `mdhouse-admin-${testPort(61760)}=${'A'.repeat(43)}`;
      const author = `mdhouse-author-${testPort(61760)}=alice`;
      for (const cookie of ['', spoofed, author, `${spoofed}; ${author}`]) {
        for (const [path, body] of [
          ['/api/settings', { editLink: false, autoRw: false }],
          ['/api/ab/default', { names: ['#x/y@h'] }],
          ['/api/ab/filter', { lines: ['^x'] }],
          ['/api/roots/remove', { id: ids[0] }],
        ] as const) {
          const res = await t.post(path, body, { cookie });
          expect(res.status).toBe(401);
          expect(res.headers.get('cache-control')).toBe('no-store');
          expect(await res.json()).toEqual(ADMIN);
        }
      }
      // a cross-site write is still the same-origin 403, before authority is looked at
      expect((await t.post('/api/settings', { editLink: false }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
      expect(await readFile(join(t.base, 'prefs.json'), 'utf8')).toBe(before);
      expect(t.registry.list().map((r) => r.id)).toEqual(ids);
    } finally {
      await t.stop();
    }
  });

  test('exchange: 204 + HttpOnly SameSite=Strict cookie, no-store; replay and garbage are the same 403', async () => {
    const t = await start(testPort(61761));
    try {
      const minted = await askAdminMint(testPort(61761));
      if (!minted || 'error' in minted) throw new Error('mint failed');
      expect(minted.url).toBe(t.origin);
      const ok = await t.post('/api/admin/session', { proof: minted.proof }, { 'sec-fetch-site': 'same-origin' });
      expect(ok.status).toBe(204);
      expect(ok.headers.get('cache-control')).toBe('no-store');
      expect(ok.headers.get('referrer-policy')).toBe('no-referrer');
      const set = ok.headers.get('set-cookie')!;
      expect(set).toMatch(new RegExp(`^mdhouse-admin-${testPort(61761)}=[A-Za-z0-9_-]{43}; Path=/; HttpOnly; SameSite=Strict; Max-Age=\\d+$`));
      expect(set.includes(minted.proof)).toBe(false); // booleans only: a failure must not print a secret
      const cookie = set.slice(0, set.indexOf(';'));

      const state = await fetch(`${t.origin}/api/admin`, { headers: { cookie } });
      expect(state.headers.get('cache-control')).toBe('no-store');
      const body = (await state.json()) as { admin: boolean; expiresAt: number };
      expect(body.admin).toBe(true);
      expect(Object.keys(body).sort()).toEqual(['admin', 'expiresAt']);

      const replay = await t.post('/api/admin/session', { proof: minted.proof });
      expect(replay.status).toBe(403);
      const generic = await replay.json();
      for (const proof of [undefined, '', 'x', 'A'.repeat(43), cookie.split('=')[1]]) {
        const res = await t.post('/api/admin/session', { proof });
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual(generic);
      }
      expect((await t.post('/api/admin/session', 'not json')).status).toBe(403);

      // the session works on a protected write
      expect((await t.post('/api/settings', { editLink: false }, { cookie })).status).toBe(200);
      expect(t.prefs.settings.editLink).toBe(false);
    } finally {
      await t.stop();
    }
  });

  test('a refused exchange leaves the proof unused; a rebound Host never reaches the handler', async () => {
    const t = await start(testPort(61762));
    try {
      const minted = await askAdminMint(testPort(61762));
      if (!minted || 'error' in minted) throw new Error('mint failed');
      const proof = { proof: minted.proof };
      const send = (headers: Record<string, string>) =>
        fetch(`${t.origin}/api/admin/session`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(proof) });
      expect((await send({})).status).toBe(403); // no Origin
      expect((await send({ origin: 'http://evil.example' })).status).toBe(403);
      expect((await send({ origin: t.origin, 'sec-fetch-site': 'cross-site' })).status).toBe(403);
      expect((await send({ origin: t.origin, 'x-forwarded-for': '203.0.113.9' })).status).toBe(204); // XFF is not read either way
      expect((await send({ origin: t.origin })).status).toBe(403); // now spent

      const again = await askAdminMint(testPort(61762));
      if (!again || 'error' in again) throw new Error('mint failed');
      const rebound = await fetch(`${t.origin}/api/admin/session`, {
        method: 'POST',
        headers: { host: `evil.example:${testPort(61762)}`, origin: `http://evil.example:${testPort(61762)}`, 'content-type': 'application/json' },
        body: JSON.stringify({ proof: again.proof }),
      });
      expect(rebound.status).toBe(421);
      expect((await t.post('/api/admin/session', { proof: again.proof })).status).toBe(204);
    } finally {
      await t.stop();
    }
  });

  test('logout and control revoke end sessions; list shows no secrets', async () => {
    const t = await start(testPort(61763));
    try {
      const one = await adminLogin(testPort(61763));
      const two = await adminLogin(testPort(61763));
      const listed = await askAdminList(testPort(61763));
      if (!listed || 'error' in listed) throw new Error('list failed');
      expect(listed.sessions).toHaveLength(2);
      for (const s of listed.sessions) expect(Object.keys(s).sort()).toEqual(['createdAt', 'expiresAt', 'id', 'lastSeenAt']);
      expect(JSON.stringify(listed).includes(one.split('=')[1]!)).toBe(false);

      const out = await t.post('/api/admin/logout', {}, { cookie: one });
      expect(out.status).toBe(204);
      expect(out.headers.get('set-cookie')).toBe(`mdhouse-admin-${testPort(61763)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
      expect(await (await fetch(`${t.origin}/api/admin`, { headers: { cookie: one } })).json()).toEqual({ admin: false });
      expect((await t.post('/api/settings', { editLink: false }, { cookie: one })).status).toBe(401);
      expect((await t.post('/api/admin/logout', {}, { cookie: two, 'sec-fetch-site': 'cross-site' })).status).toBe(403);
      expect((await t.post('/api/settings', { editLink: false }, { cookie: two })).status).toBe(200);

      const unused = await askAdminMint(testPort(61763));
      if (!unused || 'error' in unused) throw new Error('mint failed');
      expect(await askAdminRevoke(testPort(61763))).toEqual({ revoked: 1 });
      expect((await t.post('/api/settings', { editLink: true }, { cookie: two })).status).toBe(401);
      expect((await t.post('/api/admin/session', { proof: unused.proof })).status).toBe(403);
      expect(t.prefs.settings.editLink).toBe(false);
    } finally {
      await t.stop();
    }
  });

  test('Basic admission admits but is not administration; the exchange still needs it', async () => {
    const t = await start(testPort(61764), { u: await hashPassword('pw') });
    try {
      const basic = `Basic ${btoa('u:pw')}`;
      expect((await fetch(`${t.origin}/api/admin`)).status).toBe(401); // not admitted
      expect(await (await fetch(`${t.origin}/api/admin`, { headers: { authorization: basic } })).json()).toEqual({ admin: false });
      expect(await (await t.post('/api/settings', { editLink: false }, { authorization: basic })).json()).toEqual(ADMIN);

      const minted = await askAdminMint(testPort(61764));
      if (!minted || 'error' in minted) throw new Error('mint failed');
      expect((await t.post('/api/admin/session', { proof: minted.proof })).status).toBe(401); // admission first, proof untouched
      const ok = await t.post('/api/admin/session', { proof: minted.proof }, { authorization: basic });
      expect(ok.status).toBe(204);
      const cookie = ok.headers.get('set-cookie')!.split(';')[0]!;
      expect((await t.post('/api/settings', { editLink: false }, { cookie })).status).toBe(401); // admission still applies
      expect((await t.post('/api/settings', { editLink: false }, { cookie, authorization: basic })).status).toBe(200);
    } finally {
      await t.stop();
    }
  });

  test('no mint while --host-name names a proxy: localhost is refused there', async () => {
    const t = await start(testPort(61765));
    try {
      await t.prefs.setHostNames(['proxy.example']);
      const minted = await askAdminMint(testPort(61765));
      expect(minted && 'error' in minted && minted.error).toContain('--host-name');
    } finally {
      await t.stop();
    }
  });
});

describe('admin control transport must be private to the OS owner', () => {
  const raw = (port: number, path: string) =>
    fetch(`http://localhost${path}`, { unix: controlPath(port), method: 'POST', body: '{}' }).then(async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> }));

  test('a group/other-accessible socket folder or socket, or a symlinked folder, refuses admin ops; a caller stops looking there', async () => {
    const t = await start(testPort(61766));
    // Fixed now: an unprivate folder makes controlDir() fall back to the config dir.
    const dir = controlDir();
    const sock = controlPath(testPort(61766));
    const raw = (_port: number, path: string) =>
      fetch(`http://localhost${path}`, { unix: sock, method: 'POST', body: '{}' }).then(async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> }));
    try {
      expect(controlInsecurity(testPort(61766))).toBeNull();
      expect((await raw(testPort(61766), '/admin/mint')).status).toBe(200);

      chmodSync(dir, 0o755);
      try {
        expect(controlDir()).toBe(CONFIG_DIR);
        expect(await askAdminMint(testPort(61766))).toBeNull(); // the client does not look there
        const served = await raw(testPort(61766), '/admin/mint'); // and the daemon refuses
        expect(served.status).toBe(403);
        expect(served.body).not.toHaveProperty('proof');
        expect((await raw(testPort(61766), '/admin/revoke')).status).toBe(403);
        expect((await raw(testPort(61766), '/admin/list')).status).toBe(403);
        expect(await askPing(testPort(61766))).toBeNull();
      } finally {
        chmodSync(dir, 0o700);
      }
      expect(await askPing(testPort(61766))).toMatchObject({ pid: process.pid });

      chmodSync(sock, 0o666);
      try {
        expect(controlInsecurity(testPort(61766))).toContain('open to other users');
        expect((await raw(testPort(61766), '/admin/mint')).status).toBe(403);
      } finally {
        chmodSync(sock, 0o600);
      }

      const real = `${dir}.real`;
      renameSync(dir, real);
      symlinkSync(real, dir);
      try {
        expect(controlDir()).toBe(CONFIG_DIR);
        expect((await raw(testPort(61766), '/admin/mint')).status).toBe(403);
      } finally {
        unlinkSync(dir);
        renameSync(real, dir);
      }
      expect((await raw(testPort(61766), '/admin/mint')).status).toBe(200);
    } finally {
      await t.stop();
    }
  });
});

describe('mdhouse admin — the link goes only to an interactive terminal', () => {
  const env = { ...process.env, NO_COLOR: '1' };
  /** Runs the CLI without a terminal. Async: the daemon answering it lives in this process. */
  const cli = async (...args: string[]) => {
    const p = Bun.spawn(['bun', CLI, 'admin', ...args], { env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
    return { exitCode: await p.exited, stdout, stderr };
  };

  test('redirected or piped output is refused before any daemon is asked; nothing secret is printed', async () => {
    // nothing runs on this port: a refusal that came from the daemon would say "nothing running"
    const piped = await cli('--port', String(testPort(61767)));
    expect(piped.exitCode).toBe(2);
    expect(piped.stderr).toContain('only to an interactive terminal');
    expect(piped.stdout).toBe('');

    const t = await start(testPort(61768));
    try {
      let seen = '';
      const out = join(t.base, 'out.txt');
      // a real PTY on stdin, stdout redirected to a file
      const p = Bun.spawn(['bash', '-c', `exec bun "$0" admin --port ${testPort(61768)} > "$1"`, CLI, out], { env, terminal: { cols: 200, rows: 24, data: (_t, d) => (seen += Buffer.from(d).toString()) } });
      expect(await p.exited).toBe(2);
      expect(seen).toContain('only to an interactive terminal');
      expect(seen.includes('#admin=')).toBe(false);
      expect(await readFile(out, 'utf8')).toBe('');
      const listed = await askAdminList(testPort(61768));
      expect(listed).toEqual({ sessions: [] });
    } finally {
      await t.stop();
    }
  });

  test('on a real PTY it prints a single-use local fragment link that the public exchange accepts once', async () => {
    const t = await start(testPort(61769));
    try {
      let seen = '';
      const p = Bun.spawn(['bun', CLI, 'admin', '--port', String(testPort(61769))], { env, terminal: { cols: 300, rows: 24, data: (_t, d) => (seen += Buffer.from(d).toString()) } });
      expect(await p.exited).toBe(0);
      const link = new RegExp(`(http://127\\.0\\.0\\.1:${testPort(61769)})/settings#admin=([A-Za-z0-9_-]{43})`).exec(seen);
      // booleans only: a failure must not print the captured terminal, which holds the proof
      expect(link !== null).toBe(true);
      expect(/[?&]admin=/.test(seen)).toBe(false);
      const [, origin, proof] = link!;
      expect(origin === t.origin).toBe(true);
      expect((await t.post('/api/admin/session', { proof })).status).toBe(204);
      expect((await t.post('/api/admin/session', { proof })).status).toBe(403);
      // nothing written beside the config: only prefs and the control socket
      expect(existsSync(join(CONFIG_DIR, 'admin'))).toBe(false);
    } finally {
      await t.stop();
    }
  });

  test('--list and --revoke work without a terminal and print no secret', async () => {
    const t = await start(testPort(61770));
    try {
      const cookie = await adminLogin(testPort(61770));
      const list = await cli('--list', '--port', String(testPort(61770)));
      expect([list.exitCode, list.stderr]).toEqual([0, '']);
      expect(list.stdout).toMatch(/^[0-9a-f]{32}  since /);
      expect(list.stdout.includes(cookie.split('=')[1]!)).toBe(false);
      const revoke = await cli('--revoke', '--port', String(testPort(61770)));
      expect(revoke.exitCode).toBe(0);
      expect(revoke.stdout).toContain('ended 1 browser administrator session');
      expect((await t.post('/api/settings', { editLink: false }, { cookie })).status).toBe(401);
      expect((await cli('--list', '--revoke', '--port', String(testPort(61770)))).exitCode).toBe(2);
    } finally {
      await t.stop();
    }
  });
});
