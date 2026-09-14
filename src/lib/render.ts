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

  const html = md.render(src);
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
