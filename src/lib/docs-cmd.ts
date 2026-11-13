/** `mdhouse docs`: where the installed reference lives, and the one line that points a project's AGENTS.md at it. */

/** The start file for an AI, in the reference and on GitHub (for a machine without mdhouse). */
export const START_FILE = 'for-agents.md';
export const GITHUB_RAW = `https://raw.githubusercontent.com/parf/mdhouse/main/agents/${START_FILE}`;

/** The address a client uses for a daemon bound to `host`: a wildcard address is this machine. */
export function clientHost(host: string): string {
  if (host === '0.0.0.0' || host === '::' || host === '') return '127.0.0.1';
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

/** The raw, plain-text URL of the start file on the daemon at `host:port`. */
export const startUrl = (host: string, port: number): string => `http://${clientHost(host)}:${port}/api/raw?p=_mdhouse/${START_FILE}`;

/** The one line an owner pastes into a project's AGENTS.md: the GitHub raw URL works for any AI, with or without mdhouse running. */
export const agentsLine = (): string => `Plans, questions and issues in this project follow mdhouse conventions — fetch and follow ${GITHUB_RAW}`;

/** What `mdhouse docs` prints: the line to paste, then the reference path and the daemon's raw URL for offline use; `pathOnly` is the path alone, for `$(…)`. */
export function docsText(reference: string, host: string, port: number, pathOnly: boolean): string {
  if (pathOnly) return `${reference}\n`;
  return `${agentsLine()}\n\nOffline: the reference is ${reference}\nOn this machine's mdhouse: ${startUrl(host, port)}\n`;
}
