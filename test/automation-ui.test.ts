import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ApiError } from '../src/ui/api';
import { automationApi } from '../src/ui/automation-api';
import {
  APPROVAL_WORDS, automationUrl, autoReasonText, canApproveReg, canRevokeReg, cronWords, runLine, shortHash, whenWords, willRun,
  type AutoRegistration, type AutomationState,
} from '../src/ui/automation-model';
import { VIEWER_DENIED, VIEWER_MESSAGE } from '../src/ui/viewer-text';

const reg = (o: Partial<AutoRegistration> = {}): AutoRegistration => ({
  id: 'weekly', file: '.mdhouse/automation/weekly.json', flow: 'recent-commits-review', range: 'since-last-run', when: { cron: '30 8 * * 1-5' }, maxLate: '1h', overlap: 'skip',
  hash: 'a'.repeat(64), approval: 'none', disabled: false, failures: 0, startedToday: 0, runs: [], ...o,
});

describe('a schedule in words, in UTC', () => {
  test.each([
    ['30 8 * * 1-5', 'weekdays at 08:30 UTC'],
    ['0 9 * * *', 'every day at 09:00 UTC'],
    ['0 9 * * 1', 'Mondays at 09:00 UTC'],
    ['0 9 * * 0', 'Sundays at 09:00 UTC'],
    ['0 9 * * 7', 'Sundays at 09:00 UTC'],
    ['15 22 * * 6,0', 'weekends at 22:15 UTC'],
    ['*/15 * * * *', 'every 15 minutes'],
    ['0 * * * *', 'every hour, on the hour'],
    ['0 9 1 * *', 'cron 0 9 1 * * (UTC)'],
    ['0 0 9 * * 1', 'cron 0 0 9 * * 1 (UTC)'],
    ['61 9 * * *', 'cron 61 9 * * * (UTC)'],
    ['weird', 'cron weird (UTC)'],
  ])('%s → %s', (expr, words) => expect(cronWords(expr)).toBe(words));
  test('an instant', () => {
    expect(whenWords({ at: '2026-12-01T09:00:00Z' })).toBe('once, 2026-12-01 09:00 UTC');
    expect(whenWords({ cron: '30 8 * * 1-5' })).toBe('weekdays at 08:30 UTC');
  });
});

describe('what the page says', () => {
  test('a run line has its outcome, time, and the reason or status', () => {
    expect(runLine({ at: '2026-11-13T08:30:05.000Z', outcome: 'refused', why: 'not approved' })).toBe('🚫 2026-11-13 08:30 UTC · refused — not approved');
    expect(runLine({ at: '2026-11-13T08:30:05Z', outcome: 'started', status: 'held' })).toBe('▶ 2026-11-13 08:30 UTC · started — held');
    expect(runLine({ at: '2026-11-13T08:30:05Z', outcome: 'ok' })).toBe('✅ 2026-11-13 08:30 UTC · ok');
  });
  test('what an approval lets run: the flow, when, over what, how late, where it writes, who is told', () => {
    const lines = willRun(reg({ notify: '#claude/x@host', range: { kind: 'baseline', commit: 'abc1234' }, maxLate: '30m' }));
    expect(lines[0]).toBe('Start the flow recent-commits-review weekdays at 08:30 UTC');
    expect(lines[1]).toBe('over the commits from commit abc1234; a run later than 30m is skipped');
    expect(lines[2]).toMatch(/analysis only.*Plans\/flows\/runs\//);
    expect(lines[3]).toBe('and tell #claude/x@host how it went');
    expect(willRun(reg())).toHaveLength(3);
  });
  test('the approval states say what happens', () => {
    expect(APPROVAL_WORDS.none).toMatch(/will not run/);
    expect(APPROVAL_WORDS.changed).toMatch(/changed since it was approved/);
    expect(shortHash('a'.repeat(64))).toBe('a'.repeat(12));
  });
  test('approve and revoke are the administrator\'s, and only where they change something', () => {
    const admin = { canApprove: true } as AutomationState;
    const reader = { canApprove: false } as AutomationState;
    expect([canApproveReg(admin, reg({ approval: 'none' })), canApproveReg(admin, reg({ approval: 'changed' })), canApproveReg(admin, reg({ approval: 'approved' }))]).toEqual([true, true, false]);
    expect([canRevokeReg(admin, reg({ approval: 'none' })), canRevokeReg(admin, reg({ approval: 'changed' })), canRevokeReg(admin, reg({ approval: 'approved' }))]).toEqual([false, true, true]);
    for (const a of ['none', 'changed', 'approved'] as const) expect([canApproveReg(reader, reg({ approval: a })), canRevokeReg(reader, reg({ approval: a }))]).toEqual([false, false]);
  });
  test('refusals: the page\'s words for stale and admin, the server\'s own for the rest', () => {
    expect(autoReasonText('stale', 'x')).toMatch(/reload/);
    expect(autoReasonText('admin', 'x')).toMatch(/mdhouse admin/);
    expect(autoReasonText('not-decided', 'Who may approve is not decided yet')).toBe('Who may approve is not decided yet');
    expect(autoReasonText(undefined, 'fallback')).toBe('fallback');
  });
  test('the page address', () => expect(automationUrl('my repo')).toBe('/automation?root=my%20repo'));
});

/** A fake of the routes: the shapes and refusals, none of the server. */
let server: ReturnType<typeof Bun.serve>;
let base = '';
let approvedHash: string | null = null;
beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const body = req.method === 'POST' ? ((await req.json()) as Record<string, string>) : null;
      const json = (status: number, b: unknown) => Response.json(b, { status });
      if (url.pathname === '/api/automation') {
        if (url.searchParams.get('root') === 'nope') return json(404, { error: 'no such project', reason: 'no-root' });
        const state: AutomationState = { root: 'p', canApprove: true, registrations: [reg({ approval: approvedHash ? 'approved' : 'none' })], errors: [{ file: 'bad.json', error: 'unknown key "command"' }] };
        return json(200, state);
      }
      if (url.pathname === '/api/automation/approve') {
        if (body!.root === 'viewer') return json(403, { error: 'read-only', reason: 'viewer' });
        if (body!.hash !== 'a'.repeat(64)) return json(409, { error: 'the file changed', reason: 'stale' });
        if (body!.root === 'undecided') return json(409, { error: 'who may approve is not decided yet', reason: 'not-decided' });
        approvedHash = body!.hash!;
        return json(200, { registration: body!.registration, approval: 'approved', hash: approvedHash });
      }
      if (url.pathname === '/api/automation/revoke') {
        approvedHash = null;
        return json(200, { registration: body!.registration, approval: 'none' });
      }
      return json(404, { error: 'no' });
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(() => server.stop(true));

describe('against the fake routes', () => {
  const api = () => automationApi(base);
  test('state, approve, state again, revoke', async () => {
    const a = await api().state('p');
    expect(a.registrations[0]!.approval).toBe('none');
    expect(a.errors).toEqual([{ file: 'bad.json', error: 'unknown key "command"' }]);
    expect(await api().approve('p', 'weekly', 'a'.repeat(64))).toMatchObject({ approval: 'approved' });
    expect((await api().state('p')).registrations[0]!.approval).toBe('approved');
    expect(await api().revoke('p', 'weekly')).toEqual({ registration: 'weekly', approval: 'none' });
  });
  test('a stale hash, an undecided rule and an unknown project are refused with their reasons', async () => {
    expect((await api().approve('p', 'weekly', 'b'.repeat(64)).catch((e) => e)).reason).toBe('stale');
    const e = await api().approve('undecided', 'weekly', 'a'.repeat(64)).catch((x) => x);
    expect([e instanceof ApiError, e.reason, e.message]).toEqual([true, 'not-decided', 'who may approve is not decided yet']);
    expect((await api().state('nope').catch((x) => x)).reason).toBe('no-root');
  });
  test('a Viewer\'s refusal tells the app to re-read the mode and speaks as a Viewer', async () => {
    const seen: string[] = [];
    const on = () => seen.push(VIEWER_DENIED);
    addEventListener(VIEWER_DENIED, on);
    const e = await api().approve('viewer', 'weekly', 'a'.repeat(64)).catch((x) => x);
    removeEventListener(VIEWER_DENIED, on);
    expect([e.reason, e.message, seen]).toEqual(['viewer', VIEWER_MESSAGE, [VIEWER_DENIED]]);
  });
});
