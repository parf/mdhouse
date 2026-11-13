/**
 * The flow host: turns a run request into git facts, a run state and its Markdown document.
 *
 * Packages come only from the installed reference catalog. Every git fact is read here (HEAD, the
 * base, the commits between, uncommitted paths); the pure core (`flow-run.ts`) only validates them.
 * `planFlowRun` writes nothing: it returns the exact document a start would write and a token that
 * binds it. `startFlowRun` plans again with the token's run id and time, and writes only when the
 * result is byte-identical — anything that moved in between (HEAD, the marker, the uncommitted set,
 * the package) is `stale`. Manual and scheduled starts share it.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { link, mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { FlowPackage, LoadedFlowPackage } from './flow-package';
import { applyFlowRunEvent, createFlowRun, type FlowRunAction, type FlowRunEvent, type FlowRunInput, type FlowRunState, type FlowRunStatus } from './flow-run';
import { keepAnalystSections, markerOf, readFlowRunDocument, readFlowRunMeta, renderFlowRunDocument, type FlowRunDocMeta, type FlowRunSeal } from './flow-run-markdown';
import type { Registry, Root } from './roots';

export type FlowRange = { kind: 'since-last-run' } | { kind: 'baseline'; commit: string };
export type FlowTrigger = { kind: 'manual'; actor: string } | { kind: 'schedule'; id: string; slot: string };
export interface FlowStartRequest {
  rootId: string;
  packageId: string;
  range: FlowRange;
  trigger: FlowTrigger;
}

export type FlowErrorCode =
  | 'invalid'
  | 'no-root'
  | 'unknown-package'
  | 'no-git'
  | 'no-baseline'
  | 'bad-baseline'
  | 'open-run'
  | 'stale'
  | 'not-writable'
  | 'held'
  | 'tampered'
  | 'foreign';
export interface FlowError {
  error: string;
  reason: FlowErrorCode;
  why?: 'first-run' | 'marker-missing' | 'marker-unreachable';
  run?: { url: string; status: FlowRunStatus };
}

/** Git as the host uses it; `src/lib/git.ts` in the server, a fake in tests. */
export interface FlowGit {
  repoOf(root: Root): Promise<string | null>;
  head(repo: string): Promise<string | null>;
  commitOf(repo: string, rev: string): Promise<string | null>;
  isAncestor(repo: string, a: string, b: string): Promise<boolean>;
  commits(repo: string, base: string, target: string): Promise<string[] | null>;
  dirty(repo: string, root: Root): Promise<string[]>;
}

export interface FlowHostDeps {
  registry: Registry;
  /** The installed reference catalog; never a project's own packages. */
  catalog(): Promise<LoadedFlowPackage[]>;
  git: FlowGit;
  /** Signs plan tokens; per process. */
  key: Buffer;
  /** Seals a run's input at start: per instance, kept 0600 in the config dir (`sealKeyAt`). */
  sealKey(): Promise<Buffer>;
  /** Ancestry answers by repo, commits and HEAD: they cannot change while HEAD stays. */
  ancestry?: Map<string, boolean>;
  now?(): Date;
}

export interface FlowPlan {
  rootId: string;
  packageId: string;
  runId: string;
  startedAt: string;
  /** Root-relative path of the run document. */
  runPath: string;
  base: string;
  target: string;
  commits: string[];
  dirty: string[];
  warnings: string[];
  doc: string;
  token: string;
}

export interface FlowStarted {
  status: FlowRunStatus;
  runPath: string;
  url: string;
  /** False when a repeated schedule slot found its run already there. */
  created: boolean;
}

/** Where a package's run documents go, root-relative. */
export const runsDir = (packageId: string): string => `Plans/flows/runs/${packageId}`;
const DIRTY_KEPT = 120;
/** Run documents read per package, newest first: the open run and a repeated schedule slot are found among them. */
const RUNS_LISTED = 500;
/** Ancestry answers kept per host. */
const ANCESTRY_KEPT = 256;
const REV = /^[0-9a-f]{4,40}$/;
const ROOT_SLUG = (id: string): string => id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^[^a-z]+|-+$/g, '').slice(0, 100).replace(/-+$/, '') || 'project';
/** The required-evidence label that names the commit range: the host reads the range from git and supplies exactly that one. */
export const rangeLabel = (m: FlowPackage): string | undefined => m.evidence.required.find((l) => /\brange\b/i.test(l));
/**
 * A package this host runs with no code of its own: an explicit-baseline range, analysis-only steps (no consequential
 * effect, no approval) and a required evidence label that names the range. Adding such a flow is its package files.
 */
export const runnableFlow = (m: FlowPackage): boolean =>
  m.defaults.range === 'explicit-baseline' && m.steps.length > 0 && m.steps.every((s) => s.effect === 'analysis' && s.approval === 'none') && rangeLabel(m) !== undefined;
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
const fail = (reason: FlowErrorCode, error: string, extra: Partial<FlowError> = {}): FlowError => ({ error, reason, ...extra });
const isError = (v: unknown): v is FlowError => typeof v === 'object' && v !== null && 'reason' in v && 'error' in v;
export { isError as isFlowError };

/** The digest a run declares for its package: manifest, documents and example. */
const digestOf = (pkg: LoadedFlowPackage): string => sha256(JSON.stringify([pkg.manifest, [...pkg.documents], pkg.example]));

/**
 * The seal key at `path`: read, or created 0600 on first use (written aside and linked, so a
 * concurrent start reads a whole key). Not 32 bytes → throws.
 */
export async function sealKeyAt(path: string): Promise<Buffer> {
  const have = await readFile(path).catch((err: NodeJS.ErrnoException) => (err.code === 'ENOENT' ? null : Promise.reject(err)));
  if (have) {
    if (have.length !== 32) throw new Error(`${path} is not a flow seal key`);
    return have;
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${randomBytes(6).toString('hex')}`;
  const key = randomBytes(32);
  await writeFile(tmp, key, { flag: 'wx', mode: 0o600 });
  try {
    await link(tmp, path);
    return key;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return sealKeyAt(path);
    throw err;
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

const RANGE_SOURCE = 'commit-range';
/** What a seal binds: the project, package, range, its commits, destination and run document. */
function sealData(rootPath: string, input: FlowRunInput, runPath: string): string {
  const sel = input.selection;
  const range = sel.sources.find((x) => x.id === RANGE_SOURCE)?.digest ?? '';
  return stable([rootPath, input.runId, input.package.id, input.packageDigest, sel.base, sel.target, range, sel.destination, runPath]);
}
const sealId = (key: Buffer): string => sha256(key.toString('hex')).slice(0, 16);
const sealMac = (key: Buffer, data: string): string => createHmac('sha256', key).update(data).digest('hex');

/** JSON with sorted keys: equal data, equal text. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** The run id a trigger gets: random for a manual start, fixed by the slot for a scheduled one. */
export function runIdFor(trigger: FlowTrigger): string {
  if (trigger.kind === 'schedule') return `run-${sha256(`${trigger.id}:${trigger.slot}`).slice(0, 16)}`;
  return `run-${randomBytes(8).toString('hex')}`;
}

/** `2026-11-12T20:52:00.000Z` → `20261112T205200Z`. */
const stamp = (iso: string): string => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function validRequest(v: unknown): FlowStartRequest | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  const range = r.range as Record<string, unknown> | undefined;
  const trigger = r.trigger as Record<string, unknown> | undefined;
  if (typeof r.rootId !== 'string' || typeof r.packageId !== 'string' || !range || !trigger) return null;
  const okRange = range.kind === 'since-last-run' || (range.kind === 'baseline' && typeof range.commit === 'string');
  const okTrigger =
    (trigger.kind === 'manual' && typeof trigger.actor === 'string') ||
    (trigger.kind === 'schedule' && typeof trigger.id === 'string' && typeof trigger.slot === 'string' && trigger.id.length <= 128 && trigger.slot.length <= 128);
  return okRange && okTrigger ? (v as FlowStartRequest) : null;
}

/** Each run document of `packageId` under `root`, newest first, with its replayed status. */
export async function listRuns(registry: Registry, root: Root, packageId: string, limit = RUNS_LISTED): Promise<Array<{ path: string; status: FlowRunStatus; runId: string; at: string }>> {
  const dir = await registry.resolve(`${root.id}/${runsDir(packageId)}`);
  if (!dir) return [];
  const names = (await readdir(dir.abs).catch(() => [] as string[])).filter((n) => /^\d{8}T\d{6}Z-[a-z0-9-]+\.md$/.test(n)).sort().reverse().slice(0, limit);
  const out: Array<{ path: string; status: FlowRunStatus; runId: string; at: string }> = [];
  for (const name of names) {
    const loc = await registry.resolve(`${root.id}/${runsDir(packageId)}/${name}`);
    if (!loc) continue;
    const doc = readFlowRunDocument(await Bun.file(loc.abs).text().catch(() => ''));
    if (doc) out.push({ path: loc.rel, status: doc.state.status, runId: doc.state.input.runId, at: doc.state.input.startedAt });
  }
  return out;
}

/** A run that still blocks a new one of its package. */
export const isOpenRun = (s: FlowRunStatus): boolean => s === 'running' || s === 'held';

/**
 * The run a request would start, without writing anything. `fixed` replays a token's run id and
 * time. Errors are `FlowError`s.
 */
export async function planFlowRun(deps: FlowHostDeps, value: unknown, fixed?: { runId: string; startedAt: string }): Promise<FlowPlan | FlowError> {
  const req = validRequest(value);
  if (!req) return fail('invalid', 'expected {rootId, packageId, range, trigger}');
  const root = deps.registry.get(req.rootId);
  if (!root || root.kind === 'reference') return fail('no-root', 'no such project');
  const pkg = (await deps.catalog()).find((p) => p.manifest.id === req.packageId && runnableFlow(p.manifest));
  if (!pkg) return fail('unknown-package', 'no such flow package');
  const manifest = pkg.manifest;
  const repo = await deps.git.repoOf(root);
  if (!repo) return fail('no-git', 'the project is not in a git repository');
  const target = await deps.git.head(repo);
  if (!target) return fail('no-git', 'the repository has no commits');

  const dest = await deps.registry.resolve(`${root.id}/${manifest.defaults.destination}`);
  if (!dest) return fail('invalid', 'the package destination is outside the project');
  const destText = await Bun.file(dest.abs).text().catch(() => null);

  let base: string | null;
  if (req.range.kind === 'baseline') {
    if (!REV.test(req.range.commit)) return fail('bad-baseline', 'a baseline is a commit hash: 4-40 hex digits');
    base = await deps.git.commitOf(repo, req.range.commit);
    if (!base) return fail('bad-baseline', 'the baseline names no commit');
  } else {
    const marker = destText === null ? null : markerOf(destText);
    if (!marker) return fail('no-baseline', 'no earlier run: choose a baseline commit', { why: destText === null ? 'first-run' : 'marker-missing' });
    base = await deps.git.commitOf(repo, marker);
    if (!base) return fail('no-baseline', 'the last run’s commit is gone (history rewritten?): choose a baseline commit', { why: 'marker-unreachable' });
  }
  if (!(await deps.git.isAncestor(repo, base, target))) return fail('bad-baseline', 'the baseline is not an ancestor of HEAD');
  const commits = await deps.git.commits(repo, base, target);
  if (commits === null) return fail('no-git', 'git could not list the range');

  const allDirty = await deps.git.dirty(repo, root);
  const dirty = allDirty.slice(0, DIRTY_KEPT);
  const warnings = allDirty.length > DIRTY_KEPT ? [`${allDirty.length - DIRTY_KEPT} more uncommitted paths not listed`] : [];

  const runId = fixed?.runId ?? runIdFor(req.trigger);
  const startedAt = fixed?.startedAt ?? (deps.now?.() ?? new Date()).toISOString();
  const runPath = `${runsDir(manifest.id)}/${stamp(startedAt)}-${runId.slice(4, 12)}.md`;
  const packageDigest = digestOf(pkg);
  const rangeSource = { id: RANGE_SOURCE, path: `commits/${base.slice(0, 12)}-${target.slice(0, 12)}`, digest: sha256(commits.join('\n')) };
  // Evidence asserted on the run page is recorded in the run document itself; its digest is of the path, as the text changes.
  const runSource = { id: 'run-document', path: runPath, digest: sha256(runPath) };
  const dirtySources = dirty.slice(0, 120).map((p, i) => ({ id: `uncommitted-${i + 1}`, path: p.replace(/[\\:%?#\x00-\x1f\x7f]/g, '_'), digest: sha256(p) }));
  const input: FlowRunInput = {
    runId,
    startedAt,
    package: manifest,
    packageDigest,
    selection: {
      ...manifest.defaults,
      root: ROOT_SLUG(root.id),
      sources: [rangeSource, runSource, ...dirtySources],
      base,
      target,
      dirtySourceIds: dirtySources.map((s) => s.id),
    },
    // The host established the range itself; every other label is the analyst's to supply.
    evidence: manifest.evidence.required.map((label) =>
      label === rangeLabel(manifest) ? { label, status: 'supplied' as const, sourceIds: [RANGE_SOURCE], note: `${commits.length} commits, read by mdhouse from git` } : { label, status: 'missing' as const, sourceIds: [], note: 'Not yet supplied' },
    ),
    questions: [],
  };
  const sealKey = await deps.sealKey();
  const seal: FlowRunSeal = { key: sealId(sealKey), mac: sealMac(sealKey, sealData(root.path, input, runPath)) };
  let doc: string;
  try {
    const state = createFlowRun(input);
    doc = renderFlowRunDocument(state, { rootId: root.id, runPath, trigger: req.trigger, marker: base, commits, dirty, seal });
  } catch (err) {
    return fail('invalid', err instanceof Error ? err.message : 'invalid run');
  }
  const token = sign(deps.key, { req, runId, startedAt, doc: sha256(doc) });
  return { rootId: root.id, packageId: manifest.id, runId, startedAt, runPath, base, target, commits, dirty, warnings, doc, token };
}

interface TokenBody {
  req: FlowStartRequest;
  runId: string;
  startedAt: string;
  doc: string;
}

function sign(key: Buffer, body: TokenBody): string {
  const data = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${data}.${createHmac('sha256', key).update(data).digest('base64url')}`;
}

function verify(key: Buffer, token: unknown): TokenBody | null {
  if (typeof token !== 'string' || token.length > 16_384) return null;
  const [data = '', mac = ''] = token.split('.');
  const want = Buffer.from(createHmac('sha256', key).update(data).digest('base64url'));
  const got = Buffer.from(mac);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString()) as TokenBody;
  } catch {
    return null;
  }
}

/** Hooks the server gives a start: its write queue and the only write to a tree. */
export interface FlowWrite {
  queue<T>(key: string, run: () => Promise<T>): Promise<T>;
  writeFile(p: string, text: string): Promise<unknown>;
}

/** How long a preview token starts a run. */
export const TOKEN_TTL_MS = 10 * 60_000;

/**
 * Starts the run a plan token (manual) or a request (scheduled) names. A manual start needs a fresh
 * preview token and writes exactly the previewed document, by `actor` — another actor is `stale`. A
 * scheduled slot that already has its run returns it. One open run per package and project: another
 * start is `open-run`. Planned again under the package's queue and the destination's, so a start
 * sees every earlier start and no destination write lands in between.
 */
export async function startFlowRun(deps: FlowHostDeps, io: FlowWrite, start: { token: string; actor: (root: Root) => Promise<string> } | { request: FlowStartRequest }): Promise<FlowStarted | FlowError> {
  let req: FlowStartRequest;
  let fixed: { runId: string; startedAt: string; doc: string } | undefined;
  if ('token' in start) {
    const body = verify(deps.key, start.token);
    const valid = body && validRequest(body.req);
    if (!body || !valid || valid.trigger.kind !== 'manual') return fail('invalid', 'not a valid preview token');
    const age = (deps.now?.() ?? new Date()).getTime() - Date.parse(body.startedAt);
    if (!(age >= 0 && age <= TOKEN_TTL_MS)) return fail('stale', 'the preview expired — preview again');
    req = valid;
    fixed = { runId: body.runId, startedAt: body.startedAt, doc: body.doc };
  } else {
    const valid = validRequest(start.request);
    if (!valid || valid.trigger.kind !== 'schedule') return fail('invalid', 'a request start is for a schedule trigger');
    req = valid;
  }
  const found = deps.registry.get(req.rootId);
  const root = found && found.kind !== 'reference' ? found : null;
  if (!root) return fail('no-root', 'no such project');
  if (!root.writable) return fail('not-writable', 'the project is read-only');
  // The actor is whoever starts, as at preview: another author makes the document differ — stale.
  if ('token' in start) req = { ...req, trigger: { kind: 'manual', actor: await start.actor(root) } };
  const pkg = (await deps.catalog()).find((p) => p.manifest.id === req.packageId && runnableFlow(p.manifest));
  if (!pkg) return fail('unknown-package', 'no such flow package');
  const dest = await deps.registry.resolve(`${root.id}/${pkg.manifest.defaults.destination}`);
  if (!dest) return fail('invalid', 'the package destination is outside the project');

  return io.queue(`flow:${root.id}:${pkg.manifest.id}`, () =>
    io.queue(dest.abs, async () => {
      const runs = await listRuns(deps.registry, root, pkg.manifest.id);
      const runId = fixed ? null : runIdFor(req.trigger);
      const same = runs.find((r) => r.runId === runId);
      if (same) return { status: same.status, runPath: same.path, url: deps.registry.docUrl(root, same.path), created: false };
      const open = runs.find((r) => isOpenRun(r.status));
      if (open) return fail('open-run', 'a run of this flow is still open', { run: { url: deps.registry.docUrl(root, open.path), status: open.status } });
      const plan = await planFlowRun(deps, req, fixed);
      if (isError(plan)) return plan;
      if (fixed && sha256(plan.doc) !== fixed.doc) return fail('stale', 'something changed since the preview — preview again');
      const loc = await deps.registry.resolve(`${root.id}/${plan.runPath}`);
      if (!loc) return fail('invalid', 'the run path is outside the project');
      if (await stat(loc.abs).catch(() => null)) return fail('stale', 'that run document already exists');
      await io.writeFile(`${root.id}/${plan.runPath}`, plan.doc);
      return { status: readFlowRunDocument(plan.doc)!.state.status, runPath: plan.runPath, url: deps.registry.docUrl(root, plan.runPath), created: true };
    }),
  );
}

/** The run as the run page shows it (`/api/doc` `flow`). */
export interface DocFlow {
  runId: string;
  version: number;
  status: FlowRunStatus;
  node: { id: string; title: string; outcomes: Array<'complete' | 'blocked' | 'failed'> };
  holds: string[];
  evidence: Array<{ label: string; status: 'supplied' | 'missing'; note: string; required: boolean }>;
  questions: Array<{ id: string; title: string; required: boolean; status: 'unanswered' | 'answered' }>;
  canAct: boolean;
  refused?: string;
}

/** A step's words: the package's steps carry only an id (`delivery-sync` → `Delivery sync`). */
const stepTitle = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ');

/**
 * Whether a run document may be acted on: its input must be what this host wrote — sealed by this
 * instance's key over the project, package, range, commits, destination and path (another key:
 * `foreign`, read-only here), under its package's runs folder, the installed runnable package (same
 * manifest and digest), the package's own selection defaults, and a base and target that are commits
 * on HEAD's history. Else `tampered`.
 */
export async function verifyRun(deps: FlowHostDeps, root: Root, rel: string, state: FlowRunState, meta: FlowRunDocMeta | null): Promise<FlowError | null> {
  const { input } = state;
  const sel = input.selection;
  const id = input.package.id;
  const tampered = (why: string) => fail('tampered', `this run document cannot be acted on: ${why}`);
  if (!meta?.seal) return tampered('it carries no seal from this host');
  const key = await deps.sealKey();
  if (meta.seal.key !== sealId(key)) return fail('foreign', 'this run was started on another machine — read-only here');
  const want = Buffer.from(sealMac(key, sealData(root.path, input, rel)));
  const got = Buffer.from(meta.seal.mac);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return tampered('its run input was changed, or the project folder moved (the seal binds the path)');
  if (sel.sources.find((x) => x.id === RANGE_SOURCE)?.digest !== sha256(meta.commits.join('\n'))) return tampered('its commit list was changed');
  if (!rel.startsWith(`${runsDir(id)}/`)) return tampered('it is not in its package’s runs folder');
  const pkg = (await deps.catalog()).find((p) => p.manifest.id === id && runnableFlow(p.manifest));
  if (!pkg) return tampered('its package is not installed or not runnable');
  if (stable(input.package) !== stable(pkg.manifest) || input.packageDigest !== digestOf(pkg)) return tampered('it was made with another version of its package');
  const d = pkg.manifest.defaults;
  if (sel.scope !== d.scope || sel.range !== d.range || sel.audience !== d.audience || sel.output !== d.output || sel.destination !== d.destination) {
    return tampered('its selection differs from the package’s');
  }
  const repo = await deps.git.repoOf(root);
  const head = repo ? await deps.git.head(repo) : null;
  if (!repo || !head) return fail('no-git', 'the project is not in a git repository');
  // An unknown commit is no ancestor either.
  const onHistory = async (): Promise<boolean> => (await deps.git.isAncestor(repo, sel.target, head)) && (await deps.git.isAncestor(repo, sel.base, sel.target));
  const seen = `${repo}\0${sel.base}\0${sel.target}\0${head}`;
  let ok = deps.ancestry?.get(seen);
  if (ok === undefined) {
    ok = await onHistory();
    if (deps.ancestry) {
      if (deps.ancestry.size >= ANCESTRY_KEPT) deps.ancestry.delete(deps.ancestry.keys().next().value!);
      deps.ancestry.set(seen, ok);
    }
  }
  if (!ok) return tampered('its range is not on the history of HEAD');
  return null;
}

/** The page's view of a run state; `canAct` only while the run is open and `writable`; `refused` says why a run cannot be acted on. */
export function docFlow(state: FlowRunState, writable: boolean, refused?: string): DocFlow {
  const node = state.input.package.steps.find((s) => s.id === state.nodeId)!;
  const required = new Set(state.input.package.evidence.required);
  return {
    runId: state.input.runId,
    version: state.version,
    status: state.status,
    node: { id: node.id, title: stepTitle(node.id), outcomes: (['complete', 'blocked', 'failed'] as const).filter((o) => node.on[o]) },
    holds: [...state.holds],
    evidence: state.evidence.map((e) => ({ label: e.label, status: e.status, note: e.note, required: required.has(e.label) })),
    questions: state.questions.map((q) => ({ id: q.id, title: q.title, required: q.required, status: q.status })),
    canAct: writable && !refused && isOpenRun(state.status),
    ...(refused ? { refused } : {}),
  };
}

/** What the run page sends: one assertion; the host adds the node, sources and time. */
export type FlowPageAction =
  | { type: 'outcome'; outcome: 'complete' | 'blocked' | 'failed'; text: string }
  | { type: 'evidence'; label: string; status: 'supplied' | 'missing'; note: string }
  | { type: 'question'; questionId: string; status: 'unanswered' | 'answered'; turn: string }
  | { type: 'cancel'; reason: string };

const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;

function coreAction(state: FlowRunState, a: unknown): FlowRunAction | null {
  if (typeof a !== 'object' || a === null) return null;
  const v = a as Record<string, unknown>;
  switch (v.type) {
    case 'outcome':
      return { type: 'outcome', nodeId: state.nodeId, outcome: v.outcome as 'complete', text: v.text as string, sourceIds: [], questionIds: [] };
    case 'evidence':
      return { type: 'evidence', evidence: { label: v.label as string, status: v.status as 'supplied', sourceIds: v.status === 'supplied' ? ['run-document'] : [], note: v.note as string } };
    case 'question':
      return { type: 'question', questionId: v.questionId as string, status: v.status as 'answered', turn: v.turn as string };
    case 'cancel':
      return { type: 'cancel', reason: v.reason as string };
    default:
      return null;
  }
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export interface FlowActed {
  /** The new document text; null for a retry already recorded. */
  doc: string | null;
  state: FlowRunState;
  /** Set when this event completed the run: the commit the destination's marker advances to. */
  advance: string | null;
}

/**
 * Applies one page action to a run document's text. The event id comes from `clientId`, so a retry
 * of the same action is answered with the recorded state; another action at an old version is
 * `stale`. Completing while held is `held`. The analyst's sections are kept; a document that lost
 * them, or its state or host block, is refused.
 */
export function applyFlowAction(text: string, at: { rootId: string; rel: string }, req: { expectedVersion: unknown; clientId: unknown; action: unknown }, now: Date = new Date()): FlowActed | FlowError {
  const read = readFlowRunDocument(text);
  const meta = readFlowRunMeta(text);
  if (!read || !meta) return fail('invalid', 'not a run document, or its run state was edited');
  if (meta.rootId !== at.rootId || meta.runPath !== at.rel) return fail('invalid', 'this run document was moved or copied — act on the original');
  const { state } = read;
  if (typeof req.clientId !== 'string' || !CLIENT_ID.test(req.clientId)) return fail('invalid', 'clientId: 8-64 letters, digits, - or _');
  if (!Number.isSafeInteger(req.expectedVersion)) return fail('invalid', 'expectedVersion is a version number');
  const action = coreAction(state, req.action);
  if (!action) return fail('invalid', 'action: outcome | evidence | question | cancel');
  const id = `ev-${sha256(req.clientId).slice(0, 16)}`;
  const recorded = state.events.find((e) => e.id === id);
  if (recorded) return same(recorded.action, action) ? { doc: null, state, advance: null } : fail('invalid', 'clientId reused for another action');
  if (req.expectedVersion !== state.version || !isOpenRun(state.status)) return fail('stale', 'the run moved on — reload the page');
  if (action.type === 'outcome' && action.outcome === 'complete' && state.holds.length) return fail('held', `the run is held: ${state.holds.join('; ')}`);
  const lastAt = state.events.at(-1)?.at ?? state.input.startedAt;
  const nowAt = now.toISOString();
  const event: FlowRunEvent = { id, expectedVersion: state.version, at: nowAt < lastAt ? lastAt : nowAt, action };
  let next: FlowRunState;
  try {
    next = applyFlowRunEvent(state, event).state;
  } catch (err) {
    return fail('invalid', err instanceof Error ? err.message : 'invalid event');
  }
  const advance = next.status === 'complete' ? next.input.selection.target : null;
  let doc: string;
  try {
    doc = renderFlowRunDocument(next, advance ? { ...meta, marker: advance } : meta);
  } catch (err) {
    return fail('invalid', err instanceof Error ? err.message : 'invalid run');
  }
  const kept = keepAnalystSections(text, doc);
  if (kept === null) return fail('invalid', 'the Findings … Transitions sections are gone — restore them first');
  return { doc: kept, state: next, advance };
}
