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
  - [ ] shared project definitions in `$PROJECT/.mdhouse/` (Git): ignore rules, default agents, RAG source id, flows
  - [ ] RW/RO stays per user/machine — a repo never grants itself write
  - [ ] secrets (bus token, credentials, user hashes) move out of prefs.json into `secrets.json` 0600 (keyring later)
  - [ ] a stable project id in `.mdhouse/project.json` (survives moves/clones), prefs keyed by it
  - [ ] control sockets → `$XDG_RUNTIME_DIR/mdhouse/`; history/state → `$XDG_STATE_HOME/mdhouse/`
  - ( ) marks: per user (prefs)
  - ( ) marks: team-shared (`.mdhouse/`, Git)
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

- ❓ Q-R3-CTL1 MW.7 (an agent opens a file in a given mdhouse tab): who may send control commands by default? <a id="Q-R3-CTL1"></a>
  Temp CTO chose the first one (being built by #md/w1); worst case is navigation within readable projects, never a write.
  - ( ) the daemon's rule — only your own agents (`@owner`); `--ab-control '<pat>'` narrows, `--ab-control off` stops it 🌟
  - ( ) nobody until `--ab-control '<pat>'` is set (opt-in)

- ❓ Q-R3-UX1 Phone/tablet UX review (MW.13, #opencode/md-api; screenshots in its touch walk) — structural changes: <a id="Q-R3-UX1"></a>
  Being done now without asking: one ⋯ per heading on touch, lighter tree rows/Q&A form/AB bottom sheet, reading-first phone header.
  - [ ] one "Changes" destination: file list + diff + message + "Commit 2 files"; the document shows only a status chip; Push only when a remote exists (no raw git error)
  - [ ] untracked files in "Changes": listed, unticked by default
  - [ ] phone navigation = 4 labelled destinations: Files · Changes · Search · Ask
  - [ ] one Search with a scope switch Files | Index (the RAG page becomes "Index"; [R] stays as a shortcut)

- [№Q-R3-AUTO1](DECISIONS.md#Q-R3-AUTO1) <a id="Q-R3-AUTO1"></a>

- ❓ Q-R3-AUTO2 Automation registrations are team data (`$PROJECT/.mdhouse/automation/`, Git). When one arrives by a pull or a commit from someone else, who lets it run on this machine? <a id="Q-R3-AUTO2"></a>
  Design in [AUTOMATION.md](../AUTOMATION.md#3-registration). Temp CTO chose the first: the usual practice (CI, git hooks, direnv) is that committed definitions do not run until a person approves their content.
  - ( ) the instance administrator approves the file's content hash on this machine; a changed file stops firing until approved again 🌟
  - ( ) a registration found in a project runs at once, its schedule created by whoever pulled it (a pull can then start jobs)
  - ( ) only registrations created from this machine's page run; files from others are shown, never run
