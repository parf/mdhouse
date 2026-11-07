/** A document's raw source as the editor holds it, and back — exactly; and the per-document drafts. */

/** The source split for the editor: its lines, the file's own line separator, and its BOM kept aside. */
export interface EditorSource {
  bom: boolean;
  separator: '\n' | '\r\n';
  lines: string[];
}

/**
 * The source ready for the editor, or why it is not edited here. A file whose lines end in one way
 * (LF or CRLF) round-trips exactly; mixed or bare-CR endings are refused, since the editor would
 * save them all one way.
 */
export function forEditor(text: string): EditorSource | { unsupported: string } {
  const bom = text.startsWith('﻿');
  const body = bom ? text.slice(1) : text;
  const crlf = (body.match(/\r\n/g) ?? []).length;
  const cr = (body.match(/\r/g) ?? []).length;
  const lf = (body.match(/\n/g) ?? []).length;
  // every CR starts a CRLF and every LF ends one, or there is no CR at all
  if (cr && (cr !== crlf || lf !== crlf)) return { unsupported: 'This file has mixed line endings — editing it here would change them all.' };
  const separator = crlf ? '\r\n' : '\n';
  return { bom, separator, lines: body.split(separator) };
}

/** The text to save: the editor's text, already joined with the file's separator, with the BOM put back. */
export const fromEditor = (src: EditorSource, text: string): string => (src.bom ? '﻿' : '') + text;

/** A document's unsaved text and the source revision it was started from. */
export interface Draft {
  text: string;
  base: string;
}

const drafts = new Map<string, Draft>();
const key = (p: string) => `mdhouse.edit.${p}`;

/** The draft of document `p` (`root/rel`): this tab's, else the one kept in the browser. */
export function loadDraft(p: string): Draft | null {
  const mine = drafts.get(p);
  if (mine) return mine;
  try {
    const got = JSON.parse(localStorage.getItem(key(p)) ?? 'null') as Partial<Draft> | null;
    if (got && typeof got.text === 'string' && typeof got.base === 'string') return { text: got.text, base: got.base };
  } catch {
    /* unavailable or not ours */
  }
  return null;
}

/** Keeps a draft in this tab, and in the browser when it can — a full or blocked storage loses nothing here. */
export function saveDraft(p: string, d: Draft): void {
  drafts.set(p, d);
  try {
    localStorage.setItem(key(p), JSON.stringify(d));
  } catch {
    /* full or unavailable: this tab still has it */
  }
}

export function dropDraft(p: string): void {
  drafts.delete(p);
  try {
    localStorage.removeItem(key(p));
  } catch {
    /* unavailable */
  }
}
