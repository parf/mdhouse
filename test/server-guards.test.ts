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
