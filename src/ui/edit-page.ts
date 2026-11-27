/** The editor page's address (`<doc>?edit`) and who may open it. */

/** True when the query (`?…`) asks for the editor page. */
export const wantsEdit = (search: string): boolean => new URLSearchParams(search).has('edit');

/** The editor page of a document page `docUrl`. */
export const editPageUrl = (docUrl: string): string => `${docUrl.split(/[?#]/)[0]}?edit`;

/**
 * Whether the editor page opens for a document: Markdown, not reference material, not in Viewer mode,
 * and writable now — or with a draft kept here, opened read-only so the text can be copied.
 */
export function canOpenEditor(doc: { kind: string; reference?: boolean } | null, opts: { writable: boolean; viewer: boolean; draft: boolean }): boolean {
  return !!doc && doc.kind === 'md' && !doc.reference && !opts.viewer && (opts.writable || opts.draft);
}
