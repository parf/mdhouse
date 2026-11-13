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

- ❓ Q-R3-VIEWADMIN1 In a Viewer, is there a local administrator? <a id="Q-R3-VIEWADMIN1"></a>
  Done as the temp CTO decided (`4ee3733`): a proxied request could switch a Viewer back to Workspace in one request.
  - ( ) no — Viewer: sign in with `mdhouse admin` 🌟
  - ( ) yes — local install = admin, Viewer too

- ❓ Q-R3-EXPOSE1 Served on a network address (`--host 0.0.0.0`), no users, no allow list — today every RW project is writable by the network. <a id="Q-R3-EXPOSE1"></a>
  - ( ) A — as is: a non-loopback address was chosen on purpose
  - ( ) B — every project RO; the start line says why 🌟
  - ( ) C — refuse to start; name what to configure

- ❓ Q-R3-HOSTNAME1 Does `--host-name` (a proxy on this host) count as an explicit access policy for Q-R3-EXPOSE1? <a id="Q-R3-HOSTNAME1"></a>
  - ( ) yes — `md` keeps working as today 🌟
  - ( ) no — same as a network address

- ❓ Q-R3-VIEWPROXY1 A Viewer behind `--host-name`: `mdhouse admin` cannot mint (localhost is refused), so switching back is CLI only (`mdhouse --workspace`). <a id="Q-R3-VIEWPROXY1"></a>
  - ( ) keep — CLI only 🌟
  - ( ) allow minting for the loopback name even with host names set

- ❓ Q-R3-SUBSYS1 `Plans/subsystems.md`: new files match no prefix. <a id="Q-R3-SUBSYS1"></a>
  - ( ) J "agent bus & RAG ⚠️" (agent-bus, rag-*, rag-sync-cli); authz/admin-session → A; install.md → I 🌟
  - ( ) leave as is

- ❓ Q-R3-REFDOC1 Installed reference (`_mdhouse`, MW.17) — these rewrite your docs: <a id="Q-R3-REFDOC1"></a>
  - [ ] fold `skills/markup.md` into `agent-markup.md`, keep a 5-line pointer
  - [ ] split `plans.md`: portable Plans convention stays; this repo's commit rules go to CLAUDE.md (your file — you edit it)
  - [ ] one home per glyph table (`glyphs.md`) and per Q&A sample set (`qa-playground.md`); the others link
  - [ ] add `mdhouse docs` — prints the reference path

- ❓ Q-R3-DATA1 Where mdhouse data belongs (MW.14, inventory by #md/w1): <a id="Q-R3-DATA1"></a>
  - [ ] shared project definitions in `$PROJECT/.mdhouse/` (Git): ignore rules, default agents, RAG source id, flows
  - [ ] RW/RO stays per user/machine — a repo never grants itself write
  - [ ] secrets (bus token, credentials, user hashes) move out of prefs.json into `secrets.json` 0600 (keyring later)
  - [ ] a stable project id in `.mdhouse/project.json` (survives moves/clones), prefs keyed by it
  - [ ] control sockets → `$XDG_RUNTIME_DIR/mdhouse/`; history/state → `$XDG_STATE_HOME/mdhouse/`
  - ( ) marks: per user (prefs)
  - ( ) marks: team-shared (`.mdhouse/`, Git)
