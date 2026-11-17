# Subsystems

Kept by `/find-issues`: paths → subsystem, first match wins; ⚠️ = scary (two reviewers). A letter is never changed or reused.

| Letter | Path prefix | Subsystem | Check |
|---|---|---|---|
| A | `src/server.ts`, `src/lib/access.ts`, `src/lib/roots.ts`, `src/lib/filetypes.ts`, `src/lib/authz.ts`, `src/lib/admin-session.ts` | server ⚠️ | the write-route order, guards, error contract, path jail (CLAUDE.md "Server invariants") |
| B | `src/lib/render.ts`, `src/lib/qa.ts`, `src/lib/insert.ts` | render & Q&A ⚠️ | the source model, hashes, what a write touches in the user's file |
| C | `src/cli.ts`, `src/lib/service.ts`, `src/lib/control.ts`, `src/lib/loghint.ts`, `bin/` | cli & service ⚠️ | systemd, the control socket, hand-over, exit codes |
| D | `src/lib/prefs.ts`, `src/lib/ignore.ts` | prefs & config ⚠️ | prefs.json: atomic writes, several writers, never lost |
| E | `src/lib/git.ts`, `src/lib/gitpage.ts`, `src/lib/scan.ts`, `src/lib/store.ts`, `src/lib/search.ts`, `src/lib/watch.ts` | git & data | git as argv, caches invalidated by the watcher, scan limits |
| F | `src/ui/`, `src/app.tsx`, `src/index.html`, `src/styles/`, `src/types/` | ui | links, localStorage, live reload, the editors |
| G | `test/`, `bunfig.toml`, `scripts/` | tests | they test what they claim; no live config |
| H | `package.json`, `tsconfig.json`, `CHANGELOG.md` | packaging | what ships, the Deploy checklist |
| I | `CLAUDE.md`, `AGENTS.md`, `.claude/`, `agents/`, `doc/`, `README.md`, `install.md`, `Plans/` | docs & skills | commands that do what they say; docs match the code |
| J | `src/lib/agent-bus.ts`, `src/lib/ab-control.ts`, `src/lib/rag-`, `src/rag-sync-cli.ts` | agent bus & RAG ⚠️ | never `AGENT_BUS_*`; own topic + tag per call; paid sends only on explicit apply |
