import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Prefs } from '../src/lib/prefs';
import { Registry } from '../src/lib/roots';
import { serve } from '../src/server';
import { testPort } from './ports';

/** A server over a writable project `rw`, a read-only project `ro` and the reference root `_ref`. */
async function start(port: number) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-preview-')));
  const rw = join(dir, 'rw');
  const ro = join(dir, 'ro');
  const ref = join(dir, 'ref');
  const outside = join(dir, 'outside');
  for (const d of [rw, ro, ref, outside, join(rw, 'sub'), join(rw, '.git')]) await mkdir(d, { recursive: true });
  await writeFile(join(rw, 'sub', 'doc.md'), '# On disk\n');
  await writeFile(join(rw, 'task.md'), '# Task\n');
  await writeFile(join(rw, 'sub', 'pic.png'), 'png');
  await writeFile(join(rw, 'a.txt'), 'text\n');
  await writeFile(join(rw, '.git', 'x.md'), '# git\n');
  await writeFile(join(outside, 'secret.md'), '# secret\n');
  await symlink(join(outside, 'secret.md'), join(rw, 'escape.md'));
  await writeFile(join(ro, 'r.md'), '# ro\n');
  await writeFile(join(ref, 'guide.md'), '# guide\n');
  const prefs = await Prefs.load(join(dir, 'prefs.json'));
  const registry = await Registry.create([rw, ro]);
  const rwId = registry.list().find((r) => r.path === rw)!.id;
  const roId = registry.list().find((r) => r.path === ro)!.id;
  registry.setMode(rwId, 'rw');
  registry.setMode(roId, 'ro');
  await registry.addReference(ref, '_ref');
  const s = await serve({ registry, prefs, port, hostname: '127.0.0.1', noGit: true });
  const origin = `http://127.0.0.1:${port}`;
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${origin}/api/preview`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const stop = async () => {
    s.server.stop(true);
    s.watcher.close();
    s.control?.stop();
    await rm(dir, { recursive: true, force: true });
  };
  return { origin, rw, rwId, roId, post, stop };
}

describe('POST /api/preview', () => {
  test('renders unsaved text as the document would render, from its own folder, with no controls', async () => {
    const w = await start(testPort(61800));
    try {
      const text = [
        '﻿---',
        'title: Draft',
        '---',
        '# Draft heading',
        '',
        '- [ ] a task',
        '',
        'See [task](../task.md), [[task]] and ![pic](pic.png).',
        '',
        '| a | b |',
        '|---|---|',
        '| 1 | 2 |',
        '',
        '```mermaid',
        'graph TD; A-->B',
        '```',
        '',
        '- ❓ Is it rendered?',
        '  > 💬 It is.',
        '',
      ].join('\r\n');
      const r = await w.post({ p: `${w.rwId}/sub/doc.md`, text });
      expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toContain('no-store');
      const got = await r.json();
      expect(Object.keys(got).sort()).toEqual(['hasMermaid', 'html']);
      expect(got.hasMermaid).toBe(true);
      // front matter is not shown, as on the document page
      expect(got.html).not.toContain('title: Draft');
      expect(got.html).toContain('Draft heading');
      expect(got.html).toContain('<table');
      expect(got.html).toContain(`href="/${w.rwId}/task.md"`);
      expect(got.html).toContain(`href="/${w.rwId}/task.md" class="md-local-link wikilink"`);
      expect(got.html).toContain(`src="/api/raw?p=${w.rwId}%2Fsub%2Fpic.png"`);
      expect(got.html).toContain('task-checkbox');
      expect(got.html).toContain('data-qa="item"');
      expect(got.html).not.toContain('data-act');
      // the file is not touched
      expect(await readFile(join(w.rw, 'sub', 'doc.md'), 'utf8')).toBe('# On disk\n');
    } finally {
      await w.stop();
    }
  });

  test('authored HTML stays passive: no script, no handler, no forged control metadata', async () => {
    const w = await start(testPort(61801));
    try {
      const text = [
        '# Hostile',
        '',
        '<script>alert(1)</script>',
        '<img src=x onerror="alert(2)">',
        '<button class="accept" data-act="x" data-act-qa="1" data-act-line="1" data-act-hash="abc">✓ accept</button>',
        '<a href="javascript:alert(3)">js</a>',
        '',
      ].join('\n');
      const got = await (await w.post({ p: `${w.rwId}/sub/doc.md`, text })).json();
      expect(got.html).not.toMatch(/<script/i);
      expect(got.html).not.toMatch(/onerror/i);
      expect(got.html).not.toContain('data-act');
      expect(got.html).not.toMatch(/href="javascript:/i);
    } finally {
      await w.stop();
    }
  });

  test('refusals: method, origin, body shape, size, and every path that is not a readable document', async () => {
    const w = await start(testPort(61802));
    try {
      const p = `${w.rwId}/sub/doc.md`;
      expect((await fetch(`${w.origin}/api/preview?p=${encodeURIComponent(p)}`)).status).toBe(405);
      expect((await w.post({ p, text: '# x' }, { origin: 'http://evil.example' })).status).toBe(403);
      for (const bad of [{ p }, { text: '# x' }, { p, text: '# x', hash: 'a' }, { p, text: 1 }, { p: '', text: '' }, [p, '# x'], 'not json', { p, text: '\uD800' }]) {
        expect([JSON.stringify(bad), (await w.post(bad)).status]).toEqual([JSON.stringify(bad), 400]);
      }
      expect((await w.post({ p, text: 'x'.repeat(5_000_001) })).status).toBe(413);
      for (const at of [`${w.rwId}/a.txt`, `${w.rwId}/.git/x.md`, `${w.rwId}/escape.md`, `${w.rwId}/../outside/secret.md`, `${w.rwId}/missing.md`, `${w.rwId}/sub`, 'nope/doc.md']) {
        const r = await w.post({ p: at, text: '# x' });
        expect([at, r.status]).toEqual([at, 404]);
      }
    } finally {
      await w.stop();
    }
  });

  test('a read-only project and the reference root may be previewed — reading is enough', async () => {
    const w = await start(testPort(61803));
    try {
      for (const p of [`${w.roId}/r.md`, '_ref/guide.md']) {
        const r = await w.post({ p, text: '# Preview' });
        expect([p, r.status]).toEqual([p, 200]);
        expect((await r.json()).html).toContain('Preview');
      }
    } finally {
      await w.stop();
    }
  });
});
