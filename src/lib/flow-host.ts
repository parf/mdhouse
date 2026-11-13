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
import { mkdir, readdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LoadedFlowPackage } from './flow-package';
import { createFlowRun, type FlowRunInput, type FlowRunStatus } from './flow-run';
import { markerOf, readFlowRunDocument, renderFlowRunDocument } from './flow-run-markdown';
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
  | 'not-writable';
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
const REV = /^[0-9a-f]{4,40}$/;
const ROOT_SLUG = (id: string): string => id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^[^a-z]+|-+$/g, '').slice(0, 100).replace(/-+$/, '') || 'project';
/** Packages this host can run: it supplies their first evidence label (the commit range) itself. */
export const RUNNABLE: ReadonlySet<string> = new Set(['recent-commits-review']);
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
const fail = (reason: FlowErrorCode, error: string, extra: Partial<FlowError> = {}): FlowError => ({ error, reason, ...extra });
const isError = (v: unknown): v is FlowError => typeof v === 'object' && v !== null && 'reason' in v && 'error' in v;
export { isError as isFlowError };

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
export async function listRuns(registry: Registry, root: Root, packageId: string, limit = 50): Promise<Array<{ path: string; status: FlowRunStatus; runId: string; at: string }>> {
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
  const pkg = RUNNABLE.has(req.packageId) ? (await deps.catalog()).find((p) => p.manifest.id === req.packageId) : undefined;
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
  const packageDigest = sha256(JSON.stringify([manifest, [...pkg.documents], pkg.example]));
  const rangeSource = { id: 'commit-range', path: `commits/${base.slice(0, 12)}-${target.slice(0, 12)}`, digest: sha256(commits.join('\n')) };
  const dirtySources = dirty.slice(0, 120).map((p, i) => ({ id: `uncommitted-${i + 1}`, path: p.replace(/[\\:%?#\x00-\x1f\x7f]/g, '_'), digest: sha256(p) }));
  const input: FlowRunInput = {
    runId,
    startedAt,
    package: manifest,
    packageDigest,
    selection: {
      ...manifest.defaults,
      root: ROOT_SLUG(root.id),
      sources: [rangeSource, ...dirtySources],
      base,
      target,
      dirtySourceIds: dirtySources.map((s) => s.id),
    },
    // The host established the range itself; every other label is the analyst's to supply.
    evidence: manifest.evidence.required.map((label, i) =>
      i === 0 ? { label, status: 'supplied' as const, sourceIds: ['commit-range'], note: `${commits.length} commits, read by mdhouse from git` } : { label, status: 'missing' as const, sourceIds: [], note: 'Not yet supplied' },
    ),
    questions: [],
  };
  let doc: string;
  try {
    const state = createFlowRun(input);
    doc = renderFlowRunDocument(state, { rootId: root.id, runPath, trigger: req.trigger, marker: base, commits, dirty });
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

/**
 * Starts the run a plan token (manual) or a request (scheduled) names. A manual start needs the
 * token of a preview and writes exactly the previewed document. A scheduled slot that already has
 * its run returns it. One open run per package and project: another start is `open-run`.
 */
export async function startFlowRun(deps: FlowHostDeps, io: FlowWrite, start: { token: string } | { request: FlowStartRequest }): Promise<FlowStarted | FlowError> {
  let req: FlowStartRequest;
  let fixed: { runId: string; startedAt: string; doc: string } | undefined;
  if ('token' in start) {
    const body = verify(deps.key, start.token);
    const valid = body && validRequest(body.req);
    if (!body || !valid) return fail('invalid', 'not a valid preview token');
    req = valid;
    fixed = { runId: body.runId, startedAt: body.startedAt, doc: body.doc };
  } else {
    const valid = validRequest(start.request);
    if (!valid || valid.trigger.kind !== 'schedule') return fail('invalid', 'a request start is for a schedule trigger');
    req = valid;
  }
  // Planned again inside the queue: a start sees every earlier start's document.
  return io.queue(`flow:${req.rootId}:${req.packageId}`, async () => {
    const found = deps.registry.get(req.rootId);
    const root = found && found.kind !== 'reference' ? found : null;
    if (root) {
      const runs = await listRuns(deps.registry, root, req.packageId, 500);
      const runId = fixed ? null : runIdFor(req.trigger);
      const same = runs.find((r) => r.runId === runId);
      if (same) return { status: same.status, runPath: same.path, url: deps.registry.docUrl(root, same.path), created: false };
      const open = runs.find((r) => isOpenRun(r.status));
      if (open) return fail('open-run', 'a run of this flow is still open', { run: { url: deps.registry.docUrl(root, open.path), status: open.status } });
    }
    const plan = await planFlowRun(deps, req, fixed);
    if (isError(plan) || !root) return isError(plan) ? plan : fail('no-root', 'no such project');
    if (fixed && sha256(plan.doc) !== fixed.doc) return fail('stale', 'something changed since the preview — preview again');
    if (!root.writable) return fail('not-writable', 'the project is read-only');
    const loc = await deps.registry.resolve(`${root.id}/${plan.runPath}`);
    if (!loc) return fail('invalid', 'the run path is outside the project');
    if (await stat(loc.abs).catch(() => null)) return fail('stale', 'that run document already exists');
    await mkdir(dirname(loc.abs), { recursive: true });
    await io.writeFile(`${root.id}/${plan.runPath}`, plan.doc);
    return { status: readFlowRunDocument(plan.doc)!.state.status, runPath: plan.runPath, url: deps.registry.docUrl(root, plan.runPath), created: true };
  });
}
