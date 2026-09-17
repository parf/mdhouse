/**
 * The HTTP + WebSocket server.
 *
 * Bun bundles `index.html` and everything it imports natively, so there is no vite, no webpack
 * and no build step to run before starting — `bun run src/cli.ts <dir>` is the whole thing.
 */

import type { ServerWebSocket } from 'bun';
import index from './index.html';
import { Registry, ReadOnlyError, type Root } from './lib/roots';
import { Prefs, MARKS, type Mark } from './lib/prefs';
import { Store } from './lib/store';
import { render, splitFrontmatter } from './lib/render';
import { searchContent } from './lib/search';
import { commitDiff, commitInfo, fileHistory, newFileDiff, workingDiff, type FileDiff } from './lib/git';
import { Watcher } from './lib/watch';
import { serveControl, type AddReply } from './lib/control';

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

const RAW_EXT = /\.(mmd|mermaid|txt|sql|sh|ya?ml|json|csv|ini|conf|toml|howto|local|log|env|dist|example|readme)$/i;
const ASSET_EXT = /\.(png|jpe?g|gif|webp|svg|avif|ico)$/i;

/** Resolved once at startup; mermaid is a direct dependency so this always exists. */
const MERMAID_DIST = new URL('../node_modules/mermaid/dist', import.meta.url).pathname;

export async function serve(opts: ServeOptions) {
  const { registry, prefs, port, hostname } = opts;
  const store = new Store(registry, prefs, { noGit: opts.noGit, gitLogLimit: opts.gitLogLimit });

  /** Resolve the `root` query parameter, defaulting to the first root. */
  const rootOf = (url: URL): Root | null => {
    const id = url.searchParams.get('root');
    return id ? (registry.get(id) ?? null) : registry.defaultRoot();
  };

  const flag = (url: URL, name: string, dflt = false): boolean => {
    const v = url.searchParams.get(name);
    return v === null ? dflt : v !== '0' && v !== 'false';
  };

  const server = Bun.serve({
    port,
    hostname,
    development: false,
    // Bun turns SO_REUSEPORT on by default, which lets a second `mdhouse` bind the same port
    // and the kernel split requests between two processes serving two different trees — every
    // other click lands in the wrong one and 404s. Refuse the port instead, loudly.
    reusePort: false,

    routes: {
      '/': index,
      // Every document URL is `/d/<path>/<file>.md`; the SPA takes it from here.
      '/d/*': index,

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
          })),
          single: registry.single,
        }),

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

        const asked = url.searchParams.get('rev') ?? '';
        // Only a hash, never a ref expression: this string reaches a git command line.
        const rev = /^[0-9a-f]{4,40}$/i.test(asked) ? asked : null;
        const where = await store.repoFor(loc.root, loc.rel);
        const status = await store.statusOf(loc.root, loc.rel);
        const committed = status !== 'modified' && status !== 'staged';

        // Not in a repository, or in one that has never seen this file: the whole file is new.
        if (!where || (status === 'untracked' && !rev)) {
          const text = await Bun.file(loc.abs).text().catch(() => null);
          return json(text === null ? none : { ...newFileDiff(text), current: true });
        }

        if (rev) {
          const info = await commitInfo(where.repo, rev);
          const shown = info && (await commitDiff(where.repo, where.repoRel, info));
          if (!shown) return json(none);
          // The newest commit's result is the file on disk — as long as nothing has been
          // edited since. Any older revision describes a text this page is not showing.
          const by = await store.authorship(loc.root, loc.rel);
          return json({ ...shown, current: committed && by?.last?.hash === info!.hash });
        }

        if (!committed) {
          const working = await workingDiff(where.repo, where.repoRel);
          // An empty answer means the index and the working tree agree with HEAD after all —
          // a mode change, say. Fall through to the last commit rather than show nothing.
          if (working?.hunks.length) return json({ ...working, current: true });
        }

        const by = await store.authorship(loc.root, loc.rel);
        if (!by?.last) return json(none);
        const last = await commitDiff(where.repo, where.repoRel, by.last);
        return json(last ? { ...last, current: committed } : none);
      },

      '/api/marks': {
        GET: async (req) => {
          const url = new URL(req.url);
          const root = rootOf(url);
          if (!root) return fail(404, 'unknown root');
          return json(prefs.get(root.path));
        },
        POST: async (req) => {
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
    },

    async fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === '/ws') {
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
  for (const root of registry.list()) watcher.watchRoot(root);

  /**
   * Serve more directories, at the request of a second `mdhouse` on the control socket.
   *
   * Adding rather than replacing is deliberate. A tab open on one tree should not turn into a
   * different tree because a terminal somewhere ran another command: the reader loses their
   * place, the open document 404s, and nothing says why. mdhouse already serves several roots
   * with a switcher, so the new directory simply joins them and the caller is told its URL.
   */
  const addRoots = async (dirs: string[], writable: boolean): Promise<AddReply> => {
    const asked = new Set<string>();
    const added = new Set<string>();

    for (const dir of dirs) {
      const known = new Set(registry.list().map((r) => r.id));
      const root = await registry.add(dir, writable);
      // Asking for a directory already served is a request for its URL, not a second copy of
      // it — only a genuinely new root needs a watcher.
      if (!known.has(root.id)) {
        watcher.watchRoot(root);
        added.add(root.id);
      }
      asked.add(root.id);
    }

    const roots = registry.list().map((r) => ({ ...r, added: added.has(r.id), asked: asked.has(r.id) }));
    // Open tabs learn about the new root over the channel they already hold.
    server.publish('roots', JSON.stringify({ t: 'roots', roots: roots.map((r) => r.id) }));
    return { url: `http://${hostname}:${server.port}`, roots };
  };

  /** Everything this process holds open, released in the right order. */
  const shutdown = () => {
    watcher.close();
    control?.stop();
    server.stop(true);
    process.exit(0);
  };

  const control = await serveControl(port, {
    add: (req) => addRoots(req.dirs, req.rw === true),
    ping: () => ({
      pid: process.pid,
      url: `http://${hostname}:${server.port}`,
      roots: registry.list().map((r) => ({ name: r.name, path: r.path, writable: r.writable })),
    }),
    // `mdhouse exit`. The daemon runs detached with no terminal attached to it, so asking it
    // over the socket is the supported way to stop it — there is no Ctrl+C to press.
    exit: shutdown,
  });

  return { server, store, watcher, control, shutdown };
}
