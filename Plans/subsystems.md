# Subsystems

Kept by `/find-issues`: paths → subsystem, first match wins; ⚠️ = scary (two reviewers).

| Path prefix | Subsystem | Check |
|---|---|---|
| `src/server.ts`, `src/lib/access.ts`, `src/lib/roots.ts`, `src/lib/filetypes.ts` | server ⚠️ | the write-route order, guards, error contract, path jail (CLAUDE.md "Server invariants") |
| `src/lib/render.ts`, `src/lib/qa.ts`, `src/lib/insert.ts` | render & Q&A ⚠️ | the source model, hashes, what a write touches in the user's file |
| `src/cli.ts`, `src/lib/service.ts`, `src/lib/control.ts`, `src/lib/loghint.ts`, `bin/` | cli & service ⚠️ | systemd, the control socket, hand-over, exit codes |
| `src/lib/prefs.ts`, `src/lib/ignore.ts` | prefs & config ⚠️ | prefs.json: atomic writes, several writers, never lost |
| `src/lib/git.ts`, `src/lib/gitpage.ts`, `src/lib/scan.ts`, `src/lib/store.ts`, `src/lib/search.ts`, `src/lib/watch.ts` | git & data | git as argv, caches invalidated by the watcher, scan limits |
| `src/ui/`, `src/app.tsx`, `src/index.html`, `src/styles/`, `src/types/` | ui | links, localStorage, live reload, the editors |
| `test/`, `bunfig.toml` | tests | they test what they claim; no live config |
| `package.json`, `tsconfig.json`, `CHANGELOG.md` | packaging | what ships, the Deploy checklist |
| `CLAUDE.md`, `AGENTS.md`, `.claude/`, `doc/`, `README.md`, `Plans/` | docs & skills | commands that do what they say; docs match the code |
