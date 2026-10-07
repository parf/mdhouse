/**
 * The HTTP + WebSocket server.
 *
 * Bun bundles `index.html` and everything it imports natively, so there is no vite, no webpack
 * and no build step to run before starting — `bun run src/cli.ts <dir>` is the whole thing.
 */

import type { ServerWebSocket } from 'bun';
import index from './index.html';
import { realpath } from 'node:fs/promises';
import { homedir, hostname as machineName } from 'node:os';
import { resolve as resolvePath } from 'node:path';
import { Registry, ReadOnlyError, type Root } from './lib/roots';
import { repoToplevel } from './lib/scan';
import { Prefs, MARKS, type Mark } from './lib/prefs';
import { Store } from './lib/store';
import { markupHunks, render, splitFrontmatter, toggleTask } from './lib/render';
import { answerText, findQuestion, QA_FORMS, writeAnswer, type AnswerRequest, type QaForm } from './lib/qa';
import { searchContent } from './lib/search';
import { commitDiff, commitInfo, fileHistory, newFileDiff, workingDiff, type FileDiff } from './lib/git';
import { Watcher } from './lib/watch';
import { serveControl, type AddReply, type RemoveReply, type RootLine } from './lib/control';

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

const RAW_EXT = /\.(mmd|mermaid|txt|sql|sh|ya?ml|json|csv|ini|conf|toml|howto|local|log|env|dist|example|readme)$/i;
const ASSET_EXT = /\.(png|jpe?g|gif|webp|svg|avif|ico)$/i;

/** Resolved once at startup; mermaid is a direct dependency so this always exists. */
const MERMAID_DIST = new URL('../node_modules/mermaid/dist', import.meta.url).pathname;

export async function serve(opts: ServeOptions) {
  const { registry, prefs, port, hostname } = opts;
  const store = new Store(registry, prefs, { noGit: opts.noGit, gitLogLimit: opts.gitLogLimit });
  /**
   * Writes to documents in flight, per file, so they apply one after another — two quick clicks
   * (a tick and an answer, or two ticks) each run against the file the previous one left.
   */
  const fileWrites = new Map<string, Promise<unknown>>();
  const queueWrite = <T>(abs: string, write: () => Promise<T>): Promise<T> => {
    const run = (fileWrites.get(abs) ?? Promise.resolve()).then(write);
    const tail = run.catch(() => {});
    fileWrites.set(abs, tail);
    // Forget the file once its last queued write is done, so the map does not grow.
    void tail.then(() => fileWrites.get(abs) === tail && fileWrites.delete(abs));
    return run;
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

  /**
   * Every handler behind the host check. The app's HTML entry is left as it is — it is the
   * bundle, the same for everyone, and carries no data.
   */
  type Handler = (req: Request) => Response | Promise<Response>;
  const check = (h: Handler): Handler => (req) =>
    trustedHost(req.headers.get('host'), hostname) ? h(req) : fail(421, 'unrecognised host name');
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
      '/': index,
      // Every document URL is `/d/<path>/<file>.md`; the SPA takes it from here.
      '/d/*': index,
      '/settings': index,

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
            const result = toggleTask(await Bun.file(loc.abs).text(), body.line!, body.hash!);
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
       * Answering a question from the page — the second write mdhouse makes to a document.
       *
       * GET loads the answer under a question as editable text, with its fingerprint; POST writes
       * it, in the question's own syntax (qa.ts). Both are refused when the question's lines no
       * longer match what the page rendered, and POST the same way when the answer changed
       * under it, so a stale page never overwrites anything. Same rules as `/api/task`.
       */
      '/api/qa/answer': {
        GET: async (req) => {
          const url = new URL(req.url);
          const loc = await registry.resolve(url.searchParams.get('p') ?? '');
          const form = url.searchParams.get('form') as QaForm;
          const line = Number(url.searchParams.get('line'));
          if (!loc || !/\.mdx?$/i.test(loc.rel)) return fail(404, 'not a document');
          if (!QA_FORMS.includes(form) || !Number.isInteger(line)) return fail(400, 'expected p, line, form, hash');
          const src = await Bun.file(loc.abs).text();
          const found = findQuestion(src, splitFrontmatter(src).offset, line, form);
          if (!found || found.hash !== url.searchParams.get('hash')) {
            return json({ error: 'the file changed since this page was loaded', reason: 'stale' }, 409);
          }
          const text = found.answer ? answerText(found.lines.slice(found.answer.start, found.answer.end), form) : '';
          return json({ text, answerHash: found.answerHash });
        },
        POST: async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const body = (await req.json().catch(() => null)) as (Partial<AnswerRequest> & { p?: string }) | null;
          if (
            !body?.p ||
            !Number.isInteger(body.line) ||
            !QA_FORMS.includes(body.form as QaForm) ||
            typeof body.hash !== 'string' ||
            typeof body.answerHash !== 'string' ||
            typeof body.text !== 'string'
          ) {
            return fail(400, 'expected {p, line, form, hash, answerHash, text}');
          }
          const loc = await registry.resolve(body.p);
          if (!loc || !/\.mdx?$/i.test(loc.rel)) return fail(404, 'not a document');
          if (!loc.root.writable) return fail(403, `${loc.root.name} is read-only — start it with --rw to answer`);

          const result = await queueWrite(loc.abs, async () => {
            const src = await Bun.file(loc.abs).text();
            const result = writeAnswer(src, splitFrontmatter(src).offset, body as AnswerRequest);
            if ('error' in result) return result;
            await registry.writeFile(body.p!, result.src);
            return result;
          });
          if ('error' in result) {
            const message = {
              stale: 'the file changed since this page was loaded',
              'not-a-question': 'that is no longer a question',
              empty: 'the answer is empty',
            }[result.error];
            return json({ error: message, reason: result.error }, result.error === 'empty' ? 400 : 409);
          }
          return json({ ok: true });
        },
      },

      /** The settings page's options. Changing one is held to the same same-origin rule. */
      '/api/settings': {
        GET: () => json(prefs.settings),
        POST: async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
          if (!body) return fail(400, 'expected a JSON object');
          return json(await prefs.updateSettings(body));
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

        const src = await file.text();
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
        return new Response(file, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
      },

      '/api/asset': async (req) => {
        const url = new URL(req.url);
        const loc = await registry.resolve(url.searchParams.get('p') ?? '');
        if (!loc) return fail(403, 'path outside any root');
        if (!ASSET_EXT.test(loc.rel)) return fail(415, 'not an image');

        const file = Bun.file(loc.abs);
        if (!(await file.exists())) return fail(404, 'not found');
        return new Response(file, { headers: { 'cache-control': 'no-cache' } });
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
          maxHits: Number(url.searchParams.get('limit') ?? 500),
        });
        return json(result);
      },

      '/api/recents': async (req) => {
        const url = new URL(req.url);
        const root = rootOf(url);
        if (!root) return fail(404, 'unknown root');

        const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 500);
        const includeIgnored = flag(url, 'ignored', opts.includeIgnoredDefault);

        return json({ entries: await store.recents(root, limit, includeIgnored) });
      },

      '/api/digest': async (req) => {
        const url = new URL(req.url);
        const root = rootOf(url);
        if (!root) return fail(404, 'unknown root');

        const limit = Math.min(Number(url.searchParams.get('limit') ?? 60), 300);
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
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 5, 1), 50);
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
          const working = await workingDiff(where.repo, where.repoRel);
          // An empty answer means the index and the working tree agree with HEAD after all —
          // a mode change, say. Fall through to the last commit rather than show nothing.
          if (working?.hunks.length) return served(working, true);
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
      // taking write access away is `-P` without `--rw` and a restart, or `--rm`.
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
    }),
    // `mdhouse exit`. The daemon runs detached with no terminal attached to it, so asking it
    // over the socket is the supported way to stop it — there is no Ctrl+C to press.
    exit: shutdown,
  });

  return { server, store, watcher, control, shutdown };
}
