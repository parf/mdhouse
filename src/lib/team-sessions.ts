import { createHash, randomBytes } from 'node:crypto';
import type { TeamState, TeamUser } from './team-access';
import { IDLE_MS } from './user-session-model';

const SESSION_VALUE = /^[A-Za-z0-9_-]{43}$/;
const sessionKey = (value: string): string => createHash('sha256').update(value).digest('hex');

interface Session {
  userId: string;
  lastUsed: number;
}

/** The current process holds bearer-session hashes. Restart and ban revoke them. */
export class TeamSessions {
  readonly #sessions = new Map<string, Session>();
  #members = new Map<string, TeamUser>();

  constructor(private readonly now: () => number = Date.now) {}

  syncAuth(policy: TeamState): void {
    this.#members = new Map(policy.active ? policy.users.filter((user) => !user.banned).map((user) => [user.id, user]) : []);
    for (const [key, session] of this.#sessions) if (!this.#members.has(session.userId)) this.#sessions.delete(key);
  }

  issue(userId: string): string | null {
    if (!this.#members.has(userId)) return null;
    const value = randomBytes(32).toString('base64url');
    const now = this.now();
    for (const [key, session] of this.#sessions) if (now - session.lastUsed > IDLE_MS) this.#sessions.delete(key);
    this.#sessions.set(sessionKey(value), { userId, lastUsed: now });
    return value;
  }

  lookup(value: string | null, touch = false): TeamUser | null {
    if (!value || !SESSION_VALUE.test(value)) return null;
    const key = sessionKey(value);
    const session = this.#sessions.get(key);
    if (!session) return null;
    const now = this.now();
    if (now - session.lastUsed > IDLE_MS) {
      this.#sessions.delete(key);
      return null;
    }
    if (touch) session.lastUsed = now;
    return this.#members.get(session.userId) ?? null;
  }

  revoke(value: string | null): void {
    if (value && SESSION_VALUE.test(value)) this.#sessions.delete(sessionKey(value));
  }
}
