# TODO — MDHOUSE Workspaces

R3 scope: [`Release 3 — Paradigm Shift`](../README.md).

## Execution contract

Unchecked items are planned, not evidence of execution. Assignments and exact revisions live in
[`../EXECUTION.md`](../EXECUTION.md). CTO alone closes shared checkpoints after integration and checks.
Partial slices do not close their parent task. State: assigned → working → ready → reviewed → integrated → done.

Foundation DAG: [№MW.0f](#MW.0f) + [№MW.0g](#MW.0g) → [№MW.0h](#MW.0h) → [№MW.0c](#MW.0c) → [№MW.0d](#MW.0d) → [№MW.0e](#MW.0e) → [№MW.0](#MW.0) activation.
[№MW.0a](#MW.0a) attribution can proceed independently; [№MW.0b](#MW.0b) assembles the completed access foundations.
[№MW.0c](#MW.0c)/[№MW.0d](#MW.0d)/[№MW.0e](#MW.0e) may implement dormant primitives in order without requiring [№MW.0](#MW.0) default activation.
Each integrated slice must preserve or reduce current access; no temporary permissive policy.
[№MW.1](#MW.1) web root/config controls wait for administrator authorization; project Editor is insufficient.
[№MW.7](#MW.7) permits only read-only queries and authorized targeted browser opening; no AB mutations.
Independent Copy, license and flow-package authoring may proceed before default activation.

## W0 — Workspace by default

- [x] MW.L Ship the approved R3 license and package metadata <a id="MW.L"></a>
  - Builds: official PolyForm Strict License 1.0.0 in `LICENSE.md`, copyright Sergey Porfiriev; consistent README/package metadata and Unreleased notice
  - Acceptance: `SEE LICENSE IN LICENSE.md`; actual packed tarball contains canonical license text/copyright and no stale current GPL metadata or LICENSE link
  - Acceptance: regression check inspects packed contents; no version/tag rewrites or third-party notice changes
  - Verified: integrated `e9c1b77`; actual tarball/full 317 tests/tsc pass at `80c17e65017c5a4febf14502c1ac52348aea2e62`

- [x] MW.0f Make the installed reference root immutable <a id="MW.0f"></a>
  - Builds: immutable reference root kind, canonical registration and installed reference auto-mount with plan/markup/syntax/shareable skills
  - Verified: primitive `be776cf`/`6bd2300`, mount `052eaf8`, content `4de0d3`/pointers `b5e81a3`; independent integrated identity PASS `ea7ebda`, packed install and guard evidence in [QA](../QA.md)
  - [x] MW.0f.1 Root-kind/addReference primitive, write/remove/promotion and Agent Bus dispatch guards; no auto-mount/default flip <a id="MW.0f.1"></a>
    - Verified: integrated `be776cf` + `6bd2300`; independent PASS and 317 tests/tsc at `80c17e65017c5a4febf14502c1ac52348aea2e62`
  - Acceptance: reference or overlapping paths cannot dispatch an Agent Bus action/note that delegates mutation; validate before external send
  - [x] MW.0f.2 Slice: package content, installed auto-mount and UI identity; preserve project root IDs/default selection <a id="MW.0f.2"></a>
  - Acceptance: CLI/control, prefs/autoRw, web and direct writes cannot promote/remove or mutate reference files; symlink/overlapping-root and Git mutations preserve the boundary
  - Acceptance: reference material ships and is readable on fresh packed install without an explicit user grant

- [ ] MW.0g Establish authenticated instance administration and authorization seams <a id="MW.0g"></a>
  - Builds: common request actor and explicit instance-administrator capability, distinct from project Reader/Editor and trusted-source admission
  - [x] MW.0g.1 Memory-only proof/session primitive; no endpoints or grants <a id="MW.0g.1"></a>
  - [x] MW.0g.2a Classify mutation families and add dormant actor types; no authorization activation or grant endpoints <a id="MW.0g.2a"></a>
  - Slice verified: integrated `484a277`, approved `da05ea9`; source identity + focused pure 14/0, live inventory excluded. No admin activation; [evidence](../EXECUTION.md#dormant-route-classification-integrated)
  - Slice acceptance: complete registered POST-family inventory, unknown/duplicate classification rejection, current route behavior unchanged; marks policy remains [№Q-R3-ADMIN1](QUESTIONS.md#Q-R3-ADMIN1), actor identity excludes author cookies
  - Wiring prerequisite: [№MW.8](#MW.8) content isolation reviewed and verified under [№Q-R3-HTML1](DECISIONS.md#Q-R3-HTML1)
  - Acceptance: web root add/remove/save/mode, config/AB endpoint/default/filter, profile/user/grant controls require an authenticated authorized administrator and same-origin protection
  - Contract: [№ADMIN-W1](DECISIONS.md#ADMIN-W1); short-lived single-use OS-control proof, fragment cleanup, revocable HttpOnly session, no secret in journal/history/query/config
  - Acceptance: trusted localhost/CIDR or project RW alone never grants administrator; existing OS-protected CLI/control remains an explicit administration path
  - Acceptance: CLI/control always authorizes the process OS owner through protected local transport, with no GitHub/web-admin/project-grant requirement
  - Acceptance: local Personal administration uses OS-owner-protected CLI/control bootstrap into a browser session without GitHub/account onboarding; remote admin designation remains explicit
  - Acceptance: bootstrap/recovery never trusts first visitor, localhost/CIDR or arbitrary Basic/GitHub login; single-use proof/session expiry/revocation and secret handling are tested
  - Acceptance: classify document/Git/flow/control/config/marks/external-send mutations; direct/stale requests deny missing authority; no new privilege-granting endpoint before checks exist
  - Acceptance: test every mutation family, cross-user/root isolation and denial; dormant foundations retain current RO defaults

- [ ] MW.0h Implement safe mode and access migration before activation <a id="MW.0h"></a>
  - Depends: [№MW.0f](#MW.0f), [№MW.0g](#MW.0g)
  - Builds: explicit configured vs effective root access, Viewer hard cap, versioned compatible prefs migration and safe exposure defaults
  - Acceptance: migration is idempotent; old absent RW grants become explicit RO choices before any new-root default applies
  - Acceptance: old saved/session/autoRw choices preserve effective access; unknown/newer config cannot be destructively rewritten; no upgrade silently expands admission/RW
  - Acceptance: Viewer refuses every mutation family through stale/direct requests and preserves configured choices; restart and downgrade behavior are documented/tested
  - Acceptance: no non-loopback RW exposure without explicit admission policy; migration does not activate incomplete Team/profile UI


- [ ] MW.0 Change the next release from viewer-by-default to workspace-by-default <a id="MW.0"></a>
  - Builds: workspace as the default product mode; new roots RW by default; `--ro`; persisted Viewer mode
  - Depends: [№MW.0f](#MW.0f), [№MW.0g](#MW.0g), [№MW.0h](#MW.0h), [№MW.0c](#MW.0c), [№MW.0d](#MW.0d), [№MW.0e](#MW.0e), [№Q-W4](DECISIONS.md#Q-W4), [№Q-W5](DECISIONS.md#Q-W5)
  - Acceptance: non-loopback binding requires explicit admission policy before any RW-default activation
  - Acceptance: a fresh install and every newly added root use workspace behavior unless Viewer or RO was explicitly selected
  - Acceptance: Viewer makes every root effectively RO and removes task toggles, Q&A/add editors, commit/pull/push actions and all other document write controls
  - Acceptance: Viewer never erases configured per-root access; switching back to Workspace restores it
  - Acceptance: server write routes enforce the Viewer override even if a stale tab or direct request still carries an earlier RW state
  - Acceptance: an upgrade preserves every existing saved root's effective RW/RO access; it never silently grants write access
  - Acceptance: help, onboarding, settings, README, package description and release notes describe one mode model consistently
  - Home: [Next release](README.md#next-release)

- [x] MW.0a Add a cookie-based author name for shared editing <a id="MW.0a"></a>
  - Verified: approved `78344d9`, integrated `b11e47f`; two-browser route/signature/no-rights coverage and independent cohort PASS `ea7ebda`. Authenticated Team identity remains [№MW.0d](#MW.0d), not this fallback slice
  - Why: the legacy server-wide `prefs.settings.me` could not distinguish browser attribution
  - Builds: a user-name control in the web UI; a persistent per-browser cookie; the cookie identity passed through every signed Q&A and document-edit action
  - Acceptance: two browsers using the same mdhouse instance can set different names and their signed replies carry different `👤<name>` badges
  - Acceptance: this layer supplies fallback attribution only; authenticated GitHub precedence is verified with [№MW.0d](#MW.0d), not a dependency of this slice
  - Acceptance: the cookie is attribution only and grants no access or write permission; its value is normalized and length-limited before it reaches Markdown
  - Acceptance: cookie scope, lifetime and behavior behind HTTP/HTTPS are documented and covered by server-route tests
  - Home: [Next release](README.md#next-release)

- [ ] MW.0b Add an explicit Team workspace setup <a id="MW.0b"></a>
  - Acceptance: no users permits Personal owner management without mandatory GitHub login; configured users require Team and an existing designated `admin=username` bound to immutable provider ID
  - Acceptance: first-user confirmation and designated-admin setup commit atomically; failure/cancel leaves no user/grant/Team transition; missing admin, unknown admin and mode/profile conflicts fail closed without first-visitor takeover
  - Builds: Personal as the zero-config default; a Team setup flow combining network exposure, GitHub OAuth configuration, known users and per-browser fallback identity
  - Depends: [№MW.0a](#MW.0a), [№MW.0c](#MW.0c), [№MW.0d](#MW.0d), [№MW.0e](#MW.0e), [№Q-W6](QUESTIONS.md#Q-W6)
  - Acceptance: a personal install still starts locally without onboarding or account setup
  - Acceptance: the owner can configure a shared instance without assembling unrelated host, access and identity options by hand
  - Acceptance: every teammate authenticates with GitHub and is distinguished by GitHub username in Markdown replies; trusted anonymous browsers use the fallback author control
  - Acceptance: Team onboarding configures GitHub login and known usernames; it does not ask the owner to create local passwords for normal users
  - Acceptance: Team setup does not imply RW or Viewer; access profile and editing mode remain independent and visible
  - Acceptance: concurrent edits keep the existing stale-write refusal and never overwrite another teammate's newer change
  - Home: [Next release](README.md#next-release)

- [ ] MW.0c Add Reader and Editor access levels <a id="MW.0c"></a>
  - Builds: public/unauthenticated Reader where enabled; GitHub-authenticated Editor; optional no-login Editor access for localhost or configured CIDRs; login/logout UI and visible current role
  - Depends: [№MW.0g](#MW.0g), [№MW.0h](#MW.0h), [№Q-W8](QUESTIONS.md#Q-W8)
  - Acceptance: Viewer always authorizes Reader only, regardless of login, CIDR or stored root mode
  - Acceptance: Workspace read routes remain available to Reader according to the existing network/host policy; document write and git mutation routes require Editor
  - Acceptance: this layer enforces mode/root/actor; absent project-grant support denies Team writes until [№MW.0d](#MW.0d) supplies the fourth factor, with stale/direct denial tests
  - Acceptance: Settings can optionally grant Editor without login to loopback and explicit intranet CIDRs; unmatched addresses remain Reader until login
  - Acceptance: trusted edit CIDRs reuse strict CIDR parsing and never trust forwarding headers unless a separately configured trusted proxy supplies them
  - Acceptance: authenticated `/user` supplies immutable identity plus optional profile fields; missing name/avatar/email/SSH keys does not block valid login, profile metadata grants no rights
  - Acceptance: GitHub OAuth validates callback state and immutable provider identity server-side; session cookies are Secure on HTTPS, HttpOnly, SameSite and revocable
  - Acceptance: Reader UI removes edit/Q&A/task/git mutation actions and shows a Login to edit action; successful login upgrades the live page without losing location or drafts
  - Acceptance: the author-name cookie remains attribution only and cannot grant Editor; authentication and displayed author are tested independently
  - Acceptance: with >1 configured user, every answer/comment creation and edit is signed with the authenticated respondent’s name; shared Git author never substitutes for attribution ([№USER-W5](DECISIONS.md#USER-W5))
  - Acceptance: test multiple authenticated users across answer/comment/edit flows, forged body/cookie names, stale sessions and revocation; Personal signature preference stays separate, and >1 does not relax existing Team/admin thresholds
  - Acceptance: route tests cover Reader, login Editor, trusted-CIDR Editor, RO root, Viewer override, logout/revocation, CSRF and multiple users
  - Home: [Next release](README.md#next-release)

- [ ] MW.0d Add user management and per-project grants <a id="MW.0d"></a>
  - [ ] MW.0d.1 Pure per-user session/history model and mock-only sequential GeoIP; no persistence, routes, proxy config or OAuth activation <a id="MW.0d.1"></a>
  - State: ready `b9986d2`, W1; independent Review in progress, not integrated or done
  - Slice owner: W1; exact canonical IPs, no new session cap/purge/absolute TTL; cached/current geo observations refresh lastSeen without a new lookup; separate city/state/country MRUs; provider region may map honestly to state
  - Acceptance: web user management is Personal-owner/Team-configured-admin only; Editor/project RW cannot add or manage users, including direct/stale requests
  - Builds: Settings UI, matching CLI and protected APIs to add users by GitHub username, edit status/grants, disable and remove them; GitHub OAuth login; instance `ACCESS`; per-canonical-root `RO` / `RW` grants; known-users-only admission; optional trusted localhost/CIDRs
  - Depends: [№MW.0g](#MW.0g), [№MW.0c](#MW.0c), [№Q-W8](QUESTIONS.md#Q-W8)
  - Acceptance: final effective write requires Workspace + root RW + project grant RW + Editor, with authenticated GitHub attribution overriding cookie fallback
  - Acceptance: Add user is server lookup → public-profile preview → explicit confirmation; no user/grant writes before it, input changes invalidate preview, stale or changed immutable identity is rejected safely
  - Acceptance: nonexistent account differs from provider/network/rate-limit failure; cancel/failure/duplicate ID are tested, email may be hidden and private email is not requested for another person
  - Acceptance: normal Add user has one required field, GitHub username; an authorized owner can inspect its resolved GitHub identity, edit status/grants, disable or remove the user and inspect effective access
  - Acceptance: adding a user from one project's access UI gives that project an RW grant by default; adding from global user management creates ACCESS and leaves project grants to the project-grant control
  - Acceptance: grants and audit identity use provider + immutable GitHub user ID; a username rename is applied only by admin-confirmed GitHub lookup/preview/confirmation for the same immutable ID, without losing/transferring access
  - Acceptance: web and CLI operate on the same user/grant model and never expose OAuth client secrets, access tokens or session secrets
  - Acceptance: local username/password accounts remain available only as an explicit Advanced compatibility/recovery path and are never silently created by Add user or Team setup
  - Acceptance: local and GitHub identities cannot collide or inherit one another's grants when their visible usernames match
  - Acceptance: adding a project grant defaults to `RW`; the owner can choose/change `RO`, change it back to `RW` or remove the grant
  - Acceptance: a user without a project grant does not see that project in roots, search, recents or Agent Bus inventory and cannot read it by direct URL/API
  - Acceptance: `RO` permits reads but refuses every document, Git, flow and configuration mutation; `RW` still requires Workspace mode, root RW and an Editor session
  - Acceptance: Viewer and root RO cap an `RW` user grant at effective RO; a user grant can never promote an immutable reference root or escape the path jail
  - Acceptance: the instance can require known users for access, with an explicit option to also admit localhost and configured CIDRs; all other addresses must authenticate as a known user
  - Acceptance: trusted-source admission has an explicit project policy and never inherits the server owner/admin project grants implicitly
  - Acceptance: forwarded addresses are ignored unless supplied by a separately configured trusted proxy; CIDRs use the existing strict parser
  - Acceptance: disabling/removing a user revokes active sessions; changing/removing a grant updates open tabs and blocks direct/stale requests immediately
  - Acceptance: retain each user’s sessions, last 10 IPs, last 10 unique cities, states and countries with lastSeen (city keyed by state/country, state by country) and latest browser User-Agent ([№USER-W6](DECISIONS.md#USER-W6)); provider region may map to state
  - Acceptance: session/history list and details are visible only to self or configured admin; server-side checks deny another user’s direct/list/detail requests without leaking metadata
  - Acceptance: idle >30 days on the specific user session requires GitHub reauthentication before refreshing last-used; test boundary, rejected/expired requests and a neighboring active session; admin proof/session TTLs remain separate
  - Acceptance: a detected new country returns reauth/new-country independently of idle30d; no protected action, trusted candidate-country history or authenticated baseline update before GitHub reauthentication. Unknown/private/failed GeoIP is not new-country; baseline is the session’s last GitHub-authenticated country ([№Q-R3-COUNTRY1](DECISIONS.md#Q-R3-COUNTRY1)); US→DE→US requires re-login twice even with known-country history. Initial-unknown handling remains undecided, without implied blanket deny
  - Acceptance: IP/GeoIP observations retain provider-supplied ISP, organization and ASN number/label under the same self/admin visibility; missing fields stay unavailable. Verify official provider schemas before wiring; no hostname/hosting/AntiSpider policy requirement
  - Acceptance: GeoIP uses two public HTTPS services sequentially, primary first and secondary only on failure; no fan-out, private/loopback IP disclosure, guessed location or untrusted XFF
  - Planning gate: select the exact provider pair from official API docs; report city/state/country availability, free limits/terms and timeout/invalid-response/429/5xx fallback before live wiring. Research uses docs/mocks, no real user-IP lookups or implied paid/signup credentials
  - Planning gate: verify trusted client-IP extraction, bounded history ordering/dedup and storage; missing geo/state remains unavailable
  - Review gate: bounded worker plan then exact-SHA independent security review; no premature Team-auth activation
  - Acceptance: removing a user or grant never rewrites/deletes their earlier Markdown attribution or audit records
  - Acceptance: user names and project names are display metadata; grants are keyed by stable user ID and canonical root identity
  - Acceptance: once set, Team GitHub username and name/realm cannot be self-edited; only configured admin can change them, enforced on API/direct/stale requests ([№USER-W7](DECISIONS.md#USER-W7)); login/profile sync cannot overwrite pinned identity fields
  - Acceptance: login and signatures derive only from authenticated immutable actor; reject body/cookie name spoof, admin login-as and silent OAuth different-ID rebinding. Admin profile edits never substitute another principal or grant impersonation
  - Acceptance: test self/other-user/spoofed-admin/stale or revoked-admin requests and profile-sync drift; admin username correction requires verified GitHub existence/public preview/confirmation, immutable numeric principal unchanged, no silent account rebind or grant changes
  - Planning gate: realm has no authenticated-user field in the current model; do not invent a realm field; [№Q-R3-REALM1](QUESTIONS.md#Q-R3-REALM1) does not block username/name or impersonation protection. Personal author cookie remains separate attribution, not Team identity editing
  - Acceptance: tests cover OAuth state/callback failure, unknown GitHub user, username rename, multiple users, duplicate display names, session revocation, every grant transition, trusted/untrusted sources, Viewer, root RO and project removal
  - Home: [Next release](README.md#next-release)

- [ ] MW.0e Add the four supported access profiles <a id="MW.0e"></a>
  - Acceptance: users imply Team with valid designated admin; conflicting stored profile/mode/user/admin combinations fail closed; Viewer still caps effective content access
  - Builds: first-class persisted `personal`, `open-viewer`, `private-viewer` and `team` profiles in onboarding, Settings and CLI; one shared enforcement model beneath them
  - Depends: [№MW.0h](#MW.0h), [№MW.0c](#MW.0c), [№MW.0d](#MW.0d), [№Q-W6](QUESTIONS.md#Q-W6)
  - Acceptance: **Personal Workspace** is single-owner with optional login and uses root RW by default while preserving explicit root RO and immutable references
  - Acceptance: localhost Personal Workspace is zero-config/no-login; remote Personal Workspace supports owner GitHub login or an explicit trusted CIDR/VPN/proxy boundary
  - Acceptance: binding Personal Workspace beyond loopback requires an explicit admission choice and never silently publishes RW access
  - Acceptance: **Open Viewer** admits anyone allowed by host/network policy, makes every root effectively RO and refuses every mutation regardless of stale UI or direct request
  - Acceptance: **Private Viewer** admits approved GitHub users only; only granted projects are visible and every grant is effectively RO
  - Acceptance: **Team Workspace** admits approved GitHub users only and enforces their per-project RO/RW grants
  - Acceptance: Private Viewer and Team Workspace may enable a separately visible trusted-localhost/CIDR modifier with an explicit project policy; forwarding headers remain untrusted without trusted-proxy configuration
  - Acceptance: profile labels and summaries always show who can enter and whether writes are possible; Reader/Editor terminology remains actor capability, not a competing profile name
  - Acceptance: switching profile previews affected roots/users, asks for confirmation and applies live to open tabs and server routes
  - Acceptance: Viewer profiles preserve configured root modes and user grants while capping effective access at RO; returning to a Workspace profile restores them only after the switch preview/confirmation
  - Acceptance: prefs migration chooses the profile that preserves existing effective access; it never silently expands admission or write permission
  - Acceptance: route/UI tests cover all four profiles, every mutation family, stale sessions/tabs, loopback, configured CIDRs, disallowed addresses and profile transitions
  - Home: [Next release](README.md#next-release)

## W1 — Install and connect

- [ ] MW.1 Add the AI installation runbook and managed workspace convention <a id="MW.1"></a>
  - Acceptance: Team web add outside `~/mdhouse` and all project-property changes (RW/RO, name/default/endpoint where applicable) require configured admin, not Editor/RW; no broader inside-workspace permission is inferred
  - Acceptance: project-property APIs use an explicit allowlist/schema; direct/stale non-admin calls fail, effective access updates immediately and stored/effective modes remain distinct; Personal owner management and OS-owner CLI remain available
  - Builds: `install.md`; `~/mdhouse/<project>` as the standard always-RW development workspace
  - Depends: [№MW.0](#MW.0), [№MW.0f](#MW.0f), [№MW.0g](#MW.0g), [№Q-W1](DECISIONS.md#Q-W1), [№Q-W2](DECISIONS.md#Q-W2)
  - Acceptance: from a clean account, an AI follows `install.md`, creates one project workspace and opens it writable in mdhouse
  - Acceptance: a symlink from the workspace cannot write outside the workspace root
  - Acceptance: `Settings → Directories` has Add directory; it accepts a path and RW/RO, then uses the same canonical add path as the CLI
  - Acceptance: saved roots show no saved badge; session-only roots show `[unsaved]`
  - Acceptance: clicking `[unsaved]` asks before saving the canonical root and its current RW/RO mode to prefs, then removes the badge without restarting
  - Acceptance: every root shows `[RW]` or `[RO]`; clicking it asks before switching immediately to the opposite mode
  - Acceptance: an access-mode change is persisted for a saved root and session-only for an unsaved root; saving that root later preserves its current mode
  - Acceptance: runtime switching works in both directions, including RW → RO; open tabs receive the changed root state and write routes refuse immediately after RO
  - Acceptance: save and mode actions use same-origin protected APIs and route tests cover persistence and live state
  - Home: [Workspace](README.md#workspace)

- [ ] MW.1a Add optional human names for project directories <a id="MW.1a"></a>
  - Builds: project display-name metadata keyed by canonical root path; a Project name field in the Settings directory editor; CLI `--name`
  - Acceptance: `mdhouse ~/mdhouse -p --name "All MDHouse Projects"` saves that human name for the canonical directory
  - Acceptance: `--name` requires exactly one named directory; ambiguous multi-directory use is refused with a useful error
  - Acceptance: Settings can add or edit the name; saving an empty value, or CLI `--name reset`, deletes the override and restores the directory-derived label
  - Acceptance: the human name appears in the root switcher, Settings, home/project headings and Agent Bus control inventory; the real path remains visible where needed
  - Acceptance: changing the name updates open tabs live but does not change the filesystem path, root ID, document URLs, views, marks or per-space config keys
  - Acceptance: names are trimmed, length-limited and rendered as text; prefs migration and duplicate human names are covered by tests
  - Home: [Workspace](README.md#workspace)

- [ ] MW.2 Make Agent Bus work out of the box <a id="MW.2"></a>
  - Builds: install-time Agent Bus setup; a connected mdhouse project ready to ask an agent; optional Agent Bus endpoint and default agents per space/root
  - Depends: [№MW.1](#MW.1), [№MW.1a](#MW.1a)
  - Acceptance: the installed project page can open Agent Bus, send a request and receive its reply without a separate integration pass
  - Acceptance: a per-space endpoint, keyed by the canonical root path, takes precedence over the instance-wide default endpoint
  - Acceptance: a space without an override uses the default; two spaces with different overrides route requests to their own Agent Bus daemons
  - Acceptance: per-space endpoint tokens remain in server-side prefs, never enter page state, and are covered by config and route tests
  - Acceptance: Agent Bus status shows the effective endpoint and whether it comes from the space or the default
  - Acceptance: every directory row always shows a compact `[AB]` button beside its `[RW]` / `[RO]` access badge; `[AB]` opens its Agent Bus editor
  - Acceptance: the per-space Agent Bus value is shown next to `[AB]` only when set; an inherited/default value adds no text to the row
  - Acceptance: a legend below Directories explains `[unsaved]`, `[RW]` / `[RO]` and `[AB]`
  - Acceptance: saving an empty endpoint/default removes that override and its displayed value without hiding `[AB]` or restarting mdhouse; clearing every field deletes the config entry
  - Acceptance: target precedence is explicit right-panel selection → document `<!-- AB: name -->` → space defaults → instance defaults
  - Acceptance: changing defaults or reopening the panel does not overwrite an explicit panel choice for that document
  - Acceptance: an unavailable document-named or explicitly selected agent is shown as unavailable, never silently replaced with a lower-priority default
  - Acceptance: tests cover every precedence level separately from endpoint precedence
  - Home: [Workspace](README.md#workspace)

- [ ] MW.2a Integrate the Agent Bus RAG agent lifecycle <a id="MW.2a"></a>
  - Why: the Agent Bus RAG agent already provides source ingestion, embeddings, indexing, refresh and retrieval; mdhouse should expose the full R3 capability instead of building a second backend
  - Builds: per-space/project source configuration; add/select/remove; ingestion; embedding/index jobs; refresh/reindex; progress/errors/freshness; retrieval test; request/flow source selection; citations/provenance in generated Markdown
  - Depends: [№MW.2](#MW.2) and owner-delivered [RAG contract](../RAG-CONTRACT.md); project-specific instances with independent provider grants, no namespace-label security assumption
  - Acceptance: mdhouse sends stable source/job IDs rather than source credentials or copied backend configuration
  - Acceptance: the UI starts and monitors ingestion/indexing, shows progress/failure/freshness, and can refresh/reindex or remove a source through the RAG agent
  - Acceptance: unavailable, failed or unauthorized sources/jobs are visible and never silently fall back to a different source
  - Acceptance: user project grants and Agent Bus RAG authorization are checked independently; a source grants no mdhouse filesystem access beyond explicit project permissions
  - Acceptance: manual requests and scheduled flows use the same selection contract and record effective source IDs, index version/freshness and citations/provenance in run history/output
  - Acceptance: RAG storage, embeddings, indexes, retrieval execution and credentials stay owned by Agent Bus and do not enter browser state or project prefs
  - Home: [Agent Bus control](README.md#agent-bus-control)

## W2 — Existing projects

Every [№MW.3a](#MW.3a)–[№MW.3h](#MW.3h) package must include a named entry/route, concrete default scope/range/audience/output
and local Markdown destination, evidence/missing-source behavior, approval boundaries, one small
input → output/route example, and manual/optional scheduled execution through MW.3. A coverage manifest
maps every named package to its example/check. Schedules start work, never approve consequential actions.
No package is done before shared runner/permission checks pass; tracker-free output remains complete.


- [ ] MW.3 Build the shared flow runtime for existing projects <a id="MW.3"></a>
  - [x] MW.3.1 Slice: strict package schema/loader and four Feature/delivery authoring packages; no execution/manual/schedule completion claim <a id="MW.3.1"></a>
  - [x] MW.3.2 Pure manual analysis-run core and deterministic Markdown preview; no filesystem/provider/HTTP/UI or execution authority <a id="MW.3.2"></a>
    - Owner: W3; independent exact-SHA architecture review before integration; materialization remains a separate gated slice
  - Builds: discoverable packages of Markdown documents plus routing; common scope, change range, audience, output and destination controls; optional schedules; run history
  - Depends: [№MW.2](#MW.2)
  - Acceptance: every flow leaves its inputs, plan, source evidence, findings, checks and outcome in project Markdown
  - Acceptance: analysis/report generation is separate from edits, ticket filing, merge, deploy and other external actions; each mutation has an explicit preview and confirmation
  - Acceptance: provider-specific destinations use adapters; the flow result remains complete and readable without a tracker connection
  - Acceptance: adding or improving a normal flow requires document templates and routing metadata, not a new Preact screen or server route
  - Acceptance: routing can send the next step to another flow document, a person/team, an Agent Bus target or an allowlisted external destination
  - Acceptance: every transition and approval is recorded in Markdown/run history, so a person can inspect, resume or redirect the flow without hidden orchestration state
  - Acceptance: a flow starts once without schedule metadata and on its configured schedule when present; both use the same document/routing package and entry route
  - Acceptance: missing destinations and routing loops fail visibly without dropping work or repeatedly sending the same step
  - Acceptance: schedules show next/last run, can be disabled without deleting the flow and never overlap the same flow+space run
  - Acceptance: every generated document stores a full `last-commit-id`; **since last run** evaluates that document's `<last-commit-id>..HEAD`
  - Acceptance: a successful run advances each written document to the exact processed HEAD even when its content did not need changing; a failed or partially routed run advances none of its markers
  - Acceptance: the first run has an explicit initial scope; a missing/unreachable marker after history rewrite stops with a baseline choice instead of silently reviewing all or skipping commits
  - Acceptance: uncommitted files are reported separately and never implied to be included in a commit range
  - Home: [Existing-project flows](README.md#existing-project-flows)

- [ ] MW.3a Add Documentation flows <a id="MW.3a"></a>
  - Builds: generate/update; subsystem decomposition and deep docs; summaries; refresh/verify; audience overview; documentation architecture and trust report
  - Depends: [№MW.3](#MW.3)
  - Acceptance: scope can be whole project, subsystem, aspect, path or change timeframe; audience can be executive, marketing/product, development, QA, operations, security or custom
  - Acceptance: refresh cites code/config/API/change evidence, distinguishes verified claims from inference and reports unresolved contradictions
  - Acceptance: generated docs can be organized as tutorial, how-to, reference or explanation rather than one undifferentiated document
  - Home: [Documentation](README.md#documentation)

- [ ] MW.3b Add Recent commits review <a id="MW.3b"></a>
  - Builds: project/user/developer/operations change summaries; changelog; author review; error and risk findings; task/ticket generation; plan-vs-delivery report
  - Depends: [№MW.3](#MW.3)
  - Acceptance: run by range, author, branch, subsystem or week/month; the same document/routing package runs manually or on its optional schedule
  - Acceptance: author reports show commits/files/LoC and a factual work summary, and explicitly do not turn LoC into a productivity score
  - Acceptance: findings carry evidence and severity; filing tickets is optional, previewed and provider-neutral
  - Home: [Recent commits review](README.md#recent-commits-review)

- [ ] MW.3c Add Pull request and incoming-change flows <a id="MW.3c"></a>
  - Builds: intake summary; ownership/impact routing; review; feedback resolution; merge-readiness gate; confirmed merge; post-merge docs/tasks
  - Depends: [№MW.3](#MW.3)
  - Acceptance: review covers correctness, tests, security, dependency changes, compatibility, docs and operational risk
  - Acceptance: merge readiness shows checks, conflicts, required reviews, unresolved threads, migrations, release notes and rollback notes
  - Acceptance: mdhouse never merges from an automated review alone; merge is a separate explicitly confirmed action with provider response recorded
  - Home: [Pull requests and incoming changes](README.md#pull-requests-and-incoming-changes)

- [ ] MW.3d Add all Engineering and operations flow packages <a id="MW.3d"></a>
  - Builds: Release readiness; Architecture and ownership; Project health; Onboarding and handoff; Incident/regression investigation; Requirements and delivery sync; API/schema impact; Maintenance/debt sweep
  - Checkpoint: all eight Engineering authoring packages integrated `25cb68a` + `7fb4fbb`; library contains 19 packages; full 510/510 + tsc on `7fb4fbb`; manual/scheduled runtime acceptance stays open
  - Depends: [№MW.3](#MW.3)
  - Acceptance: every flow has useful default scope/output, evidence requirements, approval boundaries and a small example; each can run manually or on an optional schedule
  - Home: [Engineering and operations flows](README.md#engineering-and-operations-flows)

- [ ] MW.3e Add Business and Ideas flow packages <a id="MW.3e"></a>
  - Checkpoint: Business five + Ideas five authoring packages integrated `74c018d` + `c580622`; library contains 29 packages; full 544/544 + tsc on `c580622`; runtime/manual/schedule acceptance stays open
  - Builds: Business overview; Strategy/planning; Market/customer brief; KPI/operating review; Decision memo; Idea capture; research/synthesis; prioritization; experiment design; idea-to-project
  - Depends: [№MW.3](#MW.3)
  - Acceptance: Business flows separate evidence, assumptions, decisions and follow-up; Ideas flows preserve rejected alternatives and can promote a selected idea into a project/plan
  - Home: [Business flows](README.md#business-flows), [Ideas flows](README.md#ideas-flows)

- [ ] MW.3f Add Finance flow packages <a id="MW.3f"></a>
  - Checkpoint: five Finance authoring packages integrated `25c3515`; library contains 34 packages; full 562/562 + tsc on that exact HEAD; runtime/manual/schedule acceptance stays open
  - Builds: Budget/forecast; Variance/management report; Unit economics/pricing; Cash/runway; Financial document review
  - Depends: [№MW.3](#MW.3)
  - Acceptance: outputs cite inputs, expose formulas/assumptions, label estimates and scenarios, and require human approval for consequential actions
  - Acceptance: flows never initiate payments, move funds or present drafts as financial advice
  - Home: [Finance flows](README.md#finance-flows)

- [ ] MW.3g Add Legal flow packages <a id="MW.3g"></a>
  - Checkpoint: five Legal authoring packages integrated `c76a512`; full 580/580 + tsc on that exact HEAD; catalog 39 covers all named authoring packages, runtime/manual/schedule acceptance stays open
  - Builds: Contract review; Obligation/renewal register; Policy/compliance review; Legal change impact; Legal request brief
  - Depends: [№MW.3](#MW.3)
  - Acceptance: outputs preserve source references, confidentiality boundaries and uncertainty; interpretation and external actions require a qualified human
  - Acceptance: flows never file, sign, accept terms or present drafts as legal advice
  - Home: [Legal flows](README.md#legal-flows)

- [ ] MW.3h Add Feature and delivery flow packages <a id="MW.3h"></a>
  - Builds: clarify → plan → implement → test → review; project/subsystem review; update → review → delivery readiness/rollback → confirmed deploy; next-feature continuity
  - Depends: [№MW.3](#MW.3)
  - Acceptance: task/owner/scope/acceptance/base/target and exact-revision tests/review evidence remain inspectable in Markdown; unanswered required questions hold dependent work
  - Acceptance: all four paths have defaults/evidence/examples and manual/optional scheduled entry; changed target invalidates review readiness
  - Acceptance: edit/commit/ticket/merge/deploy use separate preview/approval boundaries; denied/partial actions preserve provider results and recoverable state
  - Acceptance: readiness includes unresolved findings, migrations, release notes and rollback; next feature preserves decisions and unfinished work
  - Home: [Feature and delivery](README.md#feature-and-delivery)

## W3 — New projects

- [ ] MW.4 Create new AI projects from the web UI <a id="MW.4"></a>
  - Builds: workspace creation; project initialization; `Plans/`; markup and review skills; Agent Bus connection; first flow
  - Depends: [№MW.1](#MW.1), [№MW.2](#MW.2), [№MW.3](#MW.3), [№MW.3h](#MW.3h)
  - Acceptance: a new project is created under `~/mdhouse/`, opens writable and can immediately run its first review or feature flow with Parf's conventions
  - Home: [New-project flow](README.md#new-project-flow)

## W4 — Full-document editing

- [ ] MW.5 Add a real Markdown editor for complete documents <a id="MW.5"></a>
  - Builds: edit the full source document; save; preserve the draft on stale writes; document diff, history and commit
  - Acceptance: a writable document can be edited end to end; a concurrent file change is refused without losing the draft; a read-only root cannot save
  - Home: [Full Markdown editor](README.md#full-markdown-editor)

- [x] MW.5a Make the external edit-link scheme configurable <a id="MW.5a"></a>
  - Why: `edit:` can keep opening the user's common editor while a separate scheme such as `mdedit:` opens Markdown files in Typora
  - Builds: `settings.editScheme`, default `edit`; an inline Settings field next to the existing Edit link switch; generated `<scheme>:/full/path:line` links everywhere
  - Acceptance: an existing prefs file with no scheme continues to generate `edit:/full/path:line`
  - Acceptance: setting `mdedit` generates `mdedit:/full/path:line` for the document title, heading links, Q&A forms and add forms
  - Acceptance: the value is normalized without `:` and validated as a URL scheme (`[A-Za-z][A-Za-z0-9+.-]*`); an invalid value is refused without losing the previous setting
  - Acceptance: the scheme field is shown next to Edit link only when Edit link is enabled
  - Acceptance: disabling Edit link hides the scheme field and external-editor actions without deleting the configured scheme; enabling it restores the same value
  - Acceptance: contextual help beside the setting shows `mdedit:/path:line` and explains that `mdedit:` can be registered for Typora separately from the common `edit:` handler
  - Acceptance: UI labels, tooltips and parsing make no assumption that the scheme is five characters long
  - Acceptance: prefs migration, Settings API, rendering and keyboard-open behavior are covered by tests; README and platform setup docs show `edit` and `mdedit` examples
  - Home: [Full Markdown editor](README.md#full-markdown-editor)

- [ ] MW.5b Keep mdhouse controls out of copied document text <a id="MW.5b"></a>
  - [x] MW.5b.1 Copy-exclusion implementation and scratch Chrome verification; integrated `d7b0ef7` <a id="MW.5b.1"></a>
  - Remaining: supported Safari/Edge/context-menu and Firefox fallback verification; parent acceptance stays open ([QA](../QA.md))
  - Why: selecting a rendered heading currently copies injected controls such as `#`, `✎`, `↓` and `⇊` together with the authored title
  - Builds: one copy-exclusion contract for mdhouse-injected heading links, edit/add actions, badges and other document controls
  - Acceptance: normal selection and Copy produce the authored document text without mdhouse UI chrome
  - Acceptance: a `#`, `✎`, `↓`, `⇊` or badge-like glyph that actually exists in the source Markdown is still copied
  - Acceptance: keyboard and context-menu Copy behave the same in supported Chrome, Edge and Safari; Firefox has a safe documented fallback
  - Acceptance: controls remain visible, focusable, accessible and clickable; copy exclusion does not remove their accessible names
  - Acceptance: rendering/UI tests cover a heading, Q&A item, multi-block selection and source-authored control glyphs
  - Home: [Full Markdown editor](README.md#full-markdown-editor)

- [ ] MW.5c Make the primary workspace journey usable on iPad and phone <a id="MW.5c"></a>
  - Why: Personal Workspace may run remotely so one owner can develop from a tablet or phone without an AI CLI or separate Markdown editor
  - Builds: responsive and touch-usable project/document navigation, Agent Bus work, Q&A, flows, full Markdown editing, diff/review and commit actions
  - Acceptance: no critical action depends only on hover, right-click, a hardware keyboard or a desktop-width panel
  - Acceptance: touch targets, focus behavior, virtual-keyboard layout, draft preservation and panel transitions work in supported mobile Safari and Chrome
  - Acceptance: the owner can open a remote Personal Workspace, authenticate when configured, ask an agent, edit/save Markdown, inspect the diff and commit from an iPad
  - Acceptance: a phone can perform the same primary journey with an intentionally compact layout; large diffs/documents may use progressive disclosure without removing actions
  - Acceptance: desktop shortcuts remain enhancements and every shortcut-only action gains a visible touch control
  - [x] MW.5c.1 Touch-visible heading/actions and 44px controls; integrated `f434fd5`/`80c17e6`, responsive Chromium light/dark evidence in [QA](../QA.md) <a id="MW.5c.1"></a>
  - Remaining: real-device virtual keyboard, long-press Copy and complete mobile journey; parent stays open
  - Acceptance: responsive UI tests and a documented manual device matrix in `Plans/R3/QA.md` cover iPad landscape/portrait and representative phone widths
  - Home: [Full Markdown editor](README.md#full-markdown-editor)

## W5 — Agent Bus control

- [ ] MW.7 Let Agent Bus control a mdhouse workspace <a id="MW.7"></a>
  - Main goal: an Agent Bus command opens one specific Markdown file in mdhouse
  - Builds: a small versioned, typed read-only Agent Bus inventory/query API plus targeted document opening; structured replies and errors
  - Depends: [№MW.0](#MW.0), [№MW.0g](#MW.0g), [№MW.0b](#MW.0b), [№MW.2](#MW.2), [№Q-W7](QUESTIONS.md#Q-W7)
  - Acceptance: the inventory response gives Agent Bus the available `rootId` values and connected `clientId` values with enough labels/current state to choose them
  - Acceptance: an authorized AB sender supplies `rootId`, Markdown `path` and destination `clientId`; mdhouse resolves the document through `Registry.resolve()`, returns its canonical page URL and directs only that browser/tab to it
  - Acceptance: there is no pairing step and no broadcast fallback; an unknown or disconnected `clientId` returns the URL with `opened: false`
  - Acceptance: all AB control senders are refused root add/configure, user/grant, RW and filesystem/config mutations; page agent-chat does not confer control authority
  - Acceptance: inventory/query and browser opening independently check sender/root/user authorization; document paths remain jailed
  - Acceptance: control IDs are opaque identifiers, not credentials; authorization is checked independently on inventory and command requests
  - Acceptance: commands are idempotent by request id, produce an audit record, and have integration tests for replay, denial, path escape, stale client IDs, multiple roots and multiple browsers
  - Home: [Agent Bus control](README.md#agent-bus-control)

## W6 — Passive document content

- [x] MW.8 Prohibit document-supplied active content <a id="MW.8"></a>
  - Contract: [№Q-R3-HTML1](DECISIONS.md#Q-R3-HTML1); preserve passive HTML, source/edit/Copy and normal app behavior
  - Checkpoint: integrated `3b044d5`, exact reviewed target `fdb4098`; controlled full 703/0 + tsc, integrated focused 65/0. [Evidence](../QA.md#mw8-final-integration). Safari/Firefox and raw click landing remain release QA; admin wiring is separate.
  - [x] MW.8a Server content policy, raw response boundaries and defense headers <a id="MW.8a"></a>
  - [x] MW.8b Browser sinks and constrained app-controlled Mermaid rendering <a id="MW.8b"></a>
  - Acceptance: authored HTML cannot impersonate generated Q&A/task controls, even with exact current line/hash and matching list structure; genuine target/tick/pick/verdict/answer controls still work
  - Acceptance: preserve arbitrary passive authored classes in raw HTML and `{#id .class}` syntax; action authorization depends on generated-control provenance, not authored class/structure selectors
  - Acceptance: client filtering preserves Shiki themes, table alignment and passive formatting; Mermaid uses constrained app-controlled rendering with inert image output, no callbacks or app-level CSS/request authority
  - Acceptance: inline handlers, scripts, srcdoc/frames, javascript URLs, forms/base, raw script MIME and SVG/HTML embedding cannot gain app-script or privileged-request capability
  - Acceptance: document/diff/preview and stale/direct surfaces share the boundary; Q&A actions, line hashes, passive tables/details/formatting and source text remain usable
  - Acceptance: Mermaid labels, links/callbacks/config directives and SVG output are constrained; renderer code may execute, diagram source may not gain arbitrary authority
  - Acceptance: owned scratch browser attack/passive compatibility corpus, full tests/tsc and exact-SHA independent security verdict before integration; Referer is not a substitute

## Gate

- [ ] MW.6 Review the complete workspace flow <a id="MW.6"></a>
  - Depends: [№MW.8](#MW.8), [№MW.L](#MW.L), [№MW.0](#MW.0), [№MW.0f](#MW.0f), [№MW.0g](#MW.0g), [№MW.0h](#MW.0h), [№MW.0a](#MW.0a), [№MW.0b](#MW.0b), [№MW.0c](#MW.0c), [№MW.0d](#MW.0d), [№MW.0e](#MW.0e), [№MW.1](#MW.1), [№MW.1a](#MW.1a), [№MW.2](#MW.2), [№MW.2a](#MW.2a), [№MW.3](#MW.3), [№MW.3a](#MW.3a), [№MW.3b](#MW.3b), [№MW.3c](#MW.3c), [№MW.3d](#MW.3d), [№MW.3e](#MW.3e), [№MW.3f](#MW.3f), [№MW.3g](#MW.3g), [№MW.3h](#MW.3h), [№MW.4](#MW.4), [№MW.5](#MW.5), [№MW.5a](#MW.5a), [№MW.5b](#MW.5b), [№MW.5c](#MW.5c), [№MW.7](#MW.7)
  - Acceptance: packed license text/copyright/metadata and immutable installed reference contents are verified
  - Acceptance: every mutation family (document/Git/flow/control/config/users/grants/profiles/roots/external sends) has direct/stale denial checks for Viewer, Reader, RO, revoked and non-admin actors
  - Acceptance: `Plans/R3/QA.md` records desktop Chrome/Edge/Safari, Firefox Copy fallback, iPad portrait/landscape and phone Safari/Chrome evidence or explicit unverified gaps
  - Acceptance: a fresh install creates a project, connects an agent, runs Feature/delivery and RAG flows, edits and copies authored Markdown, uses touch heading controls, reviews diff/history and reaches explicit delivery approval without an AI CLI/external editor
  - Acceptance: validation uses scratch instances and simulated/explicitly authorized delivery destinations; this gate does not authorize production deploy
  - Acceptance: an owner adds only a GitHub username, the user authenticates through GitHub, receives the project as RW by default, changes to RO, then is removed; UI, active sessions and direct APIs enforce every transition immediately
  - Acceptance: an allowed RAG source can be ingested, embedded/indexed, queried and refreshed through the Agent Bus RAG agent; requests/flows record source identity and citations without exposing credentials
  - Acceptance: Personal Workspace, Open Viewer, Private Viewer and Team Workspace each pass their full admission/read/write matrix, including trusted-network variants and profile switching
  - Acceptance: the remote Personal Workspace journey passes on iPad and a representative phone viewport without requiring a hardware keyboard, AI CLI or external editor
