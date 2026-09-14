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
import { fileHistory, authorship } from './lib/git';
import { Watcher } from './lib/watch';

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

export function serve(opts: ServeOptions) {
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
        const where = opts.noGit ? null : await store.repoFor(loc.root, loc.rel);
        const by = where ? await authorship(where.repo, where.repoRel) : null;

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
          authors: by?.last
            ? {
                created: by.created && { name: by.created.author, email: by.created.email, at: by.created.date },
                last: { name: by.last.author, email: by.last.email, at: by.last.date, hash: by.last.hash.slice(0, 8) },
              }
            : null,
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
        const empty = { commits: [], created: null, truncated: false };
        if (opts.noGit) return json(empty);

        const where = await store.repoFor(loc.root, loc.rel);
        if (!where) return json(empty);
        return json(await fileHistory(where.repo, where.repoRel, 20));
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

  return { server, store, watcher };
}
