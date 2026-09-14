import { describe, expect, test } from 'bun:test';
import { render, splitFrontmatter } from '../src/lib/render';

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

  test('nested lists survive — the r-doc parser loses these', async () => {
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
