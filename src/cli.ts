#!/usr/bin/env bun
/**
 * `mdhouse [dir ...] [options]`
 */

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Registry } from './lib/roots';
import { Prefs } from './lib/prefs';
import { serve } from './server';

const USAGE = `mdhouse — browse every .md file under a directory

  mdhouse [dir ...] [options]

Options
  -p, --port <n>       port to listen on            (default 7777)
  -h, --host <addr>    address to bind              (default 127.0.0.1)
  -o, --open           open a browser on start
  -a, --all            include gitignored .md files
      --git-log <n>    commits scanned for git recents (default 200)
      --no-git         skip git entirely; filesystem recents only
      --rw             allow mdhouse to write to the trees it serves
      --help           show this

With no directory, the current one is used.
`;

interface Options {
  dirs: string[];
  port: number;
  host: string;
  open: boolean;
  all: boolean;
  gitLog: number;
  noGit: boolean;
  rw: boolean;
}

function parse(argv: string[]): Options {
  const o: Options = {
    dirs: [],
    port: Number(process.env.MDHOUSE_PORT ?? 7777),
    host: process.env.MDHOUSE_HOST ?? '127.0.0.1',
    open: false,
    all: false,
    gitLog: 200,
    noGit: false,
    rw: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = () => argv[++i] ?? '';

    switch (arg) {
      case '-p': case '--port': o.port = Number(next()); break;
      case '-h': case '--host': o.host = next(); break;
      case '-o': case '--open': o.open = true; break;
      case '-a': case '--all': o.all = true; break;
      case '--git-log': o.gitLog = Number(next()); break;
      case '--no-git': o.noGit = true; break;
      case '--rw': o.rw = true; break;
      case '--help': console.log(USAGE); process.exit(0);
      default:
        if (arg.startsWith('-')) {
          console.error(`mdhouse: unknown option ${arg}\n`);
          console.error(USAGE);
          process.exit(2);
        }
        o.dirs.push(arg);
    }
  }

  if (!o.dirs.length) o.dirs.push(process.env.MDHOUSE_ROOT ?? process.cwd());
  return o;
}

const opts = parse(process.argv.slice(2));

const dirs: string[] = [];
for (const dir of opts.dirs) {
  const abs = resolve(dir);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    console.error(`mdhouse: not a directory: ${dir}`);
    process.exit(1);
  }
  dirs.push(abs);
}

const registry = await Registry.create(dirs, opts.rw);
const prefs = await Prefs.load();

const { server, watcher } = serve({
  registry,
  prefs,
  port: opts.port,
  hostname: opts.host,
  noGit: opts.noGit,
  gitLogLimit: opts.gitLog,
  includeIgnoredDefault: opts.all,
});

const url = `http://${opts.host}:${server.port}`;
console.log(`mdhouse  ${url}`);
for (const root of registry.list()) {
  const badge = root.writable ? '  [RW]' : '';
  console.log(`  ${registry.single ? '' : root.id.padEnd(12)}${root.path}${badge}`);
}
if (!opts.rw) {
  console.log('\n  Read-only — mdhouse will not write to these trees. Pass --rw to allow it.');
}

if (opts.open) {
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  Bun.spawn([opener, url], { stdout: 'ignore', stderr: 'ignore' }).unref();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    watcher.close();
    server.stop(true);
    process.exit(0);
  });
}
