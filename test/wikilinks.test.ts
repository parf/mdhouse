import { describe, expect, test } from 'bun:test';
import { parseWiki, resolveWiki, wikiIndex, wikiTargets } from '../src/lib/wikilinks';
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
