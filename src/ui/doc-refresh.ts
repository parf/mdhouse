/** Separates file metadata updates from replacements of the rendered body and its provenance. */
import type { DocMetadataFields, DocPayload, DocRefreshPayload, RootInfo } from './api';

export interface DocRefreshTicket { generation: number; root: string; rel: string; url: string; contentHash: string | undefined }
export type DocRefreshMerge = { kind: 'ignore' | 'reload' } | { kind: 'update'; doc: DocPayload };

export function docRefreshTicket(doc: DocPayload, generation: number): DocRefreshTicket {
  return { generation, root: doc.root, rel: doc.rel, url: doc.url, contentHash: doc.contentHash };
}
/** A repeated event with the same HEAD/status/state produces the same history dependency. */
export function docMetadataRevision(doc: DocPayload | null): string | null {
  if (!doc || !(doc.gitRevision || doc.status || doc.gitState)) return null;
  return JSON.stringify([doc.gitRevision ?? null, doc.status ?? null, doc.gitState ?? null]);
}
function patchMetadata(current: DocPayload, next: DocMetadataFields): DocPayload {
  const sameMarks = current.marks.length === next.marks.length && current.marks.every((m, i) => m === next.marks[i]);
  if (['raw', 'writable', 'reference', 'mtime', 'size', 'status', 'gitState', 'gitRevision'].every(k => current[k as keyof DocPayload] === next[k as keyof DocMetadataFields]) && sameMarks) return current;
  const { status: _status, gitState: _gitState, reference: _reference, ...body } = current;
  return { ...body, raw: next.raw, writable: next.writable, mtime: next.mtime, size: next.size,
    marks: sameMarks ? current.marks : [...next.marks], gitRevision: next.gitRevision,
    ...(next.status === undefined ? {} : { status: next.status }),
    ...(next.gitState === undefined ? {} : { gitState: next.gitState }),
    ...(next.reference === undefined ? {} : { reference: next.reference }) };
}
/** Ignores stale/scope-mismatched replies; only confirmed unchanged source preserves the body. */
export function mergeDocRefresh(current: DocPayload | null, reply: DocRefreshPayload, ticket: DocRefreshTicket, generation: number): DocRefreshMerge {
  if (!current || generation !== ticket.generation
    || current.root !== ticket.root || current.rel !== ticket.rel || current.url !== ticket.url
    || reply.root !== ticket.root || reply.rel !== ticket.rel || reply.url !== ticket.url) return { kind: 'ignore' };
  if ('meta' in reply || 'unchanged' in reply) {
    if (current.contentHash !== ticket.contentHash) return { kind: 'ignore' };
    if (reply.kind !== current.kind) return { kind: 'reload' };
    if ('unchanged' in reply && (!ticket.contentHash || reply.contentHash !== ticket.contentHash)) return { kind: 'reload' };
    return { kind: 'update', doc: patchMetadata(current, reply) };
  }
  return { kind: 'update', doc: reply };
}

/**
 * May the open document be written now: its project's effective access from the live root list, which every
 * mode change refreshes. Reference material never; a project no longer listed never.
 */
export function liveWritable(doc: Pick<DocPayload, 'root' | 'reference'> | null, root: RootInfo | undefined): boolean {
  return !!doc && !!root && root.id === doc.root && root.writable && root.kind !== 'reference' && !doc.reference;
}
