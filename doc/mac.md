# mdhouse on macOS

Checked on macOS 26 (Apple silicon), bun 1.4 from Homebrew.

## Install

```sh
brew install bun ripgrep     # ripgrep is optional — content search without it is slower
bun install -g mdhouse
```

`~/.bun/bin` is not on `PATH` with a Homebrew bun — add it once:

```sh
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zshrc && exec zsh
mdhouse ~/notes
```

## Possible issues

| You see | Do |
|---|---|
| `zsh: command not found: mdhouse` | `~/.bun/bin` on `PATH` — above |
| `zsh: command not found: bun` | `brew install bun`, or `curl -fsSL https://bun.sh/install \| bash` |
| `mdhouse: no systemctl here — the service needs systemd (Linux)` | no `mdhouse service` on macOS — see Limitations |
| `mdhouse: cannot listen on 127.0.0.2 — not an address of this machine` | macOS has only `127.0.0.1` on loopback: `--host 127.0.0.1`, or `sudo ifconfig lo0 alias 127.0.0.2` |
| `no ripgrep` beside "In contents" | `brew install ripgrep` |
| a folder shows as `/private/tmp/…`, `/private/var/…` | `/tmp` and `/var` are symlinks to `/private/…`; mdhouse keeps the real path — same folder |
| where is the log | `log stream --predicate 'process == "logger"'` |

## Limitations

- 🚫 No `mdhouse service` — it is systemd only; start `mdhouse` from your shell profile or a login item
  instead (it runs in the background, and a second `mdhouse <dir>` adds to the running one)
- Agent Bus: no default socket on macOS — give one: `mdhouse --agent-bus <x.sock>` or
  `--agent-bus http://host:6767` — [Agent Bus](agent-bus.md)
- ✎ `edit:` links need an app that handles `edit:` URLs
- Paths are case-insensitive on a default APFS volume — `Notes.md` and `notes.md` are one file
