/**
 * The HTTP + WebSocket server.
 *
 * Bun bundles `index.html` and everything it imports natively, so there is no vite, no webpack
 * and no build step to run before starting — `bun run src/cli.ts <dir>` is the whole thing.
 */

import type { ServerWebSocket } from 'bun';
import { Control, CTL_TOPIC, CTL_VERSION, registryDocUrl } from './lib/ab-control';
import { Tabs } from './lib/ws-tabs';
import index from './index.html';
import { realpath } from 'node:fs/promises';
import { homedir, hostname as machineName, userInfo } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { ProjectDirError, Registry, ReadOnlyError, type AccessMode, type Resolved, type Root } from './lib/roots';
import { dirUrl, normalizeEditScheme } from './lib/urls';
import { listFiles, repoToplevel } from './lib/scan';
import { inGitDir, kindOf, langOf, MD_EXT, type Kind } from './lib/filetypes';
import { SOURCE_MAX, sourceHash, sourceOf } from './lib/source';
import { CONFIG_DIR, Prefs, MARKS, publicSpaceAb, SPACE_DEFAULT_MAX, type Mark, type SpaceAbPublic } from './lib/prefs';
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
import { labelled, normalizeProjectName, parseNameRequest } from './lib/project-name';
import type { PolicyView } from './lib/prefs';
import { serveControl, type AddReply, type AdminMintReply, type RemoveReply, type RootLine } from './lib/control';
import { ownUnit, ownStopCommand } from './lib/service';
import { allowedAddress, exposedWhy, exposureOk, ipBytes, isLoopback, Users } from './lib/access';
import { ADMIN_FAMILIES, bundle, inventory, isMethodMap, mutation, read, VIEWER_REFUSED, type Actor, type RouteEntry } from './lib/authz';
import { AdminSessions, adminCookie, clearAdminCookie, readAdminCookie, type AdminCookieScope } from './lib/admin-session';
import { commitable, dirtyFiles, folderLog, remoteState, repoRel, run, suggestMessage, syncState, trackedFiles } from './lib/gitpage';
import { commitOf, dirtyPaths, headCommit, isAncestor, rangeCommits, repoHead } from './lib/git';
import { applyFlowAction, docFlow, isFlowError, verifyRun, listRuns, openRunOf, planFlowRun, runnableFlow, runsDir, sealKeyAt, startFlowRun, type FlowError, type FlowHostDeps, type FlowWrite } from './lib/flow-host';
import { AUTO_TOPIC, AUTO_VERSION, Automation, RunIndex, type LoadedRegistration } from './lib/automation';
import { Approvals, busStore, folderKey } from './lib/automation-state';
import { loadRegistrations, readRegistration, registrationLookup } from './lib/automation-registry';
import type { Schedule } from 'ai-agent-bus-sdk';
import { advanceDestination, readFlowRunDocument, readFlowRunMeta } from './lib/flow-run-markdown';
import { loadFlowCatalog, type LoadedFlowPackage } from './lib/flow-package';
import { AB_ACTIONS, abTargets, AgentBus, badPatterns, defaultSocket, passes, requestText, safeError, validEndpoint, validTarget, type AbAction, type Endpoint } from './lib/agent-bus';
import { stat } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { citeRecords } from './lib/rag-cite';
import { decodeSearchReply } from './lib/rag-sync-runtime';
import { isSourceKey, lastKeyOf, lastOf, searchBody, searchParams, shapeHits, sourceFor, type RagLast, type RagSource } from './lib/rag-ui';

/** A `/ws` socket: the tab id it asked for (`<id>.<proof>`), its User-Agent, and the id it got. */
interface WsData {
  asked: string | null;
  ua: string;
  clientId: string;
}

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
  /** Personal (no configured users): a request whose peer is loopback is the administrator. The CLI turns it on. */
  localAdmin?: boolean;
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

/**
 * The origin a local administrator exchange must come from: `http://<loopback name>:<port>` for a
 * daemon bound to loopback or to every address, else null. The name is exact — `localhost`,
 * `127.0.0.1` or `[::1]` — so no rebound or proxy name can stand in for it.
 */
export function localAdminOrigin(bound: string, port: number): string | null {
  const host = bound.toLowerCase();
  if (host === 'localhost') return `http://localhost:${port}`;
  const ip = ipBytes(host);
  if (!ip) return null;
  if (ip.every((b) => b === 0)) return ip.length === 4 ? `http://127.0.0.1:${port}` : `http://[::1]:${port}`;
  if (!isLoopback(ip)) return null;
  return ip.length === 4 ? `http://${ip.join('.')}:${port}` : `http://[::1]:${port}`;
}

/** Local administrator exchange origins accepted for this daemon: the minted one and its loopback aliases. */
function localOrigins(bound: string, port: number): Set<string> {
  if (!localAdminOrigin(bound, port)) return new Set();
  const all = [`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`];
  const ip = ipBytes(bound);
  if (ip && ip.length === 4 && isLoopback(ip)) all.push(`http://${ip.join('.')}:${port}`);
  return new Set(all);
}

/**
 * Did this administrator exchange come from a browser on this machine, at a local origin of this
 * daemon? The peer address must be loopback (forwarding headers are never read), `Host` and
 * `Origin` must name the same exact local origin, and `Sec-Fetch-Site`, when sent, same-origin.
 */
export function localExchange(req: Request, peer: string | undefined, bound: string, port: number): boolean {
  const ip = peer ? ipBytes(peer) : null;
  if (!ip || !isLoopback(ip)) return false;
  const host = req.headers.get('host')?.toLowerCase();
  const origin = req.headers.get('origin')?.toLowerCase();
  if (!host || !origin || origin !== `http://${host}` || !localOrigins(bound, port).has(origin)) return false;
  const site = req.headers.get('sec-fetch-site');
  return site === null || site === 'same-origin';
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
/** Longest path `POST /api/roots/add` takes, in UTF-16 code units — Linux's PATH_MAX. */
const ADD_PATH_MAX = 4096;

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
  registry.accessBlocked = () => prefs.accessBlocked() !== null;
  registry.viewer = () => prefs.mode() === 'viewer';
  registry.exposed = () => {
    prefs.refresh();
    return !exposureOk(hostname, prefs.access);
  };
  // The instance's own files (prefs, password hashes, sockets, the flow seal key) are never served.
  const xdg = (v: string | undefined, home: string) => `${v || `${homedir()}/${home}`}/mdhouse`;
  await registry.hide([
    dirname(prefs.path),
    CONFIG_DIR,
    xdg(process.env.XDG_STATE_HOME, '.local/state'),
    ...(process.env.XDG_RUNTIME_DIR ? [`${process.env.XDG_RUNTIME_DIR}/mdhouse`] : []),
  ]);
  /** The settings page's options, and the auto-rw paths its switch is about (set from the CLI). */
  const settingsPayload = () => {
    prefs.refresh();
    return { ...prefs.settings, autoRwPaths: prefs.autoRw, mode: prefs.mode() };
  };
  /** The Agent Bus integration — on and off from the CLI (`--agent-bus`); its events go to every tab. */
  const instanceBus = (): Endpoint => ({ addr: prefs.agentBus.socket || defaultSocket(), token: prefs.agentBus.token });
  const bus = new AgentBus(instanceBus, (ev) => server.publish('ab', JSON.stringify({ t: 'ab', ...ev })));
  /** The browser tabs on `/ws`, by the id Agent Bus control names them with. */
  const tabs = new Tabs();
  /** One journal line, and the same line to mdhouse's agent log while the Agent Bus is on. */
  const ctlAudit = (level: 'notice' | 'warning', line: string) => {
    console.log(`mdhouse  ${line}`);
    if (prefs.agentBus.enabled) void bus.agentLog(level, line);
  };
  /** Agent Bus control (MW.7): reads only — the roots, the tabs, and one tab sent to one document. */
  const abControl = new Control({
    setting: () => prefs.agentBus.control,
    roots: () =>
      registry.list().map((r) => ({ rootId: r.id, label: customName(r.path) ?? r.name, kind: r.kind ?? 'project', writable: r.writable })),
    docUrl: registryDocUrl(registry),
    clients: () => tabs.list(),
    navigate: (id, url) => tabs.navigate(id, url),
    // A tab's reader is not checked against a root yet (MW.0b): with users configured no tab is moved.
    team: () => Object.keys(prefs.access.users).length > 0,
    audit: ctlAudit,
  });
  const stopAbControl = bus.control({
    topic: CTL_TOPIC,
    handle: (from, body) => abControl.handle(from, body),
    wanted: () => {
      const ab = prefs.agentBus;
      return ab.enabled && ab.control !== 'off';
    },
    log: (line) => console.log(`mdhouse  agent-bus ${line}`),
    help: JSON.stringify({
      v: CTL_VERSION,
      topic: CTL_TOPIC,
      ops: {
        inventory: '{v:1, op:"inventory", requestId} → {roots:[{rootId,label,kind,writable}], clients:[{clientId,label,page,busy,since,lastSeen}]}',
        open: '{v:1, op:"open", requestId, rootId, path, clientId} → {url, opened, reason?: gone|busy|team}',
      },
    }),
  });
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

  /**
   * Flow runs: packages come only from the installed reference catalog (`<reference>/flows`), loaded
   * once; a reference without one has none. Run documents are written into the project.
   */
  let flowCatalog: Promise<LoadedFlowPackage[]> | null = null;
  let flowSealKey: Promise<Buffer> | null = null;
  const flowDeps: FlowHostDeps = {
    registry,
    catalog: () => {
      const ref = registry.list().find((r) => r.kind === 'reference');
      if (!ref) return Promise.resolve([]);
      flowCatalog ??= stat(`${ref.path}/flows/catalog.json`)
        .then(
          () => loadFlowCatalog(`${ref.path}/flows`),
          () => [],
        )
        .catch((err: unknown) => {
          flowCatalog = null;
          throw err;
        });
      return flowCatalog;
    },
    git: {
      repoOf: (root) => repoToplevel(root.path),
      head: headCommit,
      commitOf,
      isAncestor,
      commits: rangeCommits,
      dirty: async (repo, root) => (await dirtyPaths(repo, root.path)).filter((p) => !registry.hidden(root.path, join(root.path, p))),
    },
    key: randomBytes(32),
    sealKey: () =>
      (flowSealKey ??= sealKeyAt(join(dirname(prefs.path), 'flow-seal.key')).catch((err: unknown) => {
        flowSealKey = null;
        throw err;
      })),
    ancestry: new Map(),
  };
  // Made at start, not at a first preview: a config dir inside a project would otherwise change its uncommitted set.
  await flowDeps.sealKey().catch((err: unknown) => console.error(`mdhouse: flow seal key: ${err instanceof Error ? err.message : String(err)}`));
  const FLOW_STATUS: Record<FlowError['reason'], number> = {
    invalid: 400,
    'bad-baseline': 400,
    'not-writable': 403,
    'no-root': 404,
    'unknown-package': 404,
    'no-git': 404,
    'no-baseline': 409,
    'open-run': 409,
    held: 409,
    tampered: 409,
    foreign: 409,
    stale: 409,
  };
  const flowFail = (e: FlowError): Response => noStore(json(e, FLOW_STATUS[e.reason]));
  const flowNoGit = (): Response => flowFail({ error: 'git is off', reason: 'no-git' });
  /** How a start writes: the per-file queue and the only write to a tree. */
  const flowIo: FlowWrite = { queue: queueWrite, writeFile: (p, text) => registry.writeFile(p, text, { parents: true }) };

  /**
   * Scheduled runs (MW.11): a firing from the instance's own bus schedule starts a run only for a registration this
   * machine's administrator approved, by the file's content hash and the schedule made at approval (Q-R3-AUTO2).
   * Approvals and the run index live in the key-value store of the instance's own bus record (DATA-W2); audit lines
   * also go to its log.
   */
  const autoStore = busStore(bus);
  const approvals = new Approvals(autoStore);
  const runIndex = new RunIndex(autoStore, Date.now, (id) => {
    const root = registry.get(id);
    return root ? folderKey(root.path) : `root-${id}`;
  });
  const automation = new Automation({
    // A schedule names its project by folder (`folderKey`): root ids follow the order roots were added in.
    project: (key) => registry.list().find((r) => r.kind !== 'reference' && folderKey(r.path) === key)?.id ?? null,
    registration: registrationLookup(registry, flowDeps.catalog),
    approval: approvals.check((id) => registry.get(id)?.path ?? null),
    start: (request) => (opts.noGit ? Promise.resolve({ error: 'git is off', reason: 'no-git' as const }) : startFlowRun(flowDeps, flowIo, { request })),
    index: runIndex,
    audit: (level, line) => {
      console.log(`mdhouse  ${level}: ${line}`);
      void bus.agentLog(level === 'notice' ? 'notice' : 'warning', line);
    },
    notify: (agent, text) => bus.tell(agent, text),
  });
  const stopAutomation = bus.control({
    topic: AUTO_TOPIC,
    lock: 'auto',
    name: 'automation',
    // A Viewer starts nothing on anyone's behalf.
    handle: async (from, body, envelope) =>
      prefs.mode() === 'viewer'
        ? JSON.stringify({ v: AUTO_VERSION, ok: false, error: { code: 'viewer', msg: 'this mdhouse is a Viewer' } })
        : automation.handle({ from, body, schedule: envelope.schedule }),
    wanted: () => prefs.agentBus.enabled,
    log: (line) => console.log(`mdhouse  agent-bus ${line}`),
    help: JSON.stringify({ v: AUTO_VERSION, topic: AUTO_TOPIC, body: '{v:1, op:"run", project, registration} — from a bus schedule only' }),
  });
  /**
   * A registration as the automation page lists it: this machine's approval of the file as it is now; without the
   * bus (`schedules` null) its state is `unknown`.
   */
  const autoView = async (root: Root, reg: LoadedRegistration, schedules: Map<string, Schedule> | null) => {
    const file = {
      id: reg.reg.id,
      file: `.mdhouse/automation/${reg.reg.id}.json`,
      flow: reg.reg.flow,
      range: reg.reg.range,
      when: reg.reg.when,
      maxLateMs: reg.reg.maxLateMs,
      maxLate: durationWords(reg.reg.maxLateMs),
      overlap: reg.reg.overlap,
      ...(reg.reg.notify ? { notify: reg.reg.notify } : {}),
      hash: reg.hash,
    };
    if (!schedules) return { ...file, approval: 'unknown', schedule: null, disabled: false, failures: 0, startedToday: 0, runs: [] };
    const ok = await approvals.get(root.path, reg.reg.id);
    const st = await runIndex.state(root.id, reg.reg.id);
    const sched = ok ? schedules.get(ok.scheduleId) : undefined;
    // Approved, but no bus schedule fires it as it is now made (deleted on the bus, or an older body): approve again.
    const timer = !!sched && sched.body === scheduleSpec(root.path, reg.reg).body;
    return {
      ...file,
      approval: !ok ? 'none' : ok.hash !== reg.hash ? 'changed' : timer ? 'approved' : 'no-timer',
      ...(ok ? { approvedHash: ok.hash, approved: { at: ok.at, by: ok.by, scheduleId: ok.scheduleId } } : {}),
      schedule: sched ? { id: sched.id, enabled: sched.enabled, next: sched.next ?? null, last: sched.last ?? null } : null,
      disabled: st.disabled,
      failures: st.failures,
      startedToday: st.day === new Date().toISOString().slice(0, 10) ? st.started : 0,
      ...(st.lastStartMs ? { lastStartAt: new Date(st.lastStartMs).toISOString() } : {}),
      runs: await runIndex.history(root.id, reg.reg.id, 5),
    };
  };
  /** `90000` → `1m30s`: a lateness as a registration writes it. */
  const durationWords = (ms: number): string => {
    const parts: string[] = [];
    let rest = Math.round(ms / 1000);
    for (const [unit, n] of [['d', 86400], ['h', 3600], ['m', 60], ['s', 1]] as const) {
      if (rest >= n) parts.push(`${Math.floor(rest / n)}${unit}`);
      rest %= n;
    }
    return parts.join('') || '0s';
  };
  /** The bus schedule a registration fires by: its timer, its body, its lateness. */
  const scheduleSpec = (rootPath: string, reg: LoadedRegistration['reg']) => ({
    ...('cron' in reg.when ? { expr: reg.when.cron } : { at: reg.when.at }),
    body: JSON.stringify({ v: AUTO_VERSION, op: 'run', project: folderKey(rootPath), registration: reg.id }),
    max_late: `${Math.round(reg.maxLateMs / 1000)}s`,
  });

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
  /**
   * Run inside a git write's queue, right before git: the refusal when the folder stopped being
   * writable since the request was checked — removed, set read-only, writes blocked — or `abs` is
   * now in a read-only root. Null to go ahead.
   */
  const gitStillWritable = (at: { root: Root }, abs?: string): Response | null => {
    if (registry.get(at.root.id) !== at.root || !at.root.writable) return fail(403, `${at.root.name} is read-only`);
    if (abs !== undefined && registry.list().some((r) => !r.writable && within(abs, r.path))) return fail(403, 'that file is in a read-only folder now');
    return null;
  };
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
      const denied = gitStillWritable(at);
      if (denied) return denied;
      const ro = args[0] === 'pull' ? readOnlyIn(at.repo) : undefined;
      if (ro) return fail(409, `${ro.name} is read-only and in the same repository — pull in a terminal`);
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
  /** Requests admitted as Personal with a loopback peer: whoever routes a request to loopback means it to be local. */
  const localAdmins = new WeakSet<Request>();
  const admit = async (req: Request): Promise<Response | null> => {
    const access = await prefs.currentAccess();
    const peer = server.requestIP(req)?.address;
    if (!allowedAddress(peer, access.allow)) return new Response('access denied\n', { status: 403 });
    const ip = peer ? ipBytes(peer) : null;
    if (opts.localAdmin && !Object.keys(access.users).length && ip && isLoopback(ip)) localAdmins.add(req);
    if (Object.keys(access.users).length && !(await users.check(req.headers.get('authorization'), access.users))) {
      return new Response('access denied\n', {
        status: 401,
        headers: { 'www-authenticate': 'Basic realm="mdhouse", charset="UTF-8"' },
      });
    }
    return null;
  };

  /**
   * Browser administrators: memory-only sessions opened by a proof minted over the private control
   * socket. Admission (address list, Basic users) lets a request in; only this cookie makes it admin.
   */
  const admins = new AdminSessions();
  const adminScope = (): AdminCookieScope => ({ port: cookiePort(), secure: false });
  /** The ADMIN-W1 local administrator — never in a Viewer, a blocked prefs file included: there only a minted session is. */
  const isLocalAdmin = (req: Request): boolean => localAdmins.has(req) && prefs.mode() !== 'viewer';
  const actorOf = (req: Request): Actor =>
    isLocalAdmin(req)
      ? { admin: true, via: 'local' }
      : admins.verify(readAdminCookie(req.headers.get('cookie'), adminScope())).ok
        ? { admin: true, via: 'session' }
        : { admin: false, via: 'none' };
  const noStore = (res: Response): Response => {
    res.headers.set('cache-control', 'no-store');
    res.headers.set('referrer-policy', 'no-referrer');
    return res;
  };
  /** Mints a proof only when a browser on this machine can exchange it: loopback-bound, no proxy names. */
  const mintAdmin = (): AdminMintReply | { error: string } => {
    const url = localAdminOrigin(hostname, server.port ?? port);
    if (!url) return { error: `bound to ${hostname}: a local administrator session needs a loopback or any-address bind` };
    if (prefs.currentHostNames().length) return { error: '--host-name is set: localhost is refused, so no local administrator session' };
    return { ...admins.mintProof(), url };
  };

  /**
   * Human project names (display only). A saved root's name is in prefs; an unsaved root's lives
   * here, in memory, until the root is saved — then it moves to prefs — or removed, or mdhouse stops.
   */
  const sessionNames = new Map<string, string>();
  const customName = (path: string): string | undefined => (prefs.isSaved(path) ? prefs.savedName(path) : sessionNames.get(path));
  /**
   * An unsaved project's own Agent Bus settings, in memory until it is saved — then they move to
   * prefs — or removed, or mdhouse stops. Never a credential: one is provisioned in prefs only.
   */
  const sessionAb = new Map<string, { endpoint: string | null; default: string[] | null }>();
  /** A project's own Agent Bus settings as a page may know them: a saved one's from prefs, an unsaved one's from memory. */
  const abPublicOf = (r: Root): SpaceAbPublic => {
    if (prefs.isSaved(r.path)) return publicSpaceAb(prefs.spaceAb(r.path));
    const s = sessionAb.get(r.path);
    return { endpoint: s?.endpoint ?? null, default: s?.default ?? null, hasCredential: false, malformed: false };
  };
  const AB_UNREADABLE = 'Agent Bus settings for this project are unreadable';
  /**
   * The bus a project's documents go to: its own endpoint with its own credential (none: no
   * credential), else the instance's. Unreadable settings are an error — never the instance in its place.
   */
  const busOf = (r: Root): { ep: Endpoint; source: 'space' | 'instance' } | { error: string } => {
    if (prefs.isSaved(r.path)) {
      const ab = prefs.spaceAb(r.path);
      if (ab === null) return { error: AB_UNREADABLE };
      if (ab.endpoint) return { ep: { addr: ab.endpoint, token: ab.credential ?? '' }, source: 'space' };
    } else {
      const s = sessionAb.get(r.path);
      if (s?.endpoint) return { ep: { addr: s.endpoint, token: '' }, source: 'space' };
    }
    return { ep: instanceBus(), source: 'instance' };
  };
  /** Registered RAG sources are read from the KV at most this often per project. */
  const RAG_STATE_MS = 15_000;
  const RAG_ANSWER_MS = 60_000;
  const RAG_SEARCHES = 2;
  let ragSearching = 0;
  /** `rag/source/*` values read at once while looking for a project's source. */
  const RAG_SOURCE_BATCH = 16;
  type RagState = { source: RagSource | null; last: RagLast | null };
  const ragCache = new Map<string, { at: number; state: RagState }>();
  /** One KV lookup per project at a time: concurrent requests share it. */
  const ragLookups = new Map<string, Promise<RagState>>();
  /** Reads every `rag/source/*` value, a batch at a time, until the one for `root`'s folder; then its latest run. */
  const ragLookup = async (root: Root): Promise<RagState> => {
    const ep = instanceBus();
    const names = (await bus.kvNames('rag/source/', ep)).filter(isSourceKey);
    let source: RagSource | null = null;
    for (let i = 0; i < names.length && !source; i += RAG_SOURCE_BATCH) {
      const batch = names.slice(i, i + RAG_SOURCE_BATCH);
      source = sourceFor(await Promise.all(batch.map(async (name) => ({ name, value: await bus.kvJson(name, ep) }))), root.path);
    }
    const last = source ? lastOf(await bus.kvJson(lastKeyOf(source.sid), ep)) : null;
    return { source, last };
  };
  /** The source registered for `root`'s folder and its latest run, kept 15 s; a failure throws and is not kept. */
  const ragState = async (root: Root): Promise<RagState> => {
    const kept = ragCache.get(root.path);
    if (kept && Date.now() - kept.at < RAG_STATE_MS) return kept.state;
    let lookup = ragLookups.get(root.path);
    if (!lookup) {
      lookup = ragLookup(root)
        .then((state) => {
          ragCache.set(root.path, { at: Date.now(), state });
          return state;
        })
        .finally(() => ragLookups.delete(root.path));
      ragLookups.set(root.path, lookup);
    }
    return lookup;
  };
  /** Open tabs learn that root metadata changed; they read it again from `/api/roots`. */
  const publishRoots = () => server.publish('roots', JSON.stringify({ t: 'roots', roots: registry.list().map((r) => r.id) }));
  /**
   * Root metadata changes — add, remove, name, save — one at a time. Only the entry points (routes,
   * control handlers, the CLI's fresh-start name) queue; what they call runs inside, never queuing again.
   */
  const rootOps = <T>(op: () => Promise<T>): Promise<T> => queueWrite('roots:metadata', op);
  /** Sets (`null`: clears) a root's name where its lifetime says. Runs inside `rootOps`. */
  const setRootNameNow = async (path: string, name: string | null): Promise<void> => {
    if (await prefs.setSavedName(path, name)) sessionNames.delete(path);
    else if (name === null) sessionNames.delete(path);
    else sessionNames.set(path, name);
  };
  /** Sets a root's name and tells open tabs — the entry point for the CLI's fresh start. */
  const setRootName = (path: string, name: string | null): Promise<void> =>
    rootOps(async () => {
      await setRootNameNow(path, name);
      publishRoots();
    });
  /** A root's access as `policy` (prefs, from memory or the locked file) makes it: mode, auto-rw, reference cap, effective. */
  const accessOf = (r: Root, policy: PolicyView) => {
    const mode: AccessMode = r.mode ?? 'inherit';
    const referenceCap = registry.inReference(r.path);
    return { mode, auto: policy.auto, referenceCap, writable: (mode === 'rw' || (mode === 'inherit' && policy.auto)) && !referenceCap };
  };
  const sha256 = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  /**
   * What an administrator confirms when saving an unsaved project: full SHA-256 over its identity,
   * mode and effective access (auto-rw and the reference cap), saved state and current name.
   * A staleness check, not authority. `policy` is prefs as read now — memory, or the locked file.
   */
  const saveRevOf = (r: Root, policy: PolicyView): string =>
    sha256({ id: r.id, path: r.path, kind: r.kind ?? 'project', ...accessOf(r, policy), saved: policy.saved, name: sessionNames.get(r.path) ?? null, ab: sessionAb.get(r.path) ?? null });
  /**
   * What an administrator confirms when setting a project's mode: full SHA-256 over its identity,
   * mode, stored mode, effective access and saved state — never its name. A staleness check, not authority.
   */
  const accessRevOf = (r: Root, policy: PolicyView): string =>
    sha256({ id: r.id, path: r.path, kind: r.kind ?? 'project', ...accessOf(r, policy), stored: policy.stored, saved: policy.saved });
  /**
   * What an administrator confirms when setting a project's Agent Bus: full SHA-256 over its identity,
   * saved state and public settings — never a credential, only whether there is one. A staleness check.
   */
  const abRevOf = (r: Root, saved: boolean, ab: SpaceAbPublic): string => sha256({ id: r.id, path: r.path, saved, ...ab });
  /** The Agent Bus settings a page edits: the instance's and every project's — read from memory and prefs, never the bus. */
  const abConfig = () => {
    prefs.refresh();
    const ab = prefs.agentBus;
    const roots: Record<string, { endpoint?: string; hasCredential: boolean; default?: string[]; rev: string; error?: string }> = {};
    for (const r of registry.projects()) {
      const own = abPublicOf(r);
      const rev = abRevOf(r, prefs.isSaved(r.path), own);
      roots[r.id] = own.malformed
        ? { hasCredential: false, rev, error: AB_UNREADABLE }
        : { ...(own.endpoint ? { endpoint: own.endpoint } : {}), hasCredential: own.hasCredential, ...(own.default ? { default: own.default } : {}), rev };
    }
    return { enabled: ab.enabled, instance: { endpoint: ab.socket || defaultSocket(), hasCredential: !!ab.token, default: ab.default, filter: ab.filter }, roots };
  };
  const memoryPolicy = (path: string): PolicyView => {
    prefs.refresh();
    return { saved: prefs.isSaved(path), auto: prefs.autoRwCovers(path), stored: prefs.savedMode(path) ?? null };
  };
  /** The roots as the page sees them: `name` is the label to show, `customName` the override when set. */
  const rootsPayload = () =>
    registry.list().map((r) =>
      labelled(
        {
          id: r.id,
          name: r.name,
          path: r.path,
          kind: r.kind ?? 'project',
          writable: r.writable,
          // why it is writable: its mode is `rw`, else an auto-rw path covers it
          ...(r.writable ? { writableBy: r.mode === 'rw' ? 'rw' : 'auto' } : {}),
          // explicit RW, apart from auto-rw
          configuredWritable: r.kind !== 'reference' && r.mode === 'rw',
          saved: prefs.isSaved(r.path),
          // a project's mode (`inherit` follows auto-rw) and what the page confirms before changing it
          ...(r.kind !== 'reference' ? { mode: r.mode ?? 'inherit', accessRev: accessRevOf(r, memoryPolicy(r.path)) } : {}),
          // what the page confirms before saving an unsaved project (`POST /api/roots/save`)
          ...(r.kind !== 'reference' && !prefs.isSaved(r.path) ? { saveRev: saveRevOf(r, memoryPolicy(r.path)) } : {}),
        },
        customName(r.path),
      ),
    );

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
  const adminRequired = () => noStore(json({ error: 'administrator session required', reason: 'admin' }, 401));
  /** An administrator-family write: same-origin, then an administrator session, before the handler reads anything. */
  const adminOnly = (h: Handler): Handler => (req) => {
    if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
    if (!actorOf(req).admin) return adminRequired();
    return h(req);
  };
  /**
   * A write a Viewer refuses, before the handler reads anything; a blocked prefs file is refused the same
   * way (`reason: blocked`), and so is an exposed bind (`reason: exposed`, Q-R3-EXPOSE1). Root writability
   * caps it again at the write itself.
   */
  const viewerGate = (h: Handler): Handler => (req) => {
    if (prefs.mode() !== 'viewer') {
      return registry.exposed() ? noStore(json({ error: exposedWhy(hostname), reason: 'exposed' }, 403)) : h(req);
    }
    const blocked = prefs.accessBlocked();
    return blocked
      ? noStore(json({ error: `read-only: prefs.json is ${blocked}`, reason: 'blocked' }, 403))
      : noStore(json({ error: 'read-only: this mdhouse is a Viewer', reason: 'viewer' }, 403));
  };
  function guard<R extends string>(table: Bun.Serve.Routes<undefined, R>): Bun.Serve.Routes<undefined, R> {
    routes = inventory(table);
    const family = new Map(routes.map((r) => [`${r.method} ${r.path}`, r.family]));
    const out: Record<string, unknown> = {};
    for (const [path, route] of Object.entries(table)) {
      if (typeof route === 'function') out[path] = check(route as Handler);
      else if (isMethodMap(route)) {
        out[path] = Object.fromEntries(
          Object.entries(route).map(([m, h]) => {
            const f = family.get(`${m} ${path}`);
            // An administrator family a Viewer also refuses (`automation`) passes both gates, the Viewer's (and exposure's) first.
            const admin = f && ADMIN_FAMILIES.has(f) ? adminOnly(h as Handler) : (h as Handler);
            const gated = f && VIEWER_REFUSED.has(f) ? viewerGate(admin) : admin;
            return [m, check(gated)];
          }),
        );
      } else out[path] = route;
    }
    return out as Bun.Serve.Routes<undefined, R>;
  }

  const server = Bun.serve<WsData>({
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
      '/rag': read(page),

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
          roots: rootsPayload(),
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

      /**
       * A Markdown document's whole source, for the editor. GET `?p=`: one read of its bytes — the text
       * (strict UTF-8, a BOM kept) and their SHA-256; bytes that are not UTF-8 are 422 `encoding`, more
       * than `SOURCE_MAX` 413. POST `{p, hash, text}` only: writes `text` verbatim — no legacy
       * conversion — while the file's bytes still hash to `hash`, else 409 `stale`, the reason only.
       * The final write rechecks the path and write access (`Registry.writeFile`).
       */
      '/api/source': {
        GET: async (req) => {
          const loc = await docAt(new URL(req.url).searchParams.get('p') ?? '');
          if (!loc || inGitDir(loc.rel)) return fail(404, 'not a document');
          // one read, of at most one byte past the cap
          const raw = await Bun.file(loc.abs).slice(0, SOURCE_MAX + 1).bytes().catch(() => null);
          if (!raw) return fail(404, 'not a document');
          if (raw.length > SOURCE_MAX) return fail(413, 'the document is too large to edit here');
          const src = sourceOf(raw);
          if ('error' in src) return noStore(json({ error: 'the document is not UTF-8 — it cannot be edited here', reason: 'encoding' }, 422));
          return noStore(json({ ...src, writable: registry.writableAt(loc), ...(registry.inReference(loc.abs) ? { reference: true } : {}) }));
        },
        POST: mutation('doc-write', async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
          const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort() : [];
          const { p, hash, text } = (body ?? {}) as { p?: unknown; hash?: unknown; text?: unknown };
          if (
            keys.join() !== 'hash,p,text' ||
            typeof p !== 'string' ||
            !p ||
            typeof hash !== 'string' ||
            !/^[0-9a-f]{64}$/.test(hash) ||
            typeof text !== 'string' ||
            !text.isWellFormed()
          ) {
            return fail(400, 'expected exactly {p, hash, text}');
          }
          const data = new TextEncoder().encode(text);
          if (data.length > SOURCE_MAX) return fail(413, 'the text is too long');
          const loc = await docAt(p);
          if (!loc || inGitDir(loc.rel)) return fail(404, 'not a document');
          if (!registry.writableAt(loc)) return readOnly(loc, 'edit it');
          const stale = () => json({ error: 'the file changed since it was opened', reason: 'stale' }, 409);
          try {
            return await queueWrite(loc.abs, async () => {
              // Read once, in the queue: still this document, still the bytes the editor started from.
              const now = await docAt(p);
              if (now?.abs !== loc.abs) return stale();
              // at most one byte past the cap: a file grown past it is stale, never a prefix hashed as the whole
              const current = await Bun.file(loc.abs).slice(0, SOURCE_MAX + 1).bytes().catch(() => null);
              if (!current || current.length > SOURCE_MAX || sourceHash(current) !== hash) return stale();
              await registry.writeFile(p, data);
              return json({ hash: sourceHash(data) });
            });
          } catch (err) {
            if (err instanceof ReadOnlyError) return readOnly(loc, 'edit it');
            console.error(err);
            return fail(500, 'the document could not be saved — it is unchanged');
          }
        }),
      },

      /** Whether this browser holds an administrator session, and until when at most. No secret. */
      '/api/admin': read((req) => {
        if (isLocalAdmin(req)) return noStore(json({ admin: true, local: true }));
        const v = admins.verify(readAdminCookie(req.headers.get('cookie'), adminScope()));
        return noStore(json(v.ok ? { admin: true, expiresAt: v.expiresAt } : { admin: false }));
      }),

      /**
       * Exchanges a proof minted over the control socket (`mdhouse admin`) for an administrator
       * session cookie. Only from a browser on this machine at an exact local origin; a request
       * refused on that check leaves the proof unused. Every refusal is the same 403.
       */
      '/api/admin/session': {
        POST: mutation('admin-session', async (req) => {
          const refused = () => noStore(fail(403, 'administrator proof refused'));
          if (!localExchange(req, server.requestIP(req)?.address, hostname, server.port ?? port)) return refused();
          const body = (await req.json().catch(() => null)) as { proof?: unknown } | null;
          const opened = admins.exchange(body?.proof);
          if (!opened.ok) return refused();
          const res = noStore(new Response(null, { status: 204 }));
          res.headers.append('set-cookie', adminCookie(opened.secret, admins.limits.absoluteMs, adminScope()));
          return res;
        }),
      },

      /** Ends this browser's administrator session, if any, and clears its cookie. */
      '/api/admin/logout': {
        POST: mutation('admin-session', (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const v = admins.verify(readAdminCookie(req.headers.get('cookie'), adminScope()));
          if (v.ok) admins.revoke(v.id);
          const res = noStore(new Response(null, { status: 204 }));
          res.headers.append('set-cookie', clearAdminCookie(adminScope()));
          return res;
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
          if ('mode' in body && body.mode !== 'workspace' && body.mode !== 'viewer') return fail(400, "mode: 'workspace' or 'viewer'");
          const before = prefs.settings.autoRw;
          const beforeMode = prefs.mode();
          try {
            await prefs.updateSettings(body);
          } catch (err) {
            const blocked = prefs.accessBlocked();
            if (!blocked) throw err;
            return noStore(json({ error: `prefs.json is ${blocked} — not changed`, reason: 'blocked' }, 409));
          }
          // Auto-rw or the mode changes which folders are writable: every tab shows it.
          if (prefs.settings.autoRw !== before || prefs.mode() !== beforeMode) {
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
      '/api/ab': read(async (req) => {
        const ab = prefs.agentBus;
        const id = new URL(req.url).searchParams.get('root');
        const root = id === null ? null : registry.get(id);
        if (id !== null && (!root || root.kind === 'reference')) return fail(404, 'unknown root');
        if (!ab.enabled) return json({ enabled: false });
        // `?root=`: the bus that project's documents go to
        const where = root ? busOf(root) : { ep: instanceBus(), source: 'instance' as const };
        const spaceDefault = root ? abPublicOf(root).default : null;
        const head = { enabled: true, me: bus.me, socket: ab.socket || defaultSocket(), default: ab.default, filter: ab.filter, ...(spaceDefault ? { spaceDefault } : {}) };
        if ('error' in where) return json({ ...head, connected: false, error: where.error, endpoint: null, source: 'space', agents: [] });
        const st = await bus.status(where.ep);
        // the filter narrows the lists; a default agent stays, whatever its name
        const keep = (name: string) => passes(name, ab.filter) || ab.default.includes(name) || !!spaceDefault?.includes(name);
        const agents = (st.connected ? await bus.agents(where.ep).catch(() => []) : []).filter((a) => keep(a.name));
        return json({ ...head, ...st, endpoint: where.ep.addr, source: where.source, agents });
      }),

      /** The Agent Bus settings a page edits — read from memory and prefs; never connects. */
      '/api/ab/config': read(() => json(abConfig())),

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
          // the document's project picks the bus; a project bus that fails is an error, never the instance's
          const where = busOf(loc.root);
          if ('error' in where) return fail(503, where.error);
          try {
            const job = await bus.ask([...new Set(targets as string[])], requestText(body.action as AbAction, loc.abs, url, note), where.ep);
            return json({ job });
          } catch (err) {
            return fail(503, safeError(err));
          }
        }),
      },

      /** A job's events so far — for a page that reconnected and missed some. */
      '/api/ab/job': read((req) => {
        const events = bus.job(new URL(req.url).searchParams.get('id') ?? '');
        return events ? json({ events }) : fail(404, 'no such job');
      }),

      /**
       * The `/rag` page's status: the project's registered RAG source and its latest sync, read from the
       * KV of `#mdhouse@<host>` on the instance bus — where `mdhouse-rag-sync` writes them. Never connects
       * to the RAG, writes nothing; a bus that fails is an `error` in a 200, so the page can say so.
       */
      '/api/rag': read(async (req) => {
        const url = new URL(req.url);
        const root = rootOf(url);
        if (!root || root.kind === 'reference') return fail(404, 'unknown root');
        if (!prefs.agentBus.enabled) return json({ enabled: false });
        const guide = registry.list().find((r) => r.kind === 'reference');
        const hasGuide = !!guide && !!(await fileAt(`${guide.id}/rag-sync.md`));
        const head = { enabled: true, path: root.path, ...(guide && hasGuide ? { guide: registry.docUrl(guide, 'rag-sync.md') } : {}) };
        try {
          const state = await ragState(root);
          return json({ ...head, source: state.source ? { sid: state.source.sid, namespace: state.source.namespace, table: state.source.table } : null, last: state.last });
        } catch (err) {
          return json({ ...head, error: safeError(err) });
        }
      }),

      /**
       * A keyword search of the project's registered RAG, as `#mdhouse`: the target and the mode are the
       * source's and `keyword`, never the request's. Read-only, but it costs a bus message, so a cross-site
       * request is refused, and the page's `x-mdhouse: 1` header is required: a cross-site page cannot send
       * it without a CORS preflight, which mdhouse never grants. Hits are cited from the local file
       * (`citeRecords`). A Viewer serves it: searching is reading.
       */
      '/api/rag/search': read(async (req) => {
        if (!sameOrigin(req) || req.headers.get('x-mdhouse') !== '1') return fail(403, 'cross-origin request refused');
        if (!prefs.agentBus.enabled) return fail(404, 'the agent bus is off — mdhouse --agent-bus');
        const url = new URL(req.url);
        const root = rootOf(url);
        if (!root || root.kind === 'reference') return fail(404, 'unknown root');
        const { q, limit } = searchParams(url);
        if (q === null) return fail(400, 'expected q: 1–1024 characters');
        if (ragSearching >= RAG_SEARCHES) return fail(429, 'a search is already running — try again in a moment');
        ragSearching++;
        const started = Date.now();
        try {
          let source: RagSource | null;
          try {
            source = (await ragState(root)).source;
          } catch (err) {
            return fail(503, safeError(err));
          }
          if (!source) return fail(404, 'this project is not indexed');
          let answer: string | null;
          try {
            answer = await bus.askOnce(source.rag, searchBody(source, q, limit), RAG_ANSWER_MS, instanceBus());
          } catch (err) {
            return fail(503, safeError(err));
          }
          if (answer === null) return fail(504, 'the RAG did not answer in time');
          let reply: ReturnType<typeof decodeSearchReply>;
          try {
            reply = decodeSearchReply(answer, { namespace: source.namespace, table: source.table, mode: 'keyword', limit, exclude: [] });
          } catch {
            return fail(503, 'the RAG answer was not understood');
          }
          const records = await citeRecords(reply.records, root.path);
          const hits = shapeHits(records, (src) => registry.docUrl(root, src));
          return noStore(json({ hits, count: hits.length, took: Date.now() - started }));
        } finally {
          ragSearching--;
        }
      }),

      /**
       * The settings page's project name: `{id, name}` only; an empty name clears it. A saved
       * project keeps it in prefs, an unsaved one in memory until it is saved. Display only:
       * id, path, URLs, marks and access stay as they are.
       */
      '/api/roots/name': {
        POST: mutation('root-admin', async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const asked = parseNameRequest(await req.json().catch(() => null));
          if (!asked.ok) return fail(400, asked.error);
          return rootOps(async () => {
            if (!actorOf(req).admin) return adminRequired();
            const root = registry.get(asked.id);
            if (!root) return fail(404, 'unknown root');
            if (root.kind === 'reference') return fail(403, `${root.name} is mdhouse reference material — it cannot be renamed`);
            await setRootNameNow(root.path, asked.name);
            publishRoots();
            return json({ roots: rootsPayload() });
          });
        }),
      },

      /**
       * The settings page's Add project: serve an existing directory for this session, in the mode the
       * administrator chose. `{path, mode: 'rw' | 'ro'}` only; `path` absolute, taken as written — no
       * `~`, nothing relative. Refused: gone 404, not a directory 400, reference material or inside it
       * 403, served already 409 `served` with its id, saved by another process or leading elsewhere by
       * the time it would be served 409 `stale`. Writes nothing; nothing is served on any refusal.
       */
      '/api/roots/add': {
        POST: mutation('root-admin', async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
          const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort() : [];
          const { path, mode } = (body ?? {}) as { path?: unknown; mode?: unknown };
          if (
            keys.join() !== 'mode,path' ||
            typeof path !== 'string' ||
            !path.startsWith('/') ||
            path.includes('\0') ||
            path.length > ADD_PATH_MAX ||
            (mode !== 'rw' && mode !== 'ro')
          ) {
            return fail(400, "expected exactly {path: an absolute directory, mode: 'rw' | 'ro'}");
          }
          return rootOps(async () => {
            if (!actorOf(req).admin) return adminRequired();
            let prep: PreparedProject;
            try {
              prep = await prepareProject(path);
            } catch (err) {
              if (!(err instanceof ProjectDirError)) throw err;
              return fail(err.code === 'missing' ? 404 : err.code === 'reference' ? 403 : 400, err.message);
            }
            if (registry.inReference(prep.abs)) return fail(403, `${prep.abs} is inside mdhouse reference material — it cannot be added`);
            const servedAs = (root: Root) => json({ error: `${prep.abs} is served already`, reason: 'served', id: root.id }, 409);
            const served = registry.list().find((r) => r.path === prep.abs);
            if (served) return servedAs(served);
            const stale = () => json({ error: 'the folder changed since it was asked for — look again', reason: 'stale' }, 409);
            /** A blocked file (newer or malformed) is 409 `reason: blocked`, like `/api/settings`; any other failure is 500. */
            const unreadable = (blocked: string | null) =>
              blocked
                ? noStore(json({ error: `prefs.json is ${blocked} — nothing added`, reason: 'blocked' }, 409))
                : fail(500, 'prefs.json could not be read — nothing added');
            let refused: string | null;
            try {
              // The file as it is under the lock: saved by another process means a re-add with its own
              // stored policy, which this does not do. So does an administrator signed out meanwhile.
              refused = await prefs.check(prep.abs, (fresh) => (!actorOf(req).admin ? 'admin' : fresh.saved ? 'stale' : null));
            } catch (err) {
              const blocked = prefs.accessBlocked();
              if (!blocked) console.error(err);
              return unreadable(blocked);
            }
            if (refused === 'admin') return adminRequired();
            if (refused !== null) return stale();
            // The request named a path, not what it resolved to earlier: it must lead there still.
            const now = await realpath(path).catch(() => null);
            if (now !== prep.abs || !(await stat(now).catch(() => null))?.isDirectory()) return stale();
            // No await from here on: these checks still hold when the root appears.
            if (!actorOf(req).admin) return adminRequired();
            const blocked = prefs.accessBlocked();
            if (blocked) return unreadable(blocked);
            if (prefs.isSaved(prep.abs)) return stale();
            let installed: { root: Root; added: boolean };
            try {
              installed = installProject(prep, mode);
            } catch (err) {
              console.error(err);
              return fail(500, `${prep.abs} could not be served — nothing added`);
            }
            if (!installed.added) return servedAs(installed.root);
            publishRoots();
            return json({ roots: rootsPayload(), id: installed.root.id });
          });
        }),
      },

      /**
       * The settings page's `[RW]` / `[RO]`: set a project's mode explicitly. `{id, mode: 'rw' | 'ro', rev}`
       * only; `rev` is the root's `accessRev` the administrator confirmed. A saved project's mode is
       * written to prefs; an unsaved one's lives in memory until it is saved or removed. `rw` never
       * lifts the reference cap. Stale is 409, and nothing changes on any refusal or failure.
       */
      '/api/roots/mode': {
        POST: mutation('root-admin', async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
          const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort() : [];
          const { id, mode, rev } = (body ?? {}) as { id?: unknown; mode?: unknown; rev?: unknown };
          if (
            keys.join() !== 'id,mode,rev' ||
            typeof id !== 'string' ||
            !id ||
            (mode !== 'rw' && mode !== 'ro') ||
            typeof rev !== 'string' ||
            !/^[0-9a-f]{64}$/.test(rev)
          ) {
            return fail(400, "expected exactly {id, mode: 'rw' | 'ro', rev}");
          }
          return rootOps(async () => {
            if (!actorOf(req).admin) return adminRequired();
            const root = registry.get(id);
            if (!root) return fail(404, 'unknown root');
            if (root.kind === 'reference') return fail(403, `${root.name} is mdhouse reference material — always read-only`);
            if (mode === 'rw' && registry.inReference(root.path)) return fail(403, `${root.name} is inside mdhouse reference material — always read-only`);
            const stale = () => json({ error: 'the project changed since it was shown — look again', reason: 'stale' }, 409);
            if (accessRevOf(root, memoryPolicy(root.path)) !== rev) return stale();
            let refused: string | null;
            try {
              // The file as it is under the lock: an auto-rw change, a save or a mode set by another
              // process since the check above refuses here. So does an administrator signed out meanwhile.
              refused = await prefs.commitMode(root.path, mode, (fresh) =>
                !actorOf(req).admin ? 'admin' : accessRevOf(root, fresh) !== rev ? 'stale' : null,
              );
            } catch (err) {
              const blocked = prefs.accessBlocked();
              if (!blocked) console.error(err);
              return fail(500, blocked ? `prefs.json is ${blocked} — access not changed` : 'prefs.json could not be written — access not changed');
            }
            if (refused === 'admin') return adminRequired();
            if (refused !== null) return stale();
            registry.setMode(root.id, mode);
            publishRoots();
            return json({ roots: rootsPayload() });
          });
        }),
      },

      /**
       * The settings page's `[unsaved]`: save a project served for this session only, as it is —
       * its canonical path, its mode (never auto-rw's grant) and its name. `{id, rev}`
       * only; `rev` is the root's `saveRev` the administrator confirmed. Anything that changed it
       * since — access, auto-rw, name, an external save — is 409 stale, and nothing is written.
       */
      '/api/roots/save': {
        POST: mutation('root-admin', async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
          const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort() : [];
          const { id, rev } = (body ?? {}) as { id?: unknown; rev?: unknown };
          if (keys.join() !== 'id,rev' || typeof id !== 'string' || !id || typeof rev !== 'string' || !/^[0-9a-f]{64}$/.test(rev)) {
            return fail(400, 'expected exactly {id, rev}');
          }
          return rootOps(async () => {
            if (!actorOf(req).admin) return adminRequired();
            const root = registry.get(id);
            if (!root) return fail(404, 'unknown root');
            if (root.kind === 'reference') return fail(403, `${root.name} is mdhouse reference material — it is never saved`);
            const stale = () => json({ error: 'the project changed since it was shown — look again', reason: 'stale' }, 409);
            if (saveRevOf(root, memoryPolicy(root.path)) !== rev) return stale();
            const name = sessionNames.get(root.path) ?? null;
            const ab = sessionAb.get(root.path) ?? { endpoint: null, default: null };
            // The file as it is under the lock: an auto-rw change or a save by another process since
            // the check above refuses here. So does an administrator signed out meanwhile.
            const refused = await prefs.saveRoot(root.path, { mode: root.mode ?? 'inherit', name, ab }, (fresh) =>
              !actorOf(req).admin ? 'admin' : saveRevOf(root, fresh) !== rev ? 'stale' : null,
            );
            if (refused === 'admin') return adminRequired();
            if (refused !== null) return stale();
            sessionNames.delete(root.path);
            sessionAb.delete(root.path);
            publishRoots();
            return json({ roots: rootsPayload() });
          });
        }),
      },

      /**
       * The settings page's project Agent Bus: `{id, endpoint, default, rev}` only. `endpoint` is a socket
       * path or an `http(s)://` address with nothing secret in it; `''` uses the instance's. `default`
       * names agents; `[]` uses the instance's. `rev` is the project's `rev` from `/api/ab/config`. A
       * saved project's settings go to prefs — a changed or cleared endpoint drops its credential — an
       * unsaved one's stay in memory until it is saved. No credential is ever taken here. Never
       * connects. Stale is 409, and nothing changes on any refusal or failure.
       */
      '/api/roots/ab': {
        POST: mutation('root-admin', async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
          const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort() : [];
          const { id, endpoint, default: names, rev } = (body ?? {}) as { id?: unknown; endpoint?: unknown; default?: unknown; rev?: unknown };
          if (
            keys.join() !== 'default,endpoint,id,rev' ||
            typeof id !== 'string' ||
            !id ||
            typeof endpoint !== 'string' ||
            (endpoint !== '' && !validEndpoint(endpoint)) ||
            !Array.isArray(names) ||
            names.length > SPACE_DEFAULT_MAX ||
            !names.every(validTarget) ||
            typeof rev !== 'string' ||
            !/^[0-9a-f]{64}$/.test(rev)
          ) {
            return fail(400, 'expected exactly {id, endpoint: a socket path, an http(s) address or empty, default: [bus name], rev}');
          }
          if (!prefs.agentBus.enabled) return fail(404, 'the agent bus is off — mdhouse --agent-bus');
          const next = { endpoint: endpoint || null, default: names.length ? [...new Set(names as string[])] : null };
          return rootOps(async () => {
            if (!actorOf(req).admin) return adminRequired();
            const root = registry.get(id);
            if (!root) return fail(404, 'unknown root');
            if (root.kind === 'reference') return fail(403, `${root.name} is mdhouse reference material — it has no Agent Bus of its own`);
            const stale = () => json({ error: 'the project changed since it was shown — look again', reason: 'stale' }, 409);
            const saved = prefs.isSaved(root.path);
            if (abRevOf(root, saved, abPublicOf(root)) !== rev) return stale();
            // The file as it is under the lock: a change by another process since the check above — the
            // settings, a save or an unsave — refuses here. So does an administrator signed out meanwhile.
            const guard = (fresh: PolicyView, ab: SpaceAbPublic) =>
              !actorOf(req).admin ? 'admin' : fresh.saved !== saved || (saved && abRevOf(root, true, ab) !== rev) ? 'stale' : null;
            let refused: string | null;
            try {
              refused = saved ? await prefs.commitSpaceAb(root.path, next, guard) : await prefs.check(root.path, guard);
            } catch (err) {
              const blocked = prefs.accessBlocked();
              if (!blocked) console.error(err);
              return fail(500, blocked ? `prefs.json is ${blocked} — not changed` : 'prefs.json could not be written — not changed');
            }
            if (refused === 'admin') return adminRequired();
            if (refused !== null) return stale();
            if (!saved) {
              // No await from here on: these checks still hold when the settings land in memory.
              if (!actorOf(req).admin) return adminRequired();
              const blocked = prefs.accessBlocked();
              if (blocked) return fail(500, `prefs.json is ${blocked} — not changed`);
              if (memoryPolicy(root.path).saved) return stale();
              if (next.endpoint || next.default) sessionAb.set(root.path, next);
              else sessionAb.delete(root.path);
            }
            publishRoots();
            return json(abConfig());
          });
        }),
      },

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
          return rootOps(async () => {
            if (!actorOf(req).admin) return adminRequired();
            const root = body?.id ? registry.get(body.id) : undefined;
            if (!root) return fail(404, 'unknown root');
            if (root.kind === 'reference') return fail(403, `${root.name} is mdhouse reference material — it cannot be removed`);
            return json(await removeRoots([root.path]));
          });
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
            const denied = gitStillWritable(at);
            if (denied) return denied;
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
            const denied = gitStillWritable(at, loc.abs);
            if (denied) return denied;
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
      /**
       * The files the Changes view ticked, as the page showed them (`{path, code}`, repo-relative, porcelain
       * XY): each must still be uncommitted with that code, inside the folder's root and in no read-only root,
       * and no rename, copy or conflict. Untracked ones are added, then `git commit -- <those paths>` takes
       * them from the working tree — deletions included — and leaves anything else staged alone.
       */
      '/api/git/commit-files': {
        POST: mutation('git-write', async (req) => {
          const body = (await req.json().catch(() => null)) as { p?: string; message?: string; files?: unknown } | null;
          const at = await gitWrite(req, body?.p);
          if ('error' in at) return at.error;
          const message = typeof body?.message === 'string' ? body.message.trim() : '';
          if (!message) return fail(400, 'a commit message is needed');
          if (message.length > 100_000) return fail(413, 'the commit message is too long');
          const asked = Array.isArray(body?.files) ? (body.files as Array<{ path?: unknown; code?: unknown }>) : null;
          const valid = (f: { path?: unknown; code?: unknown }) => typeof f?.path === 'string' && f.path.length > 0 && f.path.length <= 4096 && !f.path.includes('\0') && typeof f.code === 'string' && /^[ -~]{2}$/.test(f.code);
          if (!asked?.length || asked.length > 1000 || !asked.every(valid)) return fail(400, 'expected {p, message, files: [{path, code}]}');
          const chosen = asked as Array<{ path: string; code: string }>;
          if (new Set(chosen.map((f) => f.path)).size !== chosen.length) return fail(400, 'a file is listed twice');
          return queueWrite(`git:${at.repo}`, async () => {
            const denied = gitStillWritable(at);
            if (denied) return denied;
            const dirty = await dirtyFiles(at.repo);
            const now = new Map(dirty.map((f) => [f.path, f.code]));
            if (chosen.some((f) => now.get(f.path) !== f.code)) return json({ error: 'the files changed meanwhile — have a look', files: dirty }, 409);
            const tangled = chosen.filter((f) => /[RCU]/.test(f.code) || f.code === 'AA' || f.code === 'DD');
            if (tangled.length) return json({ error: 'a rename, copy or conflict — commit in a terminal', files: tangled }, 409);
            const foreign = chosen.filter((f) => {
              const abs = `${at.repo}/${f.path}`;
              return !within(abs, at.root.path) || registry.list().some((r) => !r.writable && within(abs, r.path));
            });
            if (foreign.length) return json({ error: `changes outside ${at.root.name} or in a read-only folder — commit in a terminal`, files: foreign }, 409);
            const untracked = chosen.filter((f) => f.code === '??').map((f) => literal(f.path));
            if (untracked.length && (await run(at.repo, ['add', '--', ...untracked])).code !== 0) return fail(500, 'could not add the new files');
            const r = await run(at.repo, ['commit', '-m', message, '--', ...chosen.map((f) => literal(f.path))]);
            return r.code === 0 ? json({ ok: true, output: r.out.trim() }) : fail(500, (r.err || r.out).trim());
          });
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
            const denied = gitStillWritable(at, loc.abs);
            if (denied) return denied;
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
        const tree = await store.tree(root, flag(url, 'ignored', opts.includeIgnoredDefault), reveal);
        return json({ ...tree, root: labelled(tree.root, customName(root.path)) });
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
        // a run document: its validated state, as the run page acts on it
        const run = loc.root.kind !== 'reference' && loc.rel.startsWith('Plans/flows/runs/') ? readFlowRunDocument(src) : null;
        const refused = !run ? null : opts.noGit ? { error: 'git is off' } : await verifyRun(flowDeps, loc.root, loc.rel, run.state, readFlowRunMeta(src));
        const flow = run ? { flow: docFlow(run.state, registry.writableAt(loc), refused?.error) } : {};
        return json({ ...common, frontmatter, lineOffset: offset, ...rendered, ...ab, ...flow, contentHash });
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

      /** The runnable flow packages and, per package, this project's newest and open run. */
      '/api/flow/catalog': {
        GET: async (req) => {
          const root = registry.get(new URL(req.url).searchParams.get('root') ?? '');
          if (!root || root.kind === 'reference') return flowFail({ error: 'no such project', reason: 'no-root' });
          const pkgs = (await flowDeps.catalog()).filter((p) => runnableFlow(p.manifest));
          const packages = await Promise.all(
            pkgs.map(async ({ manifest: m }) => {
              const runs = await listRuns(registry, root, m.id);
              const last = runs[0];
              const open = await openRunOf(flowDeps, root, runs);
              return {
                id: m.id,
                family: m.family,
                title: m.title,
                ranges: ['since-last-run', 'baseline'],
                defaults: m.defaults,
                lastRun: last ? { url: registry.docUrl(root, last.path), status: last.status, at: last.at } : null,
                openRun: open ? { url: registry.docUrl(root, open.path), status: open.status } : null,
              };
            }),
          );
          return noStore(json({ packages }));
        },
      },

      /**
       * The run a start would write, rendered like `/api/doc`, and the token that binds it. Writes
       * nothing, so a Viewer may preview; POST only, same-origin. The actor is the request's author.
       */
      '/api/flow/preview': read(async (req) => {
        if (req.method !== 'POST') return fail(405, 'POST only');
        if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
        if (opts.noGit) return flowNoGit();
        const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body || typeof body.rootId !== 'string') return flowFail({ error: 'expected {rootId, packageId, range}', reason: 'invalid' });
        const root = registry.get(body.rootId);
        const actor = root && root.kind !== 'reference' ? (await authorOf(req, { root, rel: '' })).name : '';
        const plan = await planFlowRun(flowDeps, { rootId: body.rootId, packageId: body.packageId, range: body.range, trigger: { kind: 'manual', actor } });
        if (isFlowError(plan)) return flowFail(plan);
        const { html } = await render(plan.doc, { rootId: plan.rootId, docPath: plan.runPath, docUrl: (rel) => registry.docUrl(root!, rel) });
        return noStore(json({ token: plan.token, runPath: plan.runPath, base: plan.base, target: plan.target, dirty: plan.dirty, warnings: plan.warnings, html }));
      }),

      /** Writes the previewed run document — exactly it, or 409 stale. One open run per package and project. */
      '/api/flow/start': {
        POST: mutation('flow', async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          if (opts.noGit) return flowNoGit();
          const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
          if (typeof body?.token !== 'string') return flowFail({ error: 'expected {token}', reason: 'invalid' });
          const actor = async (root: Root) => (await authorOf(req, { root, rel: '' })).name;
          const res = await startFlowRun(flowDeps, flowIo, { token: body.token, actor });
          if (isFlowError(res)) return flowFail(res);
          return noStore(json({ status: res.status, runPath: res.runPath, url: res.url }));
        }),
      },

      /**
       * One assertion on an open run, from its page: an outcome, evidence, a question's answer or cancel.
       * The run document is rewritten from its replayed state, the analyst's sections kept. A run that
       * completes advances its destination's `last-commit-id` to the run's target, after the run's write.
       */
      '/api/flow/event': {
        POST: mutation('flow', async (req) => {
          if (!sameOrigin(req)) return fail(403, 'cross-origin request refused');
          if (opts.noGit) return flowNoGit();
          const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
          if (!body || typeof body.root !== 'string' || typeof body.path !== 'string' || body.path.length > 4096) {
            return flowFail({ error: 'expected {root, path, expectedVersion, clientId, action}', reason: 'invalid' });
          }
          const loc = await registry.resolve(`${body.root}/${body.path}`);
          if (!loc || loc.root.kind === 'reference' || !loc.rel.startsWith(`${runsDir('')}`) || !loc.rel.endsWith('.md')) return flowFail({ error: 'no such run document', reason: 'no-root' });
          if (!registry.writableAt(loc)) return flowFail({ error: `${loc.root.name} is read-only`, reason: 'not-writable' });
          return queueWrite(loc.abs, async () => {
            const text = await Bun.file(loc.abs).text().catch(() => null);
            if (text === null) return flowFail({ error: 'no such run document', reason: 'no-root' });
            const before = readFlowRunDocument(text);
            const refused = before && (await verifyRun(flowDeps, loc.root, loc.rel, before.state, readFlowRunMeta(text)));
            if (refused) return flowFail(refused);
            const res = applyFlowAction(text, { rootId: loc.root.id, rel: loc.rel }, { expectedVersion: body.expectedVersion, clientId: body.clientId, action: body.action });
            if (isFlowError(res)) return flowFail(res);
            // Completing: the destination's marker first; if it cannot be written, the run stays as it was.
            if (res.advance) {
              const sel = res.state.input.selection;
              const dest = await registry.resolve(`${loc.root.id}/${sel.destination}`);
              const wrote = dest
                ? await queueWrite(dest.abs, async () => {
                    const prev = await Bun.file(dest.abs).text().catch(() => null);
                    const next = advanceDestination(prev, { title: res.state.input.package.title, target: sel.target, base: sel.base, runId: res.state.input.runId, url: registry.docUrl(loc.root, loc.rel) });
                    await registry.writeFile(`${loc.root.id}/${dest.rel}`, next, { parents: true });
                    return true;
                  }).catch(() => false)
                : false;
              if (!wrote) return noStore(json({ error: `${sel.destination} could not be written — the run is not complete; try again`, reason: 'partial' }, 500));
            }
            if (res.doc !== null) await registry.writeFile(`${loc.root.id}/${loc.rel}`, res.doc);
            return noStore(json({ status: res.state.status, version: res.state.version, url: registry.docUrl(loc.root, loc.rel) }));
          });
        }),
      },

      /**
       * This project's registrations and this machine's approval of each (administrator only): the file as it is now,
       * approved / changed / none, its bus schedule, the run index. Files that are no registration are listed with why.
       */
      '/api/automation': read(async (req) => {
        if (!actorOf(req).admin) return adminRequired();
        const root = registry.get(new URL(req.url).searchParams.get('root') ?? '');
        if (!root || root.kind === 'reference') return json({ error: 'no such project', reason: 'no-root' }, 404);
        const { loaded, errors } = await loadRegistrations(registry, root.id, await flowDeps.catalog());
        let schedules: Map<string, Schedule> | null = null;
        let busError: string | undefined;
        if (prefs.agentBus.enabled) {
          try {
            schedules = new Map((await bus.schedules()).map((s) => [s.id, s]));
          } catch (err) {
            busError = safeError(err);
          }
        } else busError = 'the Agent Bus integration is off';
        let registrations;
        try {
          registrations = await Promise.all(loaded.map((r) => autoView(root, r, schedules)));
        } catch (err) {
          busError = safeError(err);
          registrations = await Promise.all(loaded.map((r) => autoView(root, r, null)));
        }
        // Why approve would be refused now; none: it would pass every gate.
        const canApproveWhy =
          prefs.mode() === 'viewer' ? 'viewer' : registry.exposed() ? 'exposed' : !prefs.agentBus.enabled ? 'bus-off' : opts.noGit ? 'no-git' : !root.writable ? 'read-only' : null;
        return noStore(json({ root: root.id, canApprove: canApproveWhy === null, ...(canApproveWhy ? { canApproveWhy } : {}), registrations, errors, ...(busError ? { busError } : {}) }));
      }),

      /**
       * Approves a registration file as it is now (`hash` as the page showed it): creates its bus schedule on the
       * instance's record, then keeps the approval with that schedule's id; a previous schedule of it is deleted.
       * Clears a stop after failures. A bus refusal keeps nothing; the bus unreachable → 503.
       */
      '/api/automation/approve': {
        POST: mutation('automation', async (req) => {
          const body = (await req.json().catch(() => null)) as { root?: unknown; registration?: unknown; hash?: unknown } | null;
          if (typeof body?.root !== 'string' || typeof body.registration !== 'string' || typeof body.hash !== 'string') return json({ error: 'expected {root, registration, hash}', reason: 'invalid' }, 400);
          const root = registry.get(body.root);
          if (!root || root.kind === 'reference') return json({ error: 'no such project', reason: 'no-root' }, 404);
          if (!prefs.agentBus.enabled) return fail(409, 'the Agent Bus integration is off — mdhouse --agent-bus on');
          // A run writes its document into the project and reads its git history: refused now, not after three failed firings.
          if (opts.noGit) return json({ error: 'git is off here — a scheduled run needs it', reason: 'no-git' }, 409);
          if (!root.writable) return json({ error: 'the project is read-only here — a scheduled run writes its run document into it', reason: 'read-only' }, 409);
          const id = body.registration;
          const hash = body.hash;
          return queueWrite(`automation:${root.path}:${id}`, async () => {
            const found = await readRegistration(registry, root.id, id, await flowDeps.catalog());
            if (!found) return json({ error: 'no such registration', reason: 'not-found' }, 404);
            if ('error' in found) return json({ error: `not a registration: ${found.error}`, reason: 'invalid' }, 409);
            if (found.loaded.hash !== hash) return noStore(json({ error: 'the file changed since it was shown — have a look again', reason: 'stale' }, 409));
            let before;
            try {
              before = await approvals.get(root.path, id);
            } catch (err) {
              return fail(503, safeError(err));
            }
            let made: Schedule;
            try {
              made = await bus.scheduleAdd(scheduleSpec(root.path, found.loaded.reg));
            } catch (err) {
              return fail(409, `the Agent Bus refused the schedule: ${safeError(err)}`);
            }
            try {
              await approvals.set(root.path, id, { hash, scheduleId: made.id, at: new Date().toISOString(), by: actorOf(req).user ?? actorOf(req).via });
              const st = await runIndex.state(root.id, id);
              await runIndex.save(root.id, id, { ...st, failures: 0, disabled: false });
            } catch (err) {
              await bus.scheduleDelete(made.id).catch(() => false);
              return fail(503, safeError(err));
            }
            if (before && before.scheduleId !== made.id) await bus.scheduleDelete(before.scheduleId).catch(() => false);
            return noStore(json({ registration: id, approval: 'approved', hash, approved: { hash, scheduleId: made.id }, schedule: { id: made.id, enabled: made.enabled, next: made.next ?? null } }));
          });
        }),
      },

      /** Withdraws this machine's approval and deletes its bus schedule; the file stays in the project. */
      '/api/automation/revoke': {
        POST: mutation('automation', async (req) => {
          const body = (await req.json().catch(() => null)) as { root?: unknown; registration?: unknown } | null;
          if (typeof body?.root !== 'string' || typeof body.registration !== 'string') return json({ error: 'expected {root, registration}', reason: 'invalid' }, 400);
          const root = registry.get(body.root);
          if (!root || root.kind === 'reference') return json({ error: 'no such project', reason: 'no-root' }, 404);
          if (!prefs.agentBus.enabled) return fail(409, 'the Agent Bus integration is off — mdhouse --agent-bus on');
          const id = body.registration;
          return queueWrite(`automation:${root.path}:${id}`, async () => {
            let was;
            try {
              was = await approvals.drop(root.path, id);
            } catch (err) {
              return fail(503, safeError(err));
            }
            if (!was) return json({ error: 'not approved on this machine', reason: 'not-found' }, 404);
            let scheduleError: string | undefined;
            try {
              await bus.scheduleDelete(was.scheduleId);
            } catch (err) {
              scheduleError = safeError(err);
            }
            return noStore(json({ registration: id, approval: 'none', revoked: true, ...(scheduleError ? { scheduleError } : {}) }));
          });
        }),
      },

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
        const data: WsData = { asked: url.searchParams.get('client'), ua: req.headers.get('user-agent') ?? '', clientId: '' };
        if (srv.upgrade(req, { data })) return undefined as unknown as Response;
        return fail(400, 'websocket upgrade failed');
      }
      return rootPage(req);
    },

    websocket: {
      open(ws: ServerWebSocket<WsData>) {
        const rootIds = registry.list().map((r) => r.id);
        for (const id of rootIds) ws.subscribe(`root:${id}`);
        ws.subscribe('roots');
        ws.subscribe('ab');
        const tab = tabs.open(ws, ws.data.asked, ws.data.ua);
        ws.data.clientId = tab.clientId;
        ws.send(JSON.stringify({ t: 'hello', roots: rootIds, ...tab }));
      },
      // Client frames: a liveness ping, and `at` — the page the tab shows (Agent Bus control labels).
      message(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
        const text = raw.toString();
        tabs.message(ws.data.clientId, text);
        if (text === 'ping') ws.send(JSON.stringify({ t: 'pong' }));
      },
      close(ws: ServerWebSocket<WsData>) {
        tabs.close(ws.data.clientId, ws);
      },
    },

    error(err) {
      if (err instanceof ReadOnlyError) return fail(403, err.message);
      console.error(err);
      return fail(500, 'internal error');
    },
  });

  const watcher = new Watcher((events) => {
    for (const ev of events) {
      const root = registry.get(ev.rootId);
      const paths = root ? ev.paths.filter((p) => !registry.hidden(root.path, join(root.path, p))) : ev.paths;
      if (ev.paths.length && !paths.length) continue;
      store.invalidate(ev.rootId, ev.kind === 'git');
      server.publish(`root:${ev.rootId}`, JSON.stringify({ t: ev.kind, root: ev.rootId, paths }));
    }
  });
  const watchTree = async (root: Root): Promise<void> => {
    watcher.watchRoot(root);
    // A root inside a checkout, or a linked worktree, has its git dirs out of reach of the recursive watch.
    if (!opts.noGit) watcher.watchRepo(root, await gitDirs(root.path));
  };
  for (const root of registry.list()) await watchTree(root);

  /** A directory ready to serve, every await done: its canonical path and the git dirs to watch. */
  type PreparedProject = { abs: string; gitDirs: string[] };
  /**
   * Prepares a directory for `installProject` — canonical, a directory, not a reference root, and its
   * git dirs — serving nothing yet. Throws a `ProjectDirError`.
   */
  const prepareProject = async (spec: string): Promise<PreparedProject> => {
    const abs = await registry.prepare(spec);
    const served = registry.list().some((r) => r.path === abs);
    return { abs, gitDirs: served || opts.noGit ? [] : await gitDirs(abs) };
  };
  /**
   * Serves a prepared directory in `mode` and watches it — synchronously, so nothing sees it half set
   * up. A directory served already returns its root unchanged, `added: false`. Should watching throw,
   * the new root is gone again before this returns.
   */
  const installProject = (p: PreparedProject, mode: AccessMode): { root: Root; added: boolean } => {
    const served = registry.list().find((r) => r.path === p.abs);
    if (served) return { root: served, added: false };
    const root = registry.install(p.abs, mode);
    try {
      watcher.watchRoot(root);
      // A root inside a checkout, or a linked worktree, has its git dirs out of reach of the recursive watch.
      if (!opts.noGit) watcher.watchRepo(root, p.gitDirs);
    } catch (err) {
      watcher.unwatch(root.id);
      registry.remove(root.id);
      throw err;
    }
    return { root, added: true };
  };

  /**
   * Serve more directories, at the request of a second `mdhouse` on the control socket.
   *
   * Adding rather than replacing is deliberate. A tab open on one tree should not turn into a
   * different tree because a terminal somewhere ran another command: the reader loses their
   * place, the open document 404s, and nothing says why. mdhouse already serves several roots
   * with a switcher, so the new directory simply joins them and the caller is told its URL.
   */
  const addRoots = async (dirs: string[], writable: boolean, save = false, name?: string | null): Promise<AddReply> => {
    if (name !== undefined) {
      const n = name === null ? { ok: true as const, name: null } : normalizeProjectName(name);
      if (!n.ok) throw new Error(n.error);
      if (dirs.length !== 1) throw new Error('a name is for exactly one directory');
      name = n.name;
    }
    const asked = new Set<string>();
    const added = new Set<string>();
    const upgraded = new Set<string>();

    for (const dir of dirs) {
      const prep = await prepareProject(dir);
      // A saved read-only choice holds for a folder newly served without `--rw`.
      const { root, added: isNew } = installProject(prep, writable ? 'rw' : prefs.savedMode(prep.abs) === 'ro' ? 'ro' : 'inherit');
      // `--rw` for a folder already served read-only upgrades it in place — an explicit read-only
      // choice too. Never the other way: re-opening without `--rw` changes nothing; taking write
      // access away is `-p` without `--rw` and a restart, the settings page, or `--rm`.
      // A folder writable only by auto-rw is asked for too: `--rw` outlives auto-rw going off.
      if (writable && root.mode !== 'rw') {
        const before = root.writable;
        registry.setMode(root.id, 'rw');
        if (!before && root.writable) upgraded.add(root.id);
      }
      // Asking for a directory already served is a request for its URL, not a second copy of it.
      if (isNew) added.add(root.id);
      asked.add(root.id);
      if (save) {
        // `--rw` saves it writable; without, saved write access goes and a read-only choice stays.
        await prefs.addSaved(root.path, writable ? 'rw' : root.mode === 'ro' ? 'ro' : null);
        // Saving keeps the name the session gave it.
        const session = sessionNames.get(root.path);
        if (session !== undefined) await prefs.setSavedName(root.path, session);
        sessionNames.delete(root.path);
        // so does its Agent Bus
        const ab = sessionAb.get(root.path);
        if (ab) await prefs.commitSpaceAb(root.path, ab, () => null);
        sessionAb.delete(root.path);
      }
      if (name !== undefined) await setRootNameNow(root.path, name);
    }

    const roots = rootLines(added, asked).map((r) => (upgraded.has(r.id) ? { ...r, upgraded: true } : r));
    // Open tabs learn about the new root over the channel they already hold.
    server.publish('roots', JSON.stringify({ t: 'roots', roots: roots.map((r) => r.id) }));
    return { url: pageUrl(hostname, server.port), roots };
  };

  const rootLines = (added: Set<string> = new Set(), asked: Set<string> = new Set()): RootLine[] =>
    registry.list().map((r) => ({
      ...labelled(r, customName(r.path)),
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
      const name = prefs.savedName(abs);
      const ab = prefs.isSaved(abs) ? prefs.spaceAb(abs) : null;
      const unsaved = await prefs.removeSaved(abs);
      const root = registry.list().find((r) => r.path === abs);
      // Still served (the last project) but no longer saved: its name and Agent Bus settings live on
      // in memory — a credential does not.
      if (root && name !== undefined && registry.projects().length === 1) sessionNames.set(root.path, name);
      if (root && registry.projects().length === 1 && (ab?.endpoint || ab?.default?.length)) {
        sessionAb.set(root.path, { endpoint: ab.endpoint ?? null, default: ab.default?.length ? ab.default : null });
      }
      if (root && registry.projects().length > 1) {
        sessionNames.delete(root.path);
        sessionAb.delete(root.path);
      }
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
    // The control lock is released so a restarted mdhouse serves at once, not after its TTL.
    void Promise.race([Promise.all([stopAbControl(), stopAutomation()]), Bun.sleep(1_500)]).finally(() => {
      server.stop(true);
      process.exit(0);
    });
  };

  const control = await serveControl(port, {
    add: (req) => rootOps(() => addRoots(req.dirs, req.rw === true, req.save === true, req.name)),
    remove: (req) => rootOps(() => removeRoots(req.dirs)),
    ping: () => ({
      pid: process.pid,
      url: pageUrl(hostname, server.port),
      roots: registry.list().map((r) => ({
        name: customName(r.path) ?? r.name,
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
    admin: {
      mint: mintAdmin,
      revoke: () => ({ revoked: admins.revokeAll() }),
      list: () => admins.list(),
    },
  });

  return { server, store, watcher, control, shutdown, routes, setRootName, abControl, stopAbControl, automation, stopAutomation, approvals, runIndex };
}
