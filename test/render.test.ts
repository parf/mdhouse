import { describe, expect, test } from 'bun:test';
import { lineHash, render, splitFrontmatter, toggleTask } from '../src/lib/render';
import { parseQa } from '../src/lib/qa';

const ctx = { rootId: 'r', docPath: 'docs/guide.md', docUrl: (rel: string) => `/r/${rel}` };

describe('markdown rendering', () => {
  test('a backslash at the end of a line or before a space is a line break, not in code', async () => {
    const { html } = await render('one\\\ntwo \\ three `a\\ b`\n\n> ❓ q \\\n> more\n', ctx);
    expect(html).toContain('one<br>');
    expect(html).toContain('two <br>\nthree');
    expect(html).toContain('<code>a\\ b</code>');
    expect(html).toMatch(/q <br>\s*more/);
  });

  test('every block carries its source line', async () => {
    const { html } = await render('# One\n\nsecond paragraph\n\n- item\n', ctx);
    expect(html).toContain('<h1 data-line="1"');
    expect(html).toContain('<p data-line="3"');
    expect(html).toContain('<li data-line="5"');
  });

  test('a fence is highlighted up to a size; a bigger one is plain', async () => {
    expect((await render('```json\n{"a": 1}\n```\n', ctx)).html).toContain('class="shiki shiki-themes');
    const big = `{"a": "${'x'.repeat(100_001)}"}`;
    expect((await render(`\`\`\`json\n${big}\n\`\`\`\n`, ctx)).html.startsWith('<pre class="shiki plain"><code>{&quot;a&quot;')).toBe(true);
  });

  test('GitHub alerts become markdown-alert blocks', async () => {
    const { html } = await render('> [!WARNING]\n> Do not merge.\n', ctx);
    expect(html).toContain('markdown-alert markdown-alert-warning');
    expect(html).toContain('<p class="markdown-alert-title">Warning</p>');
    expect(html).toContain('Do not merge.');
    expect(html).not.toContain('[!WARNING]');
  });

  test('task lists become real checkboxes and are counted', async () => {
    const { html, tasks } = await render('- [ ] open\n- [x] done\n', ctx);
    expect(tasks).toEqual({ done: 1, total: 2 });
    expect(html).toContain('type="checkbox" disabled data-line="1"');
    expect(html).toContain('checked data-line="2"');
  });

  test('nested lists keep all their levels', async () => {
    const { html } = await render('- outer\n  - inner\n    - deepest\n', ctx);
    expect(html.match(/<ul/g)?.length).toBe(3);
  });

  test('a wrapped blockquote stays one blockquote', async () => {
    const { html } = await render('> line one\n> line two\n', ctx);
    expect(html.match(/<blockquote/g)?.length).toBe(1);
    expect(html).toContain('line two');
  });

  test('a relative link opens the file page — any file, an image too; an image shows its bytes', async () => {
    const { html } = await render('[x](../other/spec.md) ![i](img/pic.png) [c](../src/cli.ts#L5) [l](img/pic.png) [d](sub/)', ctx);
    expect(html).toContain('href="/r/src/cli.ts#L5"');
    expect(html).toContain('href="/r/docs/img/pic.png"');
    expect(html).toContain('href="/r/docs/sub/"');
    expect(html).toContain('href="/r/other/spec.md"');
    expect(html).toContain('src="/api/raw?p=r%2Fdocs%2Fimg%2Fpic.png"');
  });

  test('an <img> written as HTML gets the same asset URL', async () => {
    // A README that centres its logo with raw HTML is ordinary; the browser would otherwise
    // resolve that path against the page's address, which is a page, not the bytes.
    const { html } = await render('<p align="center"><img src="../logo.png" width="200"></p>\n', ctx);
    expect(html).toContain('src="/api/raw?p=r%2Flogo.png"');
    expect(html).toContain('width="200"');
  });

  test('an external or absolute <img> is left alone', async () => {
    const { html } = await render('<img src="https://example.com/x.png"><img src="/api/asset?p=r%2Fy.png">\n', ctx);
    expect(html).toContain('src="https://example.com/x.png"');
    expect(html).toContain('src="/api/asset?p=r%2Fy.png"');
  });

  test('external links open in a new tab, safely', async () => {
    const { html } = await render('[site](https://example.com)', ctx);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test('a link that escapes the root is left alone', async () => {
    const { html } = await render('[up](../../../etc/passwd.md)', { ...ctx, docPath: 'a.md' });
    expect(html).not.toContain('/r/');
  });

  test('mermaid is detected and passed through for the client', async () => {
    const { html, hasMermaid } = await render('```mermaid\ngraph TD; A-->B;\n```\n', ctx);
    expect(hasMermaid).toBe(true);
    expect(html).toContain('<pre class="mermaid">');
    expect(html).toContain('A--&gt;B');
  });

  test('headings get one stable slug, reused by the ToC', async () => {
    const { headings, html } = await render('## Ключ парцели\n', ctx);
    expect(headings).toHaveLength(1);
    expect(headings[0]!.slug).toBe('ключ-парцели');
    expect(html).toContain('id="ключ-парцели"');
  });

  test('tables keep alignment and inline HTML in cells', async () => {
    const { html } = await render('| a | b |\n| --- | ---: |\n| `x` | <small>y</small> |\n', ctx);
    expect(html).toContain('style="text-align:right"');
    expect(html).toContain('<small>y</small>');
  });
});

describe('frontmatter', () => {
  test('is split off and the body line offset reported', () => {
    const { frontmatter, body, offset } = splitFrontmatter('---\ntitle: x\n---\n# Head\n');
    expect(frontmatter).toBe('title: x');
    expect(body).toBe('# Head\n');
    expect(offset).toBe(3);
  });

  test('a document without it is untouched', () => {
    const { frontmatter, body, offset } = splitFrontmatter('# Head\n');
    expect(frontmatter).toBeNull();
    expect(body).toBe('# Head\n');
    expect(offset).toBe(0);
  });

  test('YAML only: a key right after `---`, closed by `---` or `...`; a rule that opens a doc stays a rule', () => {
    const none = (src: string) => expect(splitFrontmatter(src)).toEqual({ frontmatter: null, body: src, offset: 0 });
    none('---\n\nIntro paragraph.\n\n---\n# Title\n');
    none('---\nJust text\n---\n');
    none('----\nfoo: 1\n---\nbody');
    none('---\nfoo: 1\n---x\nbody');
    expect(splitFrontmatter('---\ntitle: x\ntags: [a]\n...\n# T\n')).toEqual({ frontmatter: 'title: x\ntags: [a]', body: '# T\n', offset: 4 });
    expect(splitFrontmatter('---\r\ntitle: x\r\n---\r\n# T\r\n')).toEqual({ frontmatter: 'title: x\r', body: '# T\r\n', offset: 3 });
    expect(splitFrontmatter('---\ntitle: x\n---')).toEqual({ frontmatter: 'title: x', body: '', offset: 3 });
  });
});

describe('paths that are not plain ASCII', () => {
  // markdown-it hands back a percent-encoded href even when the source wrote a literal space,
  // and every rewrite below re-encodes what it is given. Decoding first is what keeps a space
  // from becoming %2520 and the link from 404ing.
  const encCtx = { ...ctx, docPath: 'index.md' };

  test('a link written with %20 resolves to the file with the space', async () => {
    const { html } = await render('[spaced](My%20Notes/doc.md)', encCtx);
    expect(html).toContain('href="/r/My Notes/doc.md"');
    expect(html).not.toContain('%2520');
  });

  test('a link written with a literal space comes out the same way', async () => {
    const { html } = await render('[spaced](<My Notes/doc.md>)', encCtx);
    expect(html).toContain('href="/r/My Notes/doc.md"');
  });

  test('an image path is decoded once, then encoded once for the asset route', async () => {
    const { html } = await render('![x](My%20Pics/shot.png)', encCtx);
    expect(html).toContain(`src="/api/raw?p=${encodeURIComponent('r/My Pics/shot.png')}"`);
    expect(html).not.toContain('%2520');
  });

  test('a raw-HTML img with a space is rewritten too', async () => {
    const { html } = await render('<p><img src="My Pics/shot.png"></p>', encCtx);
    expect(html).toContain(`src="/api/raw?p=${encodeURIComponent('r/My Pics/shot.png')}"`);
  });

  test('an encoded slash names no file: the link is left as written', async () => {
    const { html } = await render('[x](..%2F..%2Fetc%2Fpasswd) [y](a%2Fb.md) [z](%2E%2E/up.md)', encCtx);
    expect(html).toContain('<a href="..%2F..%2Fetc%2Fpasswd">x</a>');
    expect(html).toContain('<a href="a%2Fb.md">y</a>');
    expect(html).toContain('<a href="%2E%2E/up.md">z</a>');
  });

  test('a lone percent is a filename character, not a broken escape', async () => {
    // decodeURIComponent throws on this; the segment has to survive as written.
    const { html } = await render('<p><img src="100% done.png"></p>', encCtx);
    expect(html).toContain(encodeURIComponent('r/100% done.png'));
  });
});

describe('toggleTask — ticking a task in the document', () => {
  const tick = (src: string, line: number, text: string) => toggleTask(src, line, lineHash(text));

  test('flips one bracket and keeps every other byte', () => {
    const src = '# T\n\n- [ ] one\n- [x] two\n';
    expect(tick(src, 3, '- [ ] one')).toEqual({ src: '# T\n\n- [x] one\n- [x] two\n', checked: true });
    expect(tick(src, 4, '- [x] two')).toEqual({ src: '# T\n\n- [ ] one\n- [ ] two\n', checked: false });
    expect(tick('- [X] up\n', 1, '- [X] up')).toEqual({ src: '- [ ] up\n', checked: false });
  });

  test('CRLF files stay CRLF', () => {
    expect(tick('- [ ] a\r\n- [ ] b\r\n', 2, '- [ ] b')).toEqual({ src: '- [ ] a\r\n- [x] b\r\n', checked: true });
  });

  test('nested, numbered and quoted items', () => {
    expect(tick('- a\n  - [ ] deep\n', 2, '  - [ ] deep')).toMatchObject({ checked: true });
    expect(tick('3. [ ] third\n', 1, '3. [ ] third')).toMatchObject({ src: '3. [x] third\n' });
    expect(tick('> - [ ] quoted\n', 1, '> - [ ] quoted')).toMatchObject({ src: '> - [x] quoted\n' });
  });

  test('front matter is counted back in: data-line is the line within the body', () => {
    const src = '---\ntitle: x\n---\n- [ ] after\n';
    expect(tick(src, 1, '- [ ] after')).toEqual({ src: '---\ntitle: x\n---\n- [x] after\n', checked: true });
  });

  test('a page older than the file is refused, not applied to whatever is there now', () => {
    expect(tick('- [x] one\n', 1, '- [ ] one')).toEqual({ error: 'stale' }); // ticked elsewhere since
    expect(tick('- [ ] new line\n- [ ] one\n', 1, '- [ ] one')).toEqual({ error: 'stale' }); // shifted
    expect(tick('- [ ] one\n', 9, '- [ ] one')).toEqual({ error: 'stale' });
    expect(tick('- [ ] one\n', 0, '- [ ] one')).toEqual({ error: 'stale' });
  });

  test('a line that is no longer a task item is refused', () => {
    expect(tick('plain text\n', 1, 'plain text')).toEqual({ error: 'not-a-task' });
  });

  test('the rendered checkbox carries the hash toggleTask expects', async () => {
    const { html } = await render('- [ ] one\n- [x] two\n', ctx);
    expect(html).toContain(`data-line="1" data-hash="${lineHash('- [ ] one')}"`);
    expect(html).toContain(`data-line="2" data-hash="${lineHash('- [x] two')}"`);
  });
});

describe('alerts', () => {
  test('IMPORTANT, WARNING and CAUTION get a title row', async () => {
    for (const kind of ['important', 'warning', 'caution']) {
      const { html } = await render(`> [!${kind.toUpperCase()}]\n> body\n`, ctx);
      expect(html).toContain(`markdown-alert markdown-alert-${kind}`);
      expect(html).toContain(`<p class="markdown-alert-title">${kind[0]!.toUpperCase()}${kind.slice(1)}</p>`);
    }
  });

  test('NOTE and TIP are one line too', async () => {
    const { html } = await render('> [!NOTE]\n> Read this.\n\n> [!TIP] Inline.\n', ctx);
    expect(html).toContain('class="markdown-alert markdown-alert-note" role="note" aria-label="Note"');
    expect(html).toContain('class="markdown-alert markdown-alert-tip" role="note" aria-label="Tip"');
    expect(html).not.toContain('markdown-alert-title');
  });

  test('a quote inside an alert closes inside it; the alert holds its tail', async () => {
    const { html } = await render('> [!NOTE]\n> text\n> > nested\n>\n> tail\n', ctx);
    expect(html.replace(/ data-line="\d+"/g, '')).toContain('<blockquote>\n<p>nested</p>\n</blockquote>\n<p>tail</p>\n</div>');
  });

  test('an unknown marker stays a plain quote', async () => {
    expect((await render('> [!BOGUS]\n> x\n', ctx)).html).toContain('<blockquote');
  });
});

describe('Q&A items', () => {
  test('the old forms are plain Markdown now (convertLegacy rewrites them on load)', async () => {
    const { html } = await render('**Q:** bold\n\n> [!QUESTION]\n> q\n\n::: q\nx\n:::\n\n> ? q\n', ctx);
    expect(html).toContain('<strong>Q:</strong> bold');
    expect(html).toContain('<blockquote');
    expect(html).toContain('::: q');
    expect(html).not.toContain('data-qa');
  });

  test('an item carries its line, the fingerprint the server checks, and what the strip filters on', async () => {
    const src = '# T\n\n- ❓ Keep it?\n  > 💬👾 maybe\n- 🎯 🔴 D1 `a.ts:1` lost\n  Evidence: ran it\n';
    const { html } = await render(src, ctx);
    const items = parseQa(src, 0).items;
    expect(html).toContain(`<li class="item wait-me" data-qa="item" data-line="3" data-hash="${items[0]!.hash}" data-k="❓ open">`);
    expect(html).toContain(`data-line="5" data-hash="${items[1]!.hash}" data-k="🔴 open 🎯" data-sev="🔴" id="D1"`);
    expect(html).toContain('<a class="iid" href="#D1">D1</a>');
    expect(html).toContain('<span class="meta">Evidence: ran it</span>');
    expect(html).toContain('<div class="reply" data-line="4"><span class="who" data-kind="agent">👾</span>');
  });

  test('settled and answered items fold; 🔵 a note is closed', async () => {
    const { html } = await render('- ✅ done\n  > 💬 👤parf yes\n\n- ❓ q\n  > 💬 👤parf a\n\n- 🔵 not reviewed\n', ctx);
    expect(html.match(/<details class="settled">/g)).toHaveLength(3);
    expect(html).toContain('g-answered');
    expect(html).toContain('class="item settled info"');
  });

  test('options are radios / checkboxes with their lines, not counted as tasks; a plain [ ] still is', async () => {
    const { html, tasks } = await render('- ❓ Port:\n  - ( ) 7790 🌟\n  - [x] more\n- [ ] plain\n', ctx);
    expect(html).toContain('<div class="c-wrap" data-line="2"><div class="c-row"><label class="opt"><input type="radio"');
    expect(html).toContain('🌟 suggested');
    expect(tasks).toEqual({ done: 0, total: 1 });
  });

  test('a quote item, and a thread with no question over it', async () => {
    const { html } = await render('> ❓ quote q\n> 💬 a\n\n> 💬 loose\n', ctx);
    expect(html).toContain('<ul class="items qa-quote"><li class="item settled" data-qa="quote" data-line="1"');
    expect(html).toContain('<div class="thread loose" data-line="4">');
  });

  test('badges in text, never in code; links in replies render as links', async () => {
    const { html } = await render('- ❓ ask 👥backend `👤x`\n  > 💬 see [a](a.md)\n', ctx);
    expect(html).toContain('<span class="who" data-kind="team">👥backend</span>');
    expect(html).toContain('<code>👤x</code>');
    expect(html).toContain('href="/r/docs/a.md"');
  });
});

describe('curly braces (B3)', () => {
  test('a {word} is text; {#id .class key=value} after a block are its attributes', async () => {
    const html = async (s: string) => (await render(s, ctx)).html;
    expect(await html('GET /users/{id}\n')).toContain('>GET /users/{id}</p>');
    expect(await html('- Template: {placeholder}\n')).toContain('Template: {placeholder}');
    expect(await html('| a |\n|---|\n| {x} |\n')).toContain('<td>{x}</td>');
    expect(await html('a {b} c {d}\n')).toContain('a {b} c {d}');
    expect(await html('# Title {#custom .big}\n')).toContain('<h1 id="custom" class="big"');
    expect(await html('para {.note}\n')).toContain('<p class="note"');
  });
});

describe('file names in the text are links to the files', () => {
  const have = new Set(['CHANGELOG.md', 'Plans/README.md', 'src/server.ts', 'docs/other.md', 'doc/logo.png']);
  const fctx = { ...ctx, exists: async (rels: string[]) => new Set(rels.filter((r) => have.has(r))) };
  const html = async (s: string) => (await render(s, fctx)).html;

  test('a code span that is a path, a word with a / or a .md name — when the file exists', async () => {
    const out = await html('See CHANGELOG.md, `Plans/README.md`, `src/server.ts:557`, other.md and doc/logo.png.\n');
    expect(out).toContain('<a href="/r/CHANGELOG.md" class="md-local-link md-file-link">CHANGELOG.md</a>');
    expect(out).toContain('<a href="/r/Plans/README.md" class="md-local-link md-file-link"><code>Plans/README.md</code></a>');
    expect(out).toContain('<a href="/r/src/server.ts#L557" class="md-local-link md-file-link"><code>src/server.ts:557</code></a>');
    expect(out).toContain('<a href="/r/docs/other.md" class="md-local-link md-file-link">other.md</a>');
    expect(out).toContain('<a href="/r/doc/logo.png" class="md-local-link md-file-link">doc/logo.png</a>');
  });

  test('not a file, inside a link, in a code block: left as written', async () => {
    const out = await html('missing.md `nope.md` [CHANGELOG.md](https://x.io) e.g. v1.5.0\n\n```\nCHANGELOG.md\n```\n');
    expect(out).toContain('missing.md <code>nope.md</code> <a href="https://x.io"');
    expect(out).toContain('<code>CHANGELOG.md\n</code>');
  });

  test('a name is never taken for a domain (.md, .py, .sh); a real one still is', async () => {
    const out = await html('setup.py run.sh github.com/parf/mdhouse www.example.com\n');
    expect(out).toContain('<p data-line="1">setup.py run.sh <a href="http://github.com/parf/mdhouse"');
    expect(out).toContain('href="http://www.example.com"');
  });
});
