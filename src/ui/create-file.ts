/** Creating a Markdown file from a document's breadcrumb: the name sent, the folder it goes to, and who is offered it. */

import { MD_EXT } from '../lib/filetypes';

/** The file name sent: trimmed, with `.md` added unless it already ends in a Markdown suffix. Empty when nothing was typed. */
export function newFileName(typed: string): string {
  const name = typed.trim();
  if (!name) return '';
  return MD_EXT.test(name) ? name : `${name}.md`;
}

/** The containing folder of document `rel` in root `root`, in the `p` form: `<root>` for the top level, else `<root>/<dir>`. */
export function newFileDir(root: string, rel: string): string {
  const cut = rel.lastIndexOf('/');
  return cut < 0 ? root : `${root}/${rel.slice(0, cut)}`;
}

/** Whether the breadcrumb offers to create a file: the project is writable now (`liveWritable`) and the page is not in Viewer mode. */
export const canCreateFile = (opts: { writable: boolean; viewer: boolean }): boolean => opts.writable && !opts.viewer;
