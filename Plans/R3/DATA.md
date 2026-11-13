# mdhouse data — what is kept, where, by whom

Rule [№DATA-W1](workspaces/DECISIONS.md#DATA-W1): user data in `$HOME/.config/mdhouse` (each user's own); team data in `$PROJECT/.mdhouse/` under Git (common).
Open question: [№Q-R3-DATA1](workspaces/QUESTIONS.md#Q-R3-DATA1). Inventory: #md/w1 (MW.14), 2026-11-12.

Kinds: **user** · **user-secret** · **browser** · **bus** (on the Agent Bus) · **machine** · **runtime** (process/boot) · **state** (machine-local history) · **team** (Git).
Status: ✅ now · ⚠️ now, location to change · ❓ planned.

## User — `$XDG_CONFIG_HOME/mdhouse/prefs.json` (0600, dir 0700)

| | Item | Writer | Notes |
|---|---|---|---|
| ✅ | saved projects, names, RW/RO (`writable`/`readonly`), auto-RW rules | CLI, Settings (admin) | keyed by canonical path; RW/RO never team |
| ✅ | mode `workspace`/`viewer`, `viewerWritable` (v3 while Viewer) | CLI, Settings (admin) | |
| ✅ | marks: favorite / muted / ignored per project | page | stays user ([№Q-R3-ADMIN1](workspaces/DECISIONS.md#Q-R3-ADMIN1)) |
| ✅ | edit link + scheme, `me` | Settings | |
| ✅ | Agent Bus: enabled (`true`/`false`/`auto`), socket, default agents, filter, `control` patterns, per-project spaces (endpoint, default) | CLI, Settings | |
| ⚠️ | Agent Bus token, per-space credentials | CLI, Settings | secret → `secrets.json` |

## User, secret — today in `prefs.json`; planned `secrets.json` 0600 (keyring later)

| | Item | Notes |
|---|---|---|
| ⚠️ | Agent Bus token, space credentials | move: migration step 1 |
| ⚠️ | Basic users' password hashes (`access.users`) | move: migration step 1 |

## Machine — config dir

| | Item | Where | Notes |
|---|---|---|---|
| ✅ | server port / host, allow list, host names | `prefs.json` | CLI only |
| ✅ | flow run seal key | `flow-seal.key` 0600 | created at start; never in a project ([MW.3.3](workspaces/TODO.md#MW.3)) |
| ✅ | systemd unit | `~/.config/systemd/user/mdhouse[-<port>].service` | `mdhouse service` |
| ✅ | config dir hidden from every route when inside a served root | — | `35e799d` |

## Runtime — memory / socket / journal

| | Item | Where today | Planned |
|---|---|---|---|
| ⚠️ | control socket `control-<port>.sock` | config dir | `$XDG_RUNTIME_DIR/mdhouse/` (step 2, read-both) |
| ✅ | admin sessions, proofs, local-admin marks | memory | |
| ✅ | Agent Bus send jobs/events, tab ids (`/ws` clientId) | memory | |
| ✅ | logs | journald | |

## State — machine-local history, `$XDG_STATE_HOME/mdhouse/` (planned)

| | Item | Notes |
|---|---|---|
| ❓ | automation approvals (content hash per registration) | [№Q-R3-AUTO2](workspaces/DECISIONS.md#Q-R3-AUTO2); MW.11 slice 2 |
| ❓ | schedule state / run index (last/next, failures) | MW.11 |
| ❓ | user session history (`sessions.json`) | Team, future |

## Browser — per origin

| | Item | Notes |
|---|---|---|
| ✅ | author cookie `mdhouse_author_<port>`, admin cookie `mdhouse-admin-<port>` | |
| ✅ | `localStorage mdhouse.*`: drafts `edit.<p>`, views, sidebar, history, filters, `ab.<p>` … | drafts are content copies |
| ✅ | `sessionStorage mdhouse.client` (tab id + resume proof) | MW.7 |

## Bus — on `#mdhouse@<host>`

| | Item | Notes |
|---|---|---|
| ✅ | RAG registry `rag/source/<sid>`, `rag/last/<sid>`, `rag/hist/<sid>/…` (KV) | `mdhouse-rag-sync` |
| ✅ | control lock `ctl` + `ctl.owner` nonce (KV) | MW.7 |
| ✅ | agent log lines (notice / warning / alert) | not readable back |
| ❓ | bus schedules (the timer for automation) | MW.11 slice 2 |

## Team — `$PROJECT`, Git

| | Item | Notes |
|---|---|---|
| ✅ | documents, task ticks, answers, inserts | the project itself |
| ✅ | `.mdhouseignore` | stays top-level |
| ✅ | flow run documents `Plans/flows/runs/<package>/…`, flow reports `Plans/flows/<package>.md` (`last-commit-id`) | MW.3.3 |
| ❓ | automation registrations `.mdhouse/automation/<id>.json` | fire only after per-machine approval ([№Q-R3-AUTO2](workspaces/DECISIONS.md#Q-R3-AUTO2)) |
| ❓ | project id `.mdhouse/project.json` | created on the first team write |
| ❓ | other shared definitions (default agents, RAG source id, flows) | owner to choose |

**Never team:** RW/RO, secrets, access, machine state.

## Install / repo only

| | Item | Notes |
|---|---|---|
| ✅ | reference `_mdhouse` (installed `doc/`, read-only) | |
| ✅ | `.scratch/` (dev, gitignored), `test/fixtures/` | not shipped |

## Migration order (proposal, #md/w1)

1. secrets out of `prefs.json` → `secrets.json` (version bump, read-both one release)
2. control socket → `$XDG_RUNTIME_DIR/mdhouse/` (client tries new, then old)
3. `$XDG_STATE_HOME/mdhouse/` for new state only (nothing to move)
4. `.mdhouse/project.json` on the first team write; prefs stay keyed by path
5. `.mdhouse/automation/` with approvals (MW.11 slice 2)

Marks and `.mdhouseignore` do not move.
