import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Users } from '../src/lib/access';
import { Prefs } from '../src/lib/prefs';
import { SECRET_MOVED } from '../src/lib/secrets';

const json = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as Record<string, any>;
const basic = (login: string, pw: string) => `Basic ${Buffer.from(`${login}:${pw}`).toString('base64')}`;

let dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function cfg() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'mdhouse-secrets-')));
  dirs.push(dir);
  await mkdir(join(dir, 'p'));
  return { dir, prefs: join(dir, 'prefs.json'), secrets: join(dir, 'secrets.json'), p: join(dir, 'p') };
}

/** A prefs.json as 2.3 writes it: every secret inside. */
async function legacy(c: Awaited<ReturnType<typeof cfg>>) {
  const hash = await Bun.password.hash('pw-ann');
  writeFileSync(
    c.prefs,
    JSON.stringify({
      version: 2,
      saved: [c.p],
      writable: [],
      readonly: [],
      autoRwRules: [],
      access: { allow: [], users: { ann: hash }, hostNames: [] },
      agentBus: { enabled: true, socket: 'http://bus:6767', token: 'tok-1', default: [], filter: [], control: [] },
      agentBusSpaces: { [c.p]: { endpoint: '/run/s.sock', credential: 'cred-1', default: ['#a@h'] } },
    }),
  );
  return hash;
}

describe('secrets.json beside prefs.json', () => {
  test('a 2.3 prefs.json reads as it was; the next write moves every secret out, 0600', async () => {
    const c = await cfg();
    const hash = await legacy(c);
    const prefs = await Prefs.load(c.prefs);
    expect([prefs.access.users.ann, prefs.agentBus.token, prefs.spaceAb(c.p)?.credential]).toEqual([hash, 'tok-1', 'cred-1']);
    expect(existsSync(c.secrets)).toBe(false);
    await prefs.setSavedName(c.p, 'P');
    const onDisk = json(c.prefs);
    expect([onDisk.access.users, onDisk.agentBus.token, onDisk.agentBusSpaces[c.p]]).toEqual([{ ann: SECRET_MOVED }, '', { endpoint: '/run/s.sock', default: ['#a@h'] }]);
    expect(json(c.secrets)).toEqual({ version: 1, users: { ann: hash }, agentBus: { endpoint: 'http://bus:6767', token: 'tok-1' }, spaces: { [c.p]: { endpoint: '/run/s.sock', credential: 'cred-1' } } });
    expect(statSync(c.secrets).mode & 0o777).toBe(0o600);
    const again = await Prefs.load(c.prefs);
    expect([again.access.users.ann, again.agentBus.token, again.spaceAb(c.p)?.credential]).toEqual([hash, 'tok-1', 'cred-1']);
    expect(await new Users().check(basic('ann', 'pw-ann'), again.access.users)).toBe(true);
  });

  test('an older mdhouse reading the new prefs.json still asks for a login and admits nobody', async () => {
    const c = await cfg();
    await legacy(c);
    await (await Prefs.load(c.prefs)).setSavedName(c.p, 'P');
    // What 2.3 reads: the users as prefs.json holds them, no token, no credential.
    const old = json(c.prefs);
    expect(Object.keys(old.access.users)).toEqual(['ann']);
    expect(await new Users().check(basic('ann', 'pw-ann'), old.access.users)).toBe(false);
    expect(await new Users().check(basic('ann', SECRET_MOVED), old.access.users)).toBe(false);
    expect([old.agentBus.token, old.agentBusSpaces[c.p].credential]).toEqual(['', undefined]);
  });

  test('a real value in prefs.json (an older mdhouse after a downgrade) wins and moves; a dropped login stays dropped', async () => {
    const c = await cfg();
    await legacy(c);
    await (await Prefs.load(c.prefs)).setUser('bob', await Bun.password.hash('pw-bob'));
    const newer = await Bun.password.hash('pw-ann-2');
    const f = json(c.prefs);
    f.access.users = { ann: newer }; // 2.3 changed ann's password and removed bob
    writeFileSync(c.prefs, JSON.stringify(f));
    const prefs = await Prefs.load(c.prefs);
    expect(Object.keys(prefs.access.users)).toEqual(['ann']);
    expect(await new Users().check(basic('ann', 'pw-ann-2'), prefs.access.users)).toBe(true);
    await prefs.setSavedName(c.p, 'P');
    expect(json(c.secrets).users).toEqual({ ann: newer });
    expect(json(c.prefs).access.users).toEqual({ ann: SECRET_MOVED });
  });

  test('the token and a credential apply only to the endpoint they were saved with', async () => {
    const c = await cfg();
    await legacy(c);
    const prefs = await Prefs.load(c.prefs);
    await prefs.setSavedName(c.p, 'P');
    const f = json(c.prefs);
    f.agentBus.socket = 'http://other:6767';
    f.agentBusSpaces[c.p].endpoint = '/run/other.sock';
    writeFileSync(c.prefs, JSON.stringify(f));
    prefs.refresh();
    expect([prefs.agentBus.token, prefs.spaceAb(c.p)?.credential]).toEqual(['', undefined]);
  });

  test('removing a user removes its hash; no secrets → no secrets.json made', async () => {
    const c = await cfg();
    const prefs = await Prefs.load(c.prefs);
    await prefs.addSaved(c.p);
    expect(existsSync(c.secrets)).toBe(false);
    await prefs.setUser('ann', await Bun.password.hash('x'));
    expect(Object.keys(json(c.secrets).users)).toEqual(['ann']);
    await prefs.removeUser('ann');
    expect([json(c.secrets).users, json(c.prefs).access.users]).toEqual([undefined, {}]);
  });

  test('a missing secrets.json under a moved hash: the login never verifies', async () => {
    const c = await cfg();
    await legacy(c);
    await (await Prefs.load(c.prefs)).setSavedName(c.p, 'P');
    await rm(c.secrets);
    const prefs = await Prefs.load(c.prefs);
    expect([prefs.access.users.ann, prefs.agentBus.token]).toEqual([SECRET_MOVED, '']);
    expect(await new Users().check(basic('ann', 'pw-ann'), prefs.access.users)).toBe(false);
  });

  test.each([
    ['not JSON', '{'],
    ['newer', JSON.stringify({ version: 2, users: { ann: 'x' } })],
  ])('a secrets.json that is %s blocks the pair: a Viewer, nothing written, no login', async (_what, text) => {
    const c = await cfg();
    await legacy(c);
    await (await Prefs.load(c.prefs)).setSavedName(c.p, 'P');
    writeFileSync(c.secrets, text);
    const before = readFileSync(c.prefs, 'utf8');
    const prefs = await Prefs.load(c.prefs);
    expect([prefs.mode(), prefs.accessBlocked()]).toEqual(['viewer', expect.stringContaining('secrets.json')]);
    expect(await new Users().check(basic('ann', 'pw-ann'), prefs.access.users)).toBe(false);
    expect(prefs.agentBus.token).toBe('');
    await expect(prefs.setSavedName(c.p, 'Q')).rejects.toThrow('secrets.json');
    expect([readFileSync(c.prefs, 'utf8'), readFileSync(c.secrets, 'utf8')]).toEqual([before, text]);
  });

  test('refresh takes in a secrets.json changed by another process', async () => {
    const c = await cfg();
    await legacy(c);
    const a = await Prefs.load(c.prefs);
    await a.setSavedName(c.p, 'P');
    expect(a.agentBus.token).toBe('tok-1');
    // Only secrets.json changes (a hand edit, or a token provisioned by another process).
    const sec = json(c.secrets);
    sec.agentBus.token = 'tok-2';
    writeFileSync(c.secrets, JSON.stringify(sec));
    a.refresh();
    expect(a.agentBus.token).toBe('tok-2');
  });

  test('a symlinked prefs.json keeps its secrets beside the target', async () => {
    const c = await cfg();
    await mkdir(join(c.dir, 'real'));
    const target = join(c.dir, 'real/prefs.json');
    writeFileSync(target, '{}\n');
    symlinkSync(target, join(c.dir, 'link.json'));
    const prefs = await Prefs.load(join(c.dir, 'link.json'));
    await prefs.addSaved(c.p);
    await prefs.setUser('ann', 'h');
    expect([existsSync(join(c.dir, 'real/secrets.json')), existsSync(c.secrets)]).toEqual([true, false]);
  });
});
