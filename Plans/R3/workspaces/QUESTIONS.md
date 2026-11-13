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