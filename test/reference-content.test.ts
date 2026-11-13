import { describe, expect, test } from 'bun:test';
import { existsSync, lstatSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { render } from '../src/lib/render';

const root = resolve(import.meta.dir, '..');
const doc = join(root, 'agents');
const skills = join(doc, 'skills');

async function run(args: string[], cwd = root): Promise<string> {
  const child = Bun.spawn(args, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  if (code !== 0) throw new Error(`${args[0]} exited ${code}: ${stderr}`);
  return stdout;
}

const files = (dir: string, pattern = '**/*') => [...new Bun.Glob(pattern).scanSync({ cwd: dir, onlyFiles: true })].sort();

describe('shareable skills live in agents/skills', () => {
  test('.claude/skills is a committed symlink to ../agents/skills', async () => {
    const link = join(root, '.claude/skills');
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toBe('../agents/skills');
    expect((await run(['git', 'ls-files', '-s', '.claude/skills'])).split(/\s/)[0]).toBe('120000');
  });

  test('every skill reads the same bytes through .claude/skills', () => {
    const list = files(skills);
    expect(list).toContain('markup.md');
    expect(list).toContain('ask-questions/SKILL.md');
    expect(files(join(root, '.claude/skills'))).toEqual(list);
    for (const f of list) expect(readFileSync(join(root, '.claude/skills', f))).toEqual(readFileSync(join(skills, f)));
  });
});

/** Every local link of every agents/**\/*.md, rendered with agents/ as the root, names a file and anchor inside it. */
describe('reference links stay inside the reference root', () => {
  const ctx = (docPath: string) => ({
    rootId: 'ref',
    docPath,
    docUrl: (rel: string) => `/ref/${rel}`,
    exists: async (rels: string[]) => new Set(rels.filter((r) => existsSync(join(doc, r)))),
  });
  const ids = new Map<string, Set<string>>();
  const idsOf = async (rel: string) => {
    if (!ids.has(rel)) {
      const html = (await render(readFileSync(join(doc, rel), 'utf8'), ctx(rel))).html;
      ids.set(rel, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!)));
    }
    return ids.get(rel)!;
  };

  for (const rel of files(doc, '**/*.md')) {
    test(rel, async () => {
      const html = (await render(readFileSync(join(doc, rel), 'utf8'), ctx(rel))).html;
      const bad: string[] = [];
      const all = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
      bad.push(...all.filter((id, i) => all.indexOf(id) !== i).map((id) => `duplicate id ${id}`));
      for (const [, href] of html.matchAll(/<a [^>]*href="([^"]+)"/g)) {
        if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href!)) continue;
        const local = /^\/ref\/([^#]*)(?:#(.*))?$/.exec(href!);
        const [target, hash] = href!.startsWith('#') ? [rel, href!.slice(1)] : local ? [decodeURI(local[1]!), local[2]] : [null, null];
        if (target === null) bad.push(`${href} leaves the root`);
        else if (!existsSync(join(doc, target))) bad.push(`${href} missing`);
        else if (hash && statSync(join(doc, target)).isFile() && target.endsWith('.md') && !(await idsOf(target)).has(decodeURIComponent(hash)))
          bad.push(`${href} no anchor`);
      }
      expect(bad).toEqual([]);
    });
  }
});

test('the npm artifact ships the skills byte for byte, and no .claude', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mdhouse-reference-'));
  try {
    const [packed] = JSON.parse(await run(['npm', 'pack', '--json', '--ignore-scripts', '--pack-destination', dir])) as { filename: string }[];
    const archive = join(dir, packed!.filename);
    const entries = (await run(['tar', '-tzf', archive])).trim().split('\n');
    expect(entries.filter((e) => e.startsWith('package/.claude'))).toEqual([]);
    await run(['tar', '-xzf', archive, '-C', dir]);
    const shipped = join(dir, 'package/agents');
    expect(files(join(shipped, 'skills'))).toEqual(files(skills));
    for (const f of files(skills)) expect(readFileSync(join(shipped, 'skills', f))).toEqual(readFileSync(join(skills, f)));
    for (const f of files(doc, '*.md')) expect(readFileSync(join(shipped, f))).toEqual(readFileSync(join(doc, f)));
    expect(relative(shipped, join(shipped, 'skills/markup.md'))).toBe('skills/markup.md');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);
