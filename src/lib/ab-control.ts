/**
 * Agent Bus control: the requests other agents send to mdhouse on topic `mdhouse.ctl`.
 *
 * Two ops, both reads: `inventory` names the roots and the connected browser tabs; `open` sends one
 * tab to one Markdown document. Nothing here writes a tree, a setting, a user or a grant. Every
 * request is checked against the sender rule on its own; a document path goes through the
 * registry's jail. A reply is always one JSON object, an error included.
 */

import { stat } from 'node:fs/promises';
import { inGitDir, MD_EXT } from './filetypes';
import type { Registry } from './roots';

export const CTL_TOPIC = 'mdhouse.ctl';
export const CTL_VERSION = 1;
/** Larger bodies are refused before parsing. */
export const CTL_MAX_BODY = 4096;
/** Replies kept for a repeated `requestId`, and for how long. */
export const CTL_REPLAY_KEPT = 500;
export const CTL_REPLAY_MS = 10 * 60_000;

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const CLIENT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ROOT_ID = /^[^/\0]{1,128}$/;
const PATH_MAX = 1024;

/** `off` serves nothing; a list narrows the senders the daemon already admits; empty — no narrowing. */
export type ControlSetting = 'off' | string[];

export type CtlErrorCode = 'bad-request' | 'version' | 'unknown-op' | 'denied' | 'no-root' | 'not-found' | 'conflict' | 'internal';

export interface CtlRoot {
  rootId: string;
  label: string;
  kind: 'project' | 'reference';
  writable: boolean;
}

export interface CtlClient {
  clientId: string;
  /** Browser family and the page title. */
  label: string;
  /** The page the tab shows, as its pathname. */
  page?: string;
  /** The tab has unsaved editor text; it is not moved. */
  busy: boolean;
  since: number;
  lastSeen: number;
}

/** Why a tab was not moved. */
export type NotOpened = 'gone' | 'busy' | 'team';

export interface CtlDeps {
  setting(): ControlSetting;
  roots(): CtlRoot[];
  /** The page URL of a Markdown file inside `rootId`, or null — no root, outside it, not a file, not Markdown. */
  docUrl(rootId: string, path: string): Promise<string | null>;
  clients(): CtlClient[];
  /** Sends that one tab to `url`; false when the tab is not connected. */
  navigate(clientId: string, url: string): boolean;
  /** Users are configured: a tab's reader is not yet checked per root, so no tab is moved. */
  team(): boolean;
  audit(level: 'notice' | 'warning', line: string): void;
  now?(): number;
}

/** `agentBus.control` as stored: absent — no narrowing; a list of strings; anything else is `off`. */
export function parseControl(raw: unknown): ControlSetting {
  if (raw === undefined) return [];
  if (Array.isArray(raw) && raw.every((p) => typeof p === 'string')) return [...raw];
  return 'off';
}

/**
 * Whether `from` may send control requests under `setting`. A pattern is a whole-name regex without the `#`, any case;
 * an invalid one refuses everyone. Each must be a regex on its own, so none closes the anchoring group (`a)|(.*`).
 */
export function senderAllowed(setting: ControlSetting, from: string): boolean {
  if (setting === 'off') return false;
  if (!setting.length) return true;
  const name = from.replace(/^#/, '');
  let res: RegExp[];
  try {
    res = setting.map((p) => {
      void new RegExp(p, 'i'); // throws for `a)|(.*`, which only parses inside the group
      return new RegExp(`^(?:${p})$`, 'i');
    });
  } catch {
    return false;
  }
  return res.some((re) => re.test(name));
}

/** `CtlDeps.docUrl` over a registry: `registry.resolve` jails the path; `.git` and non-Markdown files are refused, as `/api/doc` refuses `.git`. */
export function registryDocUrl(registry: Registry): CtlDeps['docUrl'] {
  return async (rootId, path) => {
    const loc = await registry.resolve(`${rootId}/${path}`);
    if (!loc || loc.root.id !== rootId || !loc.rel || inGitDir(loc.rel) || !MD_EXT.test(loc.rel)) return null;
    if (!(await stat(loc.abs).catch(() => null))?.isFile()) return null;
    return registry.docUrl(loc.root, loc.rel);
  };
}

type Reply = Record<string, unknown>;

const err = (requestId: string | undefined, code: CtlErrorCode, msg: string): Reply => ({
  v: CTL_VERSION,
  ...(requestId ? { requestId } : {}),
  ok: false,
  error: { code, msg },
});

const short = (id: string) => id.slice(0, 8);
/** Audit text: no spaces or control characters from a sender reach the log line. */
const clean = (s: string) => s.replace(/[\s\x00-\x1f\x7f]+/g, '_').slice(0, 200);

export class Control {
  private readonly replies = new Map<string, { fingerprint: string; reply: Promise<string>; at: number }>();

  constructor(private readonly deps: CtlDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  /** Answers one request from `from`; never throws. */
  async handle(from: string, body: string): Promise<string> {
    try {
      return await this.dispatch(from, body);
    } catch {
      return JSON.stringify(err(undefined, 'internal', 'internal error'));
    }
  }

  private async dispatch(from: string, body: string): Promise<string> {
    if (Buffer.byteLength(body) > CTL_MAX_BODY) return JSON.stringify(err(undefined, 'bad-request', `body over ${CTL_MAX_BODY} bytes`));
    let req: unknown;
    try {
      req = JSON.parse(body);
    } catch {
      return JSON.stringify(err(undefined, 'bad-request', 'body is not JSON'));
    }
    if (typeof req !== 'object' || req === null || Array.isArray(req)) return JSON.stringify(err(undefined, 'bad-request', 'body is not an object'));
    const r = req as Record<string, unknown>;
    const requestId = typeof r.requestId === 'string' && REQUEST_ID.test(r.requestId) ? r.requestId : undefined;
    if (!requestId) return JSON.stringify(err(undefined, 'bad-request', 'requestId: 1-128 of [A-Za-z0-9._:-]'));
    if (r.v !== CTL_VERSION) return JSON.stringify(err(requestId, 'version', `v must be ${CTL_VERSION}`));

    if (!senderAllowed(this.deps.setting(), from)) {
      this.deps.audit('warning', `ctl denied from=${clean(from)} op=${clean(String(r.op))} req=${requestId}`);
      return JSON.stringify(err(requestId, 'denied', 'sender not allowed'));
    }

    if (r.op === 'inventory') return JSON.stringify(this.inventory(from, requestId));
    if (r.op === 'open') return this.openOnce(from, requestId, r);
    return JSON.stringify(err(requestId, 'unknown-op', 'op: inventory | open'));
  }

  private inventory(from: string, requestId: string): Reply {
    const roots = this.deps.roots();
    const clients = this.deps.clients();
    this.deps.audit('notice', `ctl inventory from=${clean(from)} roots=${roots.length} clients=${clients.length} req=${requestId}`);
    return { v: CTL_VERSION, requestId, ok: true, roots, clients };
  }

  /** The same `requestId` from the same sender gets the first reply again and moves no tab; different parameters — `conflict`. */
  private async openOnce(from: string, requestId: string, r: Record<string, unknown>): Promise<string> {
    const { rootId, path, clientId } = r;
    if (typeof rootId !== 'string' || !ROOT_ID.test(rootId)) return JSON.stringify(err(requestId, 'bad-request', 'rootId'));
    if (typeof path !== 'string' || !path || path.length > PATH_MAX || path.includes('\0')) return JSON.stringify(err(requestId, 'bad-request', 'path'));
    if (typeof clientId !== 'string' || !CLIENT_ID.test(clientId)) return JSON.stringify(err(requestId, 'bad-request', 'clientId'));

    const now = this.now();
    for (const [k, e] of this.replies) {
      if (now - e.at <= CTL_REPLAY_MS) break;
      this.replies.delete(k);
    }
    const key = `${from}\n${requestId}`;
    const fingerprint = JSON.stringify([rootId, path, clientId]);
    const seen = this.replies.get(key);
    if (seen) return seen.fingerprint === fingerprint ? seen.reply : JSON.stringify(err(requestId, 'conflict', 'requestId was used with other parameters'));

    const reply = this.open(from, requestId, rootId, path, clientId);
    this.replies.set(key, { fingerprint, reply, at: now });
    while (this.replies.size > CTL_REPLAY_KEPT) this.replies.delete(this.replies.keys().next().value!);
    return reply;
  }

  private async open(from: string, requestId: string, rootId: string, path: string, clientId: string): Promise<string> {
    const at = `from=${clean(from)} root=${clean(rootId)} path=${clean(path)} client=${short(clientId)} req=${requestId}`;
    if (!this.deps.roots().some((x) => x.rootId === rootId)) {
      this.deps.audit('warning', `ctl open ${at} error=no-root`);
      return JSON.stringify(err(requestId, 'no-root', 'no such root'));
    }
    const url = await this.deps.docUrl(rootId, path.replace(/^\/+/, ''));
    if (!url) {
      this.deps.audit('warning', `ctl open ${at} error=not-found`);
      return JSON.stringify(err(requestId, 'not-found', 'no such Markdown file'));
    }
    const reason = this.move(clientId, url);
    this.deps.audit('notice', `ctl open ${at} opened=${!reason}${reason ? ` reason=${reason}` : ''}`);
    return JSON.stringify({ v: CTL_VERSION, requestId, ok: true, url, opened: !reason, ...(reason ? { reason } : {}) });
  }

  private move(clientId: string, url: string): NotOpened | null {
    if (this.deps.team()) return 'team';
    const tab = this.deps.clients().find((c) => c.clientId === clientId);
    if (!tab) return 'gone';
    if (tab.busy) return 'busy';
    return this.deps.navigate(clientId, url) ? null : 'gone';
  }
}
