# Open questions — MDHOUSE Workspaces

> **Serg Parf:** Viewer mode  REMOVES all "rw" / interactivity elements
> so rw entries became RO

- <a id="Q-W1"></a>[№Q-W1](DECISIONS.md#Q-W1)
- <a id="Q-W2"></a>[№Q-W2](DECISIONS.md#Q-W2)
- <a id="Q-W3"></a>[№Q-W3](DECISIONS.md#Q-W3)
- <a id="Q-W4"></a>[№Q-W4](DECISIONS.md#Q-W4)
- <a id="Q-W5"></a>[№Q-W5](DECISIONS.md#Q-W5)
- <a id="Q-W6"></a>[№Q-W6](DECISIONS.md#Q-W6)
- <a id="Q-W7"></a>[№Q-W7](DECISIONS.md#Q-W7)
- <a id="Q-W8"></a>[№Q-W8](DECISIONS.md#Q-W8)
- [№Q-R3-RAG1](DECISIONS.md#Q-R3-RAG1) <a id="Q-R3-RAG1"></a>
- [№Q-R3-HTML1](DECISIONS.md#Q-R3-HTML1) <a id="Q-R3-HTML1"></a>
- [№Q-R3-ADMIN1](DECISIONS.md#Q-R3-ADMIN1) <a id="Q-R3-ADMIN1"></a>
- [№Q-R3-COUNTRY1](DECISIONS.md#Q-R3-COUNTRY1) <a id="Q-R3-COUNTRY1"></a>
- [№Q-R3-REALM1](DECISIONS.md#Q-R3-REALM1) <a id="Q-R3-REALM1"></a>
- [№Q-R3-COUNTRY2](DECISIONS.md#Q-R3-COUNTRY2) <a id="Q-R3-COUNTRY2"></a>
- [№Q-R3-RAGSYNC1](DECISIONS.md#Q-R3-RAGSYNC1) <a id="Q-R3-RAGSYNC1"></a>
- [№Q-R3-NAME1](DECISIONS.md#Q-R3-NAME1) <a id="Q-R3-NAME1"></a>
- [№Q-R3-MODE1](DECISIONS.md#Q-R3-MODE1) <a id="Q-R3-MODE1"></a>
- [№Q-R3-AB1](DECISIONS.md#Q-R3-AB1) <a id="Q-R3-AB1"></a>
- [№Q-R3-RELOAD1](resolved.md#Q-R3-RELOAD1) <a id="Q-R3-RELOAD1"></a>
- [№Q-R3-HANDOFF1](resolved.md#Q-R3-HANDOFF1) <a id="Q-R3-HANDOFF1"></a>

## Owner decisions — 2026-11-12

- [№Q-R3-VIEWADMIN1](DECISIONS.md#Q-R3-VIEWADMIN1) <a id="Q-R3-VIEWADMIN1"></a>

- [№Q-R3-EXPOSE1](DECISIONS.md#Q-R3-EXPOSE1) <a id="Q-R3-EXPOSE1"></a>

- [№Q-R3-HOSTNAME1](DECISIONS.md#Q-R3-HOSTNAME1) <a id="Q-R3-HOSTNAME1"></a>

- [№Q-R3-VIEWPROXY1](DECISIONS.md#Q-R3-VIEWPROXY1) <a id="Q-R3-VIEWPROXY1"></a>

- [№Q-R3-SUBSYS1](resolved.md#Q-R3-SUBSYS1) <a id="Q-R3-SUBSYS1"></a>

- [№Q-R3-REFDOC1](DECISIONS.md#Q-R3-REFDOC1) <a id="Q-R3-REFDOC1"></a>

- ❓ Q-R3-DATA1 Where mdhouse data belongs (MW.14, inventory by #md/w1): <a id="Q-R3-DATA1"></a>
  Everything kept now and planned: [DATA.md](../DATA.md).
  Tick what to do (layout and order as in [DATA.md](../DATA.md)):
  - [ ] layout as in DATA.md: user / secret / machine / runtime / state / browser / bus / team; never in Git: RW/RO, secrets, access, machine state 🌟
  - [ ] 1 secrets (bus token, credentials, user password hashes) → `secrets.json` 0600; read both places for one release 🌟
  - [ ] 2 control socket → `$XDG_RUNTIME_DIR/mdhouse/`; the CLI tries new, then old 🌟
  - [ ] 3 `$XDG_STATE_HOME/mdhouse/` for new machine state (automation approvals, run index) 🌟
  - [ ] 4 `.mdhouse/project.json` (stable project id) created on the first team write; prefs stay keyed by path
  - [ ] other shared definitions in `.mdhouse/` (default agents, RAG source id): which ones? → 💬
  - ( ) marks stay per user (prefs) 🌟
  - ( ) marks become team-shared (`.mdhouse/`, Git)
  > 💬👾 Common practice (#md/w1, sources: XDG basedir, git protected config, VS Code Workspace Trust, JetBrains `.idea`, direnv, Bun.secrets):
  > a repo never grants itself permissions (RW/RO stays per user); committed definitions run only after per-user trust;
  > personal marks are user state, only deliberately shared lists go in Git; secrets: 0600 file now (works headless), keyring later;
  > path stays the local key, a committed id only for what must survive a clone; sockets → `XDG_RUNTIME_DIR` with a read-both release;
  > keep `.mdhouseignore` top-level.
  >
  > 💬 we have a task to decide what is user DATA ($HOME/.config/mdhouse) and what is team data ($PROJECT/.mdhouse/...)
  > Ex:
  >  favorites / agent-setup - user data - every can have its own
  >  automation - common - and must be under git
  >
  > 💬👾 → [№DATA-W1](DECISIONS.md#DATA-W1). Next: #md/w1 classifies every item of the MW.14 inventory as user or team data by this rule and proposes the layout here.
  >
  > 💬👾 MW.14 inventory by [№DATA-W1](DECISIONS.md#DATA-W1) (row numbers = the inventory):
  > - **User** (`$XDG_CONFIG_HOME/mdhouse/prefs.json`): saved roots, names, RW/RO, auto-rw (2); marks favorite/muted/ignored (3); edit link, `me` (4); Agent Bus setup, filter, defaults, spaces (6, without secrets); mode (1)
  > - **User, secret** (`secrets.json` 0600, keyring later): bus token, space credentials (6), user password hashes (5)
  > - **User, browser** (unchanged): author cookie (10), `localStorage mdhouse.*` (11)
  > - **User, on the bus** (unchanged): RAG source/last/history, agent log (13)
  > - **Machine** (config dir): server port/host, allow list, host names (5); systemd unit (19)
  > - **Machine runtime** (memory, `$XDG_RUNTIME_DIR/mdhouse/`, journal): control socket (7), admin sessions (8, 9), send jobs (12), logs (18)
  > - **Machine state** (`$XDG_STATE_HOME/mdhouse/`): session history (14), schedule state / run index (planned; [№Q-R3-AUTO1](DECISIONS.md#Q-R3-AUTO1))
  > - **Team** (`$PROJECT`, Git): `.mdhouseignore` (15, stays top-level), documents (16), run documents `Plans/flows/runs/` (MW.3.3), automation registrations `.mdhouse/automation/` ([№Q-R3-AUTO2](#Q-R3-AUTO2)), project id `.mdhouse/project.json` (when Team needs it)
  > - **Never team**: RW/RO, secrets, access, machine state
  > - Install / repo-local: reference `_mdhouse` (20), `.scratch/` (21)
  >
  > Migration order: 1 secrets out of prefs.json (version bump, read-both one release) → 2 control socket → `$XDG_RUNTIME_DIR` (client tries new, then old) → 3 `$XDG_STATE_HOME` for new state only (nothing to move) → 4 `.mdhouse/project.json` created on first team write; prefs stay keyed by path → 5 `.mdhouse/automation/` behind Q-R3-AUTO2 approval. Marks and `.mdhouseignore` do not move.

- [№Q-R3-CTL1](DECISIONS.md#Q-R3-CTL1) <a id="Q-R3-CTL1"></a>

- [№Q-R3-UX1](DECISIONS.md#Q-R3-UX1) <a id="Q-R3-UX1"></a>

- [№Q-R3-AUTO1](DECISIONS.md#Q-R3-AUTO1) <a id="Q-R3-AUTO1"></a>

- [№Q-R3-AUTO2](DECISIONS.md#Q-R3-AUTO2) <a id="Q-R3-AUTO2"></a>

## Open — 2026-11-12, evening

- ❓ Q-R3-REL1 Release now? `main` is 440+ commits ahead (RAG page, Viewer, flows, Settings/mobile, MW.7 control, `mdhouse docs`); 1554 tests pass. <a id="Q-R3-REL1"></a>
  Publishing also makes the AGENTS.md line's GitHub URL live; MW.16 starts right after.
  - ( ) publish after #md/review's independent pass (back after 01:19 EST) 🌟
  - ( ) publish now
  - ( ) wait — finish Changes / phone navigation / MW.11 slice 2 first

- ❓ Q-R3-CLAUDE1 CLAUDE.md (your file — you edit it): <a id="Q-R3-CLAUDE1"></a>
  - [ ] line 129: `doc/qa-playground.md` → `test/fixtures/qa-playground.md` (moved in 93e8f63)
  - [ ] "a route → serve() on its own 617xx port" → "on its own `testPort(617xx)` port (`test/ports.ts`)" (0d6fb0d)
  - [ ] Deploy checklist "~65 files, ~234 kB": today ~240 files, ~730 kB (flows + agent-bus.png)
  - [ ] Plans/R3/README.md: link DATA.md
