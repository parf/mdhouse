/**
 * The browser tabs on the live channel, by an opaque `clientId` that survives the tab's reconnects.
 *
 * The server mints each id with a resume proof (an HMAC under a per-process key). A tab keeps both
 * and offers them when it reconnects; a valid proof for an id no live socket holds gets that id
 * back, anything else a fresh one. So a tab cannot take another tab's id, and every id is new after
 * a restart. An id is not a credential: it only names where `open` goes.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CtlClient } from './ab-control';

/** Where a frame for one tab goes — the socket. */
export interface TabSink {
  send(data: string): unknown;
}

interface Tab {
  sink: TabSink;
  browser: string;
  page?: string;
  title?: string;
  busy: boolean;
  since: number;
  lastSeen: number;
}

const ID = /^[A-Za-z0-9_-]{22}$/;
const PAGE_MAX = 1024;
const TITLE_MAX = 200;
/** Tabs kept; a new one past it drops the one heard from longest ago, which `open` no longer reaches. */
export const TABS_MAX = 200;

/** The browser family from a User-Agent: the label part a person recognizes, nothing that identifies them. */
export function browserOf(ua: string): string {
  if (/\bEdg\//.test(ua)) return 'Edge';
  if (/\bFirefox\//.test(ua)) return 'Firefox';
  if (/Chrom(e|ium)\/|\bCriOS\//.test(ua)) return 'Chrome';
  if (/\bSafari\//.test(ua)) return 'Safari';
  return 'Browser';
}

export class Tabs {
  private readonly tabs = new Map<string, Tab>();
  private readonly key: Buffer;

  constructor(
    key: Buffer = randomBytes(32),
    private readonly now: () => number = Date.now,
  ) {
    this.key = key;
  }

  private proof(id: string): string {
    return createHmac('sha256', this.key).update(id).digest('base64url');
  }

  private valid(id: string, proof: string): boolean {
    if (!ID.test(id)) return false;
    const want = Buffer.from(this.proof(id));
    const got = Buffer.from(proof);
    return got.length === want.length && timingSafeEqual(got, want);
  }

  /**
   * A socket opened: it gets the id it asks for (`<id>.<proof>`) when the proof is valid and no live
   * socket holds that id, else a fresh one. Returns what the tab keeps.
   */
  open(sink: TabSink, asked: string | null, ua: string): { clientId: string; resume: string } {
    const [id = '', proof = ''] = (asked ?? '').split('.');
    const clientId = this.valid(id, proof) && !this.tabs.has(id) ? id : randomBytes(16).toString('base64url');
    const at = this.now();
    if (this.tabs.size >= TABS_MAX) {
      let idle: [string, number] | null = null;
      for (const [id, t] of this.tabs) if (!idle || t.lastSeen < idle[1]) idle = [id, t.lastSeen];
      this.tabs.delete(idle![0]);
    }
    this.tabs.set(clientId, { sink, browser: browserOf(ua), busy: false, since: at, lastSeen: at });
    return { clientId, resume: this.proof(clientId) };
  }

  /** The socket closed; a newer socket holding the same id stays. */
  close(clientId: string, sink: TabSink): void {
    if (this.tabs.get(clientId)?.sink === sink) this.tabs.delete(clientId);
  }

  /** A frame from the tab. Returns false when it is not one this channel knows. */
  message(clientId: string, raw: string): boolean {
    const tab = this.tabs.get(clientId);
    if (!tab) return false;
    tab.lastSeen = this.now();
    if (raw === 'ping') return true;
    if (raw.length > PAGE_MAX + TITLE_MAX + 200) return false;
    let m: unknown;
    try {
      m = JSON.parse(raw);
    } catch {
      return false;
    }
    if (typeof m !== 'object' || m === null || (m as { t?: unknown }).t !== 'at') return false;
    const { page, title, busy } = m as { page?: unknown; title?: unknown; busy?: unknown };
    if (typeof page !== 'string' || !page.startsWith('/') || page.length > PAGE_MAX) return false;
    tab.page = page;
    tab.title = typeof title === 'string' ? title.slice(0, TITLE_MAX) : undefined;
    tab.busy = busy === true;
    return true;
  }

  list(): CtlClient[] {
    return [...this.tabs].map(([clientId, t]) => ({
      clientId,
      label: t.title ? `${t.browser} · ${t.title}` : t.browser,
      ...(t.page ? { page: t.page } : {}),
      busy: t.busy,
      since: t.since,
      lastSeen: t.lastSeen,
    }));
  }

  /** Sends that one tab to `url`; false when no socket holds the id. */
  navigate(clientId: string, url: string): boolean {
    const tab = this.tabs.get(clientId);
    if (!tab) return false;
    tab.sink.send(JSON.stringify({ t: 'open', url }));
    return true;
  }
}
