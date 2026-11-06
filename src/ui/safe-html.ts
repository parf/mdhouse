/**
 * The one place the page turns server HTML into DOM. A document's HTML is the author's: it is passive
 * markup — text, tables, details, images, links, the Q&A the renderer writes — never script, frames,
 * forms, styles or anything that navigates or fetches on its own. DOMPurify parses the HTML as a
 * browser would and keeps an allow-list; nothing here edits the result afterwards.
 */
import DOMPurify from 'dompurify';
import { STYLE } from '../lib/passive-style';

const purify = DOMPurify(window);

/** `style` rebuilt from the declarations the shared list allows (`src/lib/passive-style.ts`), or null when none is. */
function allowedStyle(value: string): string | null {
  const kept: string[] = [];
  for (const decl of value.split(';')) {
    const colon = decl.indexOf(':');
    if (colon < 0) continue;
    const prop = decl.slice(0, colon).trim();
    const raw = decl.slice(colon + 1).trim();
    const important = /\s*!important$/i.test(raw);
    const val = important ? raw.replace(/\s*!important$/i, '') : raw;
    if (Object.hasOwn(STYLE, prop) && STYLE[prop]!.some((re) => re.test(val))) kept.push(`${prop}:${val}${important ? ' !important' : ''}`);
  }
  return kept.length ? kept.join(';') : null;
}

// Each element keeps only the style declarations the list allows, rebuilt from their validated parts.
purify.addHook('afterSanitizeAttributes', (node) => {
  const style = node.getAttribute('style');
  if (style !== null) {
    const kept = allowedStyle(style);
    if (kept === null) node.removeAttribute('style');
    else node.setAttribute('style', kept);
  }
  // A link that opens a new tab never gets the opener or the referrer.
  if (node.tagName === 'A' && node.getAttribute('target') === '_blank') node.setAttribute('rel', 'noopener noreferrer');
});

const CONFIG = {
  USE_PROFILES: { html: true }, // no svg, no mathml
  FORBID_TAGS: ['style', 'form', 'base', 'meta', 'link', 'iframe', 'frame', 'frameset', 'object', 'embed', 'noscript', 'template', 'script'],
  FORBID_ATTR: ['srcdoc', 'formaction', 'form', 'ping', 'autofocus'],
  // The data-* the renderer writes, and no others: what a control acts on, and the token that marks it.
  ADD_ATTR: [
    'target', 'data-line', 'data-hash', 'data-k', 'data-tip', 'data-kind', 'data-sev', 'data-qa',
    'data-act', 'data-act-qa', 'data-act-line', 'data-act-hash', 'data-act-k', 'data-act-sev', 'data-act-opt', 'data-act-reply',
  ],
  ALLOW_DATA_ATTR: false,
};

/** `html` as passive DOM-ready markup. */
export const safeHtml = (html: string): string => purify.sanitize(html, CONFIG) as unknown as string;
