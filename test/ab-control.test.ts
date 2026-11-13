import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Control, CTL_MAX_BODY, CTL_REPLAY_MS, parseControl, registryDocUrl, senderAllowed, type ControlSetting, type CtlClient, type CtlDeps } from '../src/lib/ab-control';
import { Registry } from '../src/lib/roots';
import { Prefs } from '../src/lib/prefs';
import { openTarget } from '../src/ui/tab-presence';

const ME = '#claude/agent@host';

function tab(clientId: string, over: Partial<CtlClient> = {}): CtlClient {
  return { clientId, label: 'Chrome · a.md', busy: false, since: 1, lastSeen: 2, ...over };
}

function setup({ tabs: given, rule = [], ...over }: Partial<CtlDeps> & { tabs?: CtlClient[]; rule?: ControlSetting } = {}) {
  const moved: Array<[string, string]> = [];
  const log: string[] = [];
  let now = 1_000;
  const tabs = given ?? [tab('tabA'), tab('tabB')];
  const deps: CtlDeps = {
    setting: () => rule,
    roots: () => [
      { rootId: 'notes', label: 'Notes', kind: 'project', writable: true },
      { rootId: 'docs', label: 'Docs', kind: 'project', writable: false },
    ],
    docUrl: async (rootId, path) => (path.endsWith('.md') && !path.includes('..') ? `/${rootId}/${path}` : null),
    clients: () => tabs,
    navigate: (id, url) => {
      if (!tabs.some((t) => t.clientId === id)) return false;
      moved.push([id, url]);
      return true;
    },
    team: () => false,
    audit: (level, line) => log.push(`${level} ${line}`),
    now: () => now,
    ...over,
  };
  const ctl = new Control(deps);
  const ask = async (body: unknown, from = ME) => JSON.parse(await ctl.handle(from, typeof body === 'string' ? body : JSON.stringify(body))) as Record<string, any>;
  return { ctl, ask, moved, log, tabs, tick: (ms: number) => (now += ms) };
}

const open = (over: Record<string, unknown> = {}) => ({ v: 1, op: 'open', requestId: 'r1', rootId: 'notes', path: 'a.md', clientId: 'tabA', ...over });

describe('sender rule', () => {
  test('empty list admits every sender the daemon let through; off admits none', () => {
    expect(senderAllowed([], ME)).toBe(true);
    expect(senderAllowed('off', ME)).toBe(false);
  });

  test('patterns match the whole name without #, any case; an invalid pattern refuses everyone', () => {
    expect(senderAllowed(['claude/.*'], ME)).toBe(true);
    expect(senderAllowed(['CLAUDE/AGENT@HOST'], ME)).toBe(true);
    expect(senderAllowed(['claude'], ME)).toBe(false);
    expect(senderAllowed(['other/.*'], ME)).toBe(false);
    expect(senderAllowed(['claude/.*', '('], ME)).toBe(false);
  });

  test('a denied sender gets denied on inventory and on open, and moves no tab', async () => {
    for (const rule of ['off', ['other/.*']] as ControlSetting[]) {
      const s = setup({ rule });
      expect((await s.ask({ v: 1, op: 'inventory', requestId: 'i1' })).error.code).toBe('denied');
      expect((await s.ask(open())).error.code).toBe('denied');
      expect(s.moved).toEqual([]);
      expect(s.log.filter((l) => l.startsWith('warning ctl denied')).length).toBe(2);
    }
  });

  test('the rule is read on every request', async () => {
    let rule: ControlSetting = [];
    const s = setup({ setting: () => rule });
    expect((await s.ask({ v: 1, op: 'inventory', requestId: 'a' })).ok).toBe(true);
    rule = 'off';
    expect((await s.ask({ v: 1, op: 'inventory', requestId: 'b' })).error.code).toBe('denied');
  });
});

describe('request shape', () => {
  test('bad bodies get a structured error, never a throw', async () => {
    const s = setup();
    expect((await s.ask('not json')).error.code).toBe('bad-request');
    expect((await s.ask('[1]')).error.code).toBe('bad-request');
    expect((await s.ask({ v: 1, op: 'inventory', requestId: 'big', pad: 'x'.repeat(CTL_MAX_BODY) })).error).toEqual({ code: 'bad-request', msg: `body over ${CTL_MAX_BODY} bytes` });
    expect((await s.ask({ v: 1, op: 'inventory' })).error.code).toBe('bad-request');
    expect((await s.ask({ v: 1, op: 'inventory', requestId: 'a b' })).error.code).toBe('bad-request');
    expect((await s.ask({ v: 2, op: 'inventory', requestId: 'a' })).error).toEqual({ code: 'version', msg: 'v must be 1' });
    expect((await s.ask({ v: 1, op: 'addRoot', requestId: 'a' })).error.code).toBe('unknown-op');
    for (const bad of [{ rootId: 'a/b' }, { rootId: 3 }, { path: '' }, { path: 'x\0.md' }, { clientId: '../x' }, { clientId: '' }])
      expect((await s.ask(open({ ...bad, requestId: `b${JSON.stringify(bad).length}` }))).error.code).toBe('bad-request');
    expect(s.moved).toEqual([]);
  });

  test('a throwing dependency is an internal error reply', async () => {
    const s = setup({
      roots: () => {
        throw new Error('boom');
      },
    });
    expect(await s.ask({ v: 1, op: 'inventory', requestId: 'a' })).toEqual({ v: 1, ok: false, error: { code: 'internal', msg: 'internal error' } });
  });
});

describe('inventory', () => {
  test('lists roots and tabs, and leaves a notice line', async () => {
    const s = setup();
    const r = await s.ask({ v: 1, op: 'inventory', requestId: 'i1' });
    expect(r.ok).toBe(true);
    expect(r.requestId).toBe('i1');
    expect(r.roots.map((x: { rootId: string }) => x.rootId)).toEqual(['notes', 'docs']);
    expect(r.clients.map((x: { clientId: string }) => x.clientId)).toEqual(['tabA', 'tabB']);
    expect(s.log).toEqual([`notice ctl inventory from=${ME} roots=2 clients=2 req=i1`]);
  });
});

describe('open', () => {
  test('moves only the named tab and returns the url', async () => {
    const s = setup();
    expect(await s.ask(open({ clientId: 'tabB' }))).toEqual({ v: 1, requestId: 'r1', ok: true, url: '/notes/a.md', opened: true });
    expect(s.moved).toEqual([['tabB', '/notes/a.md']]);
    expect(s.log).toEqual([`notice ctl open from=${ME} root=notes path=a.md client=tabB req=r1 opened=true`]);
  });

  test('a leading slash is the root-relative path', async () => {
    const s = setup();
    expect((await s.ask(open({ path: '/a.md' }))).url).toBe('/notes/a.md');
  });

  test('unknown or disconnected tab: url, opened false, nothing moves', async () => {
    const s = setup();
    expect(await s.ask(open({ clientId: 'nope' }))).toMatchObject({ ok: true, url: '/notes/a.md', opened: false, reason: 'gone' });
    const t = setup({ navigate: () => false });
    expect(await t.ask(open())).toMatchObject({ ok: true, opened: false, reason: 'gone' });
    expect(s.moved).toEqual([]);
  });

  test('a tab with unsaved editor text is not moved', async () => {
    const s = setup({ tabs: [tab('tabA', { busy: true })] });
    expect(await s.ask(open())).toMatchObject({ ok: true, opened: false, reason: 'busy' });
    expect(s.moved).toEqual([]);
  });

  test('with users configured no tab is moved yet', async () => {
    const s = setup({ team: () => true });
    expect(await s.ask(open())).toMatchObject({ ok: true, url: '/notes/a.md', opened: false, reason: 'team' });
    expect(s.moved).toEqual([]);
  });

  test('unknown root and unresolvable path are errors with an audit line', async () => {
    const s = setup();
    expect((await s.ask(open({ rootId: 'zzz' }))).error.code).toBe('no-root');
    expect((await s.ask(open({ requestId: 'r2', path: '../x.md' }))).error.code).toBe('not-found');
    expect((await s.ask(open({ requestId: 'r3', path: 'a.txt' }))).error.code).toBe('not-found');
    expect(s.moved).toEqual([]);
    expect(s.log.map((l) => l.split(' ').pop())).toEqual(['error=no-root', 'error=not-found', 'error=not-found']);
  });

  test('audit text carries no spaces or control characters from the sender', async () => {
    const s = setup();
    await s.ask(open({ path: 'a b\nc.md' }), '#x y');
    expect(s.log[0]).toBe('notice ctl open from=#x_y root=notes path=a_b_c.md client=tabA req=r1 opened=true');
  });
});

describe('idempotency', () => {
  test('a repeated requestId gets the same reply and moves no tab again', async () => {
    const s = setup();
    const first = await s.ask(open());
    expect(await s.ask(open())).toEqual(first);
    expect(s.moved.length).toBe(1);
  });

  test('the same requestId with other parameters is a conflict', async () => {
    const s = setup();
    await s.ask(open());
    expect((await s.ask(open({ clientId: 'tabB' }))).error.code).toBe('conflict');
    expect(s.moved).toEqual([['tabA', '/notes/a.md']]);
  });

  test('requestIds are per sender', async () => {
    const s = setup();
    await s.ask(open());
    await s.ask(open(), '#other@host');
    expect(s.moved.length).toBe(2);
  });

  test('a reply is kept for the replay window only', async () => {
    const s = setup();
    await s.ask(open());
    s.tick(CTL_REPLAY_MS + 1);
    await s.ask(open({ requestId: 'r2' }));
    await s.ask(open());
    expect(s.moved.length).toBe(3);
  });

  test('concurrent duplicates share one navigation', async () => {
    const s = setup();
    const [a, b] = await Promise.all([s.ask(open()), s.ask(open())]);
    expect(a).toEqual(b);
    expect(s.moved.length).toBe(1);
  });
});

describe('registryDocUrl — the path jail', () => {
  const dir = mkdtempSync(join(tmpdir(), 'abctl-'));
  const out = mkdtempSync(join(tmpdir(), 'abctl-out-'));
  mkdirSync(join(dir, 'sub'));
  mkdirSync(join(dir, '.git'));
  writeFileSync(join(dir, 'sub', 'a.md'), '# a');
  writeFileSync(join(dir, 'b.txt'), 'b');
  writeFileSync(join(dir, '.git', 'c.md'), 'c');
  writeFileSync(join(out, 'secret.md'), 's');
  symlinkSync(join(out, 'secret.md'), join(dir, 'link.md'));
  symlinkSync(out, join(dir, 'outdir'));
  mkdirSync(join(dir, 'folder.md'));

  test('a Markdown file inside the root is its page url', async () => {
    const registry = await Registry.create([dir, out]);
    const [root] = registry.list();
    const url = registryDocUrl(registry);
    expect(await url(root!.id, 'sub/a.md')).toBe(`/${root!.id}/sub/a.md`);
  });

  test('escapes, other roots, .git, folders and non-Markdown are null', async () => {
    const registry = await Registry.create([dir, out]);
    const [root, other] = registry.list();
    const url = registryDocUrl(registry);
    for (const p of ['../' + out.split('/').pop() + '/secret.md', 'link.md', 'outdir/secret.md', '.git/c.md', 'b.txt', 'folder.md', 'nope.md', '', 'sub/../../x.md'])
      expect(await url(root!.id, p)).toBeNull();
    expect(await url('nosuch', 'sub/a.md')).toBeNull();
    expect(await url(other!.id, 'secret.md')).toBe(`/${other!.id}/secret.md`);
  });
});

describe('stored rule', () => {
  test('absent — no narrowing; a string list kept; anything else is off', () => {
    expect(parseControl(undefined)).toEqual([]);
    expect(parseControl(['a', 'b'])).toEqual(['a', 'b']);
    for (const bad of ['off', 'on', null, 3, {}, ['a', 1], true]) expect(parseControl(bad)).toBe('off');
  });

  test('prefs keep it across a reload', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'abctl-prefs-'));
    const prefs = await Prefs.load(join(dir, 'prefs.json'));
    expect(prefs.agentBus.control).toEqual([]);
    await prefs.setAgentBus({ control: ['claude/.*'] });
    expect((await Prefs.load(join(dir, 'prefs.json'))).agentBus.control).toEqual(['claude/.*']);
    await prefs.setAgentBus({ control: 'off' });
    expect((await Prefs.load(join(dir, 'prefs.json'))).agentBus.control).toBe('off');
    writeFileSync(join(dir, 'prefs.json'), JSON.stringify({ version: 2, agentBus: { enabled: true, control: 'nope' } }));
    expect((await Prefs.load(join(dir, 'prefs.json'))).agentBus.control).toBe('off');
  });
});

describe('openTarget — what a page navigates to', () => {
  const O = 'http://127.0.0.1:7777';
  test('an in-app path is its pathname', () => {
    expect(openTarget('/notes/a.md', O)).toBe('/notes/a.md');
    expect(openTarget('/notes/a%20b.md', O)).toBe('/notes/a%20b.md');
  });
  test('anything else is null', () => {
    for (const u of ['//evil.example/x', 'http://evil.example/', 'javascript:alert(1)', 'notes/a.md', '/\\evil.example', '', 7, null, '/' + 'x'.repeat(3000)])
      expect(openTarget(u, O)).toBeNull();
  });
});

test('CLI: --ab-control saves patterns, off and reset; refuses a bad regex', () => {
  const cfg = mkdtempSync(join(tmpdir(), 'abctl-cli-'));
  const cli = (...args: string[]) =>
    Bun.spawnSync([process.execPath, join(import.meta.dir, '../src/cli.ts'), ...args], {
      env: { ...process.env, XDG_CONFIG_HOME: cfg, MDHOUSE_PORT: '', MDHOUSE_HOST: '', MDHOUSE_SERVICE: '', MDHOUSE_DAEMON: '' },
    });
  const stored = () => JSON.parse(readFileSync(join(cfg, 'mdhouse', 'prefs.json'), 'utf8')).agentBus.control;
  const set = cli('--ab-control', 'claude/.*,codex/w1');
  expect([set.exitCode, set.stdout.toString()]).toEqual([0, 'mdhouse  agent-bus control:  claude/.*, codex/w1  (the Agent Bus is off — mdhouse --agent-bus)\n']);
  expect(stored()).toEqual(['claude/.*', 'codex/w1']);
  expect(cli('--ab-control', 'off').exitCode).toBe(0);
  expect(stored()).toBe('off');
  const reset = cli('--ab-control', 'reset');
  expect(reset.stdout.toString()).toContain("every agent the daemon admits (the owner's)");
  expect(stored()).toEqual([]);
  const bad = cli('--ab-control', 'a(');
  expect([bad.exitCode, bad.stderr.toString()]).toEqual([2, 'mdhouse: --ab-control: not a regex: a(\n']);
  expect(stored()).toEqual([]);
  rmSync(cfg, { recursive: true, force: true });
});
