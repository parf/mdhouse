/** `mdhouse docs`: where the installed reference lives, and the one line that points a project's AGENTS.md at it. */

/** The start file for an AI, in the reference and on GitHub (for a machine without mdhouse). */
export const START_FILE = 'for-agents.md';
export const GITHUB_RAW = `https://raw.githubusercontent.com/parf/mdhouse/main/doc/${START_FILE}`;

/** The address a client uses for a daemon bound to `host`: a wildcard address is this machine. */
export function clientHost(host: string): string {
  if (host === '0.0.0.0' || host === '::' || host === '') return '127.0.0.1';
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

/** The raw, plain-text URL of the start file on the daemon at `host:port`. */
export const startUrl = (host: string, port: number): string => `http://${clientHost(host)}:${port}/api/raw?p=_mdhouse/${START_FILE}`;

/** The one line an owner pastes into a project's AGENTS.md. */
export const agentsLine = (host: string, port: number): string =>
  `Plans, questions and issues in this project follow mdhouse conventions (how to write plans, which glyphs, which markup): fetch and follow ${startUrl(host, port)} — without mdhouse running: ${GITHUB_RAW}`;

/** What `mdhouse docs` prints: the path first, then the line to paste; `pathOnly` is the path alone, for `$(…)`. */
export function docsText(reference: string, host: string, port: number, pathOnly: boolean): string {
  if (pathOnly) return `${reference}\n`;
  return `${reference}\n\nPaste this line into a project's AGENTS.md:\n\n${agentsLine(host, port)}\n`;
}
