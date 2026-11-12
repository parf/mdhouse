# Decisions — MDHOUSE Workspaces

## Product

- 📌 Q-W0 Markdown workspace: read, edit, agents, review, delivery; Viewer = RO.
- 📌 Q-W0a Personal by default; Team optional. Participants/access ≠ Workspace/Viewer; per-browser identity.
- 📌 Q-W4 Name: **Markdown workspace**; **personal-first, team-ready**. [History](resolved.md#Q-W4).
- 📌 Q-W5 Persist `mode: "workspace" | "viewer"`; onboarding, Settings, CLI. [History](resolved.md#Q-W5).
  Workspace: default RW, explicit root modes. Viewer: hard RO, no write controls; retain stored modes.
  Upgrade: preserve existing access.
- 📌 PROFILE-W1 Profiles: `personal`, `open-viewer`, `private-viewer`, `team`. <a id="Q-W6"></a>
  Personal: no configured users, owner management without mandatory GitHub login, default RW.
  Configured users require Team and `admin=username`, bound to an existing immutable provider ID.
  First-user/admin setup is atomic; mode/profile conflicts fail closed. Open Viewer: admitted network, RO.
  Private Viewer: approved GitHub users, granted projects, RO. Team: approved users, per-project RO/RW.
  Shared enforcement; visible trusted-network modifier + project policy; preview/confirm profile switches.
  Viewer preserves root modes/user grants; caps RO.
  Personal localhost: no setup/login. Remote: explicit GitHub/trusted CIDR/VPN/proxy admission before RW exposure.
  [History](resolved.md#Q-W6).

## Access

- 📌 USER-W1 Add user: GitHub lookup → public profile preview → explicit confirmation; login: GitHub OAuth. <a id="Q-W8"></a>
  Identity = provider + immutable GitHub ID; username = admin-controlled display/routing once set; renames never transfer grants.
  No writes before confirmation; bind it to the verified numeric ID, reject changed/stale identity.
  Web user management: Personal owner; Team configured administrator only. ACCESS = sign-in; project grant = content; new grant = RW; absent = hidden/denied.
  Local/password/Basic: Advanced recovery only; local/GitHub identities separate. [History](resolved.md#Q-W8).
- 📌 USER-W2 Write = Workspace ∩ root RW ∩ project RW ∩ Editor.
  Viewer/root RO/user RO cap access. User/grant changes apply immediately; no jail/reference override.
- 📌 USER-W3 Admission: known users; optional trusted localhost/CIDRs with explicit project policy.
  No inherited admin grants. Forwarded addresses require a configured trusted proxy.
- 📌 USER-W4 GitHub OAuth → secure revocable session; secrets/tokens server-side.
  After login fetch authenticated `/user`; name/avatar/email are optional display metadata, never grants.
  No email/key requirement or silent account merge.
  Markdown: current GitHub username; grants/audit: immutable provider ID. Browser author cookie: anonymous fallback only.
- 📌 USER-W5 With >1 configured user, Team answers/comments and their edits require the authenticated respondent’s name; shared Git author is not attribution. <a id="USER-W5"></a>
  Personal signature preference and existing Team/admin thresholds remain separate. [History](resolved.md#USER-W5).
- 📌 USER-W6 Keep per-user sessions, last 10 IPs, last 10 unique cities, states and countries with last-seen dates (city keyed by state/country, state by country), latest browser User-Agent; self/admin only. <a id="USER-W6"></a>
  IP/GeoIP observations retain ISP, organization and ASN number/label when supplied; missing metadata stays unavailable.
  GeoIP: two public services, primary first, secondary only on failure; no parallel fan-out, private/loopback IP disclosure or guessed location.
  Every country transition requires GitHub re-login before protected actions/trusted history; unknown/private/failed GeoIP is not a transition. [№Q-R3-COUNTRY1](#Q-R3-COUNTRY1).
  Each session idle >30 days requires GitHub re-login before last-used updates; other sessions do not renew it. Admin proof/session TTLs stay separate. [History](resolved.md#USER-W6).
- 📌 USER-W7 Once set, Team GitHub username and name/realm are configured-admin-edit-only; self-edit and automatic profile-sync overwrite are forbidden. <a id="USER-W7"></a>
  Login/signature always uses the authenticated immutable principal; body/cookie spoof, different-ID OAuth rebinding and admin login-as are forbidden.
  Immutable GitHub principal and grants stay unchanged; username correction requires GitHub lookup/preview/confirm. Realm meaning: [№Q-R3-REALM1](#Q-R3-REALM1). [History](resolved.md#USER-W7).
- 📌 Q-R3-REALM1 "name/realm" = the user's display name; no realm field. <a id="Q-R3-REALM1"></a>
  [History](resolved.md#Q-R3-REALM1).
- 📌 Q-W1 Explicit add → RW; `--ro` opts out; Viewer caps RO. [History](resolved.md#Q-W1).
  No protected-path list; canonical root = grant; realpath jail = boundary; automatic references stay RO.
- 📌 Q-W2 Roots: one `prefs.json` model; CLI + Settings Add directory; shared canonical registration. [History](resolved.md#Q-W2).
- 📌 Q-W3 Every instance auto-mounts current immutable RO package references: Plans, markup, syntax, skills. [History](resolved.md#Q-W3).

## Agent Bus

- 📌 AB-W1 Endpoint: canonical-space override → instance default; credentials server-side.
- 📌 AB-W2 Targets: explicit panel → `<!-- AB: name -->` → space → instance.
  Endpoint selection independent; unavailable higher-priority target = error, never fallback.
- 📌 AB-W3 Per-space configuration: directory-row `[AB]`, always visible; show value only when configured.
  Beside access badge; opens editor; legend explains controls. Empty field removes override; all empty removes entry.
- 📌 CTRL-W1 Control API: inventory IDs; open = `rootId` + Markdown path + destination `clientId`. <a id="Q-W7"></a>
  AB control is read-only inventory/query plus authorized targeted page opening; no root/config/user/grant writes.
  Page agent-chat is separate; sender/root/user authorization and the path jail still apply.
  No pairing/broadcast. Unknown/disconnected client → canonical URL, `opened: false`. [History](resolved.md#Q-W7).

- 📌 RAG-W1 RAG sync is a separate mdhouse bin module, implemented by our team and executed only on explicit owner demand; no implicit/background sync or provider-status calls. <a id="RAG-W1"></a>
  For the approved mdhouse sync scope, parf stays Owner and CTO is Maintainer on the dedicated RAG/FileScan records only after live confirmation; no worker/wildcard grants or implied destructive reset/replay.
  FileScan: one provisioned instance per folder; owner/AB-CEO handle roots/record/config/token/grants, our bin handles the agreed subscription/status. Paid/live authority is separate. [History](resolved.md#RAG-W1).

## Directory controls

- 📌 DIR-W1 Saved: no badge. Session: `[unsaved]` → confirm → persist canonical path + current mode.
- 📌 DIR-W2 `[RW]`/`[RO]` → confirm → toggle immediately, both directions.
  Web project properties, including RW/RO: Personal owner or Team configured admin only; Editor/RW is insufficient.
  Saved: persist. Session: until saved. Workspace: explicit mode wins; Viewer: RO, no toggle, stored mode retained.
- 📌 Q-R3-MODE1 Implement scoped access migration/toggle; one mdhouse process per machine. <a id="Q-R3-MODE1"></a>
  Changes apply on reload. Multiple manually started instances are the user’s responsibility, not a development gate.
  Downgraded readers lose auto-RW; no automatic restart.
  [History](resolved.md#Q-R3-MODE1).
- 📌 DIR-W3 Optional name keyed by canonical path; display only; empty resets.
  No path/ID/URL/jail change; default = directory label.
- 📌 Q-R3-NAME1 Unsaved project names stay in memory until the project is explicitly saved. <a id="Q-R3-NAME1"></a>
  [History](resolved.md#Q-R3-NAME1).

## Editor

- 📌 EDIT-W1 External scheme configurable; default `edit`; e.g. `mdedit:/path:line` for Typora.
  Separate enable switch; inline scheme/help shown only when enabled; disable preserves value.

## Flows

- 📌 FLOW-W1 Flow = editable Markdown documents + routing + optional schedule; one runner.
  Documents: inputs/work/questions/decisions/outputs. Routes: document, person/team, agent, external destination.
  New domains normally change packages, not UI.
- 📌 FLOW-W2 Ship every proposed engineering/domain package; start small, improve from use.
  Finance/Legal: evidence + drafts; no autonomous decisions, filings, signatures or payments.
- 📌 FLOW-W3 Generated document: full `last-commit-id`; next scope = `last-commit-id..HEAD`.
  Advance only after all writes/routes succeed. Missing/unreachable commit → explicit new baseline.

## Administration

- 📌 ADMIN-W1 Instance admin ≠ project Editor/RW, trusted address, first visitor or author cookie.
  CLI/control authority always comes from the process OS owner and protected local transport; no GitHub/web-admin checks.
  Team web administration requires configured `admin=username`, resolved to an existing immutable provider ID.
  Personal owner needs no Team admin configuration; first-user creation establishes Team/admin atomically.
  Team web external-root add and project-property changes are admin-only; no inferred inside-workspace grants.
  Local bootstrap: OS-owner CLI/0600 control → revocable browser admin session; no mandatory GitHub/account setup.
  Remote admin explicit. Proof: random, short-lived, single-use, memory-only; URL fragment removed before content renders.
  Exchange: trusted-host + admission + same-origin; expiring HttpOnly host-only cookie, appropriate HTTPS/SameSite.
  No secrets in config/projects/logs/query/audit/startup output; explicit CLI/browser recovery.
  Independent security review + negative tests before integration. [History](resolved.md#ADMIN-W1).

- 📌 Q-R3-ADMIN1 Shared file marks (`/api/marks`) = instance configuration: Personal owner / Team configured instance administrator only. <a id="Q-R3-ADMIN1"></a>
  [History](resolved.md#Q-R3-ADMIN1).

## Document content

- 📌 Q-R3-HTML1 Prohibit document-supplied active content. <a id="Q-R3-HTML1"></a>
  Keep passive HTML. Mermaid runs only through the app-controlled constrained renderer; diagram
  source gains no arbitrary script or privileged-request capability. Referer is not this boundary.
  [History](resolved.md#Q-R3-HTML1).

- 📌 Q-R3-COUNTRY1 Country baseline = this session’s last GitHub-authenticated country; only successful reauthentication changes it. <a id="Q-R3-COUNTRY1"></a>
  US→DE→US requires re-login twice; other sessions/history do not waive it. Initial unknown: [№Q-R3-COUNTRY2](#Q-R3-COUNTRY2). [History](resolved.md#Q-R3-COUNTRY1).

- 📌 Q-R3-COUNTRY2 No GeoIP country → country `NA` (not available); the first verified country after `NA` requires GitHub reauthentication. <a id="Q-R3-COUNTRY2"></a>
  [History](resolved.md#Q-R3-COUNTRY2).

- 📌 Q-R3-RAGSYNC1 Use the finite on-demand FileScan sync; no subscription/watch/timer remains, no answer within the timeout → the next sync repeats it (resend). <a id="Q-R3-RAGSYNC1"></a>
  Bind the delivered approved provider contract after deployment; standing-watch retry authority is separate. [History](resolved.md#Q-R3-RAGSYNC1).

- 📌 Q-R3-RAG1 No provider source registry / job API / history; the R3 source lifecycle is mdhouse's. <a id="Q-R3-RAG1"></a>
  New source: FileScan instance + runner roots (admin step) → `mdhouse-rag-sync` → RAG. Goal: index all docs. No answer within the timeout → repeat; no request-id dedup;
  failed/unknown files = fail queue, retried with back-off while the provider is down.
  Source registry, sync history: KV on `#mdhouse@<host>` (`set --add`); events: `#mdhouse` agent log. Small-file citations: mdhouse computes heading/lines from the file
  at `content_hash`; mismatch → stale, no citation. [History](resolved.md#Q-R3-RAG1).


- 📌 BROWSE-W1 Gitignore is a visibility default, not access control. <a id="BROWSE-W1"></a>
  Show ignored when eligible ignored files exist; direct ignored-folder navigation lists its contents.
  Folders selected in either V1/V2 also appear in main/default; each V tab keeps only its own selection.
  Preserve explicit exclusions, `.git` protection and path jail. [History](resolved.md#BROWSE-W1).


- 📌 GIT-W1 Distinguish Gitignored (orange) and Untracked (blue) across file surfaces. <a id="GIT-W1"></a>
  Separate right file-panel badges; tracked/no-repo files have neither. Direct file navigation reveals
  its exact path/selection without changing strict V1/V2 or exclusions/jail. [History](resolved.md#GIT-W1).


- 📌 GIT-W2 Hide file Git history for authoritative Gitignored and Untracked without confirmed history. <a id="GIT-W2"></a>
  Tracked paths keep history, including force-tracked ignore matches. Do not infer from badges,
  no-repo or synthesized status. [History](resolved.md#GIT-W2).


- 📌 RENDER-W1 Unchanged file content must not trigger document-body/token replacement or new diagram work. <a id="RENDER-W1"></a>
  Refresh Git metadata separately; actual content changes refresh body/provenance normally. Image cache
  is defense, not a substitute for eliminating redundant full rendering. [History](resolved.md#RENDER-W1).


- 📌 PROJECTS-W1 Settings uses Projects with project selection/details, separate browser and instance scopes. <a id="PROJECTS-W1"></a>
  Filesystem directory/path and internal root/API/storage semantics stay unchanged; unsupported
  per-project mutations require their existing admin-gated owning work. [History](resolved.md#PROJECTS-W1).


- 📌 Q-R3-AB1 AB endpoint/default overrides follow the existing saved/session root-property lifetime. <a id="Q-R3-AB1"></a>
  Unsaved: memory until explicit save; save atomically carries AB metadata with mode/name. Saved edits persist.
  Credentials stay server-only; endpoint change discards the old credential.
  [Verified-source clarification](resolved.md#Q-R3-AB1).

## Editor, retrieval and automations direction

- 📌 EDIT-W2 Integrate an existing Markdown editor component; do not build an editor engine. <a id="EDIT-W2"></a>
- 📌 RAG-W2 Defer RAG implementation; design two independent indexes. <a id="RAG-W2"></a>
  End users: documents only. Developers and AI agents: shared code-and-documentation index; retain repository/revision identity and access boundaries.
  [Owner history](resolved.md#RAG-W2).
- 📌 AUTO-W1 Use Agent Bus Cron/At to invoke agents and AI pipelines, including code review and QA. <a id="AUTO-W1"></a>
  No separate mdhouse scheduler; live schedules require separate authorization.

## Access badges

- 📌 BADGE-W1 Access badges show deviations from the mode baseline. <a id="BADGE-W1"></a>
  Workspace: hide RW, show RO. Viewer: hide RO, show configured RW; effective writes remain forbidden.
  Apply throughout the UI: hide defaults or render them gray; highlight important or unusual states.
  [Owner history](resolved.md#BADGE-W1).

## Data placement

- 📌 CONFIG-W1 `$PROJECT_HOME/.mdhouse/` is Git-controlled. <a id="CONFIG-W1"></a>
  [Owner history](resolved.md#CONFIG-W1).
