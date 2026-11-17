import { describe, expect, test } from 'bun:test';
import { parseWiki, resolveWiki, wikiCandidates, wikiIndex, wikiTargets } from '../src/lib/wikilinks';
import { render } from '../src/lib/render';

const FILES = [
  'index.md', 'entities/Ann Lee.md', 'entities/acme.md', 'topics/acme.md', 'topics/rates.mdx',
  'sources/100%.md', 'sources/über.md', 'notes/sub/page.md', 'notes/page.md', 'README.md', 'src/x.ts',
];
const idx = wikiIndex(FILES);

describe('resolveWiki', () => {
  test('relative to the document first, then the root; the extension may be left off', () => {
    expect(resolveWiki(idx, 'notes/sub/doc.md', 'page')).toEqual({ rel: 'notes/sub/page.md' });
    expect(resolveWiki(idx, 'notes/doc.md', 'page')).toEqual({ rel: 'notes/page.md' });
    expect(resolveWiki(idx, 'index.md', 'entities/acme')).toEqual({ rel: 'entities/acme.md' });
    expect(resolveWiki(idx, 'notes/sub/doc.md', '../page.md')).toEqual({ rel: 'notes/page.md' });
    expect(resolveWiki(idx, 'notes/sub/doc.md', '/notes/page')).toEqual({ rel: 'notes/page.md' });
    expect(resolveWiki(idx, 'index.md', 'topics/rates')).toEqual({ rel: 'topics/rates.mdx' });
  });
  test('a bare name is the one page of that name anywhere — exact case, then any; two: ambiguous; none: missing', () => {
    expect(resolveWiki(idx, 'index.md', 'Ann Lee')).toEqual({ rel: 'entities/Ann Lee.md' });
    expect(resolveWiki(idx, 'index.md', 'ann lee')).toEqual({ rel: 'entities/Ann Lee.md' });
    expect(resolveWiki(idx, 'index.md', 'acme')).toEqual({ ambiguous: ['entities/acme.md', 'topics/acme.md'] });
    expect(resolveWiki(idx, 'index.md', 'nope')).toEqual({ missing: true });
    expect(resolveWiki(idx, 'index.md', 'x')).toEqual({ missing: true }); // not Markdown
  });
  test('percent and Unicode are names, not escapes; climbing out of the project is missing', () => {
    expect(resolveWiki(idx, 'index.md', 'sources/100%')).toEqual({ rel: 'sources/100%.md' });
    expect(resolveWiki(idx, 'index.md', 'über')).toEqual({ rel: 'sources/über.md' });
    expect(resolveWiki(idx, 'index.md', '../../etc/passwd')).toEqual({ missing: true });
    expect(resolveWiki(idx, 'index.md', 'nope/../README')).toEqual({ rel: 'README.md' }); // a path, normalized
    expect(resolveWiki(idx, 'index.md', 'gone/acme')).toEqual({ missing: true }); // a path is never a bare name
  });
  test('parse: target, heading, label; empty or bracketed is not a wikilink', () => {
    expect(parseWiki('a/b#Some Head|Label')).toEqual({ target: 'a/b', heading: 'Some Head', label: 'Label' });
    expect(parseWiki('#Only')).toEqual({ target: '', heading: 'Only', label: null });
    expect(parseWiki(' ')).toBeNull();
    expect(parseWiki(' -z "$TMUX" ')).toBeNull(); // shell test syntax
    expect(wikiTargets('[[a]] ![[b]] [[c]](u) `[[d]]` [[e|x]]')).toEqual(['a', 'd', 'e']);
  });
});

describe('render: [[wikilinks]]', () => {
  const ctx = (docPath = 'index.md') => ({
    rootId: 'w',
    docPath,
    docUrl: (rel: string) => `/w/${rel.split('/').map(encodeURIComponent).join('/')}`,
    wiki: async (targets: string[]) => new Map(targets.map((t) => [t, resolveWiki(idx, docPath, t)])),
  });
  const html = async (src: string, docPath?: string) => (await render(src, ctx(docPath))).html;

  test('a found page is a local link, at the heading, with the label', async () => {
    const h = await html('See [[entities/acme#Key Facts|Acme]] and [[Ann Lee]].');
    expect(h).toContain('<a href="/w/entities/acme.md#key-facts" class="md-local-link wikilink">Acme</a>');
    expect(h).toContain('<a href="/w/entities/Ann%20Lee.md" class="md-local-link wikilink">Ann Lee</a>');
    expect(await html('[[#Intro]]', 'notes/page.md')).toContain('href="/w/notes/page.md#intro"');
  });
  test('missing and ambiguous are marked spans that say why — no link, no guess', async () => {
    const h = await html('[[nope]] [[acme]]');
    expect(h).toMatch(/<span class="wikilink wikilink-missing" title="No page “nope” in this project">nope<\/span>/);
    expect(h).toMatch(/class="wikilink wikilink-ambiguous" title="“acme” names 2 pages — write the path: entities\/acme.md, topics\/acme.md">acme</);
    expect(h).not.toContain('href="/w/topics/acme.md"');
  });
  test('code, fences, escapes, embeds and Markdown links stay as they are', async () => {
    const h = await html('`[[index]]`\n\n```\n[[index]]\n```\n\n\\[[index]] ![[index]] [[index]](http://x.test)');
    expect(h).not.toContain('class="md-local-link wikilink"');
    expect(h).toContain('<code>[[index]]</code>');
    expect(h).toContain('href="http://x.test"');
  });
  test('beside attrs, emphasis and a Q&A line; the flag says the document has wikilinks', async () => {
    const r = await render('**[[index]]** text {.note}\n\n**Q:** see [[index|home]]?\n**A:** yes', ctx());
    expect(r.html.match(/class="md-local-link wikilink"/g)?.length).toBe(2);
    expect(r.wikilinks).toBe(true);
    expect((await render('plain [x](y.md)', ctx())).wikilinks).toBe(false);
  });
  test('no resolver (a preview elsewhere): text, unchanged', async () => {
    const r = await render('[[index]]', { rootId: 'w', docPath: 'a.md', docUrl: (x) => `/w/${x}` });
    expect(r.html).toContain('[[index]]');
  });
});

describe('choosing where to go', () => {
  test('owner order: this folder, parent, direct subfolders (done/ and wiki/ first), root, elsewhere', () => {
    const i = wikiIndex([
      'p/d/acme.md', 'p/acme.md', 'p/d/x/acme.md', 'p/d/done/acme.md', 'p/d/wiki/acme.md', 'acme.md',
      'p/d/x/y/acme.md', 'q/acme.md', 'p/d/ACME.md', 'p/d/a-c-me.md',
    ]);
    const got = wikiCandidates(i, 'p/d/doc.md', 'acme').map((c) => `${c.place} ${c.why} ${c.rel}`);
    expect(got).toEqual([
      'same-folder name p/d/acme.md',
      'same-folder any-case p/d/ACME.md',
      'same-folder similar p/d/a-c-me.md',
      'parent name p/acme.md',
      'subfolder name p/d/done/acme.md',
      'subfolder name p/d/wiki/acme.md',
      'subfolder name p/d/x/acme.md',
      'root name acme.md',
      'other name q/acme.md', // elsewhere: shallower first
      'other name p/d/x/y/acme.md',
    ]);
  });
  test('a document at the root: its folder is the root — counted once; no parent', () => {
    const i = wikiIndex(['acme.md', 'wiki/acme.md', 'notes/acme.md', 'a/b/acme.md']);
    expect(wikiCandidates(i, 'index.md', 'acme').map((c) => `${c.place} ${c.rel}`)).toEqual([
      'same-folder acme.md', 'subfolder wiki/acme.md', 'subfolder notes/acme.md', 'other a/b/acme.md',
    ]);
    expect(wikiCandidates(i, 'index.md', 'gone/nothing-like-it')).toEqual([]);
  });
  test('render: with a choosing page, several or none is a real link to it, with the heading', async () => {
    const c = {
      rootId: 'w', docPath: 'index.md', docUrl: (rel: string) => `/w/${rel}`,
      wiki: async (t: string[]) => new Map(t.map((x) => [x, resolveWiki(idx, 'index.md', x)])),
      chooseUrl: (target: string, hash?: string) => `/w/?choose=${encodeURIComponent(target)}&from=index.md${hash ? `#${hash}` : ''}`,
      exists: async (rels: string[]) => new Set(rels.filter((r) => idx.rels.has(r))),
    };
    const h = (await render('[[acme#Plan]] [[nope|N]] [x](gone.md#a) [y](index.md)', c)).html;
    expect(h).toContain('href="/w/?choose=acme&amp;from=index.md#plan" class="md-local-link wikilink wikilink-ambiguous"');
    expect(h).toContain('href="/w/?choose=nope&amp;from=index.md" class="md-local-link wikilink wikilink-missing"');
    expect(h).toContain('href="/w/?choose=gone.md&amp;from=index.md#a" class="md-local-link md-link-missing"');
    expect(h).toContain('href="/w/index.md" class="md-local-link"');
  });
});

describe('a folder moved: found anywhere, places first, the path\'s tail breaks ties', () => {
  // Plans/R3/ moved whole into Plans/done/R3/; task.md also exists elsewhere
  const moved = wikiIndex(['Plans/done/R3/task.md', 'Plans/done/R3/notes/a.md', 'Other/task.md', 'Plans/R4/task.md', 'Plans/done/R2/task.md', 'z/Task.md', 'Plans/done/R3/task-old.md']);
  test('from Plans/README.md: Plans/R3/task.md is gone — done/R3 first among elsewhere (done/ branch, then its tail)', () => {
    expect(resolveWiki(moved, 'Plans/README.md', 'R3/task')).toEqual({ missing: true });
    expect(wikiCandidates(moved, 'Plans/README.md', 'R3/task.md').map((c) => `${c.place} ${c.why} ${c.rel}`)).toEqual([
      'subfolder name Plans/R4/task.md',
      'other name Plans/done/R3/task.md',
      'other name Plans/done/R2/task.md',
      'other name Other/task.md',
      'other any-case z/Task.md',
    ]); // task-old.md: another name, not offered; done/ is not pushed down
  });
  test('from inside the moved folder\'s old place: the moved copy is a subfolder hit or elsewhere, ranked by tail', () => {
    expect(wikiCandidates(moved, 'Plans/R3/notes/a.md', '../task.md')[0]?.rel).toBe('Plans/done/R3/task.md');
  });
  test('ordinary file links keep their type: x.ts finds .ts files only, by the same order', () => {
    const files = wikiIndex(['src/x.ts', 'src/x.md', 'lib/x.ts', 'src/old/x.ts', 'img/a.png'], { anyFile: true });
    expect(wikiCandidates(files, 'src/README.md', 'x.ts', '.ts').map((c) => `${c.place} ${c.rel}`)).toEqual(['same-folder src/x.ts', 'subfolder src/old/x.ts', 'other lib/x.ts']);
    expect(wikiCandidates(files, 'doc.md', 'pics/a.png', '.png').map((c) => c.rel)).toEqual(['img/a.png']);
  });
  test('render: a link into the moved folder, or to a missing image or code file, opens Where to go? with the path and heading', async () => {
    const c = {
      rootId: 'w', docPath: 'Plans/README.md', docUrl: (rel: string) => `/w/${rel}`,
      chooseUrl: (target: string, hash?: string) => `/w/?choose=${encodeURIComponent(target)}${hash ? `#${hash}` : ''}`,
      exists: async (rels: string[]) => new Set(rels.filter((r) => moved.rels.has(r))),
    };
    const h = (await render('[Task](R3/task.md#Plan) [code](../src/x.ts#L3) [dir](R3/)', c)).html;
    expect(h).toContain('href="/w/?choose=R3%2Ftask.md#Plan"');
    expect(h).toContain('href="/w/?choose=..%2Fsrc%2Fx.ts#L3"');
    expect(h).toContain('href="/w/Plans/R3/"');
  });
});
