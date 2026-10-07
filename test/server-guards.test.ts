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

test('POST /api/git/reset — a file back to its last commit; refuses read-only, untracked and other sites', async () => {
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
  await run(repo, ['init', '-q']);
  await run(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.']);
  await run(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'first']);
  await writeFile(join(repo, 'a.md'), 'a changed\n');
  await writeFile(join(repo, 'new.md'), 'n\n');
  await writeFile(join(ro, 'b.md'), 'b changed\n');

  const port = 61797;
  const registry = await Registry.create([
    { path: repo, writable: true },
    { path: ro, writable: false },
  ]);
  const { server, watcher, control } = await serve({ registry, prefs: await Prefs.load(join(base, 'prefs.json')), port, hostname: '127.0.0.1' });
  const [rwId, roId] = registry.list().map((r) => r.id);
  const post = (p: string, headers: Record<string, string> = {}) =>
    fetch(`http://127.0.0.1:${port}/api/git/reset`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ p }) });
  try {
    expect((await post(`${rwId}/a.md`, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect(await readFile(join(repo, 'a.md'), 'utf8')).toBe('a changed\n');
    expect((await post(`${roId}/b.md`)).status).toBe(403);
    expect(await readFile(join(ro, 'b.md'), 'utf8')).toBe('b changed\n');
    expect((await post(`${rwId}/new.md`)).status).toBe(409);
    expect((await post(`${rwId}/nope.md`)).status).toBe(404);
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

describe('/api/qa/answer — answering a question', () => {
  test('reads and writes on a writable folder; refuses read-only, stale pages, empty answers and other sites', async () => {
    const { mkdtemp, rm, readFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { Registry } = await import('../src/lib/roots');
    const { Prefs } = await import('../src/lib/prefs');
    const { serve } = await import('../src/server');
    const { lineHash } = await import('../src/lib/qa');

    const base = await mkdtemp(join(tmpdir(), 'mdhouse-qa-'));
    const rw = join(base, 'rw');
    const ro = join(base, 'ro');
    await Bun.write(join(rw, 'q.md'), '# Q\n\n> ? Who?\n> 💬 Nobody.\n\n- ⚠️ Fixed?\n');
    await Bun.write(join(ro, 'q.md'), '> ? Locked?\n');

    const port = 61792;
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
    const url = `http://127.0.0.1:${port}/api/qa/answer`;
    const post = (body: unknown, headers: Record<string, string> = {}) =>
      fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const q = lineHash('> ? Who?');

    try {
      const got = await fetch(`${url}?p=${rwId}/q.md&line=3&form=quote&hash=${q}`);
      expect(got.status).toBe(200);
      const { text, answerHash } = (await got.json()) as { text: string; answerHash: string };
      expect(text).toBe('Nobody.');

      const ok = await post({ p: `${rwId}/q.md`, line: 3, form: 'quote', hash: q, answerHash, text: 'Everybody:\n- a' });
      expect(ok.status).toBe(200);
      expect(await readFile(join(rw, 'q.md'), 'utf8')).toBe('# Q\n\n> ? Who?\n> 💬 Everybody:\n> - a\n\n- ⚠️ Fixed?\n');

      // The same save from a page that still has the old answer: refused, file untouched.
      expect((await post({ p: `${rwId}/q.md`, line: 3, form: 'quote', hash: q, answerHash, text: 'x' })).status).toBe(409);
      expect((await fetch(`${url}?p=${rwId}/q.md&line=3&form=quote&hash=${lineHash('> ? Whom?')}`)).status).toBe(409);
      expect((await post({ p: `${rwId}/q.md`, line: 7, form: 'task', hash: lineHash('- ⚠️ Fixed?'), answerHash: '', text: '  ' })).status).toBe(400);

      expect((await post({ p: `${rwId}/q.md`, line: 7, form: 'task', hash: lineHash('- ⚠️ Fixed?'), answerHash: '', text: 'x', check: 'no' })).status).toBe(400);
      expect((await post({ p: `${rwId}/q.md`, line: 7, form: 'task', hash: lineHash('- ⚠️ Fixed?'), answerHash: '', text: 'x'.repeat(100_001) })).status).toBe(413);

      // Check & Save on a status item: answered, and the glyph becomes ✅.
      const check = await post({ p: `${rwId}/q.md`, line: 7, form: 'task', hash: lineHash('- ⚠️ Fixed?'), answerHash: '', text: 'Yes.', check: true });
      expect(check.status).toBe(200);
      expect(await readFile(join(rw, 'q.md'), 'utf8')).toEndWith('- ✅ Fixed?\n  > 💬 Yes.\n');

      const before = await readFile(join(rw, 'q.md'), 'utf8');
      expect((await post({ p: `${roId}/q.md`, line: 1, form: 'quote', hash: lineHash('> ? Locked?'), answerHash: '', text: 'x' })).status).toBe(403);
      expect(await readFile(join(ro, 'q.md'), 'utf8')).toBe('> ? Locked?\n');
      const cross = await post(
        { p: `${rwId}/q.md`, line: 3, form: 'quote', hash: q, answerHash: lineHash('> 💬 Everybody:\n> - a'), text: 'x' },
        { 'sec-fetch-site': 'cross-site' },
      );
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
