/**
 * Markdown -> HTML.
 *
 * markdown-it was chosen for one structural reason: every block token carries
 * `token.map = [startLine, endLine]`. A core rule copies that onto the rendered element as
 * `data-line`, so every paragraph, list item and checkbox in the DOM knows which source line
 * it came from. Phase 1 does not consume it, but it is what makes checkbox write-back,
 * "push this section to Claude" and editor scroll-sync cheap later instead of a
 * reverse-engineering exercise.
 *
 * The r-doc viewer this replaces has two competing anchor schemes (`header-N` from PHP and
 * slugs from JS). There is exactly one here, generated server-side.
 */

import MarkdownIt from 'markdown-it';
import type { PluginWithOptions } from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import attrs from 'markdown-it-attrs';
import type { DiffHunk } from './git';
import { createHighlighter, bundledLanguages, type Highlighter } from 'shiki';

export interface RenderContext {
  /** Root id the document lives in, for building asset and raw-file URLs. */
  rootId: string;
  /** Root-relative path of the document being rendered. */
  docPath: string;
  /** Root-relative path -> browser URL (`/d/<path>/<file>.md`). Supplied by the registry. */
  docUrl: (rel: string) => string;
}

export interface Heading {
  level: number;
  text: string;
  slug: string;
  line: number;
}

export interface Rendered {
  html: string;
  headings: Heading[];
  /** Rendered content contains at least one mermaid block — client loads mermaid lazily. */
  hasMermaid: boolean;
  /** Checkbox counts, for the progress badge in the tree. */
  tasks: { done: number; total: number };
}

const ALERTS = ['note', 'tip', 'important', 'warning', 'caution'] as const;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const MD_EXT = /\.mdx?$/i;
const PRELOAD_LANGS = ['bash', 'json', 'ts', 'js', 'tsx', 'php', 'sql', 'yaml', 'go', 'python', 'diff', 'html', 'css', 'md'];

let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>(PRELOAD_LANGS);

function highlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    themes: ['github-light', 'github-dark'],
    langs: PRELOAD_LANGS,
  });
  return highlighterPromise;
}

/**
 * markdown-it's `highlight` hook is synchronous but shiki loads grammars asynchronously, so
 * every language used by this document is loaded before rendering starts.
 */
async function preloadLanguages(src: string): Promise<void> {
  const wanted = new Set<string>();
  for (const m of src.matchAll(/^[ \t]*(?:```|~~~)[ \t]*([A-Za-z0-9_+#-]+)/gm)) {
    const lang = m[1]!.toLowerCase();
    if (!loadedLangs.has(lang) && lang in bundledLanguages) wanted.add(lang);
  }
  if (!wanted.size) return;

  const hl = await highlighter();
  await Promise.all(
    [...wanted].map(async (lang) => {
      await hl.loadLanguage(lang as keyof typeof bundledLanguages).catch(() => {});
      loadedLangs.add(lang);
    }),
  );
}

function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

/** Resolve a link relative to the document, keeping the result inside the root. */
function resolveRelative(docPath: string, href: string): string | null {
  const docDir = docPath.includes('/') ? docPath.slice(0, docPath.lastIndexOf('/')) : '';
  const stack = docDir ? docDir.split('/') : [];

  for (const seg of href.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (!stack.length) return null; // escapes the root — leave the link alone
      stack.pop();
    } else stack.push(seg);
  }
  return stack.join('/');
}

function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');
}

/** Copy every block token's source line onto the rendered element. */
function lineMapPlugin(md: MarkdownIt): void {
  md.core.ruler.push('mdhouse_line_map', (state) => {
    for (const token of state.tokens) applyLine(token);
  });

  function applyLine(token: Token): void {
    if (token.map && token.type.endsWith('_open')) token.attrSet('data-line', String(token.map[0] + 1));
    if (token.type === 'fence' || token.type === 'code_block') {
      if (token.map) token.attrSet('data-line', String(token.map[0] + 1));
    }
    if (token.children) for (const child of token.children) applyLine(child);
  }
}

/**
 * GitHub alerts: `> [!NOTE]` and the quoted lines under it.
 *
 * The class names match the r-doc viewer's contract (`markdown-alert-note`), so its theme CSS
 * ports across unchanged.
 */
function alertPlugin(md: MarkdownIt): void {
  md.core.ruler.after('block', 'mdhouse_alerts', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length - 2; i++) {
      if (tokens[i]!.type !== 'blockquote_open') continue;
      const inline = tokens[i + 2];
      if (tokens[i + 1]?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;

      const match = /^\[!(note|tip|important|warning|caution)\]\s*\n?/i.exec(inline.content);
      if (!match) continue;
      const kind = match[1]!.toLowerCase() as (typeof ALERTS)[number];

      const open = tokens[i]!;
      open.tag = 'div';
      open.attrSet('class', `markdown-alert markdown-alert-${kind}`);
      const close = tokens.findIndex((t, n) => n > i && t.type === 'blockquote_close');
      if (close !== -1) tokens[close]!.tag = 'div';

      // Strip the marker and turn the first paragraph into the alert's title.
      inline.content = inline.content.slice(match[0].length);
      if (inline.children?.length) {
        const first = inline.children[0]!;
        if (first.type === 'text') first.content = first.content.replace(/^\[!\w+\]\s*/i, '');
        if (inline.children[1]?.type === 'softbreak') inline.children.splice(0, 2);
      }

      const titleToken = new state.Token('html_block', '', 0);
      titleToken.content = `<p class="markdown-alert-title">${kind[0]!.toUpperCase()}${kind.slice(1)}</p>\n`;
      tokens.splice(i + 1, 0, titleToken);

      // If the marker line was the whole paragraph, drop the now-empty paragraph.
      if (inline.content.trim() === '') tokens.splice(i + 2, 3);
      i += 2;
    }
  });
}

/**
 * Task list items become real checkboxes carrying their source line. They are rendered
 * disabled here; the client re-enables them only for a writable root.
 */
function taskListPlugin(md: MarkdownIt, counts: { done: number; total: number }): void {
  md.core.ruler.after('mdhouse_alerts', 'mdhouse_tasks', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length - 2; i++) {
      if (tokens[i]!.type !== 'list_item_open') continue;
      const inline = tokens[i + 2];
      if (tokens[i + 1]?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;

      const match = /^\[([ xX])\]\s+/.exec(inline.content);
      if (!match) continue;

      const done = match[1]!.toLowerCase() === 'x';
      counts.total++;
      if (done) counts.done++;

      const line = tokens[i]!.map ? tokens[i]!.map![0] + 1 : 0;
      tokens[i]!.attrJoin('class', 'task-item');
      inline.content = inline.content.slice(match[0].length);
      if (inline.children?.length && inline.children[0]!.type === 'text') {
        inline.children[0]!.content = inline.children[0]!.content.replace(/^\[[ xX]\]\s+/, '');
      }

      const box = new state.Token('html_inline', '', 0);
      box.content =
        `<input class="task-checkbox" type="checkbox" disabled` +
        `${done ? ' checked' : ''} data-line="${line}">`;
      inline.children?.unshift(box);
      i += 2;
    }
  });
}

/** Rewrite relative links and images to in-app routes and the asset proxy. */
function linkPlugin(md: MarkdownIt, ctx: RenderContext): void {
  const defaultLink =
    md.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    const href = token.attrGet('href');

    if (href && !isExternal(href) && !href.startsWith('#') && !href.startsWith('/')) {
      const [pathPart, hash] = href.split('#');
      const target = pathPart ? resolveRelative(ctx.docPath, pathPart) : null;

      if (target) {
        const p = `${ctx.rootId}/${target}`;
        if (MD_EXT.test(target)) token.attrSet('href', `${ctx.docUrl(target)}${hash ? `#${hash}` : ''}`);
        else if (IMAGE_EXT.test(target)) token.attrSet('href', `/api/asset?p=${encodeURIComponent(p)}`);
        else token.attrSet('href', `/api/raw?p=${encodeURIComponent(p)}`);
        token.attrJoin('class', 'md-local-link');
      }
    } else if (href && isExternal(href)) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
      token.attrJoin('class', 'md-external-link');
    }

    return defaultLink(tokens, idx, options, env, self);
  };

  const defaultImage =
    md.renderer.rules.image ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    const src = token.attrGet('src');
    if (src && !isExternal(src) && !src.startsWith('/')) {
      const target = resolveRelative(ctx.docPath, src);
      if (target) token.attrSet('src', `/api/asset?p=${encodeURIComponent(`${ctx.rootId}/${target}`)}`);
    }
    token.attrSet('loading', 'lazy');
    return defaultImage(tokens, idx, options, env, self);
  };
}

/**
 * Rewrite `src` on raw-HTML `<img>` tags, which markdown-it passes through untouched.
 *
 * A README that centres its logo with `<p align="center"><img src="doc/logo.png"></p>` is
 * ordinary on GitHub, and without this the picture is a broken icon here: the browser resolves
 * that path against `/d/…`, which is a document route, not the asset proxy. The Markdown image
 * syntax is handled by the renderer rule above; this is the same rewrite for the tags written
 * by hand.
 */
function rewriteHtmlImages(html: string, ctx: RenderContext): string {
  return html.replace(/(<img\b[^>]*?\bsrc=)(["'])([^"']+)\2/gi, (whole, head, quote, src: string) => {
    if (isExternal(src) || src.startsWith('/') || src.startsWith('data:')) return whole;
    const target = resolveRelative(ctx.docPath, src);
    if (!target) return whole;
    return `${head}${quote}/api/asset?p=${encodeURIComponent(`${ctx.rootId}/${target}`)}${quote}`;
  });
}

export async function render(src: string, ctx: RenderContext): Promise<Rendered> {
  await preloadLanguages(src);
  const hl = await highlighter();

  const headings: Heading[] = [];
  const tasks = { done: 0, total: 0 };
  let hasMermaid = false;

  const md: MarkdownIt = new MarkdownIt({
    html: true, // docs are trusted; --sanitize mode is applied by the caller
    linkify: true,
    breaks: false,
    highlight(code: string, lang: string): string {
      const language = lang.toLowerCase().split(/[\s{]/)[0] ?? '';

      // Mermaid is rendered in the browser; hand the source through untouched.
      if (language === 'mermaid') {
        hasMermaid = true;
        return `<pre class="mermaid">${md.utils.escapeHtml(code)}</pre>`;
      }

      if (language && loadedLangs.has(language)) {
        try {
          return hl.codeToHtml(code, {
            lang: language,
            themes: { light: 'github-light', dark: 'github-dark' },
            defaultColor: false,
          });
        } catch {
          /* fall through to plain rendering */
        }
      }
      return `<pre class="shiki plain"><code>${md.utils.escapeHtml(code)}</code></pre>`;
    },
  });

  md.use(lineMapPlugin);
  md.use(alertPlugin);
  md.use(taskListPlugin, tasks);
  // markdown-it-attrs ships its own (older) @types/markdown-it, so its declared plugin type
  // does not line up with ours. The runtime contract is a plain markdown-it plugin.
  md.use(attrs as unknown as PluginWithOptions<{ allowedAttributes: string[] }>, {
    allowedAttributes: ['id', 'class'],
  });
  md.use(footnote);
  md.use(anchor, {
    slugify,
    permalink: anchor.permalink.linkInsideHeader({ symbol: '#', placement: 'after', class: 'header-anchor' }),
    callback(token: Token, info: { title: string; slug: string }) {
      headings.push({
        level: Number(token.tag.slice(1)),
        text: info.title,
        slug: info.slug,
        line: token.map ? token.map[0] + 1 : 0,
      });
    },
  });
  md.use(linkPlugin, ctx);

  const html = rewriteHtmlImages(md.render(src), ctx);
  return { html, headings, hasMermaid, tasks };
}

/** Front matter is not parsed as Markdown; strip it and report it separately. */
export function splitFrontmatter(src: string): { frontmatter: string | null; body: string; offset: number } {
  if (!src.startsWith('---')) return { frontmatter: null, body: src, offset: 0 };
  const end = src.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: null, body: src, offset: 0 };

  const stop = src.indexOf('\n', end + 1);
  const head = src.slice(src.indexOf('\n') + 1, end);
  const body = stop === -1 ? '' : src.slice(stop + 1);
  return { frontmatter: head, body, offset: src.slice(0, stop + 1).split('\n').length - 1 };
}

/* ── patch lines, with their markdown applied ────────────────────────────── */

/**
 * A patch of a Markdown file is still Markdown, and reading `**bold**` and `[text](url)` as
 * source is a needless tax on someone who came to see what a document says. The diff view
 * keeps its gutters and its `+`/`-` column — those are the patch — and renders the line
 * content instead of printing it.
 *
 * Inline only, one line at a time: a patch row is a line, not a block, and a line pulled out
 * of its list or its table cannot be parsed as one anyway. What block context there is comes
 * from the line's own prefix — `##`, `-`, `>` — which is kept, muted, so the source shape is
 * still visible beside its rendering.
 */
const inlineMd = new MarkdownIt({ html: false, linkify: false });

// A link in a patch row is decoration, not navigation: a relative href would not resolve from
// here, and nothing in a diff view should be clickable into somewhere else.
inlineMd.renderer.rules.link_open = () => '<span class="md-link">';
inlineMd.renderer.rules.link_close = () => '</span>';
// An image would blow the row height up; its alt text says what it was.
inlineMd.renderer.rules.image = (tokens, idx) =>
  `<span class="md-img">🖼 ${escapeHtml(tokens[idx]!.content)}</span>`;

const escapeHtml = (s: string): string => inlineMd.utils.escapeHtml(s);

const FENCE = /^[ \t]*(?:```|~~~)/;

/** Render one patch line. `raw` is for lines inside a fenced code block, which stay as typed. */
export function markupLine(text: string, raw = false): string {
  const indent = /^[ \t]*/.exec(text)![0]!;
  const rest = text.slice(indent.length);
  const pad = indent.replace(/\t/g, '    ').length;
  const style = pad ? ` style="padding-left:${pad}ch"` : '';
  const wrap = (cls: string, body: string) => `<span class="dl${cls ? ` ${cls}` : ''}"${style}>${body || '&nbsp;'}</span>`;
  const mark = (s: string) => `<span class="mk">${escapeHtml(s)}</span>`;

  if (raw) return wrap('dl-code', escapeHtml(rest));

  const heading = /^(#{1,6})([ \t]+)(.*)$/.exec(rest);
  if (heading) {
    return wrap(`dl-h dl-h${Math.min(heading[1]!.length, 3)}`, mark(heading[1]! + heading[2]!) + inlineMd.renderInline(heading[3]!));
  }

  const quote = /^(>[ \t]?)(.*)$/.exec(rest);
  if (quote) return wrap('dl-q', mark(quote[1]!) + inlineMd.renderInline(quote[2]!));

  const item = /^([-*+]|\d+[.)])([ \t]+)(.*)$/.exec(rest);
  if (item) {
    const task = /^\[([ xX])\][ \t]+(.*)$/.exec(item[3]!);
    const marker = mark(item[1]! + item[2]!);
    if (task) {
      const done = task[1] !== ' ';
      return wrap(
        `dl-li${done ? ' dl-done' : ''}`,
        `${marker}<span class="tick">${done ? '☑' : '☐'}</span> ${inlineMd.renderInline(task[2]!)}`,
      );
    }
    return wrap('dl-li', marker + inlineMd.renderInline(item[3]!));
  }

  if (/^([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(rest)) return wrap('dl-rule', escapeHtml(rest));

  return wrap('', inlineMd.renderInline(rest));
}

/**
 * Render every line of a patch.
 *
 * Fence tracking is per hunk and best-effort: a hunk starts wherever git chose to start it, so
 * a document whose code fence opened above the hunk is read as prose. Getting that right would
 * mean parsing the whole file for the sake of a handful of rows.
 */
export function markupHunks(hunks: DiffHunk[]): DiffHunk[] {
  return hunks.map((hunk) => {
    let fenced = false;
    return {
      ...hunk,
      lines: hunk.lines.map((line) => {
        const fence = FENCE.test(line.text);
        const html = markupLine(line.text, fenced || fence);
        if (fence) fenced = !fenced;
        return { ...line, html };
      }),
    };
  });
}
