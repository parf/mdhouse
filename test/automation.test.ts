import { describe, expect, test } from 'bun:test';
import {
  AUTO_DAILY_CAP, AUTO_FAILURES_OFF, AUTO_MIN_INTERVAL_MS, Automation, RunIndex, contentHash, lateMs, memoryStore, notApproved, parseDuration, parseRegistration, readStamp, validCron,
  type Approval, type AutoDeps, type LoadedRegistration, type Registration,
} from '../src/lib/automation';
import type { FlowError, FlowStarted, FlowStartRequest } from '../src/lib/flow-host';

const REG: Registration = { id: 'weekly-review', flow: 'recent-commits-review', range: { kind: 'since-last-run' }, when: { cron: '30 8 * * 1-5' }, maxLateMs: 3_600_000, overlap: 'skip' };
const text = (o: Record<string, unknown> = {}) => JSON.stringify({ id: 'weekly-review', flow: 'recent-commits-review', range: 'since-last-run', when: { cron: '30 8 * * 1-5' }, ...o });

describe('the registration file', () => {
  test('a valid one, with the defaults', () => {
    expect(parseRegistration(text(), 'weekly-review')).toEqual({ ok: true, value: REG });
    expect(parseRegistration(text({ maxLate: '30m', notify: '#claude/x@host', range: { kind: 'baseline', commit: 'ABC1234'.toLowerCase() }, when: { at: '2026-12-01T09:00:00Z' } }), 'weekly-review')).toEqual({
      ok: true, value: { ...REG, maxLateMs: 1_800_000, notify: '#claude/x@host', range: { kind: 'baseline', commit: 'abc1234' }, when: { at: '2026-12-01T09:00:00Z' } },
    });
  });
  test.each([
    ['not JSON', 'nope', /not JSON/],
    ['an array', '[]', /not an object/],
    ['an unknown key (no command, no path)', text({ command: 'rm -rf /' }), /unknown key "command"/],
    ['an id that is not the file name', text({ id: 'other' }), /not the file's name/],
    ['an id with a slash', text({ id: '../x' }), /id:/],
    ['a flow that is a path', text({ flow: '../../etc' }), /flow:/],
    ['a range that names a path', text({ range: { kind: 'baseline', commit: 'abcd', path: '/x' } }), /range:/],
    ['a baseline that is not hex', text({ range: { kind: 'baseline', commit: 'main' } }), /range:/],
    ['a cron of the wrong shape', text({ when: { cron: '* * *' } }), /when:/],
    ['a cron with a shell word', text({ when: { cron: '* * * * $(id)' } }), /when:/],
    ['both a cron and an instant', text({ when: { cron: '* * * * *', at: '2026-12-01T09:00:00Z' } }), /when:/],
    ['an instant that is not UTC', text({ when: { at: '2026-12-01T09:00:00+02:00' } }), /when:/],
    ['a maxLate over a week', text({ maxLate: '8d' }), /maxLate/],
    ['an overlap that is not built', text({ overlap: 'queue1' }), /only "skip"/],
    ['a notify that is not an agent', text({ notify: 'bob' }), /notify/],
  ])('refuses %s', (_name, body, why) => {
    const r = parseRegistration(body, 'weekly-review');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(why);
  });
  test('a file over the size limit', () => expect(parseRegistration(text({ notify: '#' + 'a'.repeat(20_000) }), 'weekly-review').ok).toBe(false));
  test('the hash is of the exact bytes: one more space is another registration', () => {
    expect(contentHash(text())).toBe(contentHash(text()));
    expect(contentHash(text())).not.toBe(contentHash(text() + ' '));
  });
  test('durations and crons', () => {
    expect([parseDuration('30s'), parseDuration('2h'), parseDuration('7d'), parseDuration('8d'), parseDuration('0s'), parseDuration('x')]).toEqual([30_000, 7_200_000, 604_800_000, null, null, null]);
    expect([validCron('*/15 * * * *'), validCron('0 9 * * 1-5'), validCron('0 0 9 * * 1,3'), validCron('* * *'), validCron('a b c d e')]).toEqual([true, true, true, false, false]);
  });
});

describe('the bus stamp', () => {
  const stamp = { id: 's1', by: '#claude/x@h', slot: '2026-11-13T08:30:00Z' };
  test('only the daemon-shaped one counts', () => {
    expect(readStamp(stamp)).toEqual(stamp);
    expect(readStamp({ ...stamp, late_by: '90s', missed: 2 })).toMatchObject({ late_by: '90s', missed: 2 });
    for (const bad of [null, 'x', [], {}, { ...stamp, id: '' }, { ...stamp, slot: 'tomorrow' }, { ...stamp, by: '' }, { ...stamp, late_by: {} }]) expect(readStamp(bad)).toBeNull();
  });
  test('late_by: seconds as a number, a duration, nothing — and an unreadable one is not zero', () => {
    expect([lateMs(undefined), lateMs(90), lateMs('90s'), lateMs('1.5m'), lateMs('2h'), lateMs('soon'), lateMs(-1)]).toEqual([0, 90_000, 90_000, 90_000, 7_200_000, null, null]);
  });
});

/** A handler on fakes: the host answers from `start`, time moves with `clock`. */
function rig(o: { approval?: Approval; reg?: Registration | null; start?: (req: FlowStartRequest) => Promise<FlowStarted | FlowError> } = {}) {
  const calls: FlowStartRequest[] = [];
  const audit: string[] = [];
  const told: string[] = [];
  const clock = { t: Date.parse('2026-11-13T08:30:05Z') };
  const index = new RunIndex(memoryStore(), () => clock.t);
  let n = 0;
  const loaded: LoadedRegistration | null = o.reg === null ? null : { rootId: 'p', reg: o.reg ?? REG, hash: 'h1' };
  const deps: AutoDeps = {
    registration: async (root, id) => (loaded && root === 'p' && id === loaded.reg.id ? { loaded } : null),
    approval: o.approval ?? (async () => true),
    start: async (req) => {
      calls.push(req);
      return o.start ? o.start(req) : { status: 'held', runPath: `Plans/flows/runs/x/run-${++n}.md`, url: `/p/run-${n}`, created: true };
    },
    index,
    audit: (level, line) => audit.push(`${level} ${line}`),
    notify: async (agent, t) => void told.push(`${agent}: ${t}`),
    now: () => clock.t,
  };
  const auto = new Automation(deps);
  const fire = async (over: { from?: string; schedule?: unknown; body?: unknown; slot?: string; id?: string } = {}) => {
    const reply = await auto.handle({
      from: over.from ?? '#bus',
      schedule: 'schedule' in over ? over.schedule : { id: over.id ?? 's1', by: '#claude/x@h', slot: over.slot ?? '2026-11-13T08:30:00Z' },
      body: typeof over.body === 'string' ? over.body : JSON.stringify(over.body ?? { v: 1, op: 'run', project: 'p', registration: 'weekly-review' }),
    });
    return JSON.parse(reply) as { ok: boolean; error?: { code: string; msg: string }; skipped?: string; status?: string; created?: boolean; runPath?: string };
  };
  return { auto, calls, audit, told, clock, index, fire };
}

describe('FAIL CLOSED: nothing runs until the owner has answered Q-R3-AUTO2', () => {
  test('the approval that exists refuses every firing and never reaches the flow host', async () => {
    const r = rig({ approval: notApproved });
    const reply = await r.fire();
    expect(reply).toMatchObject({ ok: false, error: { code: 'not-approved' } });
    expect(r.calls).toEqual([]);
    expect(r.audit.join('\n')).toMatch(/not approved/);
    expect((await r.index.history('p', 'weekly-review'))[0]).toMatchObject({ outcome: 'refused', why: 'not approved' });
    expect(await notApproved({ rootId: 'p', registration: 'a', hash: 'h', scheduleId: 's' })).toBe(false);
  });
  test('a healthy, early, uncapped firing is refused all the same', async () => {
    const r = rig({ approval: notApproved });
    for (let i = 0; i < 3; i++) {
      r.clock.t += 24 * 3_600_000;
      expect((await r.fire({ slot: `2026-11-${14 + i}T08:30:00Z` })).error?.code).toBe('not-approved');
    }
    expect(r.calls).toEqual([]);
  });
  test('the approval is asked with the file hash and the schedule id', async () => {
    const asked: unknown[] = [];
    const r = rig({ approval: async (a) => (asked.push(a), true) });
    await r.fire();
    expect(asked).toEqual([{ rootId: 'p', registration: 'weekly-review', hash: 'h1', scheduleId: 's1' }]);
  });
});

describe('provenance and the body', () => {
  test('only #bus with the daemon\'s stamp is a firing', async () => {
    const r = rig();
    for (const o of [{ from: '#claude/x@h' }, { schedule: undefined }, { schedule: { id: 's1' } }, { from: '#bus', schedule: 'trust me' }]) {
      expect((await r.fire(o)).error?.code).toBe('denied');
    }
    expect(r.calls).toEqual([]);
  });
  test('the body names a project and a registration, never a flow, a range, a path or a trigger', async () => {
    const r = rig();
    for (const extra of [{ flow: 'x' }, { range: 'since-last-run' }, { path: '/etc' }, { trigger: { kind: 'manual' } }, { requestId: 'a:b' }]) {
      expect((await r.fire({ body: { v: 1, op: 'run', project: 'p', registration: 'weekly-review', ...extra }, slot: `2026-11-13T0${Object.keys(extra).length}:00:00Z` })).error?.code).toBe('bad-request');
    }
    for (const body of ['nope', '[]', { v: 2, op: 'run' }, { v: 1, op: 'stop' }, { v: 1, op: 'run', project: 'p' }, { v: 1, op: 'run', project: 'p', registration: '../x' }]) {
      expect((await r.fire({ body, slot: '2026-11-13T09:00:00Z' })).error?.code).toBe('bad-request');
    }
    expect((await r.fire({ body: 'x'.repeat(5000), slot: '2026-11-13T10:00:00Z' })).error?.code).toBe('bad-request');
    expect(r.calls).toEqual([]);
  });
  test('an unknown project or registration is unregistered', async () => {
    const r = rig();
    expect((await r.fire({ body: { v: 1, op: 'run', project: 'q', registration: 'weekly-review' } })).error?.code).toBe('unregistered');
    expect((await r.fire({ body: { v: 1, op: 'run', project: 'p', registration: 'nope' }, slot: '2026-11-13T09:00:00Z' })).error?.code).toBe('unregistered');
    expect(r.calls).toEqual([]);
  });
});

describe('a firing that is approved (a test double: none exists yet)', () => {
  test('starts the registration\'s own flow and range, as a schedule trigger of this slot', async () => {
    const r = rig();
    const reply = await r.fire();
    expect(reply).toMatchObject({ ok: true, created: true, status: 'held' });
    expect(r.calls).toEqual([{ rootId: 'p', packageId: 'recent-commits-review', range: { kind: 'since-last-run' }, trigger: { kind: 'schedule', id: 's1', slot: '2026-11-13T08:30:00Z' } }]);
    expect((await r.index.history('p', 'weekly-review'))[0]).toMatchObject({ outcome: 'started', requestId: 's1:2026-11-13T08:30:00Z' });
  });
  test('a repeated slot answers what it answered and starts nothing; another body for it is a conflict', async () => {
    const r = rig();
    const a = await r.fire();
    expect(await r.fire()).toEqual(a);
    expect(r.calls).toHaveLength(1);
    expect((await r.fire({ body: { v: 1, op: 'run', project: 'p', registration: 'other' } })).error?.code).toBe('conflict');
  });
  test('a slot found already run by the host (a catch-up) is not counted again', async () => {
    const r = rig({ start: async () => ({ status: 'complete', runPath: 'Plans/flows/runs/x/old.md', url: '/p/old', created: false }) });
    expect(await r.fire()).toMatchObject({ ok: true, created: false, status: 'complete' });
    expect((await r.index.state('p', 'weekly-review')).started).toBe(0);
  });
  test('late beyond maxLate, or unreadable, is skipped; within it runs', async () => {
    const r = rig();
    expect((await r.fire({ schedule: { id: 's1', by: 'b', slot: '2026-11-13T08:30:00Z', late_by: '2h' } })).skipped).toBe('late');
    expect((await r.fire({ schedule: { id: 's2', by: 'b', slot: '2026-11-13T08:31:00Z', late_by: 'soon' } })).skipped).toBe('late');
    expect((await r.fire({ schedule: { id: 's3', by: 'b', slot: '2026-11-13T08:32:00Z', late_by: '5m' } })).ok).toBe(true);
    expect(r.calls).toHaveLength(1);
  });
  test('at most one start per five minutes, and ten per UTC day', async () => {
    const r = rig();
    expect((await r.fire({ slot: '2026-11-13T08:30:00Z' })).created).toBe(true);
    r.clock.t += AUTO_MIN_INTERVAL_MS - 1000;
    expect((await r.fire({ slot: '2026-11-13T08:31:00Z', id: 's2' })).skipped).toBe('interval');
    for (let i = 1; i < AUTO_DAILY_CAP; i++) {
      r.clock.t += AUTO_MIN_INTERVAL_MS;
      expect((await r.fire({ slot: `2026-11-13T09:${String(i).padStart(2, '0')}:00Z`, id: `d${i}` })).created).toBe(true);
    }
    r.clock.t += AUTO_MIN_INTERVAL_MS;
    expect((await r.fire({ slot: '2026-11-13T10:30:00Z', id: 'over' })).skipped).toBe('daily cap');
    r.clock.t = Date.parse('2026-11-14T08:30:05Z');
    expect((await r.fire({ slot: '2026-11-14T08:30:00Z', id: 'next' })).created).toBe(true);
  });
  test('an open run of the registration is an overlap: skipped, recorded, no failure counted', async () => {
    const r = rig({ start: async () => ({ error: 'open', reason: 'open-run' }) });
    const reply = await r.fire();
    expect(reply.skipped).toBe('overlap');
    expect((await r.index.state('p', 'weekly-review')).failures).toBe(0);
    expect((await r.index.history('p', 'weekly-review'))[0]).toMatchObject({ outcome: 'skipped', why: 'overlap' });
  });
  test('a second firing while the first is still starting is an overlap too', async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    const r = rig({ start: async () => (await gate, { status: 'held', runPath: 'p.md', url: '/p', created: true }) });
    const first = r.fire({ slot: '2026-11-13T08:30:00Z' });
    await Bun.sleep(5);
    expect((await r.fire({ slot: '2026-11-13T08:30:30Z', id: 's2' })).skipped).toBe('overlap');
    release();
    expect((await first).created).toBe(true);
  });
  test('three failures in a row stop it; the stop is an alert; later firings are refused as disabled', async () => {
    const r = rig({ start: async () => ({ error: 'git could not list the range', reason: 'no-git' }) });
    for (let i = 0; i < AUTO_FAILURES_OFF; i++) {
      r.clock.t += AUTO_MIN_INTERVAL_MS;
      expect((await r.fire({ slot: `2026-11-13T09:0${i}:00Z`, id: `f${i}` })).error?.code).toBe('failed');
    }
    expect(r.audit.some((l) => l.startsWith('alert') && l.includes('stopped after 3 failures'))).toBe(true);
    r.clock.t += AUTO_MIN_INTERVAL_MS;
    expect((await r.fire({ slot: '2026-11-13T10:00:00Z', id: 'after' })).error?.code).toBe('disabled');
    expect(r.calls).toHaveLength(AUTO_FAILURES_OFF);
  });
  test('a success between failures clears the count; run outcomes count too', async () => {
    const r = rig();
    await r.index.outcome('p', 'weekly-review', 'failed', {});
    await r.index.outcome('p', 'weekly-review', 'failed', {});
    await r.index.outcome('p', 'weekly-review', 'ok', {});
    expect((await r.index.state('p', 'weekly-review')).failures).toBe(0);
    for (let i = 0; i < 3; i++) await r.index.outcome('p', 'weekly-review', 'failed', {});
    expect((await r.index.state('p', 'weekly-review')).disabled).toBe(true);
  });
  test('the notify agent hears of a start, best effort', async () => {
    const r = rig({ reg: { ...REG, notify: '#claude/x@host' } });
    await r.fire();
    expect(r.told).toEqual(['#claude/x@host: weekly-review: run started — Plans/flows/runs/x/run-1.md']);
  });
  test('the history keeps the newest 200', async () => {
    const r = rig();
    for (let i = 0; i < 205; i++) {
      r.clock.t += 1000;
      await r.index.record('p', 'weekly-review', { requestId: `r${i}`, outcome: 'skipped', why: 'late' });
    }
    const h = await r.index.history('p', 'weekly-review', 500);
    expect(h).toHaveLength(200);
    expect(h[0]!.requestId).toBe('r204');
  });
});
