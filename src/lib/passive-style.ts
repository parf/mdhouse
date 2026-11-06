/**
 * The inline styles passive HTML keeps: property (lower case) → the patterns a value must match.
 * Pure data — the server's `passive()` and the page's own filter share it.
 */

/** A colour, as Shiki and a document write it. */
const COLOR = [/^#[0-9a-f]{3,8}$/i, /^(?:rgb|hsl)a?\(\s*[\d.%\s,/]+\)$/i, /^[a-z]+$/i];
const KEYWORD = [/^[a-z-]+(?:\s+[a-z-]+)*$/i];
const WEIGHT = [/^(?:[a-z]+|\d{3})$/i];

const shiki: Record<string, RegExp[]> = Object.fromEntries(
  ['light', 'dark'].flatMap((theme) => [
    [`--shiki-${theme}`, COLOR],
    [`--shiki-${theme}-bg`, COLOR],
    [`--shiki-${theme}-font-style`, KEYWORD],
    [`--shiki-${theme}-font-weight`, WEIGHT],
    [`--shiki-${theme}-text-decoration`, KEYWORD],
  ]),
);

export const STYLE: Record<string, RegExp[]> = {
  ...shiki,
  'text-align': [/^(?:left|right|center|justify)$/],
  'padding-left': [/^\d+ch$/],
  color: COLOR,
  'background-color': COLOR,
  'font-weight': WEIGHT,
  'font-style': KEYWORD,
  'text-decoration': KEYWORD,
};
