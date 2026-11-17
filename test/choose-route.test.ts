import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Registry } from '../src/lib/roots';
import { Prefs } from '../src/lib/prefs';
import { serve } from '../src/server';
import { testPort } from './ports';

test("/api/choose: the project's own pages only — excluded folders and other projects never listed", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdhouse-choose-'));
  const a = join(dir, 'a');
  const b = join(dir, 'b');
  for (const d of ['x', 'y', 'secret']) await mkdir(join(a, d), { recursive: true });
  await mkdir(b);
  await writeFile(join(a, 'x', 'acme.md'), '# x\n');
  await writeFile(join(a, 'y', 'acme.md'), '# y\n');
  await writeFile(join(a, 'secret', 'acme.md'), '# s\n');
  await writeFile(join(a, '.mdhouseignore'), 'secret\n');
  await writeFile(join(b, 'acme.md'), '# other project\n');
  await mkdir(join(a, 'src', 'old'), { recursive: true });
  await writeFile(join(a, 'src', 'old', 'x.ts'), 'export {};\n');
  await writeFile(join(a, 'secret', 'x.ts'), 'export {};\n');
  await writeFile(join(b, 'x.ts'), 'export {};\n');
  const port = testPort(61971);
  const base = `http://127.0.0.1:${port}`;
  const { server, watcher, control } = await serve({ registry: await Registry.create([a, b]), prefs: await Prefs.load(join(dir, 'prefs.json')), port, hostname: '127.0.0.1', noGit: true });
  try {
    const roots = ((await (await fetch(`${base}/api/roots`)).json()) as { roots: Array<{ id: string; path: string }> }).roots;
    const ra = roots.find((r) => r.path === a)!.id;
    const got = (await (await fetch(`${base}/api/choose?root=${ra}&target=acme&from=doc.md`)).json()) as { candidates: Array<{ rel: string; why: string; url: string }>; exact?: unknown };
    expect(got.candidates.map((c) => c.rel)).toEqual(['x/acme.md', 'y/acme.md']);
    expect(got.exact).toBeUndefined();
    expect(got.candidates[0]!.url).toBe(`/${ra}/x/acme.md`);
    const one = (await (await fetch(`${base}/api/choose?root=${ra}&target=acme&from=x/doc.md`)).json()) as { exact?: { rel: string } };
    expect(one.exact?.rel).toBe('x/acme.md');
    // a code file moved: that type only, from every listed file; the excluded folder and the other project still out
    const code = (await (await fetch(`${base}/api/choose?root=${ra}&target=src/x.ts&from=doc.md`)).json()) as { candidates: Array<{ rel: string; place: string }> };
    expect(code.candidates.map((c) => `${c.place} ${c.rel}`)).toEqual(['other src/old/x.ts']);
    expect((await fetch(`${base}/api/choose?root=${ra}&target=`)).status).toBe(400);
    expect((await fetch(`${base}/api/choose?root=nope&target=acme`)).status).toBe(404);
    // the doc page's own links to it
    const doc = (await (await fetch(`${base}/api/doc?p=${ra}/x/acme.md`)).json()) as { html: string };
    expect(doc.html).not.toContain('secret');
  } finally {
    server.stop(true);
    watcher.close();
    control?.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
