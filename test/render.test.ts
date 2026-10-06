import { describe, expect, test } from 'bun:test';
import { questionsAndAnswers, render, splitFrontmatter } from '../src/lib/render';

const ctx = { rootId: 'r', docPath: 'docs/guide.md', docUrl: (rel: string) => `/d/${rel}` };

describe('markdown rendering', () => {
  test('every block carries its source line', async () => {
    const { html } = await render('# One\n\nsecond paragraph\n\n- item\n', ctx);
    expect(html).toContain('<h1 data-line="1"');
    expect(html).toContain('<p data-line="3"');
    expect(html).toContain('<li data-line="5"');
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

  test('relative .md links become in-app routes, assets go through the proxy', async () => {
    const { html } = await render('[x](../other/spec.md) ![i](img/pic.png)', ctx);
    expect(html).toContain('href="/d/other/spec.md"');
    expect(html).toContain('src="/api/asset?p=r%2Fdocs%2Fimg%2Fpic.png"');
  });

  test('an <img> written as HTML gets the same asset URL', async () => {
    // A README that centres its logo with raw HTML is ordinary; the browser would otherwise
    // resolve that path against /d/…, which serves documents, not images.
    const { html } = await render('<p align="center"><img src="../logo.png" width="200"></p>\n', ctx);
    expect(html).toContain('src="/api/asset?p=r%2Flogo.png"');
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
    expect(html).not.toContain('/d/');
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
});

describe('paths that are not plain ASCII', () => {
  // markdown-it hands back a percent-encoded href even when the source wrote a literal space,
  // and every rewrite below re-encodes what it is given. Decoding first is what keeps a space
  // from becoming %2520 and the link from 404ing.
  const encCtx = { ...ctx, docPath: 'index.md' };

  test('a link written with %20 resolves to the file with the space', async () => {
    const { html } = await render('[spaced](My%20Notes/doc.md)', encCtx);
    expect(html).toContain('href="/d/My Notes/doc.md"');
    expect(html).not.toContain('%2520');
  });

  test('a link written with a literal space comes out the same way', async () => {
    const { html } = await render('[spaced](<My Notes/doc.md>)', encCtx);
    expect(html).toContain('href="/d/My Notes/doc.md"');
  });

  test('an image path is decoded once, then encoded once for the asset route', async () => {
    const { html } = await render('![x](My%20Pics/shot.png)', encCtx);
    expect(html).toContain(`src="/api/asset?p=${encodeURIComponent('r/My Pics/shot.png')}"`);
    expect(html).not.toContain('%2520');
  });

  test('a raw-HTML img with a space is rewritten too', async () => {
    const { html } = await render('<p><img src="My Pics/shot.png"></p>', encCtx);
    expect(html).toContain(`src="/api/asset?p=${encodeURIComponent('r/My Pics/shot.png')}"`);
  });

  test('a lone percent is a filename character, not a broken escape', async () => {
    // decodeURIComponent throws on this; the segment has to survive as written.
    const { html } = await render('<p><img src="100% done.png"></p>', encCtx);
    expect(html).toContain(encodeURIComponent('r/100% done.png'));
  });
});

describe('Q: and A:', () => {
  const qa = (html: string) => questionsAndAnswers(html).replace(/<span class="qa"[^>]*>(.)<\/span>/gu, '[$1]');

  test('leading a paragraph, a list item or a line, they become emoji', () => {
    expect(qa('<p data-line="1"><strong>Q:</strong> one?\n<strong>A:</strong> two.</p>')).toBe(
      '<p data-line="1">[❓] one?<br>\n[💬] two.</p>',
    );
    expect(qa('<li><strong>Q:</strong> x</li>')).toBe('<li>[❓] x</li>');
    // An explicit break is kept as it is, not doubled.
    expect(qa('<p>a<br>\n<strong>A:</strong> b</p>')).toBe('<p>a<br>\n[💬] b</p>');
  });

  test('raw HTML: a <pre> is left as written, and no break is added after an opening tag', () => {
    const pre = '<pre>\n<strong>Q:</strong> x</pre>';
    expect(qa(pre)).toBe(pre);
    expect(qa('<details>\n<strong>Q:</strong> x</details>')).toBe('<details>\n<strong>Q:</strong> x</details>');
  });

  test('applying it twice changes nothing more', () => {
    const once = questionsAndAnswers('<p><strong>Q:</strong> a\n<strong>A:</strong> b</p>');
    expect(questionsAndAnswers(once)).toBe(once);
  });

  test('mid-sentence, or any other bold word, is left alone', () => {
    expect(qa('<p>Text with <strong>Q:</strong> mid.</p>')).toBe('<p>Text with <strong>Q:</strong> mid.</p>');
    expect(qa('<p><strong>Note:</strong> x</p>')).toBe('<p><strong>Note:</strong> x</p>');
  });
});
