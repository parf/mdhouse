/**
 * The HTTP + WebSocket server.
 *
 * Bun bundles `index.html` and everything it imports natively, so there is no vite, no webpack
 * and no build step to run before starting — `bun run src/cli.ts <dir>` is the whole thing.
 */

import type { ServerWebSocket } from 'bun';
import index from './index.html';
import { realpath } from 'node:fs/promises';
import { homedir, hostname as machineName, userInfo } from 'node:os';
import { resolve as resolvePath } from 'node:path';
import { Registry, ReadOnlyError, type Resolved, type Root } from './lib/roots';
import { dirUrl, normalizeEditScheme } from './lib/urls';
import { listFiles, repoToplevel } from './lib/scan';
import { inGitDir, kindOf, langOf, MD_EXT, type Kind } from './lib/filetypes';
import { Prefs, MARKS, type Mark } from './lib/prefs';
import { gitStateIn, parseReveal, Store } from './lib/store';
import { isExplicitlyDenied } from './lib/ignore';
import { highlightFile, markupHunks, render, splitFrontmatter, toggleTask } from './lib/render';
import { applyQa, badgeSource, lineHash, qaRequestOf, replyText, type QaError } from './lib/qa';
import { authorCookieName, authorSetCookie, normalizeAuthorName, readAuthorCookie, type AuthorIdentity } from './lib/author';
import { searchContent } from './lib/search';
import { commitDiff, commitInfo, currentUser, fileHistory, gitDirs, literal, newFileDiff, workingDiff, type FileDiff } from './lib/git';
import { ADD_KINDS, insertBlock, type AddKind, type AddRequest } from './lib/insert';
import { convertLegacy } from './lib/legacy';
import { Watcher } from './lib/watch';
import { serveControl, type AddReply, type RemoveReply, type RootLine } from './lib/control';
import { ownUnit, ownStopCommand } from './lib/service';
import { allowedAddress, Users } from './lib/access';
import { bundle, inventory, isMethodMap, mutation, read, type RouteEntry } from './lib/authz';
import { commitable, dirtyFiles, folderLog, remoteState, repoRel, run, suggestMessage, syncState, trackedFiles } from './lib/gitpage';
import { repoHead } from './lib/git';
import { AB_ACTIONS, abTargets, AgentBus, badPatterns, defaultSocket, passes, requestText, validTarget, type AbAction } from './lib/agent-bus';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export interface ServeOptions {
  registry: Registry;
  prefs: Prefs;
  port: number;
  hostname: string;
  noGit?: boolean;
  gitLogLimit?: number;
  includeIgnoredDefault?: boolean;
  /** The authenticated author of a request, when there is one; it wins over the browser's cookie. */
  sessionAuthor?: (req: Request) => AuthorIdentity | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const fail = (status: number, message: string) => json({ error: message }, status);

/** What GET /api/author says: the name that signs, where it comes from, and the browser's own cookie. */
const authorPayload = (author: AuthorIdentity, cookie: string | null) => {
  const res = json({ name: author.name, source: author.source, cookie });
  res.headers.set('cache-control', 'private, no-store');
  return res;
};

const moved = (location: string) => new Response(null, { status: 301, headers: { location } });

/**
 * Is this request addressed to mdhouse by a name a browser can be trusted with?
 *
 * DNS rebinding is the attack: a page at `evil.example` re-points that name at 127.0.0.1, and
 * from then on the browser treats mdhouse as the attacker's own origin — `Origin`, `Host` and
 * `Sec-Fetch-Site` all say "same origin", so no origin check can tell. What it cannot fake is
 * the name: the `Host` header carries the attacker's domain. So only names that cannot be
 * rebound are accepted: `localhost` and IP literals, plus, when mdhouse is bound to the network
 * on purpose (`--host`), this machine's own hostname. With `--host-name` saved, only those
 * names pass — a reverse proxy's; localhost and IP literals are refused.
 */
export function trustedHost(host: string | null, bound: string, names: string[] = [], machine = machineName()): boolean {
  if (!host) return false;
  const name = (host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.replace(/:\d+$/, ''))
    .toLowerCase()
    .replace(/\.$/, ''); // `localhost.` is still localhost
  if (names.length) return names.includes(name);
  const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(name);
  const ipv6 = /^[0-9a-f:.]+$/.test(name) && name.includes(':');
  if (name === 'localhost' || ipv4 || ipv6) return true;
  const loopback = bound === '127.0.0.1' || bound === 'localhost' || bound === '::1';
  if (loopback) return false;
  const me = machine.toLowerCase();
  return name === me || name === `${me}.local`;
}

/** The address mdhouse prints and opens — an IPv6 host in brackets. */
export const pageUrl = (host: string, port: number | undefined): string =>
  `http://${host.includes(':') ? `[${host}]` : host}:${port}`;

/** Did this request come from a page mdhouse served itself? See `/api/roots/remove`. */
export function sameOrigin(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

/** HTML is shown sandboxed, as passive as a rendered document: an opaque origin, and no scripts run. */
const SANDBOXED_HTML = { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': 'sandbox' };

/**
 * The app page's CSP — defense in depth behind `passive()`, never the control itself. Scripts and
 * connections only from mdhouse; images from anywhere a document may link; inline styles for
 * Mermaid's SVG and Shiki.
 */
const PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: http: data: blob:",
  "media-src 'self' https: http:",
  "connect-src 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** A file's page: highlighted up to here; past it, no body — "too big, download". */
const SHOW_MAX = 5_000_000;

/**
 * The headers `/api/raw` serves a file with, by kind. Everything is sandboxed — opened on its
 * own, no HTML's, SVG's or text file's script runs — except a PDF, which the browser's own viewer
 * needs to show; code is text; an unknown binary is a download.
 */
function rawHeaders(kind: Kind, rel: string, type: string): Record<string, string> {
  const common = { 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' };
  if (kind === 'html') return { ...common, ...SANDBOXED_HTML };
  if (kind === 'pdf') return { ...common, 'content-type': 'application/pdf' };
  const sandbox = { ...common, 'content-security-policy': 'sandbox' };
  if (kind === 'image' || kind === 'video' || kind === 'audio') return { ...sandbox, 'content-type': type };
  if (kind === 'binary') {
    const name = encodeURIComponent(rel.split('/').pop() ?? 'file');
    return { ...sandbox, 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename*=UTF-8''${name}` };
  }
  return { ...sandbox, 'content-type': 'text/plain; charset=utf-8' };
}

/** A file's first 8 kB — enough to tell text from binary. */
const headOf = async (abs: string): Promise<Uint8Array> => new Uint8Array(await Bun.file(abs).slice(0, 8192).arrayBuffer());

/** Resolved once at startup; mermaid is a direct dependency so this always exists. */
const MERMAID_DIST = new URL('../node_modules/mermaid/dist', import.meta.url).pathname;

export async function serve(opts: ServeOptions) {
  const { registry, prefs, port, hostname } = opts;
  const store = new Store(registry, prefs, { noGit: opts.noGit, gitLogLimit: opts.gitLogLimit });
  registry.autoRw = (dir) => prefs.autoRwCovers(dir);
  /** The settings page's options, and the auto-rw paths its switch is about (set from the CLI). */
  const settingsPayload = () => {
    prefs.refresh();
    return { ...prefs.settings, autoRwPaths: prefs.autoRw };
  };
  /** The Agent Bus integration — on and off from the CLI (`--agent-bus`); its events go to every tab. */
  const bus = new AgentBus(
    () => ({ addr: prefs.agentBus.socket || defaultSocket(), token: prefs.agentBus.token }),
    (ev) => server.publish('ab', JSON.stringify({ t: 'ab', ...ev })),
  );
  /**
   * Writes to documents in flight, per file, so they apply one after another — two quick clicks
   * (a tick and an answer, or two ticks) each run against the file the previous one left.
   */
  const fileWrites = new Map<string, Promise<unknown>>();
  /** A Markdown file in a root that is there now — else null: a name that is gone, or a folder named `*.md`. */
  const docAt = async (p: string) => {
    const loc = await registry.resolve(p);
    if (!loc || !MD_EXT.test(loc.rel)) return null;
    return (await stat(loc.abs).catch(() => null))?.isFile() ? loc : null;
  };
  /** Any file in a root that is there now — a page shows code and text as well as Markdown. */
  const fileAt = async (p: string) => {
    const loc = await registry.resolve(p);
    if (!loc) return null;
    return (await stat(loc.abs).catch(() => null))?.isFile() ? loc : null;
  };

  /**
   * A document as mdhouse reads it: the old Q&A forms rewritten into the new markup (legacy.ts).
   * Every render and every write reads it so, and a write writes it converted.
   */
  const readDoc = async (abs: string): Promise<string> => {
    const raw = await Bun.file(abs).text();
    return convertLegacy(raw, splitFrontmatter(raw).offset);
  };

  /**
   * Who a signed reply is from: an authenticated session, else this browser's author cookie, else
   * prefs `me`, else the git identity of the file's repository, else the login. The cookie is
   * attribution only.
   */
  /** The port the author cookie is named for: the one actually listening. */
  const cookiePort = (): number => server.port ?? opts.port;
  const authorOf = async (req: Request, loc: { root: Root; rel: string } | null): Promise<AuthorIdentity> => {
    const session = opts.sessionAuthor?.(req);
    if (session) return session;
    const cookie = readAuthorCookie(req.headers.get('cookie'), cookiePort());
    if (cookie) return { name: cookie, source: 'cookie' };
    const where = loc && !opts.noGit ? await store.repoFor(loc.root, loc.rel) : null;
    return badgeSource(prefs.settings.me, where ? await currentUser(where.repo) : null, userInfo().username);
  };
  const signer = async (req: Request, loc: { root: Root; rel: string }): Promise<string> => (await authorOf(req, loc)).name;

  const queueWrite = <T>(abs: string, write: () => Promise<T>): Promise<T> => {
    const run = (fileWrites.get(abs) ?? Promise.resolve()).then(write);
    const tail = run.catch(() => {});
    fileWrites.set(abs, tail);
    // Forget the file once its last queued write is done, so the map does not grow.
    void tail.then(() => fileWrites.get(abs) === tail && fileWrites.delete(abs));
    return run;
  };

  /** `git ls-remote` answers, 30 seconds each — see `/api/git/remote`. */
  const remoteCache = new Map<string, { at: number; state: ReturnType<typeof remoteState> }>();

  /** The folder a git request names (`p` = `<root>/<dir>`), and its repo. */
  type GitAt = { root: Root; repo: string; dir: string } | { error: Response };
  const gitAt = async (url: URL): Promise<GitAt> => gitFolder(url.searchParams.get('p') ?? '');
  const gitFolder = async (p: string): Promise<GitAt> => {
    if (opts.noGit) return { error: fail(404, 'git is off') };
    const loc = await registry.resolve(p.replace(/\/+$/, ''));
    if (!loc || !(await stat(loc.abs).catch(() => null))?.isDirectory()) return { error: fail(404, 'no such folder') };
    const repo = await repoToplevel(loc.abs);
    if (!repo) return { error: fail(404, 'not in a git repository') };
    return { root: loc.root, repo, dir: repoRel(repo, loc.abs) };
  };
  const gitWrite = async (req: Request, p: string | undefined): Promise<GitAt> => {
    if (!sameOrigin(req)) return { error: fail(403, 'cross-origin request refused') };
    const at = await gitFolder(p ?? '');
    if ('error' in at) return at;
    if (!at.root.writable) return { error: fail(403, `${at.root.name} is read-only`) };
    return at;
  };
  /** The refusal for a document write to a location `registry.writableAt` refuses. */
  const readOnly = (loc: Resolved, what: string): Response =>
    fail(403, registry.inReference(loc.abs) ? `${loc.rel} is mdhouse reference material — read-only` : `${loc.root.name} is read-only — start it with --rw to ${what}`);
  /** A path is the folder or inside it. */
  const within = (path: string, dir: string): boolean => path === dir || path.startsWith(`${dir}/`);
  /** A read-only root that shares files with the repo — a write to the repo may land in it. */
  const readOnlyIn = (repo: string): Root | undefined =>
    registry.list().find((r) => !r.writable && (within(r.path, repo) || within(repo, r.path)));
  /** Pull or push: uncommitted files only when all Markdown, and confirmed. Pull only when the whole repo is the root's to write. */
  const syncRepo = async (req: Request, args: string[]): Promise<Response> => {
    const body = (await req.json().catch(() => null)) as { p?: string; confirmed?: boolean } | null;
    const at = await gitWrite(req, body?.p);
    if ('error' in at) return at.error;
    if (args[0] === 'pull') {
      const ro = readOnlyIn(at.repo);
      if (ro) return fail(409, `${ro.name} is read-only and in the same repository — pull in a terminal`);
      if (!within(at.repo, at.root.path)) return fail(409, `the repository holds files outside ${at.root.name} — pull in a terminal`);
    }
    return queueWrite(`git:${at.repo}`, async () => {
      const dirty = (await dirtyFiles(at.repo)).filter((f) => f.code !== '??' || f.md);
      if (dirty.some((f) => !f.md)) {
        return json({ error: 'You have uncommitted files that are not Markdown — commit them first', files: dirty }, 409);
      }
      if (dirty.length && !body?.confirmed) return json({ error: 'You have uncommitted files', confirm: true, files: dirty }, 409);
      const r = await run(at.repo, args, 120_000);
      // What origin said before is stale now.
      for (const key of remoteCache.keys()) if (key.startsWith(`${at.repo}\0`)) remoteCache.delete(key);
      const output = `${r.out}${r.err}`.trim();
      return r.code === 0 ? json({ ok: true, output }) : fail(500, output || `git ${args[0]} failed`);
    });
  };

  /** Resolve the `root` query parameter, defaulting to the first root. */
  const rootOf = (url: URL): Root | null => {
    const id = url.searchParams.get('root');
    return id ? (registry.get(id) ?? null) : registry.defaultRoot();
  };

  const flag = (url: URL, name: string, dflt = false): boolean => {
    const v = url.searchParams.get(name);
    return v === null ? dflt : v !== '0' && v !== 'false';
  };
  /** A `limit` query parameter: a whole number in 1..max, `dflt` when missing or not a number. */
  const limitOf = (url: URL, dflt: number, max: number): number =>
    Math.min(Math.max(Math.trunc(Number(url.searchParams.get('limit'))) || dflt, 1), max);

  /**
   * Who may come in at all — `lib/access.ts`. Off until the CLI sets an allow list or a user;
   * read from prefs.json for every request, so a change applies to a running server at once.
   */
  const users = new Users();
  const admit = async (req: Request): Promise<Response | null> => {
    const access = await prefs.currentAccess();
    if (!allowedAddress(server.requestIP(req)?.address, access.allow)) return new Response('access denied\n', { status: 403 });
    if (Object.keys(access.users).length && !(await users.check(req.headers.get('authorization'), access.users))) {
      return new Response('access denied\n', {
        status: 401,
        headers: { 'www-authenticate': 'Basic realm="mdhouse", charset="UTF-8"' },
      });
    }
    return null;
  };

  /** Every handler behind the host check, then the access check. */
  type Handler = (req: Request) => Response | Promise<Response>;
  const check = (h: Handler): Handler => async (req) =>
    !trustedHost(req.headers.get('host'), hostname, prefs.currentHostNames()) ? fail(421, 'unrecognised host name') : ((await admit(req)) ?? h(req));

  /**
   * The app's page. Bun serves the HTML bundle only as a route of its own, which no check can
   * wrap, so it sits at `/__app/` and the page routes hand out its HTML from there, behind the
   * checks. The bundle is code, the same for everyone — no data — so `/__app/` and the script
   * chunks it loads need none.
   */
  let appHtml: Promise<string> | null = null;
  const page: Handler = async () => {
    appHtml ??= fetch(new URL('/__app/', server.url)).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`app page: ${r.status}`))));
    try {
      return new Response(await appHtml, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': PAGE_CSP } });
    } catch (err) {
      appHtml = null;
      return fail(500, (err as Error).message);
    }
  };
  const raw: Handler = async (req) => {
    const url = new URL(req.url);
    const loc = await registry.resolve(url.searchParams.get('p') ?? '');
    if (!loc) return fail(403, 'path outside any root');
    if (inGitDir(loc.rel)) return fail(404, 'not found');
    if (!(await stat(loc.abs).catch(() => null))?.isFile()) return fail(404, 'not found');
    const file = Bun.file(loc.abs);
    return new Response(file, { headers: rawHeaders(kindOf(loc.rel, await headOf(loc.abs)), loc.rel, file.type) });
  };

  /** The old `/d/…` address — 301 to the page's own, the query kept. */
  const legacyPage: Handler = async (req) => {
    const url = new URL(req.url);
    const rest = url.pathname.replace(/^\/d\/?/, '');
    const loc = rest ? await registry.fromDocUrl(`/d/${rest}`) : null;
    if (rest && !loc) return fail(404, 'not found');
    const root = loc?.root ?? registry.defaultRoot();
    const target = !rest || rest.endsWith('/') ? dirUrl(root.id, loc?.rel ?? '') : registry.docUrl(root, loc!.rel);
    return moved(target + url.search);
  };

  /**
   * A page under a root: `/<rootId>`, `/<rootId>/<rel>`, `/<rootId>/<dir>/`. A folder named
   * without its trailing slash moves to its page. Anything else is 404.
   */
  const rootPage: Handler = async (req) => {
    const url = new URL(req.url);
    const segs = url.pathname.split('/');
    let first = segs[1] ?? '';
    try {
      first = decodeURIComponent(first);
    } catch {
      /* matched as written */
    }
    if (!registry.get(first)) return fail(404, 'not found');
    if (segs.length > 2 && !url.pathname.endsWith('/')) {
      const loc = await registry.fromDocUrl(url.pathname);
      if (loc && (await stat(loc.abs).catch(() => null))?.isDirectory()) return moved(dirUrl(loc.root.id, loc.rel) + url.search);
    }
    return page(req);
  };

  /** Every route and its mutation family — filled by `guard`, which refuses an unclassified write. */
  let routes: RouteEntry[] = [];
  function guard<R extends string>(table: Bun.Serve.Routes<undefined, R>): Bun.Serve.Routes<undefined, R> {
    routes = inventory(table);
    const out: Record<string, unknown> = {};
    for (const [path, route] of Object.entries(table)) {
      if (typeof route === 'function') out[path] = check(route as Handler);
      else if (isMethodMap(route)) {
        out[path] = Object.fromEntries(Object.entries(route).map(([m, h]) => [m, check(h as Handler)]));
      } else out[path] = route;
    }
    return out as Bun.Serve.Routes<undefined, R>;
  }

  const server = Bun.serve({
    port,
    hostname,
    development: false,
    // Bun turns SO_REUSEPORT on by default, which lets a second `mdhouse` bind the same port
    // and the kernel split requests between two processes serving two different trees — every
    // other click lands in the wrong one and 404s. Refuse the port instead, loudly.
    reusePort: false,

    routes: guard({
      '/__app/': bundle(index),
      '/': read(page),
      // Pages under a root are served by `fetch` (rootPage); `/d/…` is the old address.
      '/d': read(legacyPage),
      '/d/*': read(legacyPage),
      '/settings': read(page),

      /**
       * Mermaid's own ESM build, served straight from node_modules so it stays out of the app
       * bundle. Its chunks are imported relatively, so the whole dist directory is published.
       */
      '/vendor/mermaid/*': read(async (req) => {
        const rel = new URL(req.url).pathname.slice('/vendor/mermaid/'.length);
        if (!/^[\w./-]+$/.test(rel) || rel.includes('..')) return fail(400, 'bad asset path');

        const file = Bun.file(`${MERMAID_DIST}/${rel}`);
        if (!(await file.exists())) return fail(404, 'not found');
        return new Response(file, {
          headers: {
            'content-type': rel.endsWith('.mjs') ? 'text/javascript; charset=utf-8' : file.type,
            'cache-control': 'public, max-age=604800',
          },
        });
      }),

      '/api/roots': read(() =>
        json({
          roots: registry.list().map((r) => ({
            id: r.id,
            name: r.name,
            path: r.path,
            kind: r.kind ?? 'project',
            writable: r.writable,
            // why it is writable: `--rw` asked for it, else an auto-rw path covers it
            ...(r.writable ? { writableBy: r.rwAsked ? 'rw' : 'auto' } : {}),
            saved: prefs.isSaved(r.path),
          })),
          single: registry.single,
          // So the top bar can write paths under it as `~/…`.
          home: homedir(),
        })),

      /**
       * Tick or untick one task checkbox.
       *
       * Refused on a read-only folder before the file is even read; refused with 409 when the
       * page was rendered from an older file (the line's fingerprint no longer matches), so a
       * stale tab cannot flip whatever now sits on that line. The write goes through
       * `Registry.writeFile()`, and the watcher then tells every open tab.
       */
      '/api/task': {
        POST: mutation('doc-write', async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const body = (await req.json().catch(() => null)) as { p?: string; line?: number; hash?: string } | null;
          if (!body?.p || !Number.isInteger(body.line) || typeof body.hash !== 'string') {
            return fail(400, 'expected {p, line, hash}');
          }
          const loc = await docAt(body.p);
          if (!loc) return fail(404, 'not a document');
          if (!registry.writableAt(loc)) return readOnly(loc, 'tick boxes');

          const result = await queueWrite(loc.abs, async () => {
            const result = toggleTask(await readDoc(loc.abs), body.line!, body.hash!);
            if ('error' in result) return result;
            await registry.writeFile(body.p!, result.src);
            return result;
          });
          if ('error' in result) {
            return json(
              { error: result.error === 'stale' ? 'the file changed since this page was loaded' : 'that line is no longer a task', reason: result.error },
              409,
            );
          }
          return json({ checked: result.checked });
        }),
      },

      /**
       * Q&A from the page (qa.ts): a reply, a stage, yes / no on a 💡, a pick, a tick, done, 🎯, an
       * edited reply — one change to one item. Refused when the item's lines no longer match what
       * the page rendered, so a stale page never writes over anything. GET says who a signed reply
       * is from, and gives a reply's text to edit.
       */
      '/api/qa': {
        GET: async (req) => {
          const url = new URL(req.url);
          const loc = await docAt(url.searchParams.get('p') ?? '');
          if (!loc) return fail(404, 'not a document');
          const me = await signer(req, loc);
          const reply = url.searchParams.get('reply');
          if (reply === null) return json({ me });
          const line = Number(url.searchParams.get('line'));
          if (!Number.isInteger(line) || !Number.isInteger(Number(reply))) return fail(400, 'expected p, line, hash, reply');
          const src = await readDoc(loc.abs);
          const text = replyText(src, splitFrontmatter(src).offset, line, url.searchParams.get('hash') ?? '', Number(reply));
          if (text === null) return json({ error: 'the file changed since this page was loaded', reason: 'stale' }, 409);
          return json({ me, text });
        },
        POST: mutation('doc-write', async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const body = qaRequestOf(await req.json().catch(() => null));
          if (!body) return fail(400, 'expected {p, line, hash, op, …}');
          // A reply is a few paragraphs; anything near this is not one.
          if ('text' in body && (body.text?.length ?? 0) > 100_000) return fail(413, 'the text is too long');
          const loc = await docAt(body.p);
          if (!loc) return fail(404, 'not a document');
          if (!registry.writableAt(loc)) return readOnly(loc, 'answer');

          const me = await signer(req, loc);
          const result = await queueWrite(loc.abs, async () => {
            const src = await readDoc(loc.abs);
            const result = applyQa(src, splitFrontmatter(src).offset, body, me);
            if ('error' in result) return result;
            await registry.writeFile(body.p, result.src);
            return result;
          });
          if ('error' in result) {
            const message: Record<QaError, string> = {
              stale: 'the file changed since this page was loaded',
              'not-an-item': 'that is no longer a question',
              'no-target': 'that option or reply is no longer there',
              empty: 'the text is empty',
              'needs-who': '🎫 needs who takes it: 👤name or 👥team',
            };
            return json({ error: message[result.error], reason: result.error }, result.error === 'empty' || result.error === 'needs-who' ? 400 : 409);
          }
          return json({ ok: true });
        }),
      },

      /**
       * Add a block under a heading — right under it or at the end of its section — as text, a
       * quote, a quote signed with the git user's name, a tip, a question, a disagreement or an
       * answer. Same guards as an answer: same origin, a writable folder, the heading's
       * fingerprint.
       */
      '/api/insert': {
        POST: mutation('doc-write', async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const body = (await req.json().catch(() => null)) as (Partial<AddRequest> & { p?: string }) | null;
          if (
            !body?.p ||
            !Number.isInteger(body.line) ||
            typeof body.hash !== 'string' ||
            (body.where !== 'below' && body.where !== 'end') ||
            !ADD_KINDS.includes(body.kind as AddKind) ||
            typeof body.text !== 'string'
          ) {
            return fail(400, 'expected {p, line, hash, where, kind, text}');
          }
          if (body.text.length > 100_000) return fail(413, 'the text is too long');
          const loc = await docAt(body.p);
          if (!loc) return fail(404, 'not a document');
          if (!registry.writableAt(loc)) return readOnly(loc, 'add to it');

          // Who signs a "my quote": this browser's author, else the git identity of the file's repository, else the login.
          let who = '';
          if (body.kind === 'my-quote') {
            const author = await authorOf(req, null);
            if (author.source === 'cookie' || author.source === 'github') who = author.name;
            else {
              const where = opts.noGit ? null : await store.repoFor(loc.root, loc.rel);
              who = (where && (await currentUser(where.repo))?.name) || userInfo().username;
            }
          }
          const result = await queueWrite(loc.abs, async () => {
            const src = await readDoc(loc.abs);
            const result = insertBlock(src, splitFrontmatter(src).offset, body as AddRequest, who);
            if ('error' in result) return result;
            await registry.writeFile(body.p!, result.src);
            return result;
          });
          if ('error' in result) {
            const message = {
              stale: 'the file changed since this page was loaded',
              'not-a-heading': 'that is no longer a heading',
              empty: 'there is nothing to add',
            }[result.error];
            return json({ error: message, reason: result.error }, result.error === 'empty' ? 400 : 409);
          }
          return json({ ok: true, line: result.line });
        }),
      },

      /** The settings page's options. Changing one is held to the same same-origin rule. */
      '/api/settings': {
        GET: () => json(settingsPayload()),
        POST: mutation('instance-config', async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
          if (!body) return fail(400, 'expected a JSON object');
          if ('editScheme' in body && normalizeEditScheme(body.editScheme) === null) return fail(400, 'editScheme: not an allowed URL scheme');
          const before = prefs.settings.autoRw;
          await prefs.updateSettings(body);
          // Auto-rw on or off changes which folders are writable: every tab shows it.
          if (prefs.settings.autoRw !== before) {
            server.publish('roots', JSON.stringify({ t: 'roots', roots: registry.list().map((r) => r.id) }));
          }
          return json(settingsPayload());
        }),
      },

      /**
       * This browser's author name — what its signed replies carry. The cookie is attribution only:
       * it grants no access and `prefs.json` is never written. GET says who signs here and where
       * the name comes from (`cookie` is the browser's own); POST sets it, or clears it with an empty
       * name. The same-origin rule applies; a name with nothing usable is 400.
       */
      '/api/author': {
        GET: async (req) => {
          const p = new URL(req.url).searchParams.get('p');
          const loc = p ? await docAt(p) : null;
          const author = await authorOf(req, loc ?? { root: registry.defaultRoot(), rel: '' });
          return authorPayload(author, readAuthorCookie(req.headers.get('cookie'), cookiePort()));
        },
        POST: mutation('attribution', async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
          if (!body || typeof body.name !== 'string') return fail(400, 'expected {name}');
          const name = body.name.trim() === '' ? null : normalizeAuthorName(body.name);
          if (name === null && body.name.trim() !== '') return fail(400, 'name: no usable characters');
          const secure = new URL(req.url).protocol === 'https:';
          // Answer as the page's next request will be seen: with the new cookie.
          const next = new Request(req.url, { headers: name ? { cookie: `${authorCookieName(cookiePort())}=${encodeURIComponent(name)}` } : {} });
          const res = authorPayload(await authorOf(next, { root: registry.defaultRoot(), rel: '' }), name);
          res.headers.append('set-cookie', authorSetCookie(cookiePort(), name, secure));
          return res;
        }),
      },

      /** The Agent Bus integration: on or off, connected or why not, the agents and the default ones. */
      '/api/ab': read(async () => {
        const ab = prefs.agentBus;
        if (!ab.enabled) return json({ enabled: false });
        const st = await bus.status();
        // the filter narrows the lists; a default agent stays, whatever its name
        const agents = (st.connected ? await bus.agents().catch(() => []) : []).filter((a) => passes(a.name, ab.filter) || ab.default.includes(a.name));
        return json({ enabled: true, me: bus.me, socket: ab.socket || defaultSocket(), ...st, default: ab.default, filter: ab.filter, agents });
      }),

      /** The settings page's default agents — asked by a page that names none. */
      '/api/ab/default': {
        POST: mutation('instance-config', async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          if (!prefs.agentBus.enabled) return fail(404, 'the agent bus is off — mdhouse --agent-bus');
          const body = (await req.json().catch(() => null)) as { names?: unknown } | null;
          if (!Array.isArray(body?.names) || !body.names.every(validTarget)) return fail(400, 'expected {names: [bus name]}');
          const ab = await prefs.setAgentBus({ default: [...new Set(body.names as string[])] });
          return json({ default: ab.default });
        }),
      },

      /** The settings page's names filter: a regex per line. */
      '/api/ab/filter': {
        POST: mutation('instance-config', async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          if (!prefs.agentBus.enabled) return fail(404, 'the agent bus is off — mdhouse --agent-bus');
          const body = (await req.json().catch(() => null)) as { lines?: unknown } | null;
          if (!Array.isArray(body?.lines) || body.lines.length > 50 || !body.lines.every((l) => typeof l === 'string' && l.length <= 200)) {
            return fail(400, 'expected {lines: [regex]}');
          }
          const lines = (body.lines as string[]).map((l) => l.trim()).filter(Boolean);
          const bad = badPatterns(lines);
          if (bad.length) return fail(400, `not a regex: ${bad.join(', ')}`);
          const ab = await prefs.setAgentBus({ filter: lines });
          return json({ filter: ab.filter });
        }),
      },

      /** Ask agents about a document: the job id at once, its events over the WebSocket (`ab`). */
      '/api/ab/send': {
        POST: mutation('external-send', async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          if (!prefs.agentBus.enabled) return fail(404, 'the agent bus is off — mdhouse --agent-bus');
          const body = (await req.json().catch(() => null)) as { p?: unknown; targets?: unknown; action?: unknown; note?: unknown } | null;
          const targets = body?.targets;
          if (
            typeof body?.p !== 'string' ||
            !Array.isArray(targets) ||
            !targets.length ||
            targets.length > 10 ||
            !targets.every(validTarget) ||
            !AB_ACTIONS.includes(body.action as AbAction) ||
            (body.note !== undefined && typeof body.note !== 'string')
          ) {
            return fail(400, 'expected {p, targets: [bus name], action, note?}');
          }
          const note = (body.note as string | undefined) ?? '';
          if (note.length > 20_000) return fail(413, 'note too long');
          if (body.action === 'note' && !note.trim()) return fail(400, 'a note is empty');
          const loc = await docAt(body.p);
          if (!loc) return fail(404, 'not a document');
          // An agent acts on the file itself, past every write check here.
          if (registry.inReference(loc.abs)) return fail(403, `${loc.rel} is mdhouse reference material — not sent to agents`);
          const url = new URL(registry.docUrl(loc.root, loc.rel), req.url).href;
          try {
            const job = await bus.ask([...new Set(targets as string[])], requestText(body.action as AbAction, loc.abs, url, note));
            return json({ job });
          } catch (err) {
            return fail(503, (err as Error).message);
          }
        }),
      },

      /** A job's events so far — for a page that reconnected and missed some. */
      '/api/ab/job': read((req) => {
        const events = bus.job(new URL(req.url).searchParams.get('id') ?? '');
        return events ? json({ events }) : fail(404, 'no such job');
      }),

      /**
       * The settings page's delete button: forget a directory and stop serving it.
       *
       * The only request a page can make that changes what mdhouse serves, so it has to come
       * from mdhouse's own page. A browser sends `Origin` on a cross-site POST, and
       * `Sec-Fetch-Site` on every request; either one saying "another site" is a refusal. A
       * non-browser caller sends neither and is let through — it could edit prefs.json itself.
       */
      '/api/roots/remove': {
        POST: mutation('root-admin', async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const body = (await req.json().catch(() => null)) as { id?: string } | null;
          const root = body?.id ? registry.get(body.id) : undefined;
          if (!root) return fail(404, 'unknown root');
          if (root.kind === 'reference') return fail(403, `${root.name} is mdhouse reference material — it cannot be removed`);
          return json(await removeRoots([root.path]));
        }),
      },

      /**
       * The git view of a folder — see `lib/gitpage.ts`. 404 for a folder in no repo: the git
       * link shows only on folders inside one.
       */
      '/api/git': read(async (req) => {
        const at = await gitAt(new URL(req.url));
        if ('error' in at) return at.error;
        const [head, dirty] = await Promise.all([repoHead(at.repo), dirtyFiles(at.repo)]);
        const sync = head ? await syncState(at.repo, head.branch) : null;
        // Age and size, for the changed-files table — a deleted file has neither.
        const changed = await Promise.all(
          dirty.map(async (f) => {
            const st = await stat(`${at.repo}/${f.path}`).catch(() => null);
            return st?.isFile() ? { ...f, mtime: st.mtimeMs, size: st.size } : f;
          }),
        );
        return json({
          repo: at.repo.split('/').pop(),
          dir: at.dir,
          rootRel: repoRel(at.repo, at.root.path),
          head,
          dirty: changed,
          commitMessage: suggestMessage(commitable(dirty)),
          sync,
          // Who "me" is in this repo — its git user — so the page can leave your own name out.
          me: await currentUser(at.repo),
          writable: at.root.writable,
        });
      }),
      '/api/git/commits': read(async (req) => {
        const url = new URL(req.url);
        const at = await gitAt(url);
        if ('error' in at) return at.error;
        const skip = Math.max(0, Number(url.searchParams.get('skip')) || 0);
        return json({ commits: await folderLog(at.repo, at.dir, skip, 50) });
      }),
      '/api/git/files': read(async (req) => {
        const at = await gitAt(new URL(req.url));
        if ('error' in at) return at.error;
        return json(await trackedFiles(at.repo, at.dir));
      }),
      '/api/git/remote': read(async (req) => {
        const url = new URL(req.url);
        const at = await gitAt(url);
        if ('error' in at) return at.error;
        const head = await repoHead(at.repo);
        const key = `${at.repo}\0${head?.branch}\0${head?.commit?.hash}`;
        const hit = remoteCache.get(key);
        // The page asks by itself on every visit: origin is asked at most every 30 seconds per
        // repo, branch and HEAD; the button asks afresh.
        if (hit && Date.now() - hit.at < 30_000 && !flag(url, 'fresh')) return json({ ...(await hit.state), cachedAt: hit.at });
        const state = remoteState(at.repo, head?.branch ?? 'HEAD');
        remoteCache.set(key, { at: Date.now(), state });
        if (remoteCache.size > 50) remoteCache.delete(remoteCache.keys().next().value!);
        return json({ ...(await state), cachedAt: null });
      }),
      /**
       * Commit, pull, push — a writable folder only, same origin, one at a time per repo.
       * `git commit -a`: the page shows the files it takes, and a non-Markdown one has to be
       * confirmed; a file outside the root or in a read-only root refuses it. Pull and push with
       * uncommitted files: confirmed, and only when they are all Markdown. Pull is refused while
       * the repo holds a read-only root or files outside the root.
       */
      '/api/git/commit': {
        POST: mutation('git-write', async (req) => {
          const body = (await req.json().catch(() => null)) as { p?: string; message?: string; files?: string[]; nonMd?: boolean } | null;
          const at = await gitWrite(req, body?.p);
          if ('error' in at) return at.error;
          const message = body?.message?.trim();
          if (!message) return fail(400, 'a commit message is needed');
          if (message.length > 100_000) return fail(413, 'the commit message is too long');
          return queueWrite(`git:${at.repo}`, async () => {
            const files = commitable(await dirtyFiles(at.repo));
            if (!files.length) return fail(409, 'nothing to commit');
            const foreign = files.filter((f) => {
              const abs = `${at.repo}/${f.path}`;
              return !within(abs, at.root.path) || registry.list().some((r) => !r.writable && within(abs, r.path));
            });
            if (foreign.length) return json({ error: `changes outside ${at.root.name} or in a read-only folder — commit in a terminal`, files: foreign }, 409);
            const listed = [...(body?.files ?? [])].sort().join('\n');
            if (listed !== files.map((f) => f.path).sort().join('\n')) return json({ error: 'the files changed meanwhile — have a look', files }, 409);
            if (files.some((f) => !f.md) && !body?.nonMd) return json({ error: 'confirm the files that are not Markdown', files }, 409);
            const r = await run(at.repo, ['commit', '-a', '-m', message]);
            return r.code === 0 ? json({ ok: true, output: r.out.trim() }) : fail(500, (r.err || r.out).trim());
          });
        }),
      },
      /**
       * One file, from its own page: `git commit -- <file>`, which takes that path from the
       * working tree and leaves anything else staged alone. An untracked file is added first.
       * No non-Markdown tick, unlike `/api/git/commit`: that one guards files the user never
       * looked at, and this is the file on screen.
       */
      '/api/git/commit-file': {
        POST: mutation('git-write', async (req) => {
          const body = (await req.json().catch(() => null)) as { p?: string; message?: string } | null;
          // The file's folder: same origin, git on, in a repo, writable.
          const at = await gitWrite(req, body?.p?.replace(/\/[^/]*$/, ''));
          if ('error' in at) return at.error;
          const message = body?.message?.trim();
          if (!body?.p) return fail(400, 'expected {p, message}');
          if (!message) return fail(400, 'a commit message is needed');
          if (message.length > 100_000) return fail(413, 'the commit message is too long');
          const loc = await fileAt(body.p);
          if (!loc) return fail(404, 'no such file');
          const { repo } = at;
          const rel = repoRel(repo, loc.abs);
          if (!within(loc.abs, at.root.path) || registry.list().some((r) => !r.writable && within(loc.abs, r.path))) {
            return fail(409, `${rel} is outside ${at.root.name} or in a read-only folder — commit in a terminal`);
          }
          // One git write at a time per repo, as commit / pull / push; and after any write to the file.
          return queueWrite(`git:${repo}`, () => queueWrite(loc.abs, async () => {
            const dirty = (await dirtyFiles(repo)).find((f) => f.path === rel);
            if (!dirty) return fail(409, 'nothing to commit — this file matches the last commit');
            if (dirty.code === '??' && (await run(repo, ['add', '--', literal(rel)])).code !== 0) {
              return fail(500, `could not add ${rel}`);
            }
            const r = await run(repo, ['commit', '-m', message, '--', literal(rel)]);
            return r.code === 0 ? json({ ok: true, output: r.out.trim() }) : fail(500, (r.err || r.out).trim());
          }));
        }),
      },
      /** One document back to its last commit — its uncommitted changes thrown away. */
      '/api/git/reset': {
        POST: mutation('git-write', async (req) => {
          const body = (await req.json().catch(() => null)) as { p?: string; hash?: string } | null;
          // The document's folder: same origin, git on, in a repo, writable.
          const at = await gitWrite(req, body?.p?.replace(/\/[^/]*$/, ''));
          if ('error' in at) return at.error;
          if (!body?.p || typeof body.hash !== 'string') return fail(400, 'expected {p, hash}');
          const loc = await docAt(body.p);
          if (!loc) return fail(404, 'not a document');
          const { repo } = at;
          const rel = repoRel(repo, loc.abs);
          if (!within(loc.abs, at.root.path) || registry.list().some((r) => !r.writable && within(loc.abs, r.path))) {
            return fail(409, `${rel} is outside ${at.root.name} or in a read-only folder — reset it in a terminal`);
          }
          // One git write at a time per repo, as commit / pull / push; and after any write to the file.
          return queueWrite(`git:${repo}`, () => queueWrite(loc.abs, async () => {
            if ((await run(repo, ['ls-files', '--error-unmatch', '--', literal(rel)])).code !== 0) return fail(409, 'git has never seen this file');
            // Only the changes the page showed: saved again since, the file is kept.
            if (lineHash(await Bun.file(loc.abs).text()) !== body.hash) {
              return json({ error: 'the file changed since its changes were shown', reason: 'stale' }, 409);
            }
            const r = await run(repo, ['checkout', 'HEAD', '--', literal(rel)]);
            return r.code === 0 ? json({ ok: true }) : fail(500, (r.err || r.out).trim());
          }));
        }),
      },
      '/api/git/pull': { POST: mutation('git-sync', (req) => syncRepo(req, ['pull', '--ff-only'])) },
      '/api/git/push': { POST: mutation('git-sync', (req) => syncRepo(req, ['push'])) },

      '/api/tree': read(async (req) => {
        const url = new URL(req.url);
        const root = rootOf(url);
        if (!root) return fail(404, 'unknown root');
        const reveal = parseReveal(url.searchParams.getAll('reveal'));
        if (typeof reveal === 'string') return fail(400, reveal);
        return json(await store.tree(root, flag(url, 'ignored', opts.includeIgnoredDefault), reveal));
      }),

      /**
       * A file's page: every kind (`kindOf`) — Markdown rendered, code and text highlighted with
       * line numbers (`#L<n>`), the rest described for the page to show from `/api/raw`. Nothing
       * under a `.git` folder.
       *
       * `meta=1` answers the metadata alone (`meta: true`): nothing read past the head, no render.
       * `ifContent=<contentHash>` answers `unchanged: true` without a render when the text the page
       * would render still hashes so. `contentHash` covers the file's text only: link existence and
       * agent targets come from other files and prefs, so only a full answer refreshes them.
       */
      '/api/doc': read(async (req) => {
        const url = new URL(req.url);
        const meta = flag(url, 'meta');
        const ifContent = url.searchParams.get('ifContent');
        if (ifContent !== null && !/^[0-9a-f]{64}$/.test(ifContent)) return fail(400, 'ifContent is not a content hash');
        if (meta && ifContent !== null) return fail(400, 'meta and ifContent do not go together');
        const p = url.searchParams.get('p');
        const loc = p ? await registry.resolve(p) : await registry.fromDocUrl(url.searchParams.get('d') ?? '');
        if (!loc) return fail(403, 'path outside any root');
        if (inGitDir(loc.rel)) return fail(404, 'not found');

        const info = await stat(loc.abs).catch(() => null);
        // a folder named without its trailing slash: the page goes to the folder's own address
        if (info?.isDirectory()) return json({ folder: dirUrl(loc.root.id, loc.rel) });
        if (!info?.isFile()) return fail(404, 'not found');
        const kind = kindOf(loc.rel, await headOf(loc.abs));
        // Cheap — the status map is built once per root and invalidated by the watcher. It is
        // here because it decides whether the page opens on the diff or on the document.
        const status = await store.statusOf(loc.root, loc.rel).catch(() => undefined);
        const gitState = await store.gitStateOf(loc.root, loc.rel);
        const common = {
          kind,
          root: loc.root.id,
          rel: loc.rel,
          url: registry.docUrl(loc.root, loc.rel),
          raw: `/api/raw?p=${encodeURIComponent(registry.encode(loc.root, loc.rel))}`,
          writable: registry.writableAt(loc),
          ...(registry.inReference(loc.abs) ? { reference: true } : {}),
          mtime: info.mtimeMs,
          size: info.size,
          marks: prefs.marksFor(loc.root.path, loc.rel),
          ...(status ? { status } : {}),
          ...(gitState ? { gitState } : {}),
          gitRevision: await store.gitRevision(loc.root, loc.rel),
        };
        if (meta) return json({ ...common, meta: true });

        /** The hash of the text a render takes; the same hash means the same page. */
        const hashOf = (text: string) => createHash('sha256').update(text).digest('hex');

        if (kind !== 'md') {
          const shown = kind === 'code' || kind === 'text' || kind === 'html';
          const tooBig = shown && info.size > SHOW_MAX;
          const text = shown && !tooBig ? await Bun.file(loc.abs).text() : null;
          const contentHash = text === null ? null : hashOf(text);
          if (contentHash !== null && contentHash === ifContent) return json({ ...common, contentHash, unchanged: true });
          const html = text === null ? '' : await highlightFile(text, kind === 'text' ? null : (langOf(loc.rel) ?? 'html'));
          return json({ ...common, frontmatter: null, lineOffset: 0, html, headings: [], hasMermaid: false, tasks: { done: 0, total: 0 }, ...(tooBig ? { tooBig } : {}), ...(contentHash ? { contentHash } : {}) });
        }

        const src = await readDoc(loc.abs);
        const contentHash = hashOf(src);
        if (contentHash === ifContent) return json({ ...common, contentHash, unchanged: true });
        const { frontmatter, body, offset } = splitFrontmatter(src);
        const rendered = await render(body, {
          rootId: loc.root.id,
          docPath: loc.rel,
          docUrl: (rel) => registry.docUrl(loc.root, rel),
          // a file named in the text is a link when it is a file in this root
          exists: async (rels) => {
            const files = await Promise.all(
              rels.map(async (rel) => {
                const at = await registry.resolve(`${loc.root.id}/${rel}`);
                return at && at.root === loc.root && (await stat(at.abs).catch(() => null))?.isFile() ? rel : null;
              }),
            );
            return new Set(files.filter((r): r is string => r !== null));
          },
        });

        // the agents the document asks — sent only while the integration is on
        const ab = prefs.agentBus.enabled ? { ab: abTargets(src) } : {};
        return json({ ...common, frontmatter, lineOffset: offset, ...rendered, ...ab, contentHash });
      }),

      /** A file's bytes, with its type — `rawHeaders`. `/api/asset` is the old name. */
      '/api/raw': read((req) => raw(req)),
      '/api/asset': read((req) => raw(req)),

      /** Every file under a folder, not only Markdown — the folder page's ALL view. */
      '/api/files': read(async (req) => {
        const url = new URL(req.url);
        const p = (url.searchParams.get('p') ?? '').replace(/\/+$/, '');
        const loc = await registry.resolve(p);
        if (!loc) return fail(403, 'path outside any root');
        // `.git` and explicit exclusions, on the requested and on the resolved path
        const asked = p.includes('/') ? p.slice(p.indexOf('/') + 1) : '';
        if (asked && !(await store.allowedRel(loc.root, asked))) return fail(404, 'no such folder');
        const rules = await store.rules(loc.root);
        if (isExplicitlyDenied(rules, loc.rel)) return fail(404, 'no such folder');
        if (!(await stat(loc.abs).catch(() => null))?.isDirectory()) return fail(404, 'no such folder');
        const resolve = async (rel: string) => (await store.allowedRel(loc.root, rel))?.abs ?? null;
        const all = await listFiles(loc.root.path, loc.abs, { noGit: opts.noGit, rules, resolve });
        const git = await store.gitPaths(loc.root);
        const files = all.files.map((f) => {
          const gitState = gitStateIn(git, f.rel);
          return gitState ? { ...f, gitState } : f;
        });
        return json({ ...all, files });
      }),

      '/api/search': read(async (req) => {
        const url = new URL(req.url);
        const root = rootOf(url);
        if (!root) return fail(404, 'unknown root');

        const q = url.searchParams.get('q') ?? '';
        const includeIgnored = flag(url, 'ignored', opts.includeIgnoredDefault);
        const scan = await store.scan(root, includeIgnored);
        const result = await searchContent(root.path, scan.files, q, {
          regex: flag(url, 'regex'),
          includeIgnored,
          maxHits: limitOf(url, 500, 500),
        });
        return json(result);
      }),

      '/api/recents': read(async (req) => {
        const url = new URL(req.url);
        const root = rootOf(url);
        if (!root) return fail(404, 'unknown root');

        const limit = limitOf(url, 50, 500);
        const includeIgnored = flag(url, 'ignored', opts.includeIgnoredDefault);

        return json({ entries: await store.recents(root, limit, includeIgnored) });
      }),

      '/api/digest': read(async (req) => {
        const url = new URL(req.url);
        const root = rootOf(url);
        if (!root) return fail(404, 'unknown root');

        const limit = limitOf(url, 60, 300);
        return json(await store.digest(root, limit, flag(url, 'ignored', opts.includeIgnoredDefault)));
      }),

      '/api/git/log': read(async (req) => {
        const url = new URL(req.url);
        const loc = await registry.resolve(url.searchParams.get('p') ?? '');
        if (!loc) return fail(403, 'path outside any root');
        const empty = { commits: [], authors: null };
        if (opts.noGit) return json(empty);

        const where = await store.repoFor(loc.root, loc.rel);
        if (!where) return json(empty);
        // A handful of recent commits is what the panel is for; a worklog with two hundred of
        // them made the page a history browser with a document attached.
        const limit = limitOf(url, 5, 50);
        // Authorship rides along: finding the creating commit is the expensive part of this
        // page, and the document must not wait for it. Cached in the store per file.
        const [log, by] = await Promise.all([
          fileHistory(where.repo, where.repoRel, limit),
          store.authorship(loc.root, loc.rel),
        ]);
        return json({
          ...log,
          authors: by?.last
            ? {
                created: by.created && { name: by.created.author, email: by.created.email, at: by.created.date },
                last: { name: by.last.author, email: by.last.email, at: by.last.date, hash: by.last.hash.slice(0, 8) },
              }
            : null,
        });
      }),

      /**
       * What changed in one file: the working tree against HEAD when there is something
       * uncommitted, and otherwise the last commit that touched it — "compare with the
       * previous revision", which is the only comparison worth a default for a file nobody
       * has edited. `rev` asks for a particular commit instead, which is what clicking a row
       * in the history panel does.
       */
      '/api/git/diff': read(async (req) => {
        const url = new URL(req.url);
        const loc = await registry.resolve(url.searchParams.get('p') ?? '');
        if (!loc) return fail(403, 'path outside any root');

        const none: FileDiff = { kind: 'none', added: 0, removed: 0, hunks: [], truncated: false };
        if (opts.noGit) return json(none);

        /** A patch of a Markdown file is Markdown: every line goes out rendered. Any other file's, as typed. */
        const served = (d: FileDiff, current: boolean) =>
          json({ ...d, hunks: MD_EXT.test(loc.rel) ? markupHunks(d.hunks) : d.hunks, current });

        const asked = url.searchParams.get('rev') ?? '';
        // Only a hash, never a ref expression: this string reaches a git command line.
        const rev = /^[0-9a-f]{4,40}$/i.test(asked) ? asked : null;
        const where = await store.repoFor(loc.root, loc.rel);
        const status = await store.statusOf(loc.root, loc.rel);
        const committed = status !== 'modified' && status !== 'staged';

        // Not in a repository, or in one that has never seen this file: the whole file is new.
        if (!where || (status === 'untracked' && !rev)) {
          // A new image or binary has no lines to show.
          const kind = kindOf(loc.rel, await headOf(loc.abs).catch(() => undefined));
          if (kind !== 'md' && kind !== 'code' && kind !== 'text' && kind !== 'html') return json(none);
          const text = await Bun.file(loc.abs).text().catch(() => null);
          return text === null ? json(none) : served(newFileDiff(text), true);
        }

        if (rev) {
          const info = await commitInfo(where.repo, rev);
          const shown = info && (await commitDiff(where.repo, where.repoRel, info));
          if (!shown) return json(none);
          // The newest commit's result is the file on disk — as long as nothing has been
          // edited since. Any older revision describes a text this page is not showing.
          const by = await store.authorship(loc.root, loc.rel);
          return served(shown, committed && by?.last?.hash === info!.hash);
        }

        if (!committed) {
          // Read before the diff: a file changed in between is refused by Reset, never thrown away.
          const text = await Bun.file(loc.abs).text().catch(() => '');
          const working = await workingDiff(where.repo, where.repoRel);
          // An empty answer means the index and the working tree agree with HEAD after all —
          // a mode change, say. Fall through to the last commit rather than show nothing.
          if (working?.hunks.length) return served({ ...working, hash: lineHash(text) }, true);
        }

        const by = await store.authorship(loc.root, loc.rel);
        if (!by?.last) return json(none);
        const last = await commitDiff(where.repo, where.repoRel, by.last);
        return last ? served(last, committed) : json(none);
      }),

      '/api/marks': {
        GET: async (req) => {
          const url = new URL(req.url);
          const root = rootOf(url);
          if (!root) return fail(404, 'unknown root');
          return json(prefs.get(root.path));
        },
        POST: mutation('shared-prefs', async (req) => {
          // Bun parses the body whatever its content-type, so a cross-site `text/plain` form
          // post would otherwise land here.
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const body = (await req.json().catch(() => null)) as {
            root?: string;
            path?: string;
            mark?: Mark;
            on?: boolean;
          } | null;
          if (!body?.path || !body.mark || !MARKS.includes(body.mark)) return fail(400, 'path and mark are required');
          if (body.path.length > 4096) return fail(413, 'the path is too long');

          const root = body.root ? registry.get(body.root) : registry.defaultRoot();
          if (!root) return fail(404, 'unknown root');

          const marks = await prefs.set(root.path, body.path, body.mark, body.on !== false);
          // An ignore rule changes what the tree contains.
          if (body.mark === 'ignored') store.invalidate(root.id);
          return json(marks);
        }),
      },
    }),

    async fetch(req, srv) {
      if (!trustedHost(req.headers.get('host'), hostname, prefs.currentHostNames())) return fail(421, 'unrecognised host name');
      const denied = await admit(req);
      if (denied) return denied;
      const url = new URL(req.url);
      if (url.pathname === '/ws') {
        // A cross-site page must not subscribe to the live channel: it names every root and
        // every file as it changes.
        if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
        if (srv.upgrade(req)) return undefined as unknown as Response;
        return fail(400, 'websocket upgrade failed');
      }
      return rootPage(req);
    },

    websocket: {
      open(ws: ServerWebSocket<undefined>) {
        const rootIds = registry.list().map((r) => r.id);
        for (const id of rootIds) ws.subscribe(`root:${id}`);
        ws.subscribe('roots');
        ws.subscribe('ab');
        ws.send(JSON.stringify({ t: 'hello', roots: rootIds }));
      },
      message(ws: ServerWebSocket<undefined>, raw: string | Buffer) {
        // The only client message is a liveness ping; everything else flows server -> client.
        if (raw.toString() === 'ping') ws.send(JSON.stringify({ t: 'pong' }));
      },
      close() {},
    },

    error(err) {
      if (err instanceof ReadOnlyError) return fail(403, err.message);
      console.error(err);
      return fail(500, 'internal error');
    },
  });

  const watcher = new Watcher((events) => {
    for (const ev of events) {
      store.invalidate(ev.rootId, ev.kind === 'git');
      server.publish(`root:${ev.rootId}`, JSON.stringify({ t: ev.kind, root: ev.rootId, paths: ev.paths }));
    }
  });
  const watchTree = async (root: Root): Promise<void> => {
    watcher.watchRoot(root);
    // A root inside a checkout, or a linked worktree, has its git dirs out of reach of the recursive watch.
    if (!opts.noGit) watcher.watchRepo(root, await gitDirs(root.path));
  };
  for (const root of registry.list()) await watchTree(root);

  /**
   * Serve more directories, at the request of a second `mdhouse` on the control socket.
   *
   * Adding rather than replacing is deliberate. A tab open on one tree should not turn into a
   * different tree because a terminal somewhere ran another command: the reader loses their
   * place, the open document 404s, and nothing says why. mdhouse already serves several roots
   * with a switcher, so the new directory simply joins them and the caller is told its URL.
   */
  const addRoots = async (dirs: string[], writable: boolean, save = false): Promise<AddReply> => {
    const asked = new Set<string>();
    const added = new Set<string>();
    const upgraded = new Set<string>();

    for (const dir of dirs) {
      const known = new Set(registry.list().map((r) => r.id));
      const root = await registry.add(dir, writable);
      // `--rw` for a folder already served read-only upgrades it in place. Never the other way:
      // taking write access away is `-p` without `--rw` and a restart, or `--rm`.
      // A folder writable only by auto-rw is asked for too: `--rw` outlives auto-rw going off.
      if (writable && !root.rwAsked) {
        if (!root.writable) upgraded.add(root.id);
        registry.setWritable(root.id, true);
      }
      // Asking for a directory already served is a request for its URL, not a second copy of
      // it — only a genuinely new root needs a watcher.
      if (!known.has(root.id)) {
        await watchTree(root);
        added.add(root.id);
      }
      asked.add(root.id);
      if (save) await prefs.addSaved(root.path, writable);
    }

    const roots = rootLines(added, asked).map((r) => (upgraded.has(r.id) ? { ...r, upgraded: true } : r));
    // Open tabs learn about the new root over the channel they already hold.
    server.publish('roots', JSON.stringify({ t: 'roots', roots: roots.map((r) => r.id) }));
    return { url: pageUrl(hostname, server.port), roots };
  };

  const rootLines = (added: Set<string> = new Set(), asked: Set<string> = new Set()): RootLine[] =>
    registry.list().map((r) => ({
      ...r,
      added: added.has(r.id),
      asked: asked.has(r.id),
      saved: prefs.isSaved(r.path),
    }));

  /**
   * Forget directories and stop serving them — `mdhouse --rm`, or the settings page.
   *
   * A directory may have been deleted since it was saved, so a path that no longer resolves is
   * matched as written. The last project root is never removed: with none, every request would
   * have nothing to answer from. It is unsaved, kept until exit, and the reply says so. Throws,
   * removing nothing, when a directory named is a reference root.
   */
  const removeRoots = async (dirs: string[]): Promise<RemoveReply> => {
    const results: RemoveReply['results'] = [];
    const paths = await Promise.all(dirs.map((dir) => realpath(resolvePath(dir)).catch(() => resolvePath(dir))));
    const reference = registry.list().find((r) => r.kind === 'reference' && paths.includes(r.path));
    if (reference) throw new Error(`${reference.path} is mdhouse reference material — it cannot be removed`);
    for (const abs of paths) {
      const unsaved = await prefs.removeSaved(abs);
      const root = registry.list().find((r) => r.path === abs);
      if (!root) {
        results.push({ path: abs, unsaved, removed: false });
        continue;
      }
      if (registry.projects().length === 1) {
        results.push({ path: abs, unsaved, removed: false, kept: true });
        continue;
      }
      registry.remove(root.id);
      watcher.unwatch(root.id);
      store.drop(root.id);
      results.push({ path: abs, unsaved, removed: true });
    }

    const roots = rootLines();
    server.publish('roots', JSON.stringify({ t: 'roots', roots: roots.map((r) => r.id) }));
    return { results, roots };
  };

  /** Everything this process holds open, released in the right order. */
  const shutdown = () => {
    watcher.close();
    control?.stop();
    server.stop(true);
    process.exit(0);
  };

  const control = await serveControl(port, {
    add: (req) => addRoots(req.dirs, req.rw === true, req.save === true),
    remove: (req) => removeRoots(req.dirs),
    ping: () => ({
      pid: process.pid,
      url: pageUrl(hostname, server.port),
      roots: registry.list().map((r) => ({
        name: r.name,
        path: r.path,
        writable: r.writable,
        saved: prefs.isSaved(r.path),
        kind: r.kind ?? 'project',
      })),
      service: ownUnit(),
      stop: ownStopCommand(),
    }),
    // `mdhouse exit`. The daemon runs detached with no terminal attached to it, so asking it
    // over the socket is the supported way to stop it — there is no Ctrl+C to press.
    exit: shutdown,
  });

  return { server, store, watcher, control, shutdown, routes };
}
