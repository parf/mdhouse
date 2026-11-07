import { createHash } from 'node:crypto';

/** Most bytes a document's source may have to be edited: the same cap as a page shows. */
export const SOURCE_MAX = 5_000_000;

/** SHA-256 of a document's bytes — what a full-source save confirms. */
export const sourceHash = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

/**
 * A document's source as an editor takes it: its text — strict UTF-8, a BOM kept as `﻿`, so the
 * text encodes back to the same bytes — and the hash of those bytes. `encoding` when the bytes are
 * not UTF-8: nothing is replaced, so nothing is silently changed by a save.
 */
export function sourceOf(bytes: Uint8Array): { text: string; hash: string } | { error: 'encoding' } {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { error: 'encoding' };
  }
  return { text, hash: sourceHash(bytes) };
}
