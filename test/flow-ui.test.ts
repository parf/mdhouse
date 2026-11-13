import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ApiError } from '../src/ui/api';
import { VIEWER_DENIED, VIEWER_MESSAGE } from '../src/ui/viewer-text';
import { FlowApiError, flowApi } from '../src/ui/flow-api';
import {
  barOutcomes, defaultRange, flowReasonText, isTerminal, newClientId, assertionError, noBaselineText, outcomeError, rangeOf, showsBar, startable,
  type DocFlow, type FlowCatalogEntry,
} from '../src/ui/flow-model';

/** A fake of the MW.3.3 routes: only the contract's shapes and refusals, none of the runner. */
const pkg = (over: Partial<FlowCatalogEntry> = {}): FlowCatalogEntry => ({
  id: 'recent-commits-review', family: 'commit-review', title: 'Recent commits review', summary: 's',
  ranges: ['since-last-run', 'baseline'], lastRun: null, openRun: null, ...over,
});
const reply = (status: number, body: unknown) => Response.json(body, { status });
const tokens = new Map<string, string>();
const events = new Map<string, { status: string; version: number; url: string }>();
let version = 1;
let server: ReturnType<typeof Bun.serve>;
let base = '';

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const body = req.method === 'POST' ? ((await req.json()) as any) : null;
      if (url.pathname === '/api/flow/catalog') {
        if (url.searchParams.get('root') === 'viewer') return reply(403, { error: 'read-only', reason: 'viewer' });
        return reply(200, { packages: [pkg(), pkg({ id: 'busy', openRun: { url: '/p/Plans/flows/runs/busy/x.md', status: 'running' } })] });
      }
      if (url.pathname === '/api/flow/preview') {
        if (body.packageId === 'nope') return reply(404, { error: 'unknown flow', reason: 'unknown-package' });
        if (body.range.kind === 'since-last-run') return reply(409, { error: 'first run', reason: 'no-baseline', why: 'first-run' });
        const token = `t${tokens.size}`;
        tokens.set(token, body.packageId);
        return reply(200, { token, runPath: 'Plans/flows/runs/x/a.md', base: 'a'.repeat(40), target: 'b'.repeat(40), dirty: ['README.md'], warnings: [], html: '<p>preview</p>' });
      }
      if (url.pathname === '/api/flow/start') {
        if (body.token === 'open') return reply(409, { error: 'open', reason: 'open-run', run: { url: '/p/x.md', status: 'running' } });
        if (!tokens.has(body.token)) return reply(400, { error: 'expired', reason: 'invalid' });
        return reply(200, { status: 'running', runPath: 'Plans/flows/runs/x/a.md', url: '/p/Plans/flows/runs/x/a.md' });
      }
      if (url.pathname === '/api/flow/event') {
        const seen = events.get(body.clientId);
        if (seen) return reply(200, seen);
        if (body.expectedVersion !== version) return reply(409, { error: 'moved', reason: 'stale' });
        version++;
        const out = { status: body.action.type === 'cancel' ? 'cancelled' : 'running', version, url: '/p/x' };
        events.set(body.clientId, out);
        return reply(200, out);
      }
      return reply(404, { error: 'no' });
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(() => server.stop(true));

const flow = (over: Partial<DocFlow> = {}): DocFlow => ({
  runId: 'r', version: 1, status: 'running', node: { id: 'n', title: 'Review', outcomes: ['complete', 'blocked', 'failed'] },
  holds: [], evidence: [], questions: [], canAct: true, ...over,
});

describe('range', () => {
  test('since the last run needs no commit', () => expect(rangeOf('since-last-run', '')).toEqual({ range: { kind: 'since-last-run' } }));
  test('a baseline needs a hex commit of 4 to 40 digits, lower-cased', () => {
    expect(rangeOf('baseline', '')).toHaveProperty('error');
    expect(rangeOf('baseline', 'xyz1234')).toHaveProperty('error');
    expect(rangeOf('baseline', 'abc')).toHaveProperty('error');
    expect(rangeOf('baseline', ' ABC1234 ')).toEqual({ range: { kind: 'baseline', commit: 'abc1234' } });
    expect(rangeOf('baseline', 'a'.repeat(41))).toHaveProperty('error');
  });
  test('the default range follows whether there is a last run', () => {
    expect(defaultRange(pkg())).toBe('baseline');
    expect(defaultRange(pkg({ lastRun: { url: '/x', status: 'complete', at: 'now' } }))).toBe('since-last-run');
    expect(defaultRange(pkg({ ranges: ['baseline'], lastRun: { url: '/x', status: 'complete', at: 'now' } }))).toBe('baseline');
  });
  test('a package with an open run is a link, not a start', () => {
    expect(startable(pkg())).toBe(true);
    expect(startable(pkg({ openRun: { url: '/x', status: 'held' } }))).toBe(false);
  });
});

describe('the run bar', () => {
  test('offers the node\'s outcomes only to someone who can act on an open run', () => {
    expect(barOutcomes(flow())).toEqual(['complete', 'blocked', 'failed']);
    expect(barOutcomes(flow({ canAct: false }))).toEqual([]);
    expect(barOutcomes(flow({ status: 'complete' }))).toEqual([]);
    expect(barOutcomes(flow({ node: { id: 'n', title: 't', outcomes: ['complete'] } }))).toEqual(['complete']);
  });
  test('shows only to someone who can act on the run', () => {
    expect(showsBar(undefined)).toBe(false);
    expect(showsBar(flow())).toBe(true);
    expect(showsBar(flow({ canAct: false }))).toBe(false);
    expect(showsBar(flow({ canAct: false, holds: ['a question is open'] }))).toBe(false);
  });
  test('every outcome needs words; a text has a size limit', () => {
    expect(outcomeError('complete', '')).toMatch(/found/);
    expect(outcomeError('complete', 'All read.')).toBeNull();
    expect(outcomeError('blocked', '  ')).toMatch(/blocks/);
    expect(outcomeError('failed', '')).toMatch(/failed/);
    expect(outcomeError('failed', 'why')).toBeNull();
    expect(outcomeError('complete', 'x'.repeat(16 * 1024 + 1))).toMatch(/long/);
  });
  test('an assertion needs its note', () => {
    expect(assertionError('evidence', ' ')).toMatch(/evidence is/);
    expect(assertionError('question', '')).toMatch(/answer was/);
    expect(assertionError('evidence', 'git log read')).toBeNull();
    expect(flowReasonText('invalid', 'Invalid flow run: evidence note')).toBe('Invalid flow run: evidence note');
  });
  test('a missing baseline says why', () => {
    expect(noBaselineText('first-run')).toMatch(/not run here yet/);
    expect(noBaselineText('marker-unreachable')).toMatch(/no longer/);
    expect(noBaselineText('marker-missing')).toMatch(/left no commit/);
    expect(noBaselineText(undefined)).toMatch(/not run here yet/);
  });
  test('terminal statuses', () => {
    expect(isTerminal('running')).toBe(false);
    expect(isTerminal('held')).toBe(false);
    for (const s of ['complete', 'blocked', 'failed', 'cancelled', 'partial', 'unsupported'] as const) expect(isTerminal(s)).toBe(true);
  });
  test('refusals have words, an unknown reason keeps the server\'s', () => {
    expect(flowReasonText('stale', 'the preview expired — preview again')).toBe('the preview expired — preview again');
    expect(flowReasonText('weird', 'server words')).toBe('server words');
    expect(flowReasonText(undefined, 'fallback')).toBe('fallback');
  });
});

describe('against the fake routes', () => {
  const api = () => flowApi(base);
  test('catalog, then a preview with a baseline, then start', async () => {
    const c = await api().catalog('p');
    expect(c.packages.map((p) => p.id)).toEqual(['recent-commits-review', 'busy']);
    const pv = await api().preview('p', 'recent-commits-review', { kind: 'baseline', commit: 'abc1234' });
    expect(pv.html).toBe('<p>preview</p>');
    expect(pv.dirty).toEqual(['README.md']);
    const st = await api().start(pv.token);
    expect(st).toEqual({ status: 'running', runPath: 'Plans/flows/runs/x/a.md', url: '/p/Plans/flows/runs/x/a.md' });
  });
  test('a first run asks for a baseline; an unknown package and a bad token are refused with their reason', async () => {
    const e1 = await api().preview('p', 'recent-commits-review', { kind: 'since-last-run' }).catch((e) => e);
    expect(e1).toBeInstanceOf(FlowApiError);
    expect(e1).toBeInstanceOf(ApiError);
    expect(e1.reason).toBe('no-baseline');
    expect(e1.status).toBe(409);
    expect(e1.why).toBe('first-run');
    expect((await api().preview('p', 'nope', { kind: 'since-last-run' }).catch((e) => e)).reason).toBe('unknown-package');
    expect((await api().start('bogus').catch((e) => e)).reason).toBe('invalid');
  });
  test('an open run comes back with its link', async () => {
    const e = await api().start('open').catch((x) => x);
    expect(e.reason).toBe('open-run');
    expect(e.run).toEqual({ url: '/p/x.md', status: 'running' });
  });
  test('a Viewer\'s catalog is refused as viewer', async () => {
    const seen: string[] = [];
    const on = () => seen.push(VIEWER_DENIED);
    addEventListener(VIEWER_DENIED, on);
    const e = await api().catalog('viewer').catch((x) => x);
    removeEventListener(VIEWER_DENIED, on);
    expect(e.reason).toBe('viewer');
    expect(e.message).toBe(VIEWER_MESSAGE);
    expect(seen).toEqual([VIEWER_DENIED]);
    expect(flowReasonText('viewer', 'x')).toBe(VIEWER_MESSAGE);
  });
  test('an event moves the version; a repeat with the same client id is the same event; an old version is stale', async () => {
    const req = (v: number, id: string, action: any = { type: 'outcome', outcome: 'complete', text: '' }) => ({ root: 'p', path: 'x.md', expectedVersion: v, clientId: id, action });
    const id = newClientId();
    const first = await api().event(req(version, id));
    expect(first.version).toBe(version);
    expect(await api().event(req(1, id))).toEqual(first);
    expect((await api().event(req(1, newClientId())).catch((e) => e)).reason).toBe('stale');
    expect((await api().event(req(version, newClientId(), { type: 'cancel', reason: 'no longer needed' }))).status).toBe('cancelled');
  });
});
