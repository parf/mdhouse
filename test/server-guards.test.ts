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
