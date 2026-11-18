import { createHash, randomBytes } from 'node:crypto';

const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const LOOKUP_TIMEOUT_MS = 5000;
const MAX_PREVIEWS = 128;
const PREVIEW_MS = 5 * 60_000;

export interface GitHubTeamUser {
  id: string;
  login: string;
  name: string | null;
  avatar: string | null;
}

export class TeamGitHubError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function githubUser(value: unknown): GitHubTeamUser {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TeamGitHubError(502, 'GitHub returned an invalid profile');
  const { id, login, name, avatar_url, type } = value as Record<string, unknown>;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || typeof login !== 'string' || !GITHUB_LOGIN.test(login) || type !== 'User') {
    throw new TeamGitHubError(502, 'GitHub returned an invalid profile');
  }
  const display = typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120) : '';
  let avatar: string | null = null;
  if (typeof avatar_url === 'string') {
    try {
      const url = new URL(avatar_url);
      if (url.origin === 'https://avatars.githubusercontent.com' && !url.username && !url.password) avatar = url.href;
    } catch {
      // A profile does not need an avatar.
    }
  }
  return { id: String(id), login, name: display || null, avatar };
}

const publicHeaders = { accept: 'application/vnd.github+json', 'user-agent': 'mdhouse' };

export async function lookupGitHubUser(login: string, request: typeof fetch = fetch): Promise<GitHubTeamUser> {
  if (!GITHUB_LOGIN.test(login)) throw new TeamGitHubError(400, 'Enter a GitHub username');
  const res = await request(`https://api.github.com/users/${encodeURIComponent(login)}`, {
    headers: publicHeaders, redirect: 'error', signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  }).catch(() => { throw new TeamGitHubError(502, 'GitHub lookup failed'); });
  if (res.status === 404) throw new TeamGitHubError(404, 'GitHub user not found');
  if (res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')) {
    throw new TeamGitHubError(503, 'GitHub lookup is rate limited');
  }
  if (!res.ok) throw new TeamGitHubError(502, 'GitHub lookup failed');
  const user = githubUser(await res.json().catch(() => null));
  if (user.login.toLowerCase() !== login.toLowerCase()) throw new TeamGitHubError(409, 'This GitHub username changed. Look it up again');
  return user;
}

interface Preview {
  readonly binding: string;
  readonly revision: string;
  readonly user: GitHubTeamUser;
  readonly expires: number;
}

/** A preview authorizes one confirmation by the admin session that requested it. */
export class TeamGitHubPreviews {
  readonly #pending = new Map<string, Preview>();

  constructor(private readonly request: typeof fetch = fetch) {}

  async preview(login: string, binding: string, revision: string, stillAdmin: () => boolean): Promise<{ token: string; user: GitHubTeamUser }> {
    const user = await lookupGitHubUser(login, this.request);
    if (!stillAdmin()) throw new TeamGitHubError(401, 'Administrator session required');
    const now = Date.now();
    for (const [id, item] of this.#pending) if (item.expires <= now) this.#pending.delete(id);
    if (this.#pending.size >= MAX_PREVIEWS) this.#pending.delete(this.#pending.keys().next().value!);
    const token = randomBytes(32).toString('base64url');
    this.#pending.set(token, { binding, revision, user, expires: now + PREVIEW_MS });
    return { token, user };
  }

  async confirm(token: string, binding: string, revision: string): Promise<Omit<GitHubTeamUser, 'avatar'>> {
    const item = this.#pending.get(token);
    if (!item || item.binding !== binding || item.revision !== revision || item.expires <= Date.now()) {
      throw new TeamGitHubError(409, 'Preview expired or the access settings changed. Look up the user again');
    }
    this.#pending.delete(token);
    const user = await lookupGitHubUser(item.user.login, this.request);
    if (user.id !== item.user.id) throw new TeamGitHubError(409, 'GitHub returned a different identity. Look up the user again');
    return { id: user.id, login: user.login, name: user.name };
  }
}

export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
  callback: URL;
}

export function readGitHubOAuthConfig(env: NodeJS.ProcessEnv): GitHubOAuthConfig | null {
  const { MDHOUSE_GITHUB_CLIENT_ID: clientId, MDHOUSE_GITHUB_CLIENT_SECRET: clientSecret, MDHOUSE_GITHUB_CALLBACK_URL: url } = env;
  if (!clientId || !clientSecret || !url) return null;
  try {
    const callback = new URL(url);
    const local = callback.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname);
    if ((!local && callback.protocol !== 'https:') || callback.pathname !== '/auth/github/callback' || callback.search || callback.hash || callback.username || callback.password) return null;
    return { clientId, clientSecret, callback };
  } catch {
    return null;
  }
}

/** In-memory exchanges for the single server process. State is also bound to the browser's HttpOnly cookie. */
export class GitHubOAuth {
  readonly #pending = new Map<string, { verifier: string; expires: number }>();

  constructor(readonly config: GitHubOAuthConfig, private readonly request: typeof fetch = fetch) {}

  begin(): { state: string; url: URL } {
    const now = Date.now();
    for (const [state, item] of this.#pending) if (item.expires <= now) this.#pending.delete(state);
    if (this.#pending.size >= MAX_PREVIEWS) this.#pending.delete(this.#pending.keys().next().value!);
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    this.#pending.set(state, { verifier, expires: now + PREVIEW_MS });
    const url = new URL('https://github.com/login/oauth/authorize');
    url.search = new URLSearchParams({
      client_id: this.config.clientId, redirect_uri: this.config.callback.href, state, allow_signup: 'false',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
    }).toString();
    return { state, url };
  }

  async finish(state: string, stateCookie: string | null, code: string): Promise<GitHubTeamUser> {
    const entry = this.#pending.get(state);
    if (!entry || stateCookie !== state || entry.expires <= Date.now() || !code || code.length > 512) throw new TeamGitHubError(401, 'GitHub sign-in expired');
    this.#pending.delete(state);
    const response = await this.request('https://github.com/login/oauth/access_token', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS), headers: { accept: 'application/json' },
      body: new URLSearchParams({
        client_id: this.config.clientId, client_secret: this.config.clientSecret, code,
        redirect_uri: this.config.callback.href, code_verifier: entry.verifier,
      }),
    }).catch(() => { throw new TeamGitHubError(502, 'GitHub sign-in failed'); });
    const token = response.ok ? (await response.json().catch(() => null))?.access_token : null;
    if (typeof token !== 'string' || !/^[\w-]{1,512}$/.test(token)) throw new TeamGitHubError(401, 'GitHub sign-in failed');
    const profile = await this.request('https://api.github.com/user', {
      headers: { ...publicHeaders, authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    }).catch(() => { throw new TeamGitHubError(502, 'GitHub profile could not be verified'); });
    if (!profile.ok) throw new TeamGitHubError(502, 'GitHub profile could not be verified');
    return githubUser(await profile.json().catch(() => null));
  }
}
