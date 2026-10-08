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
import { Registry, ReadOnlyError, type Root } from './lib/roots';
import { listFiles, repoToplevel } from './lib/scan';
import { ASSET_EXT, HTML_EXT, RAW_EXT } from './lib/filetypes';
import { Prefs, MARKS, type Mark } from './lib/prefs';
import { Store } from './lib/store';
import { markupHunks, render, splitFrontmatter, toggleTask } from './lib/render';
import { applyQa, badgeName, lineHash, qaRequestOf, replyText, type QaError } from './lib/qa';
import { searchContent } from './lib/search';
import { commitDiff, commitInfo, currentUser, fileHistory, newFileDiff, workingDiff, type FileDiff } from './lib/git';
import { ADD_KINDS, insertBlock, type AddKind, type AddRequest } from './lib/insert';
import { convertLegacy } from './lib/legacy';
import { Watcher } from './lib/watch';
import { serveControl, type AddReply, type RemoveReply, type RootLine } from './lib/control';
import { ownUnit } from './lib/service';
import { allowedAddress, Users } from './lib/access';
import { commitable, dirtyFiles, folderLog, origin, remoteState, repoRel, run, suggestMessage, syncState, trackedFiles } from './lib/gitpage';
import { repoHead } from './lib/git';
import { stat } from 'node:fs/promises';

export interface ServeOptions {
  registry: Registry;
  prefs: Prefs;
  port: number;
  hostname: string;
  noGit?: boolean;
  gitLogLimit?: number;
  includeIgnoredDefault?: boolean;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const fail = (status: number, message: string) => json({ error: message }, status);

/**
 * Is this request addressed to mdhouse by a name a browser can be trusted with?
 *
 * DNS rebinding is the attack: a page at `evil.example` re-points that name at 127.0.0.1, and
 * from then on the browser treats mdhouse as the attacker's own origin — `Origin`, `Host` and
 * `Sec-Fetch-Site` all say "same origin", so no origin check can tell. What it cannot fake is
 * the name: the `Host` header carries the attacker's domain. So only names that cannot be
 * rebound are accepted: `localhost` and IP literals, plus, when mdhouse is bound to the network
 * on purpose (`--host`), this machine's own hostname.
 */
export function trustedHost(host: string | null, bound: string, machine = machineName()): boolean {
  if (!host) return false;
  const name = (host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.replace(/:\d+$/, ''))
    .toLowerCase()
    .replace(/\.$/, ''); // `localhost.` is still localhost
  const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(name);
  const ipv6 = /^[0-9a-f:.]+$/.test(name) && name.includes(':');
  if (name === 'localhost' || ipv4 || ipv6) return true;
  const loopback = bound === '127.0.0.1' || bound === 'localhost' || bound === '::1';
  if (loopback) return false;
  const me = machine.toLowerCase();
  return name === me || name === `${me}.local`;
}

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

/**
 * HTML is rendered, sandboxed: its scripts run, but in an opaque origin — no cookies, and every
 * request it makes back here is cross-site, so the write routes refuse it and reads stay unreadable.
 */
const SANDBOXED_HTML = { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': 'sandbox allow-scripts' };

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
  /**
   * Writes to documents in flight, per file, so they apply one after another — two quick clicks
   * (a tick and an answer, or two ticks) each run against the file the previous one left.
   */
  const fileWrites = new Map<string, Promise<unknown>>();
  /**
   * A document as mdhouse reads it: the old Q&A forms rewritten into the new markup (legacy.ts).
   * Every render and every write reads it so, and a write writes it converted.
   */
  const readDoc = async (abs: string): Promise<string> => {
    const raw = await Bun.file(abs).text();
    return convertLegacy(raw, splitFrontmatter(raw).offset);
  };

  /** Who a signed reply is from: prefs `me`, else the git identity of the file's repository, else the login. */
  const signer = async (loc: { root: Root; rel: string }): Promise<string> => {
    const where = opts.noGit ? null : await store.repoFor(loc.root, loc.rel);
    return badgeName(prefs.settings.me, where ? await currentUser(where.repo) : null, userInfo().username);
  };

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
  /** Pull or push: uncommitted files only when all Markdown, and confirmed. */
  const syncRepo = async (req: Request, args: string[]): Promise<Response> => {
    const body = (await req.json().catch(() => null)) as { p?: string; confirmed?: boolean } | null;
    const at = await gitWrite(req, body?.p);
    if ('error' in at) return at.error;
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
    !trustedHost(req.headers.get('host'), hostname) ? fail(421, 'unrecognised host name') : ((await admit(req)) ?? h(req));

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
      return new Response(await appHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    } catch (err) {
      appHtml = null;
      return fail(500, (err as Error).message);
    }
  };
  function guard<R extends string>(routes: Bun.Serve.Routes<undefined, R>): Bun.Serve.Routes<undefined, R> {
    const out: Record<string, unknown> = {};
    for (const [path, route] of Object.entries(routes)) {
      if (typeof route === 'function') out[path] = check(route as Handler);
      // A method map — `{ GET, POST }` — not the HTML bundle, which is an object too.
      else if (
        route &&
        typeof route === 'object' &&
        Object.keys(route).length > 0 &&
        Object.entries(route).every(([m, v]) => /^[A-Z]+$/.test(m) && typeof v === 'function')
      ) {
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
      '/__app/': index,
      '/': page,
      // Every document URL is `/d/<path>/<file>.md`; the SPA takes it from here.
      '/d/*': page,
      '/settings': page,

      /**
       * Mermaid's own ESM build, served straight from node_modules so it stays out of the app
       * bundle. Its chunks are imported relatively, so the whole dist directory is published.
       */
      '/vendor/mermaid/*': async (req) => {
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
      },

      '/api/roots': () =>
        json({
          roots: registry.list().map((r) => ({
            id: r.id,
            name: r.name,
            path: r.path,
            writable: r.writable,
            saved: prefs.isSaved(r.path),
          })),
          single: registry.single,
          // So the top bar can write paths under it as `~/…`.
          home: homedir(),
        }),

      /**
       * The settings page's delete button: forget a directory and stop serving it.
       *
       * The only request a page can make that changes what mdhouse serves, so it has to come
       * from mdhouse's own page. A browser sends `Origin` on a cross-site POST, and
       * `Sec-Fetch-Site` on every request; either one saying "another site" is a refusal. A
       * non-browser caller sends neither and is let through — it could edit prefs.json itself.
       */
      /**
       * Tick or untick one task checkbox — the only write mdhouse makes to a document.
       *
       * Refused on a read-only folder before the file is even read; refused with 409 when the
       * page was rendered from an older file (the line's fingerprint no longer matches), so a
       * stale tab cannot flip whatever now sits on that line. The write goes through
       * `Registry.writeFile()`, the one chokepoint, and the watcher then tells every open tab.
       */
      '/api/task': {
        POST: async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const body = (await req.json().catch(() => null)) as { p?: string; line?: number; hash?: string } | null;
          if (!body?.p || !Number.isInteger(body.line) || typeof body.hash !== 'string') {
            return fail(400, 'expected {p, line, hash}');
          }
          const loc = await registry.resolve(body.p);
          if (!loc || !/\.mdx?$/i.test(loc.rel)) return fail(404, 'not a document');
          if (!loc.root.writable) return fail(403, `${loc.root.name} is read-only — start it with --rw to tick boxes`);

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
        },
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
          const loc = await registry.resolve(url.searchParams.get('p') ?? '');
          if (!loc || !/\.mdx?$/i.test(loc.rel)) return fail(404, 'not a document');
          const me = await signer(loc);
          const reply = url.searchParams.get('reply');
          if (reply === null) return json({ me });
          const line = Number(url.searchParams.get('line'));
          if (!Number.isInteger(line) || !Number.isInteger(Number(reply))) return fail(400, 'expected p, line, hash, reply');
          const src = await readDoc(loc.abs);
          const text = replyText(src, splitFrontmatter(src).offset, line, url.searchParams.get('hash') ?? '', Number(reply));
          if (text === null) return json({ error: 'the file changed since this page was loaded', reason: 'stale' }, 409);
          return json({ me, text });
        },
        POST: async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const body = qaRequestOf(await req.json().catch(() => null));
          if (!body) return fail(400, 'expected {p, line, hash, op, …}');
          // A reply is a few paragraphs; anything near this is not one.
          if ('text' in body && (body.text?.length ?? 0) > 100_000) return fail(413, 'the text is too long');
          const loc = await registry.resolve(body.p);
          if (!loc || !/\.mdx?$/i.test(loc.rel)) return fail(404, 'not a document');
          if (!loc.root.writable) return fail(403, `${loc.root.name} is read-only — start it with --rw to answer`);

          const me = await signer(loc);
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
        },
      },

      /**
       * Add a block under a heading — right under it or at the end of its section — as text, a
       * quote, a quote signed with the git user's name, a tip, a question, a disagreement or an
       * answer. Same guards as an answer: same origin, a writable folder, the heading's
       * fingerprint.
       */
      '/api/insert': {
        POST: async (req) => {
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
          const loc = await registry.resolve(body.p);
          if (!loc || !/\.mdx?$/i.test(loc.rel)) return fail(404, 'not a document');
          if (!loc.root.writable) return fail(403, `${loc.root.name} is read-only — start it with --rw to add to it`);

          // Who signs a "my quote": the git identity of the file's repository, else the login.
          let who = '';
          if (body.kind === 'my-quote') {
            const where = opts.noGit ? null : await store.repoFor(loc.root, loc.rel);
            who = (where && (await currentUser(where.repo))?.name) || userInfo().username;
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
        },
      },

      /** The settings page's options. Changing one is held to the same same-origin rule. */
      '/api/settings': {
        GET: () => json(settingsPayload()),
        POST: async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
          if (!body) return fail(400, 'expected a JSON object');
          const before = prefs.settings.autoRw;
          await prefs.updateSettings(body);
          // Auto-rw on or off changes which folders are writable: every tab shows it.
          if (prefs.settings.autoRw !== before) {
            server.publish('roots', JSON.stringify({ t: 'roots', roots: registry.list().map((r) => r.id) }));
          }
          return json(settingsPayload());
        },
      },

      '/api/roots/remove': {
        POST: async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const body = (await req.json().catch(() => null)) as { id?: string } | null;
          const root = body?.id ? registry.get(body.id) : undefined;
          if (!root) return fail(404, 'unknown root');
          return json(await removeRoots([root.path]));
        },
      },

      /**
       * The git view of a folder — see `lib/gitpage.ts`. 404 for a folder in no repo: the git
       * link shows only on folders inside one.
       */
      '/api/git': async (req) => {
        const at = await gitAt(new URL(req.url));
        if ('error' in at) return at.error;
        const [head, host, dirty] = await Promise.all([repoHead(at.repo), origin(at.repo), dirtyFiles(at.repo)]);
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
          origin: host,
          dirty: changed,
          commitMessage: suggestMessage(commitable(dirty)),
          sync,
          // Who "me" is in this repo — its git user — so the page can leave your own name out.
          me: await currentUser(at.repo),
          writable: at.root.writable,
        });
      },
      '/api/git/commits': async (req) => {
        const url = new URL(req.url);
        const at = await gitAt(url);
        if ('error' in at) return at.error;
        const skip = Math.max(0, Number(url.searchParams.get('skip')) || 0);
        return json({ commits: await folderLog(at.repo, at.dir, skip, 50) });
      },
      '/api/git/files': async (req) => {
        const at = await gitAt(new URL(req.url));
        if ('error' in at) return at.error;
        return json({ files: await trackedFiles(at.repo, at.dir) });
      },
      '/api/git/remote': async (req) => {
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
      },
      /**
       * Commit, pull, push — a writable folder only, same origin, one at a time per repo.
       * `git commit -a`: the page shows the files it takes, and a non-Markdown one has to be
       * confirmed. Pull and push with uncommitted files: confirmed, and only when they are all
       * Markdown.
       */
      '/api/git/commit': {
        POST: async (req) => {
          const body = (await req.json().catch(() => null)) as { p?: string; message?: string; files?: string[]; nonMd?: boolean } | null;
          const at = await gitWrite(req, body?.p);
          if ('error' in at) return at.error;
          const message = body?.message?.trim();
          if (!message) return fail(400, 'a commit message is needed');
          if (message.length > 100_000) return fail(413, 'the commit message is too long');
          return queueWrite(`git:${at.repo}`, async () => {
            const files = commitable(await dirtyFiles(at.repo));
            if (!files.length) return fail(409, 'nothing to commit');
            const listed = [...(body?.files ?? [])].sort().join('\n');
            if (listed !== files.map((f) => f.path).sort().join('\n')) return json({ error: 'the files changed meanwhile — have a look', files }, 409);
            if (files.some((f) => !f.md) && !body?.nonMd) return json({ error: 'confirm the files that are not Markdown', files }, 409);
            const r = await run(at.repo, ['commit', '-a', '-m', message]);
            return r.code === 0 ? json({ ok: true, output: r.out.trim() }) : fail(500, (r.err || r.out).trim());
          });
        },
      },
      /** One document back to its last commit — its uncommitted changes thrown away. */
      '/api/git/reset': {
        POST: async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          if (opts.noGit) return fail(404, 'git is off');
          const body = (await req.json().catch(() => null)) as { p?: string; hash?: string } | null;
          if (!body?.p || typeof body.hash !== 'string') return fail(400, 'expected {p, hash}');
          const loc = await registry.resolve(body.p);
          if (!loc || !(await stat(loc.abs).catch(() => null))?.isFile()) return fail(404, 'no such file');
          if (!loc.root.writable) return fail(403, `${loc.root.name} is read-only`);
          const repo = await repoToplevel(loc.abs.replace(/\/[^/]*$/, ''));
          if (!repo) return fail(404, 'not in a git repository');
          const rel = repoRel(repo, loc.abs);
          // One git write at a time per repo, as commit / pull / push; and after any write to the file.
          return queueWrite(`git:${repo}`, () => queueWrite(loc.abs, async () => {
            if ((await run(repo, ['ls-files', '--error-unmatch', '--', rel])).code !== 0) return fail(409, 'git has never seen this file');
            // Only the changes the page showed: saved again since, the file is kept.
            if (lineHash(await Bun.file(loc.abs).text()) !== body.hash) {
              return json({ error: 'the file changed since its changes were shown', reason: 'stale' }, 409);
            }
            const r = await run(repo, ['checkout', 'HEAD', '--', rel]);
            return r.code === 0 ? json({ ok: true }) : fail(500, (r.err || r.out).trim());
          }));
        },
      },
      '/api/git/pull': { POST: (req) => syncRepo(req, ['pull', '--ff-only']) },
      '/api/git/push': { POST: (req) => syncRepo(req, ['push']) },

      '/api/tree': async (req) => {
        const url = new URL(req.url);
        const root = rootOf(url);
        if (!root) return fail(404, 'unknown root');
        return json(await store.tree(root, flag(url, 'ignored', opts.includeIgnoredDefault)));
      },

      '/api/doc': async (req) => {
        const url = new URL(req.url);
        const p = url.searchParams.get('p');
        const loc = p ? await registry.resolve(p) : await registry.fromDocUrl(url.searchParams.get('d') ?? '');
        if (!loc) return fail(403, 'path outside any root');

        const file = Bun.file(loc.abs);
        if (!(await file.exists())) return fail(404, 'not found');

        const src = /\.mdx?$/i.test(loc.rel) ? await readDoc(loc.abs) : await file.text();
        const { frontmatter, body, offset } = splitFrontmatter(src);
        const rendered = await render(body, {
          rootId: loc.root.id,
          docPath: loc.rel,
          docUrl: (rel) => registry.docUrl(loc.root, rel),
        });

        const stat = await file.stat();
        // Cheap — the status map is built once per root and invalidated by the watcher. It is
        // here because it decides whether the page opens on the diff or on the document.
        const status = await store.statusOf(loc.root, loc.rel).catch(() => undefined);

        return json({
          root: loc.root.id,
          rel: loc.rel,
          url: registry.docUrl(loc.root, loc.rel),
          writable: loc.root.writable,
          frontmatter,
          lineOffset: offset,
          mtime: stat.mtimeMs,
          size: stat.size,
          marks: prefs.marksFor(loc.root.path, loc.rel),
          ...(status ? { status } : {}),
          ...rendered,
        });
      },

      '/api/raw': async (req) => {
        const url = new URL(req.url);
        const loc = await registry.resolve(url.searchParams.get('p') ?? '');
        if (!loc) return fail(403, 'path outside any root');
        if (!RAW_EXT.test(loc.rel) && !/\.mdx?$/i.test(loc.rel)) return fail(415, 'not a viewable text file');

        const file = Bun.file(loc.abs);
        if (!(await file.exists())) return fail(404, 'not found');
        return new Response(file, {
          headers: HTML_EXT.test(loc.rel) ? SANDBOXED_HTML : { 'content-type': 'text/plain; charset=utf-8' },
        });
      },

      /** Every file under a folder, not only Markdown — the folder page's ALL view. */
      '/api/files': async (req) => {
        const url = new URL(req.url);
        const loc = await registry.resolve((url.searchParams.get('p') ?? '').replace(/\/+$/, ''));
        if (!loc) return fail(403, 'path outside any root');
        if (!(await stat(loc.abs).catch(() => null))?.isDirectory()) return fail(404, 'no such folder');
        return json(await listFiles(loc.root.path, loc.abs, { noGit: opts.noGit }));
      },

      '/api/asset': async (req) => {
        const url = new URL(req.url);
        const loc = await registry.resolve(url.searchParams.get('p') ?? '');
        if (!loc) return fail(403, 'path outside any root');
        if (!ASSET_EXT.test(loc.rel)) return fail(415, 'not an image');

        const file = Bun.file(loc.abs);
        if (!(await file.exists())) return fail(404, 'not found');
        // An image, never a page: opened on its own, an SVG's scripts would run in mdhouse's origin.
        return new Response(file, { headers: { 'cache-control': 'no-cache', 'content-security-policy': 'sandbox' } });
      },

      '/api/search': async (req) => {
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
      },

      '/api/recents': async (req) => {
        const url = new URL(req.url);
        const root = rootOf(url);
        if (!root) return fail(404, 'unknown root');

        const limit = limitOf(url, 50, 500);
        const includeIgnored = flag(url, 'ignored', opts.includeIgnoredDefault);

        return json({ entries: await store.recents(root, limit, includeIgnored) });
      },

      '/api/digest': async (req) => {
        const url = new URL(req.url);
        const root = rootOf(url);
        if (!root) return fail(404, 'unknown root');

        const limit = limitOf(url, 60, 300);
        return json(await store.digest(root, limit, flag(url, 'ignored', opts.includeIgnoredDefault)));
      },

      '/api/git/log': async (req) => {
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
      },

      /**
       * What changed in one file: the working tree against HEAD when there is something
       * uncommitted, and otherwise the last commit that touched it — "compare with the
       * previous revision", which is the only comparison worth a default for a file nobody
       * has edited. `rev` asks for a particular commit instead, which is what clicking a row
       * in the history panel does.
       */
      '/api/git/diff': async (req) => {
        const url = new URL(req.url);
        const loc = await registry.resolve(url.searchParams.get('p') ?? '');
        if (!loc) return fail(403, 'path outside any root');

        const none: FileDiff = { kind: 'none', added: 0, removed: 0, hunks: [], truncated: false };
        if (opts.noGit) return json(none);

        /** A patch of a Markdown file is Markdown: every line goes out rendered. */
        const served = (d: FileDiff, current: boolean) =>
          json({ ...d, hunks: markupHunks(d.hunks), current });

        const asked = url.searchParams.get('rev') ?? '';
        // Only a hash, never a ref expression: this string reaches a git command line.
        const rev = /^[0-9a-f]{4,40}$/i.test(asked) ? asked : null;
        const where = await store.repoFor(loc.root, loc.rel);
        const status = await store.statusOf(loc.root, loc.rel);
        const committed = status !== 'modified' && status !== 'staged';

        // Not in a repository, or in one that has never seen this file: the whole file is new.
        if (!where || (status === 'untracked' && !rev)) {
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
      },

      '/api/marks': {
        GET: async (req) => {
          const url = new URL(req.url);
          const root = rootOf(url);
          if (!root) return fail(404, 'unknown root');
          return json(prefs.get(root.path));
        },
        POST: async (req) => {
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
        },
      },
    }),

    async fetch(req, srv) {
      if (!trustedHost(req.headers.get('host'), hostname)) return fail(421, 'unrecognised host name');
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
      return fail(404, 'not found');
    },

    websocket: {
      open(ws: ServerWebSocket<undefined>) {
        const rootIds = registry.list().map((r) => r.id);
        for (const id of rootIds) ws.subscribe(`root:${id}`);
        ws.subscribe('roots');
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
    // A root inside a checkout has its .git above it, out of reach of the recursive watch.
    if (!opts.noGit) {
      const repo = await repoToplevel(root.path);
      if (repo) watcher.watchRepo(root, repo);
    }
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
      if (writable && !root.writable) {
        registry.setWritable(root.id, true);
        upgraded.add(root.id);
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
    return { url: `http://${hostname}:${server.port}`, roots };
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
   * matched as written. The last root is never removed: with none, every request would have
   * nothing to answer from. It is unsaved, kept until exit, and the reply says so.
   */
  const removeRoots = async (dirs: string[]): Promise<RemoveReply> => {
    const results: RemoveReply['results'] = [];
    for (const dir of dirs) {
      const abs = await realpath(resolvePath(dir)).catch(() => resolvePath(dir));
      const unsaved = await prefs.removeSaved(abs);
      const root = registry.list().find((r) => r.path === abs);
      if (!root) {
        results.push({ path: abs, unsaved, removed: false });
        continue;
      }
      if (registry.list().length === 1) {
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
      url: `http://${hostname}:${server.port}`,
      roots: registry.list().map((r) => ({
        name: r.name,
        path: r.path,
        writable: r.writable,
        saved: prefs.isSaved(r.path),
      })),
      service: ownUnit(),
    }),
    // `mdhouse exit`. The daemon runs detached with no terminal attached to it, so asking it
    // over the socket is the supported way to stop it — there is no Ctrl+C to press.
    exit: shutdown,
  });

  return { server, store, watcher, control, shutdown };
}
