/**
 * State for scheduled runs (MW.11): this instance's approvals of registration files and its run index, kept where the
 * timer is — the Agent Bus key-value store of the instance's own `#mdhouse@<host>` record ([№DATA-W2](../../Plans/R3/workspaces/DECISIONS.md#DATA-W2)),
 * one JSON value per key; per host by the record, never in the project or `prefs.json`. No bus: no firing either.
 */
import { createHash } from 'node:crypto';
import type { Approval, AutoStore } from './automation';

/** The bus calls the store needs: mdhouse's own JSON values. */
export interface BusKV {
  kvJson(name: string): Promise<Record<string, unknown> | null>;
  kvSet(name: string, value: Record<string, unknown>): Promise<void>;
  kvDelete(name: string): Promise<boolean>;
  kvNames(prefix: string): Promise<string[]>;
}

/** The run index's store (`RunIndex`) in the record's key-value store. */
export function busStore(kv: BusKV): AutoStore {
  return {
    get: (k) => kv.kvJson(k),
    put: (k, v) => kv.kvSet(k, v as Record<string, unknown>),
    keys: async (p) => (await kv.kvNames(p)).sort(),
    del: async (k) => void (await kv.kvDelete(k)),
  };
}

/** A project folder's key in the store: the same folder keeps it across restarts and root order. */
export const folderKey = (rootPath: string): string => createHash('sha256').update(rootPath).digest('hex').slice(0, 16);

/** This host's approval of one registration file: its exact content, and the bus schedule made for it. */
export interface Approved {
  hash: string;
  scheduleId: string;
  at: string;
  by: string;
}

const isApproved = (v: unknown): v is Approved =>
  !!v && typeof v === 'object' && ['hash', 'scheduleId', 'at', 'by'].every((k) => typeof (v as Record<string, unknown>)[k] === 'string');

/**
 * Approvals by project folder (real path) and registration id, at `auto/approval/<folder hash>/<id>`
 * ([№Q-R3-AUTO2](../../Plans/R3/workspaces/DECISIONS.md#Q-R3-AUTO2)): a firing runs only for the schedule made at
 * approval and while the file's content hash is still the approved one.
 */
export class Approvals {
  constructor(private readonly store: AutoStore) {}

  private key = (rootPath: string, id: string): string => `auto/approval/${folderKey(rootPath)}/${id}`;

  async get(rootPath: string, id: string): Promise<Approved | null> {
    const v = await this.store.get(this.key(rootPath, id));
    return isApproved(v) ? { hash: v.hash, scheduleId: v.scheduleId, at: v.at, by: v.by } : null;
  }

  set(rootPath: string, id: string, a: Approved): Promise<void> {
    return this.store.put(this.key(rootPath, id), { ...a });
  }

  /** Withdraws it; returns what it was. */
  async drop(rootPath: string, id: string): Promise<Approved | null> {
    const was = await this.get(rootPath, id);
    if (was) await this.store.del(this.key(rootPath, id));
    return was;
  }

  /** `AutoDeps.approval`, fail-closed: an unknown root or a store error is no approval. */
  check(rootPath: (rootId: string) => string | null): Approval {
    return async (ask) => {
      const path = rootPath(ask.rootId);
      const a = path === null ? null : await this.get(path, ask.registration).catch(() => null);
      return !!a && a.hash === ask.hash && a.scheduleId === ask.scheduleId;
    };
  }
}
