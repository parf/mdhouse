/**
 * `mdhouse service install | uninstall | status` — mdhouse as a systemd user service.
 *
 * The unit runs `mdhouse --fg`, which serves the saved directories (`mdhouse <dir> -p`). With
 * nothing saved it would fall back to the current directory, which under systemd is $HOME —
 * so `install` refuses until something is saved, and the service itself exits cleanly if the
 * list has been emptied since (MDHOUSE_SERVICE tells it where it is running).
 *
 * Its output goes to the journal: `journalctl --user -u mdhouse -f`. `mdhouse exit` does not stop
 * it — a stop with status 0 is one `Restart=on-failure` leaves alone, and the next `mdhouse <dir>`
 * would start a copy outside systemd — it names the `systemctl` command instead.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { Prefs } from './prefs';
import { askExit, askPing } from './control';

const DEFAULT_PORT = 7777;

/**
 * `mdhouse.service` normally: it runs a plain `mdhouse --fg`, which reads its port and host from
 * the config exactly as a start by hand does. `mdhouse-8080.service` only when `--port` was given
 * to `service` itself — a second, pinned instance beside the usual one.
 */
export function unitName(port: number, explicit = false): string {
  return explicit && port !== DEFAULT_PORT ? `mdhouse-${port}.service` : 'mdhouse.service';
}

/** The systemd unit this process runs in, when a unit started it; from its cgroup on Linux. */
export function ownUnit(): string | undefined {
  if (process.env.MDHOUSE_SERVICE !== '1') return undefined;
  try {
    return /\/([^/\n]+\.service)$/m.exec(readFileSync('/proc/self/cgroup', 'utf8'))?.[1] ?? 'mdhouse.service';
  } catch {
    return 'mdhouse.service';
  }
}

/** Where systemd looks for a user's own units. */
export const UNIT_DIR = `${homedir()}/.config/systemd/user`;

export interface UnitSpec {
  /** The bun binary. */
  bun: string;
  /** bin/mdhouse. */
  cli: string;
  /** Pinned into the unit only for an explicit `service --port`; otherwise the config decides. */
  port?: number;
  /** PATH to run with: systemd's own is minimal, and mdhouse needs git and rg on it. */
  path: string;
  /** Carried over when set, so the service reads the same prefs as the shell that installed it. */
  xdgConfigHome?: string;
}

export function unitText(u: UnitSpec): string {
  // systemd's own syntax, not a shell's: `%` starts a specifier everywhere (`%%` is a literal),
  // `$` expands a variable in ExecStart (`$$` is a literal), and a value with whitespace or
  // quotes goes in double quotes with `\` and `"` escaped.
  const q = (s: string, exec = false) => {
    let v = s.replaceAll('%', '%%');
    if (exec) v = v.replaceAll('$', '$$$$');
    return /[\s"'\\]/.test(v) ? `"${v.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"` : v;
  };
  const exec = [u.bun, u.cli, '--fg', ...(u.port ? ['--port', String(u.port)] : [])];
  return [
    '[Unit]',
    'Description=mdhouse — browse every .md file under the saved directories',
    'After=network.target',
    '',
    '[Service]',
    `ExecStart=${exec.map((a) => q(a, true)).join(' ')}`,
    'WorkingDirectory=%h',
    `Environment=${q(`PATH=${u.path}`)}`,
    'Environment=MDHOUSE_SERVICE=1',
    ...(u.xdgConfigHome ? [`Environment=${q(`XDG_CONFIG_HOME=${u.xdgConfigHome}`)}`] : []),
    'Restart=on-failure',
    'RestartSec=5',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

const systemctl = (...args: string[]) =>
  Bun.spawnSync(['systemctl', '--user', ...args], { stdout: 'inherit', stderr: 'inherit' }).exitCode;

/** Run one `mdhouse service` action; returns the exit code. */
export async function runService(action: string, opts: { port: number; explicit?: boolean }): Promise<number> {
  const pinned = !!opts.explicit && opts.port !== DEFAULT_PORT;
  const name = unitName(opts.port, opts.explicit);
  const file = `${UNIT_DIR}/${name}`;

  if (!['install', 'uninstall', 'status'].includes(action)) {
    console.error('usage: mdhouse service install | uninstall | status  [--port <n>]');
    return 2;
  }
  if (!Bun.which('systemctl')) {
    console.error('mdhouse: no systemctl here — the service needs systemd (Linux).');
    console.error('         Run `mdhouse` from a login script instead.');
    return 1;
  }

  if (action === 'status') return systemctl('status', name, '--no-pager');

  if (action === 'uninstall') {
    if (!existsSync(file)) {
      console.log(`mdhouse  no ${name} installed — nothing to do`);
      return 0;
    }
    systemctl('disable', '--now', name);
    unlinkSync(file);
    systemctl('daemon-reload');
    console.log(`mdhouse  ${name} stopped and removed`);
    return 0;
  }

  // install
  const saved = (await Prefs.load()).savedDirs();
  if (!saved.length) {
    console.error('mdhouse: nothing saved for the service to serve.');
    console.error('         Save a directory first:  mdhouse <dir> -p');
    return 1;
  }

  mkdirSync(UNIT_DIR, { recursive: true });
  writeFileSync(
    file,
    unitText({
      bun: process.execPath,
      cli: resolve(import.meta.dir, '../../bin/mdhouse'),
      port: pinned ? opts.port : undefined,
      path: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
      xdgConfigHome: process.env.XDG_CONFIG_HOME,
    }),
  );
  console.log(`mdhouse  wrote ${file}`);

  // One daemon per port: a hand-started one would hold the port and the service would fail.
  const running = await askExit(opts.port);
  if (running) console.log(`mdhouse  stopped the mdhouse already on ${opts.port} (pid ${running.pid}) — the service replaces it`);

  if (systemctl('daemon-reload') !== 0 || systemctl('enable', '--now', name) !== 0) {
    console.error(`mdhouse: systemctl could not start ${name}.  journalctl --user -u ${name} -n 20`);
    return 1;
  }

  let live = null;
  for (let i = 0; i < 100 && !live; i++) {
    live = await askPing(opts.port);
    if (!live) await Bun.sleep(100);
  }
  if (!live) {
    console.error(`mdhouse: ${name} is enabled but not answering yet.  journalctl --user -u ${name} -n 20`);
    return 1;
  }

  console.log(`mdhouse  ${live.url}  — running as ${name}, started at every login`);
  for (const root of live.roots) console.log(`  ${root.path}${root.writable ? '  [RW]' : ''}`);
  console.log(`\n  Log:        journalctl --user -u ${name} -f`);
  console.log(`  At boot, before you log in:  loginctl enable-linger ${process.env.USER ?? '$USER'}`);
  console.log(`  Remove it:  mdhouse service uninstall${pinned ? ` --port ${opts.port}` : ''}`);
  if (!pinned) console.log(`  It listens where a plain \`mdhouse\` does; change that with:  mdhouse -p --port <n> --host <addr>`);
  return 0;
}
