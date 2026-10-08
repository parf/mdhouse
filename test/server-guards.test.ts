import { describe, expect, test } from 'bun:test';
import { sameOrigin, trustedHost } from '../src/server';

describe('trustedHost — the DNS-rebinding guard', () => {
  test('loopback names and IP literals are accepted', () => {
    for (const host of ['localhost:7777', '127.0.0.1:7777', '[::1]:7777', 'LOCALHOST']) {
      expect(trustedHost(host, '127.0.0.1')).toBe(true);
    }
  });

  test('any other name is refused — that is what a rebound domain looks like', () => {
    expect(trustedHost('evil.example:7777', '127.0.0.1')).toBe(false);
    expect(trustedHost('localhost.evil.example', '127.0.0.1')).toBe(false);
    expect(trustedHost(null, '127.0.0.1')).toBe(false);
    expect(trustedHost('evil.com:x', '127.0.0.1')).toBe(false); // a colon alone is not IPv6
  });

  test('IPv6 in every form a browser sends, and a trailing dot', () => {
    for (const host of ['[::1]:7777', '::1', '[::ffff:127.0.0.1]:7777', 'localhost.:7777']) {
      expect(trustedHost(host, '127.0.0.1')).toBe(true);
    }
  });

  test('bound to the network, this machine’s own name is accepted too, and nothing near it', () => {
    expect(trustedHost('box:7777', '0.0.0.0', 'box')).toBe(true);
    expect(trustedHost('box.local:7777', '0.0.0.0', 'box')).toBe(true);
    expect(trustedHost('192.168.1.5:7777', '0.0.0.0', 'box')).toBe(true);
    expect(trustedHost('box.evil.example', '0.0.0.0', 'box')).toBe(false);
    expect(trustedHost('box:7777', '127.0.0.1', 'box')).toBe(false);
  });
});

describe('sameOrigin', () => {
  const req = (headers: Record<string, string>) => new Request('http://localhost:7777/api/marks', { headers });

  test('the page itself, and non-browser callers, pass', () => {
    expect(sameOrigin(req({ host: 'localhost:7777', origin: 'http://localhost:7777', 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(sameOrigin(req({ host: 'localhost:7777' }))).toBe(true);
  });

  test('another site is refused, by either header', () => {
    expect(sameOrigin(req({ host: 'localhost:7777', 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(sameOrigin(req({ host: 'localhost:7777', 'sec-fetch-site': 'same-site' }))).toBe(false);
    expect(sameOrigin(req({ host: 'localhost:7777', origin: 'https://evil.example' }))).toBe(false);
    expect(sameOrigin(req({ host: 'localhost:7777', origin: 'null' }))).toBe(false);
  });
});

describe('a running server', () => {
  test('starts, answers its own host, and refuses a rebound one', async () => {
    const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { Registry } = await import('../src/lib/roots');
    const { Prefs } = await import('../src/lib/prefs');
    const { serve } = await import('../src/server');

    const dir = await mkdtemp(join(tmpdir(), 'mdhouse-serve-'));
    await writeFile(join(dir, 'a.md'), '# a\n');
    const port = 61790;
    const { server, watcher, control } = await serve({
      registry: await Registry.create([dir]),
      prefs: await Prefs.load(join(dir, 'prefs.json')),
      port,
      hostname: '127.0.0.1',
      noGit: true,
    });

    try {
      const ok = await fetch(`http://127.0.0.1:${port}/api/roots`);
      expect(ok.status).toBe(200);
      expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(200);

      const rebound = await fetch(`http://127.0.0.1:${port}/api/roots`, { headers: { host: `evil.example:${port}` } });
      expect(rebound.status).toBe(421);
    } finally {
      server.stop(true);
      watcher.close();
      control?.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('access — allow list and users', () => {
  test('off by default; a user asks for a login on every route, the page too', async () => {
    const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { Registry } = await import('../src/lib/roots');
    const { Prefs } = await import('../src/lib/prefs');
    const { serve } = await import('../src/server');
    const { hashPassword } = await import('../src/lib/access');

    const dir = await mkdtemp(join(tmpdir(), 'mdhouse-access-'));
    await writeFile(join(dir, 'a.md'), '# a\n');
    const prefs = await Prefs.load(join(dir, 'prefs.json'));
    const port = 61794;
    const { server, watcher, control } = await serve({ registry: await Registry.create([dir]), prefs, port, hostname: '127.0.0.1', noGit: true });
    const get = (path: string, auth?: string) =>
      fetch(`http://127.0.0.1:${port}${path}`, auth ? { headers: { authorization: `Basic ${btoa(auth)}` } } : {});

    try {
      expect((await get('/api/roots')).status).toBe(200);
      // Another process (the CLI) adds a user: it applies at once.
      const cli = await Prefs.load(join(dir, 'prefs.json'));
      await Bun.sleep(5); // a different mtime
      await cli.setUser('ann', await hashPassword('s3cret'));
      for (const path of ['/api/roots', '/', '/d/a.md', '/settings', '/ws', '/nope']) {
        const r = await get(path);
        expect(r.status).toBe(401);
        expect(r.headers.get('www-authenticate')).toContain('Basic');
      }
      expect((await get('/api/roots', 'ann:wrong')).status).toBe(401);
      expect((await get('/api/roots', 'ann:s3cret')).status).toBe(200);
      const page = await get('/d/a.md', 'ann:s3cret');
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('<!doctype html>');
      expect((await get('/nope', 'ann:s3cret')).status).toBe(404);
      // This machine is always allowed by the list; the login is still asked.
      await cli.setAllow(['10.9.0.0/16']);
      expect((await get('/api/roots', 'ann:s3cret')).status).toBe(200);
      await cli.removeUser('ann');
      expect((await get('/api/roots')).status).toBe(200);
    } finally {
      server.stop(true);
      watcher.close();
      control?.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('the git view — /api/git', () => {
  test('a folder in no repo is 404; commit refuses a read-only folder and another site', async () => {
    const { mkdtemp, rm, writeFile, mkdir } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { Registry } = await import('../src/lib/roots');
    const { Prefs } = await import('../src/lib/prefs');
    const { serve } = await import('../src/server');
    const { run } = await import('../src/lib/gitpage');

    const base = await mkdtemp(join(tmpdir(), 'mdhouse-gitapi-'));
    const repo = join(base, 'repo');
    const plain = join(base, 'plain');
    await mkdir(repo);
    await mkdir(plain);
    await writeFile(join(repo, 'a.md'), 'a\n');
    await writeFile(join(plain, 'b.md'), 'b\n');
    await run(repo, ['init', '-q']);
    await run(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.']);
    await run(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'first']);
    await writeFile(join(repo, 'a.md'), 'a2\n');

    const port = 61795;
    const { server, watcher, control } = await serve({
      registry: await Registry.create([repo, plain]),
      prefs: await Prefs.load(join(base, 'prefs.json')),
      port,
      hostname: '127.0.0.1',
    });
    const url = (path: string) => `http://127.0.0.1:${port}${path}`;
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(url(path), { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    try {
      const info = await (await fetch(url('/api/git?p=repo/'))).json();
      expect(info.dirty).toMatchObject([{ path: 'a.md', code: ' M', md: true, size: 3 }]);
      expect(info.commitMessage).toBe('Update a.md');
      expect(info.writable).toBe(false);
      expect((await fetch(url('/api/git?p=plain/'))).status).toBe(404);
      expect((await fetch(url('/api/git/commits?p=repo/'))).status).toBe(200);
      const commit = { p: 'repo/', message: 'm', files: ['a.md'] };
      expect((await post('/api/git/commit', commit)).status).toBe(403); // read-only
      expect((await post('/api/git/commit', commit, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
      expect((await post('/api/git/push', { p: 'repo/' })).status).toBe(403);
    } finally {
      server.stop(true);
      watcher.close();
      control?.stop();
      await rm(base, { recursive: true, force: true });
    }
  });
});

test('POST /api/git/reset — a file back to its last commit; refuses read-only, untracked, other sites, and a file changed since its diff was shown', async () => {
  const { mkdtemp, rm, writeFile, readFile, mkdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { Registry } = await import('../src/lib/roots');
  const { Prefs } = await import('../src/lib/prefs');
  const { serve } = await import('../src/server');
  const { run } = await import('../src/lib/gitpage');

  const base = await mkdtemp(join(tmpdir(), 'mdhouse-reset-'));
  const repo = join(base, 'repo');
  const ro = join(base, 'repo', 'ro');
  await mkdir(ro, { recursive: true });
  await writeFile(join(repo, 'a.md'), 'a\n');
  await writeFile(join(ro, 'b.md'), 'b\n');
  await writeFile(join(repo, 'code.ts'), 'const a = 1;\n');
  await run(repo, ['init', '-q']);
  await run(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.']);
  await run(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'first']);
  await writeFile(join(repo, 'a.md'), 'a changed\n');
  await writeFile(join(repo, 'new.md'), 'n\n');
  await writeFile(join(ro, 'b.md'), 'b changed\n');
  await writeFile(join(repo, 'code.ts'), 'const a = 2;\n');

  const port = 61797;
  const registry = await Registry.create([
    { path: repo, writable: true },
    { path: ro, writable: false },
  ]);
  const { server, watcher, control } = await serve({ registry, prefs: await Prefs.load(join(base, 'prefs.json')), port, hostname: '127.0.0.1' });
  const [rwId, roId] = registry.list().map((r) => r.id);
  /** The fingerprint the page got with the file's uncommitted changes. */
  const shown = async (p: string) => ((await (await fetch(`http://127.0.0.1:${port}/api/git/diff?p=${p}`)).json()) as { hash?: string }).hash ?? '';
  const post = async (p: string, headers: Record<string, string> = {}, hash?: string) =>
    fetch(`http://127.0.0.1:${port}/api/git/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ p, hash: hash ?? (await shown(p)) }),
    });
  try {
    expect((await post(`${rwId}/a.md`, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect(await readFile(join(repo, 'a.md'), 'utf8')).toBe('a changed\n');
    expect((await post(`${roId}/b.md`)).status).toBe(403);
    expect(await readFile(join(ro, 'b.md'), 'utf8')).toBe('b changed\n');
    expect((await post(`${rwId}/new.md`)).status).toBe(409);
    expect((await post(`${rwId}/nope.md`)).status).toBe(404);
    // not a document: never reset (A7)
    const { lineHash } = await import('../src/lib/qa');
    expect((await post(`${rwId}/code.ts`, {}, lineHash('const a = 2;\n'))).status).toBe(404);
    expect(await readFile(join(repo, 'code.ts'), 'utf8')).toBe('const a = 2;\n');
    // saved again after the diff was shown: refused, the later edit kept (A2)
    const old = await shown(`${rwId}/a.md`);
    expect(old).toMatch(/^[0-9a-f]{8}$/);
    await writeFile(join(repo, 'a.md'), 'a changed\nsaved later\n');
    expect((await post(`${rwId}/a.md`, {}, old)).status).toBe(409);
    expect(await readFile(join(repo, 'a.md'), 'utf8')).toBe('a changed\nsaved later\n');
    expect((await fetch(`http://127.0.0.1:${port}/api/git/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p: `${rwId}/a.md` }) })).status).toBe(400);
    expect((await post(`${rwId}/a.md`)).status).toBe(200);
    expect(await readFile(join(repo, 'a.md'), 'utf8')).toBe('a\n');
    expect(await readFile(join(repo, 'new.md'), 'utf8')).toBe('n\n');
  } finally {
    server.stop(true);
    watcher.close();
    control?.stop();
    await rm(base, { recursive: true, force: true });
  }
});

describe('POST /api/task — ticking a box', () => {
  test('writes one line on a writable folder; refuses read-only, stale pages and other sites', async () => {
    const { mkdtemp, rm, writeFile, readFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { Registry } = await import('../src/lib/roots');
    const { Prefs } = await import('../src/lib/prefs');
    const { serve } = await import('../src/server');
    const { lineHash } = await import('../src/lib/render');

    const base = await mkdtemp(join(tmpdir(), 'mdhouse-task-'));
    const rw = join(base, 'rw');
    const ro = join(base, 'ro');
    await Bun.write(join(rw, 'todo.md'), '# T\n\n- [ ] one\n- [ ] two\n');
    await Bun.write(join(ro, 'todo.md'), '- [ ] locked\n');

    const port = 61791;
    const registry = await Registry.create([
      { path: rw, writable: true },
      { path: ro, writable: false },
    ]);
    const { server, watcher, control } = await serve({
      registry,
      prefs: await Prefs.load(join(base, 'prefs.json')),
      port,
      hostname: '127.0.0.1',
      noGit: true,
    });
    const [rwId, roId] = registry.list().map((r) => r.id);
    const post = (body: unknown, headers: Record<string, string> = {}) =>
      fetch(`http://127.0.0.1:${port}/api/task`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });

    try {
      const ok = await post({ p: `${rwId}/todo.md`, line: 3, hash: lineHash('- [ ] one') });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ checked: true });
      expect(await readFile(join(rw, 'todo.md'), 'utf8')).toBe('# T\n\n- [x] one\n- [ ] two\n');

      // The same click again, from a page that still shows the old line: refused.
      expect((await post({ p: `${rwId}/todo.md`, line: 3, hash: lineHash('- [ ] one') })).status).toBe(409);

      expect((await post({ p: `${roId}/todo.md`, line: 1, hash: lineHash('- [ ] locked') })).status).toBe(403);
      expect(await readFile(join(ro, 'todo.md'), 'utf8')).toBe('- [ ] locked\n');

      const cross = await post({ p: `${rwId}/todo.md`, line: 4, hash: lineHash('- [ ] two') }, { 'sec-fetch-site': 'cross-site' });
      expect(cross.status).toBe(403);
      expect(await readFile(join(rw, 'todo.md'), 'utf8')).toBe('# T\n\n- [x] one\n- [ ] two\n');
    } finally {
      server.stop(true);
      watcher.close();
      control?.stop();
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe('/api/qa — a change to one Q&A item', () => {
  test('writes on a writable folder, old forms converted; refuses read-only, stale pages, bad bodies and other sites', async () => {
    const { mkdtemp, rm, readFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { Registry } = await import('../src/lib/roots');
    const { Prefs } = await import('../src/lib/prefs');
    const { serve } = await import('../src/server');
    const { parseQa } = await import('../src/lib/qa');

    const base = await mkdtemp(join(tmpdir(), 'mdhouse-qa-'));
    const rw = join(base, 'rw');
    const ro = join(base, 'ro');
    // an old-form question: read as `> ❓ Who?` / `> 💬 Nobody.`
    await Bun.write(join(rw, 'q.md'), '# Q\n\n> ? Who?\n> A: Nobody.\n\n- 🟠 Fixed?\n');
    await Bun.write(join(ro, 'q.md'), '- ❓ Locked?\n');

    const port = 61792;
    const registry = await Registry.create([
      { path: rw, writable: true },
      { path: ro, writable: false },
    ]);
    const prefs = await Prefs.load(join(base, 'prefs.json'));
    await prefs.updateSettings({ me: 'ann' });
    const { server, watcher, control } = await serve({ registry, prefs, port, hostname: '127.0.0.1', noGit: true });
    const [rwId, roId] = registry.list().map((r) => r.id);
    const url = `http://127.0.0.1:${port}/api/qa`;
    const post = (body: unknown, headers: Record<string, string> = {}) =>
      fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const hashOf = async (file: string, line: number) =>
      parseQa(await readFile(file, 'utf8').then((t) => t.replace('> ? Who?\n> A:', '> ❓ Who?\n> 💬')), 0).items.find((i) => i.start === line - 1)!.hash;

    try {
      const q = await hashOf(join(rw, 'q.md'), 3);
      const got = await fetch(`${url}?p=${rwId}/q.md&line=3&hash=${q}&reply=4`);
      expect(await got.json()).toEqual({ me: 'ann', text: 'Nobody.' });

      const ok = await post({ p: `${rwId}/q.md`, line: 3, hash: q, op: 'say', text: 'Everybody:\n- a', sign: true });
      expect(ok.status).toBe(200);
      expect(await readFile(join(rw, 'q.md'), 'utf8')).toBe('# Q\n\n> ❓ Who?\n> 💬 Nobody.\n>\n> 💬 👤ann Everybody:\n> - a\n\n- 🟠 Fixed?\n');

      // the same save from a page rendered before it: refused, file untouched
      expect((await post({ p: `${rwId}/q.md`, line: 3, hash: q, op: 'say', text: 'x' })).status).toBe(409);
      expect((await fetch(`${url}?p=${rwId}/q.md&line=3&hash=${q}&reply=4`)).status).toBe(409);

      const f = await hashOf(join(rw, 'q.md'), 9);
      expect((await post({ p: `${rwId}/q.md`, line: 9, hash: f, op: 'say', text: '  ' })).status).toBe(400);
      expect((await post({ p: `${rwId}/q.md`, line: 9, hash: f, op: 'say', text: 'x', action: 'nope' })).status).toBe(400);
      expect((await post({ p: `${rwId}/q.md`, line: 9, hash: f, op: 'say', text: 'soon', action: '🎫' })).status).toBe(400);
      expect((await post({ p: `${rwId}/q.md`, line: 9, hash: f, op: 'say', text: 'x'.repeat(100_001) })).status).toBe(413);
      const done = await post({ p: `${rwId}/q.md`, line: 9, hash: f, op: 'say', text: '', action: '✅' });
      expect(done.status).toBe(200);
      expect(await readFile(join(rw, 'q.md'), 'utf8')).toEndWith('- ✅ 🟠 Fixed?\n  > 💬 👤ann settled\n');

      const before = await readFile(join(rw, 'q.md'), 'utf8');
      const lockedHash = parseQa('- ❓ Locked?\n', 0).items[0]!.hash;
      expect((await post({ p: `${roId}/q.md`, line: 1, hash: lockedHash, op: 'target' })).status).toBe(403);
      expect(await readFile(join(ro, 'q.md'), 'utf8')).toBe('- ❓ Locked?\n');
      const cross = await post({ p: `${rwId}/q.md`, line: 9, hash: f, op: 'target' }, { 'sec-fetch-site': 'cross-site' });
      expect(cross.status).toBe(403);
      expect(await readFile(join(rw, 'q.md'), 'utf8')).toBe(before);
    } finally {
      server.stop(true);
      watcher.close();
      control?.stop();
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe('POST /api/insert — adding under a heading', () => {
  test('writes on a writable folder; refuses read-only, a changed heading, bad input and other sites', async () => {
    const { mkdtemp, rm, readFile } = await import('node:fs/promises');
    const { tmpdir, userInfo } = await import('node:os');
    const { join } = await import('node:path');
    const { Registry } = await import('../src/lib/roots');
    const { Prefs } = await import('../src/lib/prefs');
    const { serve } = await import('../src/server');
    const { lineHash } = await import('../src/lib/qa');

    const base = await mkdtemp(join(tmpdir(), 'mdhouse-insert-'));
    const rw = join(base, 'rw');
    const ro = join(base, 'ro');
    await Bun.write(join(rw, 'n.md'), '# N\n\n## A\n\none\n\n## B\n');
    await Bun.write(join(ro, 'n.md'), '# Locked\n');

    const port = 61793;
    const registry = await Registry.create([
      { path: rw, writable: true },
      { path: ro, writable: false },
    ]);
    const { server, watcher, control } = await serve({
      registry,
      prefs: await Prefs.load(join(base, 'prefs.json')),
      port,
      hostname: '127.0.0.1',
      noGit: true,
    });
    const [rwId, roId] = registry.list().map((r) => r.id);
    const post = (body: unknown, headers: Record<string, string> = {}) =>
      fetch(`http://127.0.0.1:${port}/api/insert`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    const a = { p: `${rwId}/n.md`, line: 3, hash: lineHash('## A') };

    try {
      expect((await post({ ...a, where: 'end', kind: 'my-quote', text: 'mine' })).status).toBe(200);
      expect(await readFile(join(rw, 'n.md'), 'utf8')).toBe(`# N\n\n## A\n\none\n\n> **${userInfo().username}:** mine\n\n## B\n`);
      expect((await post({ ...a, hash: lineHash('## Z'), where: 'below', kind: 'text', text: 'x' })).status).toBe(409);
      expect((await post({ ...a, where: 'sideways', kind: 'text', text: 'x' })).status).toBe(400);
      expect((await post({ ...a, where: 'below', kind: 'poem', text: 'x' })).status).toBe(400);
      expect((await post({ p: `${roId}/n.md`, line: 1, hash: lineHash('# Locked'), where: 'below', kind: 'text', text: 'x' })).status).toBe(403);
      expect((await post({ ...a, where: 'below', kind: 'text', text: 'x' }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
      expect(await readFile(join(ro, 'n.md'), 'utf8')).toBe('# Locked\n');
    } finally {
      server.stop(true);
      watcher.close();
      control?.stop();
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe('request limits', () => {
  test('a limit that is not a number falls back to the default cap; an over-long marks path is refused', async () => {
    const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { Registry } = await import('../src/lib/roots');
    const { Prefs } = await import('../src/lib/prefs');
    const { serve } = await import('../src/server');

    const dir = await mkdtemp(join(tmpdir(), 'mdhouse-limits-'));
    // 30 files × 20 hits: more than the 500 cap.
    for (let i = 0; i < 30; i++) await writeFile(join(dir, `f${i}.md`), 'needle\n'.repeat(20));
    const port = 61798;
    const base = `http://127.0.0.1:${port}`;
    const { server, watcher, control } = await serve({
      registry: await Registry.create([dir]),
      prefs: await Prefs.load(join(dir, 'prefs.json')),
      port,
      hostname: '127.0.0.1',
      noGit: true,
    });
    try {
      const hits = async (limit: string) => ((await (await fetch(`${base}/api/search?q=needle&limit=${limit}`)).json()) as { hits: unknown[] }).hits.length;
      expect(await hits('abc')).toBe(500);
      expect(await hits('3')).toBe(3);
      expect(await hits('100000')).toBe(500);
      expect((await fetch(`${base}/api/recents?limit=abc`)).status).toBe(200);

      const mark = (path: string) =>
        fetch(`${base}/api/marks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, mark: 'favorite' }) });
      expect((await mark('x'.repeat(5000))).status).toBe(413);
      expect((await mark('f1.md')).status).toBe(200);
    } finally {
      server.stop(true);
      watcher.close();
      control?.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('/api/raw', () => {
  test('text files as text; HTML rendered, sandboxed; anything else refused', async () => {
    const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { Registry } = await import('../src/lib/roots');
    const { Prefs } = await import('../src/lib/prefs');
    const { serve } = await import('../src/server');

    const dir = await mkdtemp(join(tmpdir(), 'mdhouse-raw-'));
    for (const f of ['a.html', 'a.css', 'a.scss', 'a.txt', 'a.exe']) await writeFile(join(dir, f), 'x');
    const port = 61799;
    const { server, watcher, control } = await serve({
      registry: await Registry.create([dir]),
      prefs: await Prefs.load(join(dir, 'prefs.json')),
      port,
      hostname: '127.0.0.1',
      noGit: true,
    });
    try {
      const root = (await (await fetch(`http://127.0.0.1:${port}/api/roots`)).json()).roots[0].id;
      const raw = (f: string) => fetch(`http://127.0.0.1:${port}/api/raw?p=${root}/${f}`);
      const html = await raw('a.html');
      expect(html.status).toBe(200);
      expect(html.headers.get('content-type')).toStartWith('text/html');
      expect(html.headers.get('content-security-policy')).toBe('sandbox allow-scripts');
      for (const f of ['a.css', 'a.scss', 'a.txt']) {
        const r = await raw(f);
        expect(r.status).toBe(200);
        expect(r.headers.get('content-type')).toStartWith('text/plain');
        expect(r.headers.get('content-security-policy')).toBeNull();
      }
      expect((await raw('a.exe')).status).toBe(415);
    } finally {
      server.stop(true);
      watcher.close();
      control?.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('/api/files', () => {
  test('every file under a folder, not only Markdown; dot-folders and node_modules left out', async () => {
    const { mkdtemp, rm, writeFile, mkdir } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { Registry } = await import('../src/lib/roots');
    const { Prefs } = await import('../src/lib/prefs');
    const { serve } = await import('../src/server');

    const dir = await mkdtemp(join(tmpdir(), 'mdhouse-files-'));
    await mkdir(join(dir, 'sub', 'deep'), { recursive: true });
    await mkdir(join(dir, 'node_modules'), { recursive: true });
    await mkdir(join(dir, '.hidden'), { recursive: true });
    for (const f of ['a.md', 'sub/b.txt', 'sub/c.png', 'sub/deep/d.js', 'node_modules/x.js', '.hidden/y.txt']) await writeFile(join(dir, f), 'x');
    const port = 61800;
    const { server, watcher, control } = await serve({
      registry: await Registry.create([dir]),
      prefs: await Prefs.load(join(dir, 'prefs.json')),
      port,
      hostname: '127.0.0.1',
      noGit: true,
    });
    try {
      const root = (await (await fetch(`http://127.0.0.1:${port}/api/roots`)).json()).roots[0].id;
      const list = async (p: string) => fetch(`http://127.0.0.1:${port}/api/files?p=${root}/${p}`);
      const all = (await (await list('')).json()) as { files: { rel: string }[]; capped: boolean };
      // prefs.json is the test's own config, written into the folder
      expect(all.files.map((f) => f.rel).filter((r) => r !== 'prefs.json')).toEqual(['a.md', 'sub/b.txt', 'sub/c.png', 'sub/deep/d.js']);
      const sub = (await (await list('sub')).json()) as { files: { rel: string; dir: string }[] };
      expect(sub.files.map((f) => f.rel)).toEqual(['sub/b.txt', 'sub/c.png', 'sub/deep/d.js']);
      expect((await list('a.md')).status).toBe(404);
      expect((await fetch(`http://127.0.0.1:${port}/api/files?p=nope/x`)).status).toBe(403);
    } finally {
      server.stop(true);
      watcher.close();
      control?.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

test('/api/asset — an image never runs as a page: an SVG\'s script is sandboxed away (A4)', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { Registry } = await import('../src/lib/roots');
  const { Prefs } = await import('../src/lib/prefs');
  const { serve } = await import('../src/server');
  const base = await mkdtemp(join(tmpdir(), 'mdhouse-asset-'));
  await Bun.write(join(base, 'x.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/api/marks")</script></svg>');
  await Bun.write(join(base, 'p.png'), 'png');
  const port = 61798;
  const registry = await Registry.create([{ path: base, writable: true }]);
  const { server, watcher, control } = await serve({ registry, prefs: await Prefs.load(join(base, 'prefs.json')), port, hostname: '127.0.0.1', noGit: true });
  const id = registry.list()[0]!.id;
  try {
    for (const f of ['x.svg', 'p.png']) {
      const res = await fetch(`http://127.0.0.1:${port}/api/asset?p=${id}/${f}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-security-policy')).toBe('sandbox');
    }
  } finally {
    server.stop(true);
    watcher.close();
    control?.stop();
    await rm(base, { recursive: true, force: true });
  }
});

test('a document that is gone, or a folder named *.md, is 404 on every document write route (A5)', async () => {
  const { mkdtemp, rm, mkdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { Registry } = await import('../src/lib/roots');
  const { Prefs } = await import('../src/lib/prefs');
  const { serve } = await import('../src/server');
  const base = await mkdtemp(join(tmpdir(), 'mdhouse-gone-'));
  await mkdir(join(base, 'dir.md'));
  const port = 61799;
  const registry = await Registry.create([{ path: base, writable: true }]);
  const { server, watcher, control } = await serve({ registry, prefs: await Prefs.load(join(base, 'prefs.json')), port, hostname: '127.0.0.1', noGit: true });
  const id = registry.list()[0]!.id;
  const post = (route: string, body: object) =>
    fetch(`http://127.0.0.1:${port}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    for (const f of ['nope.md', 'dir.md']) {
      const p = `${id}/${f}`;
      expect((await post('/api/task', { p, line: 1, hash: 'x' })).status).toBe(404);
      expect((await post('/api/qa', { p, line: 1, hash: 'x', op: 'target' })).status).toBe(404);
      expect((await post('/api/insert', { p, line: 1, hash: 'x', where: 'below', kind: 'text', text: 'x' })).status).toBe(404);
      expect((await fetch(`http://127.0.0.1:${port}/api/qa?p=${p}&line=1&hash=x&reply=2`)).status).toBe(404);
    }
  } finally {
    server.stop(true);
    watcher.close();
    control?.stop();
    await rm(base, { recursive: true, force: true });
  }
});

test('pull and commit refuse a repo that holds a read-only root or files outside the root (A1)', async () => {
  const { mkdtemp, rm, writeFile, readFile, mkdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { Registry } = await import('../src/lib/roots');
  const { Prefs } = await import('../src/lib/prefs');
  const { serve } = await import('../src/server');
  const { run } = await import('../src/lib/gitpage');

  const base = await mkdtemp(join(tmpdir(), 'mdhouse-scope-'));
  const origin = join(base, 'origin');
  const repo = join(base, 'repo');
  const git = (cwd: string, args: string[]) => run(cwd, ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
  await mkdir(join(origin, 'docs'), { recursive: true });
  await mkdir(join(origin, 'notes'));
  await writeFile(join(origin, 'docs', 'd.md'), 'd\n');
  await writeFile(join(origin, 'notes', 'n.md'), 'n\n');
  await git(origin, ['init', '-q', '-b', 'main']);
  await git(origin, ['add', '.']);
  await git(origin, ['commit', '-qm', 'first']);
  await git(base, ['clone', '-q', origin, repo]);
  await writeFile(join(origin, 'notes', 'n.md'), 'n upstream\n');
  await git(origin, ['commit', '-qam', 'upstream']);

  const port = 61781;
  const registry = await Registry.create([
    { path: join(repo, 'docs'), writable: true },
    { path: join(repo, 'notes'), writable: false },
  ]);
  const { server, watcher, control } = await serve({ registry, prefs: await Prefs.load(join(base, 'prefs.json')), port, hostname: '127.0.0.1' });
  const [docs, notes] = registry.list().map((r) => r.id);
  const post = (path: string, body: unknown) =>
    fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    // A read-only root in the repo: pull would rewrite it.
    expect((await post('/api/git/pull', { p: `${docs}/` })).status).toBe(409);
    expect(await readFile(join(repo, 'notes', 'n.md'), 'utf8')).toBe('n\n');
    // A change outside the root (here in the read-only one) is not this root's to commit.
    await writeFile(join(repo, 'notes', 'n.md'), 'n local\n');
    expect((await post('/api/git/commit', { p: `${docs}/`, message: 'm', files: ['notes/n.md'] })).status).toBe(409);
    expect((await git(repo, ['status', '--porcelain'])).out.trim()).toBe('M notes/n.md');
    // Only the root's own files: committed.
    await git(repo, ['checkout', '--', 'notes/n.md']);
    await writeFile(join(repo, 'docs', 'd.md'), 'd local\n');
    expect((await post('/api/git/commit', { p: `${docs}/`, message: 'm', files: ['docs/d.md'] })).status).toBe(200);

    // The read-only root gone, the repo still holds files outside `docs`: pull is refused.
    await post('/api/roots/remove', { id: notes });
    expect((await post('/api/git/pull', { p: `${docs}/` })).status).toBe(409);
    expect(await readFile(join(repo, 'notes', 'n.md'), 'utf8')).toBe('n\n');
  } finally {
    server.stop(true);
    watcher.close();
    control?.stop();
    await rm(base, { recursive: true, force: true });
  }
});

test('/api/doc renders Markdown only — any other file is 404 (A6)', async () => {
  const { mkdtemp, rm, writeFile, mkdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { Registry } = await import('../src/lib/roots');
  const { Prefs } = await import('../src/lib/prefs');
  const { serve } = await import('../src/server');
  const dir = await mkdtemp(join(tmpdir(), 'mdhouse-docext-'));
  await mkdir(join(dir, '.git'));
  await writeFile(join(dir, '.git', 'config'), '[remote "origin"]\n  url = https://token@example.com/r\n');
  await writeFile(join(dir, 'creds'), 'secret\n');
  await writeFile(join(dir, 'a.md'), '# a\n');
  const port = 61782;
  const registry = await Registry.create([dir]);
  const { server, watcher, control } = await serve({ registry, prefs: await Prefs.load(join(dir, 'prefs.json')), port, hostname: '127.0.0.1', noGit: true });
  const id = registry.list()[0]!.id;
  const doc = (q: string) => fetch(`http://127.0.0.1:${port}/api/doc?${q}`);
  try {
    expect((await doc(`p=${id}/a.md`)).status).toBe(200);
    expect((await doc(`d=${id}/a.md`)).status).toBe(200);
    for (const f of ['.git/config', 'creds']) {
      expect((await doc(`p=${id}/${f}`)).status).toBe(404);
      expect((await doc(`d=${id}/${f}`)).status).toBe(404);
    }
  } finally {
    server.stop(true);
    watcher.close();
    control?.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('--rw for a folder writable only by auto-rw sticks when auto-rw goes off (A8)', async () => {
  const { mkdtemp, rm, mkdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { Registry } = await import('../src/lib/roots');
  const { Prefs } = await import('../src/lib/prefs');
  const { serve } = await import('../src/server');
  const { askDaemon } = await import('../src/lib/control');
  const base = await mkdtemp(join(tmpdir(), 'mdhouse-rwasked-'));
  const notes = join(base, 'auto', 'notes');
  await mkdir(notes, { recursive: true });
  const prefs = await Prefs.load(join(base, 'prefs.json'));
  await prefs.setAutoRw([join(base, 'auto')]);
  const port = 61783;
  const { server, watcher, control } = await serve({ registry: await Registry.create([base]), prefs, port, hostname: '127.0.0.1', noGit: true });
  const writable = async () =>
    ((await (await fetch(`http://127.0.0.1:${port}/api/roots`)).json()).roots as { path: string; writable: boolean }[]).find((r) => r.path === notes)?.writable;
  const settings = (autoRw: boolean) =>
    fetch(`http://127.0.0.1:${port}/api/settings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ autoRw }) });
  try {
    await askDaemon(port, { dirs: [notes] });
    expect(await writable()).toBe(true); // by auto-rw
    const reply = await askDaemon(port, { dirs: [notes], rw: true });
    expect(reply && 'roots' in reply && reply.roots.find((r) => r.path === notes)?.upgraded).toBeFalsy(); // it was writable already
    await settings(false);
    expect(await writable()).toBe(true); // by --rw
  } finally {
    server.stop(true);
    watcher.close();
    control?.stop();
    await rm(base, { recursive: true, force: true });
  }
});
