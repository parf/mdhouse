import { Parser } from 'htmlparser2';
import sanitizeHtml from 'sanitize-html';
import { STYLE } from './passive-style';

/**
 * Makes rendered HTML passive: what a document wrote may format, link and show images, never
 * run. Every HTML payload the server sends — a rendered document, a highlighted file, a diff —
 * goes through `passive()`, so a page loaded from an older bundle gets passive HTML too.
 *
 * An allowlist (sanitize-html): the tags and attributes the renderer itself emits, plus passive
 * formatting a document may write. Dropped: scripts, event handlers, frames and `srcdoc`, forms,
 * `<base>`/`<meta>`/`<link>`, `<style>`, SVG and MathML, `javascript:` and every other scheme
 * not listed, protocol-relative URLs, and any inline style outside the property list.
 */

/** Data attributes the renderer writes and the page reads; a document's own `data-*` is dropped. */
const DATA = [
  'data-line', 'data-hash', 'data-k', 'data-tip', 'data-kind', 'data-sev', 'data-qa',
  // a control's provenance and what it acts on — `actToken` in render.ts
  'data-act', 'data-act-qa', 'data-act-line', 'data-act-hash', 'data-act-k', 'data-act-sev', 'data-act-opt', 'data-act-reply',
];

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'img', 'details', 'summary', 'label', 'button', 'input', 'del', 'ins', 'section', 'picture', 'source', 'video', 'audio', 'track',
  ],
  disallowedTagsMode: 'discard',
  // Dropped with everything inside: their content is code, styling or another namespace, not text.
  nonTextTags: [
    'script', 'style', 'template', 'svg', 'math', 'iframe', 'frame', 'frameset', 'object', 'embed',
    'noscript', 'noembed', 'noframes', 'xmp', 'textarea', 'select', 'option', 'title', 'head',
  ],
  allowedAttributes: {
    '*': ['id', 'class', 'title', 'lang', 'dir', 'align', 'role', 'tabindex', 'aria-*', 'style', ...DATA],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'srcset', 'alt', 'width', 'height', 'loading'],
    source: ['src', 'srcset', 'type', 'media'],
    video: ['src', 'poster', 'controls', 'width', 'height', 'loop', 'muted', 'playsinline'],
    audio: ['src', 'controls', 'loop', 'muted'],
    track: ['src', 'kind', 'srclang', 'label', 'default'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan', 'scope'],
    ol: ['start', 'reversed', 'type'],
    li: ['value'],
    details: ['open'],
    input: ['type', 'checked', 'disabled', 'name'],
    button: ['type'],
  },
  allowedStyles: {
    '*': STYLE,
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: {},
  allowProtocolRelative: false,
  allowedSchemesAppliedToAttributes: ['href', 'src', 'srcset', 'cite', 'poster', 'action', 'formaction', 'data', 'xlink:href', 'background', 'ping'],
  transformTags: {
    // A link that opens a tab gets no handle on this page.
    a: (tagName, attribs) =>
      attribs.target ? { tagName, attribs: { ...attribs, rel: 'noopener noreferrer' } } : { tagName, attribs: { ...omit(attribs, 'rel') } },
    // A button never submits anything.
    button: (tagName, attribs) => ({ tagName, attribs: { ...attribs, type: 'button' } }),
  },
  // Only a checkbox or a radio survives as an input: task boxes and Q&A options.
  exclusiveFilter: (frame) => frame.tag === 'input' && frame.attribs.type !== 'checkbox' && frame.attribs.type !== 'radio',
};

function omit(attribs: sanitizeHtml.Attributes, key: string): sanitizeHtml.Attributes {
  const { [key]: _, ...rest } = attribs;
  return rest;
}

export function passive(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}

/** What only the renderer may put on an element: the page's controls are found by these. */
const RENDERER_ONLY = new Set(DATA);

const escAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escText = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * A document's raw HTML fragment with the renderer's `data-*` removed from every start tag, so
 * nothing a document writes carries what the page's controls act on. Every other byte stays as
 * written — classes, text, end tags, comments, a fragment left open for the next one. A trailing
 * tag or comment the fragment does not finish becomes text: joined to the renderer's markup that
 * follows, it could otherwise take that markup's attributes as its own.
 */
export function authored(html: string): string {
  let out = '';
  let at = 0; // copied up to here
  let open = Infinity; // where an unfinished comment starts
  let pending = Infinity; // where a start tag the parser has not finished starts
  const parser = new Parser(
    {
      onopentagname() {
        pending = parser.startIndex;
      },
      onopentag(name, attribs, implied) {
        if (implied) return;
        pending = Infinity;
        const keep = Object.entries(attribs).filter(([k]) => !RENDERER_ONLY.has(k));
        if (keep.length === Object.keys(attribs).length) return;
        const start = parser.startIndex;
        const end = parser.endIndex;
        const selfClosing = html.slice(start, end + 1).endsWith('/>');
        out += html.slice(at, start) + `<${name}${keep.map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('')}${selfClosing ? ' /' : ''}>`;
        at = end + 1;
      },
      oncomment() {
        if (!/--!?>$/.test(html.slice(parser.startIndex, parser.endIndex + 1))) open = Math.min(open, parser.startIndex);
      },
    },
    { decodeEntities: true, lowerCaseAttributeNames: true },
  );
  parser.end(html);
  // Past the last finished token: an unfinished tag (the parser stops before it) or comment.
  const tail = Math.max(at, Math.min(parser.startIndex, open, pending, html.length));
  return out + html.slice(at, tail) + escText(html.slice(tail));
}
