import { describe, expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmodSync, readFileSync, statSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashPassword } from '../src/lib/access';
import { Prefs } from '../src/lib/prefs';
import { Registry } from '../src/lib/roots';
import { serve } from '../src/server';

const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const enc = (s: string) => new TextEncoder().encode(s);
const bytes = (path: string) => new Uint8Array(readFileSync(path));

// Raw sources a save must keep byte for byte: CRLF, a BOM, no final newline, a legacy Q&A form
// (convertLegacy would rewrite `> ? Who?` / `> A:`), mixed endings, a real U+FFFD.
const SAMPLES: Record<string, Uint8Array<ArrayBuffer>> = {
  'crlf.md': enc('# CRLF\r\n\r\n- [ ] one\r\n'),
  'bom.md': new Uint8Array([0xef, 0xbb, 0xbf, ...enc('# BOM\n')]),
  'nofinal.md': enc('# no final newline'),
  'legacy.md': enc('# Legacy\n\n> ? Who?\n> A: nobody\n'),
  'mixed.md': enc('a\r\nb\nc\r\n'),
  'fffd.md': enc('# kept � here\n'),
};

/** A server over a writable project `rw`, a read-only project `ro` and the reference root `_ref`. */
async function start(port: number) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-src-')));
  const rw = join(dir, 'rw');
  const ro = join(dir, 'ro');
  const ref = join(dir, 'ref');
  const outside = join(dir, 'outside');
  for (const d of [rw, ro, ref, outside, join(rw, 'sub'), join(rw, '.git')]) await mkdir(d, { recursive: true });
  for (const [name, b] of Object.entries(SAMPLES)) await writeFile(join(rw, name), b);
  await writeFile(join(rw, 'bad.md'), new Uint8Array([0x23, 0x20, 0xc3, 0x28, 0x0a])); // invalid UTF-8
  await writeFile(join(rw, 'a.txt'), 'text\n');
  await writeFile(join(rw, '.git', 'x.md'), '# git\n');
  await writeFile(join(rw, 'task.md'), '# Tasks\n\n- [ ] one\n');
  await writeFile(join(outside, 'secret.md'), '# secret\n');
  await symlink(join(outside, 'secret.md'), join(rw, 'escape.md'));
  await writeFile(join(ro, 'r.md'), '# ro\n');
  await writeFile(join(ref, 'guide.md'), '# guide\n');
  await chmod(join(rw, 'crlf.md'), 0o640);
  const prefs = await Prefs.load(join(dir, 'prefs.json'));
  const registry = await Registry.create([rw, ro]);
  const rwId = registry.list().find((r) => r.path === rw)!.id;
  const roId = registry.list().find((r) => r.path === ro)!.id;
  registry.setMode(rwId, 'rw');
  registry.setMode(roId, 'ro');
  await registry.addReference(ref, '_ref');
  const s = await serve({ registry, prefs, port, hostname: '127.0.0.1', noGit: true });
  const origin = `http://127.0.0.1:${port}`;
  const get = (p: string, headers: Record<string, string> = {}) => fetch(`${origin}/api/source?p=${encodeURIComponent(p)}`, { headers });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${origin}/api/source`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const at = (name: string) => join(rw, name);
  const stop = async () => {
    s.server.stop(true);
    s.watcher.close();
    s.control?.stop();
    chmodSync(rw, 0o700);
    await rm(dir, { recursive: true, force: true });
  };
  return { ...s, dir, rw, ro, ref, prefs, registry, rwId, roId, origin, get, post, at, stop };
}

describe('lib/source', () => {
  test('a snapshot: SHA-256 of the bytes; strict UTF-8 that keeps a BOM and a real U+FFFD; invalid bytes refused', async () => {
    const { sourceOf, sourceHash, SOURCE_MAX } = await import('../src/lib/source');
    expect(SOURCE_MAX).toBe(5_000_000);
    for (const b of Object.values(SAMPLES)) {
      const got = sourceOf(b);
      expect(got).toEqual({ text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(b), hash: sha(b) });
      if ('text' in got) expect(enc(got.text)).toEqual(b);
      expect(sourceHash(b)).toBe(sha(b));
    }
    expect(sourceOf(SAMPLES['bom.md']!)).toMatchObject({ text: '﻿# BOM\n' });
    expect(sourceOf(new Uint8Array([0xc3, 0x28]))).toEqual({ error: 'encoding' });
    expect(sourceOf(new Uint8Array([0xed, 0xa0, 0x80]))).toEqual({ error: 'encoding' }); // a surrogate
  });
});

describe('GET /api/source', () => {
  test('one snapshot of the raw bytes: text, hash, writable, no-store; no legacy conversion', async () => {
    const t = await start(61811);
    try {
      for (const [name, b] of Object.entries(SAMPLES)) {
        const res = await t.get(`${t.rwId}/${name}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toContain('no-store');
        const got = (await res.json()) as { text: string; hash: string; writable: boolean };
        expect(got).toEqual({ text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(b), hash: sha(b), writable: true });
        expect(enc(got.text)).toEqual(b);
      }
      expect(await (await t.get(`${t.roId}/r.md`)).json()).toMatchObject({ writable: false });
      expect(await (await t.get('_ref/guide.md')).json()).toMatchObject({ writable: false, reference: true });
    } finally {
      await t.stop();
    }
  });

  test('refused: folder, non-Markdown, missing, .git, ../ and symlink escapes → 404; invalid UTF-8 → 422; over 5,000,000 bytes → 413', async () => {
    const t = await start(61812);
    try {
      for (const p of [`${t.rwId}/sub`, `${t.rwId}/a.txt`, `${t.rwId}/none.md`, `${t.rwId}/.git/x.md`, `${t.rwId}/../outside/secret.md`, `${t.rwId}/escape.md`, 'nope/a.md', '']) {
        const res = await t.get(p);
        expect([p, res.status]).toEqual([p, 404]);
        expect(await res.text()).not.toContain('secret');
      }
      const bad = await t.get(`${t.rwId}/bad.md`);
      expect([bad.status, ((await bad.json()) as { reason?: string }).reason]).toEqual([422, 'encoding']);
      await writeFile(t.at('big.md'), new Uint8Array(5_000_001).fill(0x61));
      expect((await t.get(`${t.rwId}/big.md`)).status).toBe(413);
      await writeFile(t.at('edge.md'), new Uint8Array(5_000_000).fill(0x61));
      expect((await t.get(`${t.rwId}/edge.md`)).status).toBe(200);
    } finally {
      await t.stop();
    }
  });
});

describe('POST /api/source', () => {
  test('saves the text verbatim — CRLF, BOM, no final newline, legacy forms, mixed endings — keeps the mode, answers the new hash', async () => {
    const t = await start(61813);
    try {
      for (const [name, b] of Object.entries(SAMPLES)) {
        const before = (await (await t.get(`${t.rwId}/${name}`)).json()) as { text: string; hash: string };
        const text = `${before.text}\r\n> ? Still legacy\n> A: kept`;
        const res = await t.post({ p: `${t.rwId}/${name}`, hash: sha(b), text });
        expect([name, res.status]).toEqual([name, 200]);
        expect(bytes(t.at(name))).toEqual(enc(text));
        expect(await res.json()).toEqual({ hash: sha(enc(text)) });
      }
      expect(statSync(t.at('crlf.md')).mode & 0o777).toBe(0o640);
    } finally {
      await t.stop();
    }
  });

  test('refusals write nothing: shape/extra/hash/lone surrogate 400, cross-origin 403, 404s, read-only and reference 403, 413', async () => {
    const t = await start(61814);
    try {
      const p = `${t.rwId}/crlf.md`;
      const hash = sha(SAMPLES['crlf.md']!);
      const cases: Array<[unknown, Record<string, string>, number]> = [
        ['not json', {}, 400],
        [null, {}, 400],
        [{ p, hash }, {}, 400],
        [{ p, text: 'x' }, {}, 400],
        [{ hash, text: 'x' }, {}, 400],
        [{ p, hash, text: 'x', extra: 1 }, {}, 400],
        [{ p, hash, text: 'x', line: 1 }, {}, 400],
        [{ p, hash: 'abc', text: 'x' }, {}, 400],
        [{ p, hash: hash.toUpperCase(), text: 'x' }, {}, 400],
        [{ p, hash, text: 5 }, {}, 400],
        [{ p: 5, hash, text: 'x' }, {}, 400],
        [`{"p":${JSON.stringify(p)},"hash":"${hash}","text":"a\\ud800b"}`, {}, 400],
        [{ p, hash, text: 'x' }, { origin: 'http://evil.example' }, 403],
        [{ p, hash, text: 'x' }, { 'sec-fetch-site': 'cross-site' }, 403],
        [{ p: `${t.rwId}/sub`, hash, text: 'x' }, {}, 404],
        [{ p: `${t.rwId}/a.txt`, hash, text: 'x' }, {}, 404],
        [{ p: `${t.rwId}/none.md`, hash, text: 'x' }, {}, 404],
        [{ p: `${t.rwId}/.git/x.md`, hash, text: 'x' }, {}, 404],
        [{ p: `${t.rwId}/../outside/secret.md`, hash, text: 'x' }, {}, 404],
        [{ p: `${t.rwId}/escape.md`, hash, text: 'x' }, {}, 404],
        [{ p: `${t.roId}/r.md`, hash: sha('# ro\n'), text: 'x' }, {}, 403],
        [{ p: `${t.roId}/r.md`, hash: '0'.repeat(64), text: 'x' }, {}, 403], // read-only before stale
        [{ p: '_ref/guide.md', hash: '0'.repeat(64), text: 'x' }, {}, 403],
        [{ p: '_ref/guide.md', hash: sha('# guide\n'), text: 'x' }, {}, 403],
        [{ p, hash, text: 'a'.repeat(5_000_001) }, {}, 413],
        [{ p, hash, text: 'é'.repeat(2_500_001) }, {}, 413], // UTF-8 bytes, not characters
      ];
      const files = ['crlf.md', '.git/x.md', 'a.txt'].map(t.at).concat([join(t.ro, 'r.md'), join(t.ref, 'guide.md'), join(t.dir, 'outside', 'secret.md')]);
      const before = files.map(bytes);
      for (const [body, headers, status] of cases) {
        const res = await t.post(body, headers);
        expect([JSON.stringify(body).slice(0, 80), res.status]).toEqual([JSON.stringify(body).slice(0, 80), status]);
      }
      expect(files.map(bytes)).toEqual(before);
    } finally {
      await t.stop();
    }
  });

  test('stale: a changed file is 409 with the reason only, the bytes on disk stay', async () => {
    const t = await start(61815);
    try {
      const p = `${t.rwId}/crlf.md`;
      const old = sha(SAMPLES['crlf.md']!);
      await writeFile(t.at('crlf.md'), '# changed elsewhere\n');
      const res = await t.post({ p, hash: old, text: 'my draft' });
      expect(res.status).toBe(409);
      const body = (await res.json()) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['error', 'reason']);
      expect(body.reason).toBe('stale');
      expect(JSON.stringify(body)).not.toContain('changed elsewhere');
      expect(readFileSync(t.at('crlf.md'), 'utf8')).toBe('# changed elsewhere\n');
    } finally {
      await t.stop();
    }
  });

  test('concurrency: two saves from one snapshot — one wins, one is stale; a queued task tick and a save — no lost update', async () => {
    const t = await start(61816);
    try {
      const p = `${t.rwId}/crlf.md`;
      const base = sha(SAMPLES['crlf.md']!);
      const [a, b] = await Promise.all([t.post({ p, hash: base, text: 'A' }), t.post({ p, hash: base, text: 'B' })]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(readFileSync(t.at('crlf.md'), 'utf8')).toBe(a.status === 200 ? 'A' : 'B');

      const tp = `${t.rwId}/task.md`;
      const snap = (await (await t.get(tp)).json()) as { text: string; hash: string };
      const doc = (await (await fetch(`${t.origin}/api/doc?p=${encodeURIComponent(tp)}`)).json()) as { html: string };
      const hash = /data-act-hash="([0-9a-f]+)"/.exec(doc.html)?.[1] ?? '';
      const line = Number(/data-act-line="(\d+)"/.exec(doc.html)?.[1]);
      const [tick, save] = await Promise.all([
        fetch(`${t.origin}/api/task`, { method: 'POST', headers: { 'content-type': 'application/json', origin: t.origin }, body: JSON.stringify({ p: tp, line, hash }) }),
        t.post({ p: tp, hash: snap.hash, text: `${snap.text}- [ ] two\n` }),
      ]);
      const after = readFileSync(t.at('task.md'), 'utf8');
      // whichever ran first, the other saw a changed file and wrote nothing
      expect([tick.status, save.status].sort()).toEqual([200, 409]);
      expect(after).toBe(tick.status === 200 ? '# Tasks\n\n- [x] one\n' : '# Tasks\n\n- [ ] one\n- [ ] two\n');
    } finally {
      await t.stop();
    }
  });

  test('the final write rechecks: a root set read-only after the first check is 403 and the file stays', async () => {
    const t = await start(61817);
    try {
      const p = `${t.rwId}/crlf.md`;
      const resolve = t.registry.resolve.bind(t.registry);
      let calls = 0;
      // the route's own check passes; the root turns read-only before the write
      const spy = spyOn(t.registry, 'resolve').mockImplementation(async (q: string) => {
        if (q === p && ++calls === 2) t.registry.setMode(t.rwId, 'ro');
        return resolve(q);
      });
      const res = await t.post({ p, hash: sha(SAMPLES['crlf.md']!), text: 'x' });
      spy.mockRestore();
      expect(res.status).toBe(403);
      expect(bytes(t.at('crlf.md'))).toEqual(SAMPLES['crlf.md']!);
    } finally {
      await t.stop();
    }
  });

  test('an IO failure is a generic 500; the atomic writer keeps the old bytes and mode', async () => {
    const t = await start(61818);
    const logs = spyOn(console, 'error').mockImplementation(() => {});
    try {
      chmodSync(t.rw, 0o500);
      const res = await t.post({ p: `${t.rwId}/crlf.md`, hash: sha(SAMPLES['crlf.md']!), text: 'x' });
      chmodSync(t.rw, 0o700);
      expect(res.status).toBe(500);
      expect(await res.text()).not.toContain(t.dir);
      expect(bytes(t.at('crlf.md'))).toEqual(SAMPLES['crlf.md']!);
      expect(statSync(t.at('crlf.md')).mode & 0o777).toBe(0o640);
    } finally {
      logs.mockRestore();
      await t.stop();
    }
  });

  test('admission unchanged: with a user configured, GET and POST ask for a login', async () => {
    const t = await start(61819);
    try {
      await t.prefs.setUser('ann', await hashPassword('s3cret'));
      expect((await t.get(`${t.rwId}/crlf.md`)).status).toBe(401);
      expect((await t.post({ p: `${t.rwId}/crlf.md`, hash: sha(SAMPLES['crlf.md']!), text: 'x' })).status).toBe(401);
      expect(bytes(t.at('crlf.md'))).toEqual(SAMPLES['crlf.md']!);
      const auth = { authorization: `Basic ${btoa('ann:s3cret')}` };
      expect((await t.get(`${t.rwId}/crlf.md`, auth)).status).toBe(200);
    } finally {
      await t.stop();
    }
  });
});
