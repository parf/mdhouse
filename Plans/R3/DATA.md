# mdhouse data — what is kept, where, by whom

Rule [№DATA-W1](workspaces/DECISIONS.md#DATA-W1): user data in `$HOME/.config/mdhouse` (each user's own); team data in `$PROJECT/.mdhouse/` under Git (common).
Open: [№Q-R3-DATA1](workspaces/QUESTIONS.md#Q-R3-DATA1). Inventory: #md/w1 (MW.14), 2026-11-12.

✅ kept now · ⚠️ kept now, moves (follow-up) · `[ ]` planned.

## User — `$XDG_CONFIG_HOME/mdhouse/prefs.json` (0600, dir 0700)

- ✅ saved projects, names, RW/RO (`writable` / `readonly`), auto-RW rules — CLI, Settings (admin); keyed by canonical path
- ✅ mode `workspace` / `viewer`, `viewerWritable` (version 3 while Viewer) — CLI, Settings (admin)
- ✅ marks: favorite / muted / ignored per project — page ([№Q-R3-ADMIN1](workspaces/DECISIONS.md#Q-R3-ADMIN1))
- ✅ edit link + scheme, `me` — Settings
- ✅ Agent Bus: enabled (`true` / `false` / `auto`), socket, default agents, filter, `control` patterns, per-project spaces (endpoint, default) — CLI, Settings
- ⚠️ Agent Bus token, per-space credentials — secret, moves to `secrets.json` (step 1)

## User, secret — `secrets.json` 0600, keyring later

- ⚠️ Agent Bus token, space credentials — today in `prefs.json` (step 1)
- ⚠️ Basic users' password hashes (`access.users`) — today in `prefs.json` (step 1)

## Machine — config dir

- ✅ server port / host, allow list, host names — `prefs.json`, CLI only
- ✅ flow run seal key — `flow-seal.key` 0600, created at start, never in a project
- ✅ systemd unit — `~/.config/systemd/user/mdhouse[-<port>].service`
- ✅ the config dir is hidden from every route when it lies inside a served project (`35e799d`)

## Runtime — memory, socket, journal

- ⚠️ control socket `control-<port>.sock` — config dir today, moves to `$XDG_RUNTIME_DIR/mdhouse/` (step 2)
- ✅ admin sessions, proofs, local-administrator marks — memory
- ✅ Agent Bus send jobs, tab ids (`/ws` clientId) — memory
- ✅ logs — journald

## State — machine-local history, `$XDG_STATE_HOME/mdhouse/`

- [ ] automation approvals (content hash per registration) — [№Q-R3-AUTO2](workspaces/DECISIONS.md#Q-R3-AUTO2), MW.11 slice 2
- [ ] schedule state, run index (last / next, failures) — MW.11 slice 2
- [ ] user session history (`sessions.json`) — Team

## Browser — per origin

- ✅ author cookie `mdhouse_author_<port>`, admin cookie `mdhouse-admin-<port>`
- ✅ `localStorage mdhouse.*`: drafts `edit.<p>`, views, sidebar, history, filters, `ab.<p>` — drafts are content copies
- ✅ `sessionStorage mdhouse.client` — tab id + resume proof (MW.7)

## Bus — on `#mdhouse@<host>`

- ✅ RAG registry `rag/source/<sid>`, `rag/last/<sid>`, `rag/hist/<sid>/…` (KV) — `mdhouse-rag-sync`
- ✅ control lock `ctl` + `ctl.owner` nonce (KV) — MW.7
- ✅ agent log lines (notice / warning / alert) — not readable back
- [ ] bus schedules — the timer for automation, MW.11 slice 2

## Team — `$PROJECT`, Git

- ✅ documents, task ticks, answers, inserts
- ✅ `.mdhouseignore` — stays top-level
- ✅ flow run documents `Plans/flows/runs/<package>/…`, flow reports `Plans/flows/<package>.md` (`last-commit-id`) — MW.3.3
- [ ] automation registrations `.mdhouse/automation/<id>.json` — fire only after per-machine approval ([№Q-R3-AUTO2](workspaces/DECISIONS.md#Q-R3-AUTO2))
- [ ] project id `.mdhouse/project.json` — created on the first team write (step 4)
- [ ] other shared definitions (default agents, RAG source id) — your choice in [№Q-R3-DATA1](workspaces/QUESTIONS.md#Q-R3-DATA1)

Never in Git: RW/RO, secrets, access, machine state.

## Install / repo only

- ✅ reference `_mdhouse` — installed `doc/`, read-only
- ✅ `.scratch/` (dev, gitignored), `test/fixtures/` — not shipped

## Migration order — proposal by #md/w1

- [ ] 1 secrets out of `prefs.json` → `secrets.json` (version bump, read both for one release)
- [ ] 2 control socket → `$XDG_RUNTIME_DIR/mdhouse/` (the CLI tries new, then old)
- [ ] 3 `$XDG_STATE_HOME/mdhouse/` for new state only (nothing to move)
- [ ] 4 `.mdhouse/project.json` on the first team write; prefs stay keyed by path
- [ ] 5 `.mdhouse/automation/` with approvals (MW.11 slice 2)

Marks and `.mdhouseignore` do not move.
