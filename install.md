# Install mdhouse — runbook for an AI

From a clean account to one writable project workspace. Linux; macOS skips step 4.

1. Bun ≥ 1.4 (`bun --version`); missing → `curl -fsSL https://bun.sh/install | bash`
2. `npm i -g mdhouse`; check: `mdhouse --help`
3. Workspace and a first project:
   ```sh
   mkdir -p ~/mdhouse/<project>
   printf '# <project>\n\n- [ ] first task\n' > ~/mdhouse/<project>/README.md
   mdhouse ~/mdhouse -p --rw      # saved, writable; prints http://127.0.0.1:7777 and [RW] [saved]
   ```
4. Start at login (systemd --user): `mdhouse service install` — it replaces the background copy;
   `mdhouse service status` · `mdhouse service uninstall`; at boot: `loginctl enable-linger $USER`
5. Open http://127.0.0.1:7777/mdhouse/<project>/README.md — tick the task; the file now has `- [x]`
6. Optional — Agent Bus: `mdhouse --agent-bus on` (saved) — [doc/agent-bus.md](doc/agent-bus.md)

- Port taken → add `--port <n>` to step 3 (saved) and use it in the URL
- Stop: `mdhouse exit` (a service: `systemctl --user stop mdhouse.service`)
- Other machines: [doc/access.md](doc/access.md)
