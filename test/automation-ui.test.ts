import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ApiError } from '../src/ui/api';
import { automationApi } from '../src/ui/automation-api';
import {
  APPROVAL_WORDS, actionFailure, automationUrl, latest, needsReapprove, onAutomation, rangeWords, REAPPROVE_WORDS, revokeNote, scheduleLine, autoReasonText, canApproveReg, canRevokeReg, cronWords, runLine, shortHash, whenWords, willRun,
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
  test('the range as the server writes it, and as a bare word', () => {
    expect(rangeWords({ kind: 'since-last-run' })).toBe('since the last run');
    expect(rangeWords('since-last-run')).toBe('since the last run');
    expect(rangeWords({ kind: 'baseline', commit: 'abc1234' })).toBe('from commit abc1234');
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
    expect(APPROVAL_WORDS.unknown).toMatch(/cannot be reached/);
    expect(scheduleLine(reg())).toBe('');
    expect(scheduleLine(reg({ schedule: { id: 's1', enabled: true, next: '2026-11-14T08:30:00Z' } }))).toBe('bus schedule s1 — next 2026-11-14 08:30 UTC');
    expect(scheduleLine(reg({ schedule: { id: 's1', enabled: false } }))).toBe('bus schedule s1 — disabled on the bus');
    expect(shortHash('a'.repeat(64))).toBe('a'.repeat(12));
  });
  test('approve and revoke are the administrator\'s, and only where they change something', () => {
    const admin = { canApprove: true } as AutomationState;
    const reader = { canApprove: false } as AutomationState;
    const timer = { id: 's1', enabled: true };
    expect([canApproveReg(admin, reg({ approval: 'none' })), canApproveReg(admin, reg({ approval: 'changed' })), canApproveReg(admin, reg({ approval: 'approved', schedule: timer })), canApproveReg(admin, reg({ approval: 'unknown' }))]).toEqual([true, true, false, false]);
    // approved but the bus has no timer: it will not fire, so approving again is offered
    expect(canApproveReg(admin, reg({ approval: 'approved', schedule: null }))).toBe(true);
    expect([canRevokeReg(admin, reg({ approval: 'none' })), canRevokeReg(admin, reg({ approval: 'changed' })), canRevokeReg(admin, reg({ approval: 'approved', schedule: { id: 's1', enabled: true } })), canRevokeReg(admin, reg({ approval: 'unknown' }))]).toEqual([false, true, true, false]);
    for (const a of ['none', 'changed', 'approved', 'unknown'] as const) expect([canApproveReg(reader, reg({ approval: a, schedule: null })), canRevokeReg(reader, reg({ approval: a }))]).toEqual([false, false]);
  });
  test('refusals: the page\'s words for stale and admin, the server\'s own for the rest', () => {
    expect(autoReasonText('stale', 'x')).toMatch(/changed while you were reviewing/);
    expect(autoReasonText('admin', 'x')).toMatch(/mdhouse admin/);
    expect(autoReasonText('exposed', 'x')).toMatch(/open to the network/);
    expect(autoReasonText(undefined, 'the bus is off')).toBe('the bus is off');
    expect(autoReasonText(undefined, 'fallback')).toBe('fallback');
  });
  test('a stale approve drops the review and keeps saying the file changed', () => {
    const f = actionFailure('stale', 'the file changed');
    expect(f.reset).toBe(true);
    expect(f.text).toMatch(/file changed while you were reviewing.*review it, then approve/);
    expect(actionFailure('invalid', 'not a registration')).toEqual({ text: 'not a registration', reset: false });
    expect(actionFailure(undefined, 'the agent bus is off')).toEqual({ text: 'the agent bus is off', reset: false });
  });
  test('approved without a timer is its own state; a revoke that left a timer says so', () => {
    expect(needsReapprove(reg({ approval: 'approved', schedule: null }))).toBe(true);
    expect(needsReapprove(reg({ approval: 'approved' }))).toBe(true);
    expect(needsReapprove(reg({ approval: 'approved', schedule: { id: 's', enabled: true } }))).toBe(false);
    expect(needsReapprove(reg({ approval: 'none' }))).toBe(false);
    expect(REAPPROVE_WORDS).toMatch(/approve again/);
    expect(revokeNote({})).toBeNull();
    expect(revokeNote({ scheduleError: 'the bus refused' })).toBe('Revoked here, but the bus timer could not be removed: the bus refused');
  });
  test('the latest request wins: a project switch or a newer load makes an older answer stale', () => {
    const s = latest();
    const a = s.next(); // project A's load
    expect(s.current(a)).toBe(true);
    const b = s.next(); // switched to project B
    expect([s.current(a), s.current(b)]).toEqual([false, true]);
    const again = s.next(); // a reload of B supersedes B's first
    expect([s.current(b), s.current(again)]).toEqual([false, true]);
  });
  test('an exposed or bus-less instance offers nothing: canApprove false, whatever the registration says', () => {
    const closed = { canApprove: false } as AutomationState;
    for (const approval of ['none', 'changed', 'approved', 'unknown'] as const) {
      expect(canApproveReg(closed, reg({ approval, schedule: null }))).toBe(false);
      expect(canRevokeReg(closed, reg({ approval }))).toBe(false);
    }
  });
  test('the page is a flag on the project\'s address', () => {
    expect(automationUrl('repo')).toBe('/repo/?automation');
    expect([onAutomation('?automation'), onAutomation('?git=changes'), onAutomation(''), onAutomation('?x=1&automation')]).toEqual([true, false, false, true]);
  });
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
        if (body!.root === 'undecided') return json(409, { error: 'the agent bus is off' });
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
  test('an error body is read only when the answer is not ok; an ok answer without a body is an error', async () => {
    const e = await automationApi(base).state('nope').catch((x) => x);
    expect([e instanceof ApiError, e.status, e.reason]).toEqual([true, 404, 'no-root']);
  });
  test('a stale hash, a bus that is off and an unknown project are refused with their reasons', async () => {
    expect((await api().approve('p', 'weekly', 'b'.repeat(64)).catch((e) => e)).reason).toBe('stale');
    const e = await api().approve('undecided', 'weekly', 'a'.repeat(64)).catch((x) => x);
    expect([e instanceof ApiError, e.reason, e.message]).toEqual([true, undefined, 'the agent bus is off']);
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
