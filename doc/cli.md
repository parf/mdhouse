# CLI reference

## Commands

```text
mdhouse [dir ...] [options]
```

Start mdhouse, or add the directories to the mdhouse already running on the selected port. With
no directory, serve the saved directories. A relative directory is resolved from the current
working directory.

```text
mdhouse exit [--port <n>]
mdhouse stop [--port <n>]
mdhouse exit --all
```

Stop the mdhouse on the selected port. `stop` is an alias for `exit`; `--all` stops every mdhouse
found in the config directory. A systemd service is not stopped through the control socket: the
command prints the exact `systemctl` command instead.

```text
mdhouse service install [--port <n>]
mdhouse service uninstall [--port <n>]
mdhouse service status [--port <n>]
```

Install, remove or inspect the systemd service for the selected port. The action and `--port` may
be written in either order.

```text
mdhouse user-add <login>
mdhouse user-rm <login>
mdhouse users
```

Add or remove a login, or print the users, allowed networks and allowed Host names. `user-add`
asks for the password; on non-interactive stdin it reads the first line.

## Options

| Option | Meaning |
| --- | --- |
| `-p`, `--perm` | Save the named directories and any explicit `--port` / `--host` for later starts. |
| `--rw` | The named directories may be written; with `-p`, save them as writable. |
| `--rm` | Forget the named directories and stop serving them. With no directory, use the current directory. |
| `--host <addr>` | Address to bind; default `127.0.0.1`. |
| `--port <n>` | Port to use; default `7777`. With `exit`, select which mdhouse to stop. |
| `--allow <cidr,...>` | Allow only these networks and this machine; saved. `reset` allows every address again. |
| `--host-name <name,...>` | Allow only these Host names; saved. `reset` allows localhost and IP addresses again. |
| `--auto-rw <path,...>` | Make served directories under these paths writable when the settings switch is on; saved. `reset` clears the paths. |
| `--agent-bus [on\|off\|<socket>\|<url>]` | Configure Agent Bus; saved. A remote HTTP(S) daemon asks for its token. |
| `-o`, `--open` | Open the page in a browser after starting. |
| `-a`, `--all` | Include gitignored Markdown while serving; with `exit`, stop every mdhouse. |
| `--fg`, `--foreground` | Stay in the foreground; Ctrl+C stops it. |
| `--git-log <n>` | Number of commits scanned for recents and the front page; default `200`. |
| `--no-git` | Skip git; use filesystem recents only. |
| `--help` | Show the short reference. |

Comma-separated options may be repeated. `reset` also accepts the old spelling `none`.

## Port, host and config

Port and host resolve in this order: command-line flag, `MDHOUSE_PORT` / `MDHOUSE_HOST`, saved
config, then `127.0.0.1:7777`. The config is
`$XDG_CONFIG_HOME/mdhouse/prefs.json`, or `~/.config/mdhouse/prefs.json` when
`XDG_CONFIG_HOME` is not set. Full example: [`prefs.json.dist`](prefs.json.dist).

`-p` is the only way a start saves directories, port or host. Access, auto-rw and Agent Bus
options save their own settings when used.
