import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Every run gets its own config dir and a 619xx port; every daemon is stopped by `exit --all`
// with that same config dir, so nothing here can reach ~/.config/mdhouse or :7777.
const CLI = resolve(import.meta.dir, '../src/cli.ts');
const configs: string[] = [];

const scratch = () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'mdhouse-cli-')));
  const cfg = join(dir, 'cfg');
  configs.push(cfg);
  const folder = (name: string) => {
    mkdirSync(join(dir, name));
    writeFileSync(join(dir, name, 'a.md'), '# A\n');
    return join(dir, name);
  };
  const run = (args: string[], env: Record<string, string> = {}, stdin?: string) => {
    const p = Bun.spawnSync([process.execPath, CLI, ...args], {
      env: { ...process.env, XDG_CONFIG_HOME: cfg, MDHOUSE_PORT: '', MDHOUSE_HOST: '', MDHOUSE_SERVICE: '', MDHOUSE_DAEMON: '', ...env },
      stdin: stdin === undefined ? 'ignore' : Buffer.from(stdin),
    });
    return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
  };
  const prefs = () => JSON.parse(readFileSync(join(cfg, 'mdhouse/prefs.json'), 'utf8'));
  return { dir, cfg, folder, run, prefs };
};

afterAll(() => {
  for (const cfg of configs) {
    Bun.spawnSync([process.execPath, CLI, 'exit', '--all'], { env: { ...process.env, XDG_CONFIG_HOME: cfg } });
  }
});

describe('--rw and -p apply to the folders named only', () => {
  test('-p --port with no folder keeps each saved folder as it was saved (C1)', () => {
    const s = scratch();
    const a = s.folder('a');
    const b = s.folder('b');
    expect(s.run([a, '--rw', '-p', '--port', '61911']).code).toBe(0);
    s.run(['exit', '--port', '61911']);
    expect(s.run([b, '-p', '--port', '61911']).code).toBe(0);
    s.run(['exit', '--port', '61911']);
    expect(s.prefs().writable).toEqual([a]);

    expect(s.run(['-p', '--port', '61912']).out).toContain(`${a}  [RW]`);
    expect(s.prefs().writable).toEqual([a]);
    // Handed to the running one: the same.
    expect(s.run(['-p', '--rw', '--port', '61912']).code).toBe(0);
    expect(s.prefs().writable).toEqual([a]);
    s.run(['exit', '--port', '61912']);

    // The daemon itself: a forwarded --rw with no folder makes nothing writable.
    const out = s.run(['--rw', '--port', '61913']).out;
    expect(out).toContain(`${a}  [RW]`);
    expect(out).not.toContain(`${b}  [RW]`);
    s.run(['exit', '--port', '61913']);
  });
});
