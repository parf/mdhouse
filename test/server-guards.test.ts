import { describe, expect, test } from 'bun:test';
import { pageUrl, sameOrigin, trustedHost } from '../src/server';

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

  test('with --host-name saved, only those names pass — no localhost, no IP', () => {
    const names = ['rdvp', 'parf-dvp4'];
    expect(trustedHost('rdvp', '127.0.0.1', names)).toBe(true);
    expect(trustedHost('PARF-DVP4:80', '127.0.0.1', names)).toBe(true);
    for (const host of ['localhost:7777', '127.0.0.1:7777', '[::1]:7777', 'evil.example', 'rdvp.evil.example']) {
      expect(trustedHost(host, '127.0.0.1', names)).toBe(false);
    }
  });

  test('IPv6 in every form a browser sends, and a trailing dot', () => {
    for (const host of ['[::1]:7777', '::1', '[::ffff:127.0.0.1]:7777', 'localhost.:7777']) {
      expect(trustedHost(host, '127.0.0.1')).toBe(true);
    }
  });

  test('bound to the network, this machine’s own name is accepted too, and nothing near it', () => {
    expect(trustedHost('box:7777', '0.0.0.0', [], 'box')).toBe(true);
    expect(trustedHost('box.local:7777', '0.0.0.0', [], 'box')).toBe(true);
    expect(trustedHost('192.168.1.5:7777', '0.0.0.0', [], 'box')).toBe(true);
    expect(trustedHost('box.evil.example', '0.0.0.0', [], 'box')).toBe(false);
    expect(trustedHost('box:7777', '127.0.0.1', [], 'box')).toBe(false);
  });
});

test('pageUrl brackets an IPv6 host, so the printed address is a URL (A9)', () => {
  expect(pageUrl('127.0.0.1', 7777)).toBe('http://127.0.0.1:7777');
  expect(pageUrl('::1', 7777)).toBe('http://[::1]:7777');
  expect(new URL(pageUrl('::1', 7777)).port).toBe('7777');
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
    const registry = await Registry.create([dir]);
    const id = registry.list()[0]!.id;
    const { server, watcher, control } = await serve({ registry, prefs, port, hostname: '127.0.0.1', noGit: true });
    const get = (path: string, auth?: string) =>
      fetch(`http://127.0.0.1:${port}${path}`, auth ? { headers: { authorization: `Basic ${btoa(auth)}` } } : {});

    try {
      expect((await get('/api/roots')).status).toBe(200);
      // Another process (the CLI) adds a user: it applies at once.
      const cli = await Prefs.load(join(dir, 'prefs.json'));
      await Bun.sleep(5); // a different mtime
      await cli.setUser('ann', await hashPassword('s3cret'));
      for (const path of ['/api/roots', '/', '/d/a.md', `/${id}/a.md`, '/settings', '/ws', '/nope']) {
        const r = await get(path);
        expect(r.status).toBe(401);
        expect(r.headers.get('www-authenticate')).toContain('Basic');
      }
      expect((await get('/api/roots', 'ann:wrong')).status).toBe(401);
      expect((await get('/api/roots', 'ann:s3cret')).status).toBe(200);
      const page = await get(`/${id}/a.md`, 'ann:s3cret');
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

describe('page addresses — /<rootId>/<rel>', () => {
  test('the page under a root; /d/… moves there (301, query kept); a folder without its slash moves to its page; else 404', async () => {
    const { mkdtemp, rm, mkdir, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { Registry } = await import('../src/lib/roots');
    const { Prefs } = await import('../src/lib/prefs');
    const { serve } = await import('../src/server');
    const base = await mkdtemp(join(tmpdir(), 'mdhouse-pages-'));
    await mkdir(join(base, 'notes', 'sub'), { recursive: true });
    await mkdir(join(base, 'api'));
    await writeFile(join(base, 'notes', 'a.md'), '# a\n');
    await writeFile(join(base, 'api', 'x.md'), '# x\n');
    const port = 61803;
    const registry = await Registry.create([join(base, 'notes'), join(base, 'api')]);
    const [notes, api] = registry.list();
    expect(api!.id).toBe('api-2');
    const { server, watcher, control } = await serve({ registry, prefs: await Prefs.load(join(base, 'prefs.json')), port, hostname: '127.0.0.1', noGit: true });
    const get = (path: string) => fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual' });
    const to = async (path: string) => {
      const r = await get(path);
      expect(r.status).toBe(301);
      return r.headers.get('location');
    };
    try {
      for (const path of [`/${notes!.id}/a.md`, `/${notes!.id}/`, `/${notes!.id}`, `/${notes!.id}/sub/?git`, `/${api!.id}/x.md`, `/${notes!.id}/gone.md`]) {
        const r = await get(path);
        expect(r.status).toBe(200);
        expect(await r.text()).toContain('<!doctype html>');
      }
      expect(await to('/d/a.md')).toBe(`/${notes!.id}/a.md`);
      expect(await to(`/d/${api!.id}/x.md`)).toBe(`/${api!.id}/x.md`);
      expect(await to('/d/')).toBe(`/${notes!.id}/`);
      expect(await to('/d')).toBe(`/${notes!.id}/`);
      expect(await to(`/d/${notes!.id}/sub/?git=commits`)).toBe(`/${notes!.id}/sub/?git=commits`);
      expect(await to('/d/sub/?git')).toBe(`/${notes!.id}/sub/?git`);
      expect(await to(`/${notes!.id}/sub`)).toBe(`/${notes!.id}/sub/`);
      for (const path of ['/nope/a.md', '/nope', '/api/nope', '/api', '/README.md']) expect((await get(path)).status).toBe(404);
    } finally {
      server.stop(true);
      watcher.close();
      control?.stop();
      await rm(base, { recursive: true, force: true });
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

  test('a writable repo: commit, pull and push refuse another site, changed files, unconfirmed non-Markdown and a read-only root inside', async () => {
    const { mkdtemp, rm, writeFile, mkdir } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { Registry } = await import('../src/lib/roots');
    const { Prefs } = await import('../src/lib/prefs');
    const { serve } = await import('../src/server');
    const { run } = await import('../src/lib/gitpage');

    const base = await mkdtemp(join(tmpdir(), 'mdhouse-gitrw-'));
    const repo = join(base, 'repo');
    await mkdir(repo);
    const git = (args: string[]) => run(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
    await writeFile(join(repo, 'a.md'), 'a\n');
    await writeFile(join(repo, 'b.txt'), 'b\n');
    await git(['init', '-q']);
    await git(['add', '.']);
    await git(['commit', '-qm', 'first']);
    await git(['config', 'user.name', 't']);
    await git(['config', 'user.email', 't@t']);

    const port = 61930;
    const registry = await Registry.create([{ path: repo, writable: true }]);
    const { server, watcher, control } = await serve({ registry, prefs: await Prefs.load(join(base, 'prefs.json')), port, hostname: '127.0.0.1' });
    const p = `${registry.list()[0]!.id}/`;
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const crossSite = { 'sec-fetch-site': 'cross-site' };
    const head = async () => (await git(['rev-parse', 'HEAD'])).out.trim();
    try {
      await writeFile(join(repo, 'a.md'), 'a2\n');
      const first = await head();
      for (const route of ['/api/git/commit', '/api/git/pull', '/api/git/push']) {
        expect((await post(route, { p, message: 'm', files: ['a.md'] }, crossSite)).status).toBe(403);
      }
      // Markdown changed, not confirmed: pull and push ask first.
      const ask = await post('/api/git/pull', { p });
      expect(ask.status).toBe(409);
      expect(await ask.json()).toMatchObject({ confirm: true });
      expect((await post('/api/git/push', { p })).status).toBe(409);
      // The page showed other files than git has now.
      expect((await post('/api/git/commit', { p, message: 'm', files: [] })).status).toBe(409);
      await writeFile(join(repo, 'b.txt'), 'b2\n');
      expect((await post('/api/git/commit', { p, message: 'm', files: ['a.md'] })).status).toBe(409);
      // A file that is not Markdown: commit needs it confirmed, pull and push refuse it.
      expect((await post('/api/git/commit', { p, message: 'm', files: ['a.md', 'b.txt'] })).status).toBe(409);
      const pull = await post('/api/git/pull', { p, confirmed: true });
      expect(pull.status).toBe(409);
      expect(await pull.json()).not.toHaveProperty('confirm');
      expect((await post('/api/git/push', { p, confirmed: true })).status).toBe(409);
      expect(await head()).toBe(first);
      expect((await post('/api/git/commit', { p, message: 'm', files: ['a.md', 'b.txt'], nonMd: true })).status).toBe(200);
      expect(await head()).not.toBe(first);
      expect((await git(['status', '--porcelain'])).out.trim()).toBe('');
      // A read-only root inside the repo (A1): pull would rewrite it, a change in it is not this root's to commit.
      await mkdir(join(repo, 'ro'));
      await writeFile(join(repo, 'ro', 'r.md'), 'r\n');
      await git(['add', '.']);
      await git(['commit', '-qm', 'ro']);
      await registry.add(join(repo, 'ro'));
      expect((await post('/api/git/pull', { p })).status).toBe(409);
      await writeFile(join(repo, 'ro', 'r.md'), 'r2\n');
      expect((await post('/api/git/commit', { p, message: 'm', files: ['ro/r.md'] })).status).toBe(409);
      expect((await git(['status', '--porcelain'])).out.trim()).toBe('M ro/r.md');
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

test('POST /api/git/reset resets that file only — a name git would read as a glob or as magic', async () => {
  const { mkdtemp, rm, writeFile, readFile, mkdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { Registry } = await import('../src/lib/roots');
  const { Prefs } = await import('../src/lib/prefs');
  const { serve } = await import('../src/server');
  const { run } = await import('../src/lib/gitpage');

  const base = await mkdtemp(join(tmpdir(), 'mdhouse-reset-names-'));
  const repo = join(base, 'repo');
  const files = ['notes[1]/b.md', 'notes1/b.md', ':memo/a.md', 'memo/a.md'];
  for (const f of files) {
    await mkdir(join(repo, f, '..'), { recursive: true });
    await writeFile(join(repo, f), 'v1\n');
  }
  await run(repo, ['init', '-q']);
  await run(repo, ['add', '.']);
  await run(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'first']);
  for (const f of files) await writeFile(join(repo, f), 'edited\n');

  const port = 61901;
  const registry = await Registry.create([{ path: repo, writable: true }]);
  const { server, watcher, control } = await serve({ registry, prefs: await Prefs.load(join(base, 'prefs.json')), port, hostname: '127.0.0.1' });
  const id = registry.list()[0]!.id;
  const reset = async (rel: string) => {
    const p = `${id}/${rel}`;
    const { hash } = (await (await fetch(`http://127.0.0.1:${port}/api/git/diff?p=${encodeURIComponent(p)}`)).json()) as { hash?: string };
    return (await fetch(`http://127.0.0.1:${port}/api/git/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p, hash }) })).status;
  };
  const text = (f: string) => readFile(join(repo, f), 'utf8');
  try {
    expect(await reset('notes[1]/b.md')).toBe(200);
    expect(await reset(':memo/a.md')).toBe(200);
    expect(await Promise.all(files.map(text))).toEqual(['v1\n', 'edited\n', 'v1\n', 'edited\n']);
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
  test('every file with its type: sandboxed except a PDF; HTML runs scripts in an opaque origin; an unknown binary a download; .git never', async () => {
    const { mkdtemp, rm, writeFile, mkdir } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { Registry } = await import('../src/lib/roots');
    const { Prefs } = await import('../src/lib/prefs');
    const { serve } = await import('../src/server');

    const dir = await mkdtemp(join(tmpdir(), 'mdhouse-raw-'));
    for (const f of ['a.html', 'a.css', 'a.txt', 'a.ts', 'a.md', 'a.png', 'a.pdf', 'a.mp4']) await writeFile(join(dir, f), 'x');
    await writeFile(join(dir, 'a.exe'), new Uint8Array([77, 90, 0, 1]));
    await writeFile(join(dir, 'notes'), 'plain words\n');
    await mkdir(join(dir, '.git'));
    await writeFile(join(dir, '.git', 'config'), '[remote "origin"]\n');
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
      const raw = (f: string, route = 'raw') => fetch(`http://127.0.0.1:${port}/api/${route}?p=${root}/${f}`);
      const html = await raw('a.html');
      expect(html.status).toBe(200);
      expect(html.headers.get('content-type')).toStartWith('text/html');
      expect(html.headers.get('content-security-policy')).toBe('sandbox allow-scripts');
      for (const f of ['a.css', 'a.txt', 'a.ts', 'a.md', 'notes']) {
        const r = await raw(f);
        expect(r.status).toBe(200);
        expect(r.headers.get('content-type')).toStartWith('text/plain');
        expect(r.headers.get('content-security-policy')).toBe('sandbox');
      }
      for (const [f, type] of [['a.png', 'image/png'], ['a.mp4', 'video/mp4']] as const) {
        const r = await raw(f);
        expect(r.headers.get('content-type')).toStartWith(type);
        expect(r.headers.get('content-security-policy')).toBe('sandbox');
      }
      const pdf = await raw('a.pdf');
      expect(pdf.headers.get('content-type')).toBe('application/pdf');
      expect(pdf.headers.get('content-security-policy')).toBeNull();
      const exe = await raw('a.exe');
      expect(exe.headers.get('content-type')).toBe('application/octet-stream');
      expect(exe.headers.get('content-disposition')).toStartWith('attachment');
      expect(exe.headers.get('content-security-policy')).toBe('sandbox');
      // `/api/asset` is the old name, for pages rendered before.
      expect((await raw('a.png', 'asset')).headers.get('content-type')).toStartWith('image/png');
      expect((await raw('.git/config')).status).toBe(404);
      expect((await raw('gone.txt')).status).toBe(404);
      expect((await raw('')).status).toBe(404);
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

test('/api/doc answers every kind; code and text by numbered lines; nothing under .git', async () => {
  const { mkdtemp, rm, writeFile, mkdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { Registry } = await import('../src/lib/roots');
  const { Prefs } = await import('../src/lib/prefs');
  const { serve } = await import('../src/server');
  const dir = await mkdtemp(join(tmpdir(), 'mdhouse-docext-'));
  await mkdir(join(dir, '.git'));
  await writeFile(join(dir, '.git', 'config'), '[remote "origin"]\n  url = https://token@example.com/r\n');
  await writeFile(join(dir, 'a.md'), '# a\n');
  await writeFile(join(dir, 'x.ts'), 'const a = 1;\nconst b = 2;\n');
  await writeFile(join(dir, 'creds'), 'secret\n');
  await writeFile(join(dir, 'blob'), new Uint8Array([1, 0, 2]));
  await writeFile(join(dir, 'p.html'), '<p>hi</p>\n');
  for (const f of ['i.png', 'd.pdf', 'v.webm', 's.mp3']) await writeFile(join(dir, f), 'x');
  await writeFile(join(dir, 'big.txt'), 'x'.repeat(5_000_001));
  const port = 61782;
  const registry = await Registry.create([dir]);
  const { server, watcher, control } = await serve({ registry, prefs: await Prefs.load(join(dir, 'prefs.json')), port, hostname: '127.0.0.1', noGit: true });
  const id = registry.list()[0]!.id;
  const doc = (q: string) => fetch(`http://127.0.0.1:${port}/api/doc?${q}`);
  const body = async (f: string) => (await (await doc(`p=${id}/${f}`)).json()) as { kind: string; html: string; raw: string; tooBig?: boolean; url: string };
  try {
    expect((await body('a.md')).kind).toBe('md');
    expect((await doc(`d=/${id}/a.md`)).status).toBe(200);
    const ts = await body('x.ts');
    expect(ts.kind).toBe('code');
    expect(ts.url).toBe(`/${id}/x.ts`);
    expect(ts.raw).toBe(`/api/raw?p=${encodeURIComponent(`${id}/x.ts`)}`);
    expect(ts.html).toContain('id="L2" data-line="2"');
    expect(ts.html).not.toContain('id="L3"');
    expect(ts.html).toContain('--shiki-dark');
    const text = await body('creds');
    expect(text.kind).toBe('text');
    expect(text.html).toContain('<span class="line" id="L1" data-line="1">secret</span>');
    expect((await body('p.html')).html).toContain('id="L1"');
    for (const [f, kind] of [['blob', 'binary'], ['i.png', 'image'], ['d.pdf', 'pdf'], ['v.webm', 'video'], ['s.mp3', 'audio'], ['p.html', 'html']]) {
      expect((await body(f!)).kind).toBe(kind!);
    }
    const big = await body('big.txt');
    expect(big.tooBig).toBe(true);
    expect(big.html).toBe('');
    for (const q of [`p=${id}/.git/config`, `d=/${id}/.git/config`, `p=${id}/gone.md`]) expect((await doc(q)).status).toBe(404);
    // a folder is no document: the answer names its page
    expect(await (await doc(`p=${id}/`)).json()).toEqual({ folder: `/${id}/` });
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

test('/api/doc links a file named in the text when it is a file in the root', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { Registry } = await import('../src/lib/roots');
  const { Prefs } = await import('../src/lib/prefs');
  const { serve } = await import('../src/server');
  const base = await mkdtemp(join(tmpdir(), 'mdhouse-mention-'));
  await Bun.write(join(base, 'a.md'), 'See `notes/b.md`, missing.md and `src/x.ts:3`.\n');
  await Bun.write(join(base, 'notes/b.md'), 'b\n');
  await Bun.write(join(base, 'src/x.ts'), 'x\n');
  const port = 61802;
  const registry = await Registry.create([{ path: base, writable: false }]);
  const { server, watcher, control } = await serve({ registry, prefs: await Prefs.load(join(base, 'prefs.json')), port, hostname: '127.0.0.1', noGit: true });
  const id = registry.list()[0]!.id;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/doc?p=${id}/a.md`);
    expect(res.status).toBe(200);
    const { html } = (await res.json()) as { html: string };
    expect(html).toContain('class="md-local-link md-file-link"><code>notes/b.md</code>');
    expect(html).toContain(`href="/${id}/src/x.ts#L3" class="md-local-link md-file-link"><code>src/x.ts:3</code>`);
    expect(html).toContain('missing.md');
    expect(html).not.toContain('missing.md</a>');
  } finally {
    server.stop(true);
    watcher.close();
    control?.stop();
    await rm(base, { recursive: true, force: true });
  }
});

test('POST /api/roots/remove refuses another site, an unknown root and the last root; a missing file or folder is 404 on read routes', async () => {
  const { mkdtemp, rm, writeFile, mkdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { Registry } = await import('../src/lib/roots');
  const { Prefs } = await import('../src/lib/prefs');
  const { serve } = await import('../src/server');
  const { run } = await import('../src/lib/gitpage');
  const base = await mkdtemp(join(tmpdir(), 'mdhouse-routes-'));
  const repo = join(base, 'repo');
  const other = join(base, 'other');
  await mkdir(join(repo, 'sub'), { recursive: true });
  await mkdir(other);
  await writeFile(join(repo, 'a.md'), 'a\n');
  await writeFile(join(repo, 'sub', 'b.md'), 'b\n');
  await writeFile(join(other, 'c.md'), 'c\n');
  const git = (args: string[]) => run(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
  await git(['init', '-q']);
  await git(['add', '.']);
  await git(['commit', '-qm', 'first']);
  const port = 61932;
  const registry = await Registry.create([repo, other]);
  const { server, watcher, control } = await serve({ registry, prefs: await Prefs.load(join(base, 'prefs.json')), port, hostname: '127.0.0.1' });
  const [id, otherId] = registry.list().map((r) => r.id);
  const get = (path: string) => fetch(`http://127.0.0.1:${port}${path}`);
  const remove = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`http://127.0.0.1:${port}/api/roots/remove`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    for (const q of [`doc?p=${id}/nope.md`, `raw?p=${id}/nope.txt`, `asset?p=${id}/nope.png`]) expect((await get(`/api/${q}`)).status).toBe(404);
    expect(await (await get(`/api/git/diff?p=${id}/nope.md`)).json()).toMatchObject({ kind: 'none', hunks: [] });
    expect(await (await get(`/api/git/log?p=${id}/nope.md`)).json()).toMatchObject({ commits: [] });
    expect(await (await get(`/api/git/files?p=${id}/sub`)).json()).toMatchObject({ files: ['sub/b.md'] });
    expect((await get(`/api/git/files?p=${id}/nope`)).status).toBe(404);
    expect((await get(`/api/git/commits?p=${id}/nope`)).status).toBe(404);
    expect((await get('/api/digest?root=nope')).status).toBe(404);

    expect((await remove({ id: otherId }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await remove({ id: otherId }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await remove({ id: 'nope' })).status).toBe(404);
    expect((await remove({})).status).toBe(404);
    expect(registry.list()).toHaveLength(2);
    expect((await (await remove({ id: otherId })).json()).results).toMatchObject([{ removed: true }]);
    expect((await (await remove({ id })).json()).results).toMatchObject([{ removed: false, kept: true }]);
    expect(registry.list().map((r) => r.id)).toEqual([id!]);
  } finally {
    server.stop(true);
    watcher.close();
    control?.stop();
    await rm(base, { recursive: true, force: true });
  }
});

test('/api/doc on a folder named without its slash gives the folder page\'s address', async () => {
  const { mkdtemp, rm, mkdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { Registry } = await import('../src/lib/roots');
  const { Prefs } = await import('../src/lib/prefs');
  const { serve } = await import('../src/server');
  const base = await mkdtemp(join(tmpdir(), 'mdhouse-folder-'));
  await mkdir(join(base, 'sub'));
  await Bun.write(join(base, 'sub/a.md'), 'a\n');
  const port = 61803;
  const registry = await Registry.create([{ path: base, writable: false }]);
  const { server, watcher, control } = await serve({ registry, prefs: await Prefs.load(join(base, 'prefs.json')), port, hostname: '127.0.0.1', noGit: true });
  const id = registry.list()[0]!.id;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/doc?p=${id}/sub`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ folder: `/${id}/sub/` });
  } finally {
    server.stop(true);
    watcher.close();
    control?.stop();
    await rm(base, { recursive: true, force: true });
  }
});
