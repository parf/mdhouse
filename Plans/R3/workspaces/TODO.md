# TODO — MDHOUSE Workspaces

R3 scope: [`Release 3 — Paradigm Shift`](../README.md).

## W0 — Workspace by default

- ⏳ MW.0 Change the next release from viewer-by-default to workspace-by-default
  - Builds: workspace as the default product mode; new roots RW by default; `--ro`; persisted Viewer mode
  - Depends: [№Q-W4](QUESTIONS.md#Q-W4), [№Q-W5](QUESTIONS.md#Q-W5)
  - Acceptance: a fresh install and every newly added root use workspace behavior unless Viewer or RO was explicitly selected
  - Acceptance: Viewer makes every root effectively RO and removes task toggles, Q&A/add editors, commit/pull/push actions and all other document write controls
  - Acceptance: Viewer never erases configured per-root access; switching back to Workspace restores it
  - Acceptance: server write routes enforce the Viewer override even if a stale tab or direct request still carries an earlier RW state
  - Acceptance: an upgrade preserves every existing saved root's effective RW/RO access; it never silently grants write access
  - Acceptance: help, onboarding, settings, README, package description and release notes describe one mode model consistently
  - Home: [Next release](README.md#next-release)

- ⏳ MW.0a Add a cookie-based author name for shared editing
  - Why: one mdhouse instance is opened to a team; today every browser signs replies with the same server-wide `prefs.settings.me`
  - Builds: a user-name control in the web UI; a persistent per-browser cookie; the cookie identity passed through every signed Q&A and document-edit action
  - Acceptance: two browsers using the same mdhouse instance can set different names and their signed replies carry different `👤<name>` badges
  - Acceptance: an authenticated Team user is attributed by current GitHub username; the cookie is a fallback for personal/trusted-anonymous use and cannot override authenticated identity
  - Acceptance: the cookie is attribution only and grants no access or write permission; its value is normalized and length-limited before it reaches Markdown
  - Acceptance: cookie scope, lifetime and behavior behind HTTP/HTTPS are documented and covered by server-route tests
  - Home: [Next release](README.md#next-release)

- ⏳ MW.0b Add an explicit Team workspace setup
  - Builds: Personal as the zero-config default; a Team setup flow combining network exposure, GitHub OAuth configuration, known users and per-browser fallback identity
  - Depends: MW.0a, [№Q-W6](QUESTIONS.md#Q-W6)
  - Acceptance: a personal install still starts locally without onboarding or account setup
  - Acceptance: the owner can configure a shared instance without assembling unrelated host, access and identity options by hand
  - Acceptance: every teammate authenticates with GitHub and is distinguished by GitHub username in Markdown replies; trusted anonymous browsers use the fallback author control
  - Acceptance: Team onboarding configures GitHub login and known usernames; it does not ask the owner to create local passwords for normal users
  - Acceptance: Team setup does not imply RW or Viewer; access profile and editing mode remain independent and visible
  - Acceptance: concurrent edits keep the existing stale-write refusal and never overwrite another teammate's newer change
  - Home: [Next release](README.md#next-release)

- ⏳ MW.0c Add Reader and Editor access levels
  - Builds: public/unauthenticated Reader where enabled; GitHub-authenticated Editor; optional no-login Editor access for localhost or configured CIDRs; login/logout UI and visible current role
  - Depends: MW.0, MW.0a, MW.0b, [№Q-W8](QUESTIONS.md#Q-W8)
  - Acceptance: Viewer always authorizes Reader only, regardless of login, CIDR or stored root mode
  - Acceptance: Workspace read routes remain available to Reader according to the existing network/host policy; document write and git mutation routes require Editor
  - Acceptance: effective write requires Workspace mode + root RW + user project grant RW + actor Editor; every server mutation checks all four and stale/direct requests cannot bypass them
  - Acceptance: Settings can optionally grant Editor without login to loopback and explicit intranet CIDRs; unmatched addresses remain Reader until login
  - Acceptance: trusted edit CIDRs reuse strict CIDR parsing and never trust forwarding headers unless a separately configured trusted proxy supplies them
  - Acceptance: GitHub OAuth validates callback state and immutable provider identity server-side; session cookies are Secure on HTTPS, HttpOnly, SameSite and revocable
  - Acceptance: Reader UI removes edit/Q&A/task/git mutation actions and shows a Login to edit action; successful login upgrades the live page without losing location or drafts
  - Acceptance: the author-name cookie remains attribution only and cannot grant Editor; authentication and displayed author are tested independently
  - Acceptance: route tests cover Reader, login Editor, trusted-CIDR Editor, RO root, Viewer override, logout/revocation, CSRF and multiple users
  - Home: [Next release](README.md#next-release)

- ⏳ MW.0d Add user management and per-project grants
  - Builds: Settings UI, matching CLI and protected APIs to add users by GitHub username, edit status/grants, disable and remove them; GitHub OAuth login; instance `ACCESS`; per-canonical-root `RO` / `RW` grants; known-users-only admission; optional trusted localhost/CIDRs
  - Depends: MW.0b, MW.0c, [№Q-W8](QUESTIONS.md#Q-W8)
  - Acceptance: normal Add user has one required field, GitHub username; an authorized owner can inspect its resolved GitHub identity, edit status/grants, disable or remove the user and inspect effective access
  - Acceptance: adding a user from one project's access UI gives that project an RW grant by default; adding from global user management creates ACCESS and leaves project grants to the project-grant control
  - Acceptance: grants and audit identity use provider + immutable GitHub user ID; the current username can refresh after rename without losing/transferring access
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
  - Acceptance: removing a user or grant never rewrites/deletes their earlier Markdown attribution or audit records
  - Acceptance: user names and project names are display metadata; grants are keyed by stable user ID and canonical root identity
  - Acceptance: tests cover OAuth state/callback failure, unknown GitHub user, username rename, multiple users, duplicate display names, session revocation, every grant transition, trusted/untrusted sources, Viewer, root RO and project removal
  - Home: [Next release](README.md#next-release)

- ⏳ MW.0e Add the four supported access profiles
  - Builds: first-class persisted `personal`, `open-viewer`, `private-viewer` and `team` profiles in onboarding, Settings and CLI; one shared enforcement model beneath them
  - Depends: MW.0, MW.0b, MW.0c, MW.0d, [№Q-W6](QUESTIONS.md#Q-W6)
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

- ⏳ MW.1 Add the AI installation runbook and managed workspace convention
  - Builds: `install.md`; `~/mdhouse/<project>` as the standard always-RW development workspace
  - Depends: MW.0, [№Q-W1](QUESTIONS.md#Q-W1), [№Q-W2](QUESTIONS.md#Q-W2)
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

- ⏳ MW.1a Add optional human names for project directories
  - Builds: project display-name metadata keyed by canonical root path; a Project name field in the Settings directory editor; CLI `--name`
  - Acceptance: `mdhouse ~/mdhouse -p --name "All MDHouse Projects"` saves that human name for the canonical directory
  - Acceptance: `--name` requires exactly one named directory; ambiguous multi-directory use is refused with a useful error
  - Acceptance: Settings can add or edit the name; saving an empty value, or CLI `--name reset`, deletes the override and restores the directory-derived label
  - Acceptance: the human name appears in the root switcher, Settings, home/project headings and Agent Bus control inventory; the real path remains visible where needed
  - Acceptance: changing the name updates open tabs live but does not change the filesystem path, root ID, document URLs, views, marks or per-space config keys
  - Acceptance: names are trimmed, length-limited and rendered as text; prefs migration and duplicate human names are covered by tests
  - Home: [Workspace](README.md#workspace)

- ⏳ MW.2 Make Agent Bus work out of the box
  - Builds: install-time Agent Bus setup; a connected mdhouse project ready to ask an agent; optional Agent Bus endpoint and default agents per space/root
  - Depends: MW.1, MW.1a
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

- ⏳ MW.2a Connect existing Agent Bus RAG sources
  - Why: Agent Bus already provides RAG; mdhouse should integrate it instead of building another ingestion/indexing stack
  - Builds: list allowed Agent Bus RAG sources; per-space/project source defaults; request/flow source selection; citations/provenance in generated Markdown
  - Depends: MW.2 and verification of the Agent Bus source-list/request contract
  - Acceptance: mdhouse sends stable source IDs rather than source credentials or copied backend configuration
  - Acceptance: unavailable or unauthorized sources are visible and fail explicitly without silently running against a different source
  - Acceptance: user project grants and Agent Bus source authorization are checked independently; a RAG selection grants no mdhouse filesystem access
  - Acceptance: manual requests and scheduled flows use the same selection contract and record the effective sources in run history/output
  - Non-goal: native mdhouse ingestion, embeddings, indexing, retrieval or RAG source administration
  - Home: [Agent Bus control](README.md#agent-bus-control)

## W2 — Existing projects

- ⏳ MW.3 Build the shared flow runtime for existing projects
  - Builds: discoverable packages of Markdown documents plus routing; common scope, change range, audience, output and destination controls; optional schedules; run history
  - Depends: MW.2
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

- ⏳ MW.3a Add Documentation flows
  - Builds: generate/update; subsystem decomposition and deep docs; summaries; refresh/verify; audience overview; documentation architecture and trust report
  - Depends: MW.3
  - Acceptance: scope can be whole project, subsystem, aspect, path or change timeframe; audience can be executive, marketing/product, development, QA, operations, security or custom
  - Acceptance: refresh cites code/config/API/change evidence, distinguishes verified claims from inference and reports unresolved contradictions
  - Acceptance: generated docs can be organized as tutorial, how-to, reference or explanation rather than one undifferentiated document
  - Home: [Documentation](README.md#documentation)

- ⏳ MW.3b Add Recent commits review
  - Builds: project/user/developer/operations change summaries; changelog; author review; error and risk findings; task/ticket generation; plan-vs-delivery report
  - Depends: MW.3
  - Acceptance: run by range, author, branch, subsystem or week/month; the same document/routing package runs manually or on its optional schedule
  - Acceptance: author reports show commits/files/LoC and a factual work summary, and explicitly do not turn LoC into a productivity score
  - Acceptance: findings carry evidence and severity; filing tickets is optional, previewed and provider-neutral
  - Home: [Recent commits review](README.md#recent-commits-review)

- ⏳ MW.3c Add Pull request and incoming-change flows
  - Builds: intake summary; ownership/impact routing; review; feedback resolution; merge-readiness gate; confirmed merge; post-merge docs/tasks
  - Depends: MW.3
  - Acceptance: review covers correctness, tests, security, dependency changes, compatibility, docs and operational risk
  - Acceptance: merge readiness shows checks, conflicts, required reviews, unresolved threads, migrations, release notes and rollback notes
  - Acceptance: mdhouse never merges from an automated review alone; merge is a separate explicitly confirmed action with provider response recorded
  - Home: [Pull requests and incoming changes](README.md#pull-requests-and-incoming-changes)

- ⏳ MW.3d Add all Engineering and operations flow packages
  - Builds: Release readiness; Architecture and ownership; Project health; Onboarding and handoff; Incident/regression investigation; Requirements and delivery sync; API/schema impact; Maintenance/debt sweep
  - Depends: MW.3
  - Acceptance: every flow has useful default scope/output, evidence requirements, approval boundaries and a small example; each can run manually or on an optional schedule
  - Home: [Engineering and operations flows](README.md#engineering-and-operations-flows)

- ⏳ MW.3e Add Business and Ideas flow packages
  - Builds: Business overview; Strategy/planning; Market/customer brief; KPI/operating review; Decision memo; Idea capture; research/synthesis; prioritization; experiment design; idea-to-project
  - Depends: MW.3
  - Acceptance: Business flows separate evidence, assumptions, decisions and follow-up; Ideas flows preserve rejected alternatives and can promote a selected idea into a project/plan
  - Home: [Business flows](README.md#business-flows), [Ideas flows](README.md#ideas-flows)

- ⏳ MW.3f Add Finance flow packages
  - Builds: Budget/forecast; Variance/management report; Unit economics/pricing; Cash/runway; Financial document review
  - Depends: MW.3
  - Acceptance: outputs cite inputs, expose formulas/assumptions, label estimates and scenarios, and require human approval for consequential actions
  - Acceptance: flows never initiate payments, move funds or present drafts as financial advice
  - Home: [Finance flows](README.md#finance-flows)

- ⏳ MW.3g Add Legal flow packages
  - Builds: Contract review; Obligation/renewal register; Policy/compliance review; Legal change impact; Legal request brief
  - Depends: MW.3
  - Acceptance: outputs preserve source references, confidentiality boundaries and uncertainty; interpretation and external actions require a qualified human
  - Acceptance: flows never file, sign, accept terms or present drafts as legal advice
  - Home: [Legal flows](README.md#legal-flows)

## W3 — New projects

- ⏳ MW.4 Create new AI projects from the web UI
  - Builds: workspace creation; project initialization; `Plans/`; markup and review skills; Agent Bus connection; first flow
  - Depends: MW.1, MW.2, MW.3
  - Acceptance: a new project is created under `~/mdhouse/`, opens writable and can immediately run its first review or feature flow with Parf's conventions
  - Home: [New-project flow](README.md#new-project-flow)

## W4 — Full-document editing

- ⏳ MW.5 Add a real Markdown editor for complete documents
  - Builds: edit the full source document; save; preserve the draft on stale writes; document diff, history and commit
  - Acceptance: a writable document can be edited end to end; a concurrent file change is refused without losing the draft; a read-only root cannot save
  - Home: [Full Markdown editor](README.md#full-markdown-editor)

- ⏳ MW.5a Make the external edit-link scheme configurable
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

- ⏳ MW.5b Keep mdhouse controls out of copied document text
  - Why: selecting a rendered heading currently copies injected controls such as `#`, `✎`, `↓` and `⇊` together with the authored title
  - Builds: one copy-exclusion contract for mdhouse-injected heading links, edit/add actions, badges and other document controls
  - Acceptance: normal selection and Copy produce the authored document text without mdhouse UI chrome
  - Acceptance: a `#`, `✎`, `↓`, `⇊` or badge-like glyph that actually exists in the source Markdown is still copied
  - Acceptance: keyboard and context-menu Copy behave the same in supported Chrome, Edge and Safari; Firefox has a safe documented fallback
  - Acceptance: controls remain visible, focusable, accessible and clickable; copy exclusion does not remove their accessible names
  - Acceptance: rendering/UI tests cover a heading, Q&A item, multi-block selection and source-authored control glyphs
  - Home: [Full Markdown editor](README.md#full-markdown-editor)

- ⏳ MW.5c Make the primary workspace journey usable on iPad and phone
  - Why: Personal Workspace may run remotely so one owner can develop from a tablet or phone without an AI CLI or separate Markdown editor
  - Builds: responsive and touch-usable project/document navigation, Agent Bus work, Q&A, flows, full Markdown editing, diff/review and commit actions
  - Acceptance: no critical action depends only on hover, right-click, a hardware keyboard or a desktop-width panel
  - Acceptance: touch targets, focus behavior, virtual-keyboard layout, draft preservation and panel transitions work in supported mobile Safari and Chrome
  - Acceptance: the owner can open a remote Personal Workspace, authenticate when configured, ask an agent, edit/save Markdown, inspect the diff and commit from an iPad
  - Acceptance: a phone can perform the same primary journey with an intentionally compact layout; large diffs/documents may use progressive disclosure without removing actions
  - Acceptance: desktop shortcuts remain enhancements and every shortcut-only action gains a visible touch control
  - Acceptance: responsive UI tests and a documented manual device matrix cover iPad landscape/portrait and representative phone widths
  - Home: [Full Markdown editor](README.md#full-markdown-editor)

## W5 — Agent Bus control

- ⏳ MW.7 Let Agent Bus control a mdhouse workspace
  - Main goal: an Agent Bus command opens one specific Markdown file in mdhouse
  - Builds: a small versioned, typed Agent Bus control API; list control IDs; add project/directory; set its allowed config; open document; structured reply and errors
  - Depends: MW.0, MW.0b, MW.2, [№Q-W7](QUESTIONS.md#Q-W7)
  - Acceptance: the inventory response gives Agent Bus the available `rootId` values and connected `clientId` values with enough labels/current state to choose them
  - Acceptance: an authorized AB sender supplies `rootId`, Markdown `path` and destination `clientId`; mdhouse resolves the document through `Registry.resolve()`, returns its canonical page URL and directs only that browser/tab to it
  - Acceptance: there is no pairing step and no broadcast fallback; an unknown or disconnected `clientId` returns the URL with `opened: false`
  - Acceptance: one command can add a new project directory, choose saved/session and RW/RO, apply its per-space Agent Bus endpoint/defaults, then open a named Markdown file in it
  - Acceptance: project add uses the same canonical registration path as CLI and Settings; symlinks and document paths cannot escape the added root
  - Acceptance: config is a documented allowlisted schema, not an arbitrary prefs patch; unknown keys and invalid combinations are refused without partial changes
  - Acceptance: control senders are explicitly authorized; ordinary agents cannot add filesystem roots, grant RW or change instance access config merely because they can answer a page request
  - Acceptance: add + configure + open is atomic from the caller's view: failure reports the exact step and does not leave a half-configured project
  - Acceptance: control IDs are opaque identifiers, not credentials; authorization is checked independently on inventory and command requests
  - Acceptance: commands are idempotent by request id, produce an audit record, and have integration tests for replay, denial, path escape, stale client IDs, multiple roots and multiple browsers
  - Home: [Agent Bus control](README.md#agent-bus-control)

## Gate

- ⏳ MW.6 Review the complete workspace flow
  - Depends: MW.0a, MW.0b, MW.0c, MW.0d, MW.0e, MW.1, MW.1a, MW.2, MW.2a, MW.3, MW.3a, MW.3b, MW.3c, MW.3d, MW.3e, MW.3f, MW.3g, MW.4, MW.5, MW.5a, MW.5b, MW.5c, MW.7
  - Acceptance: a fresh install creates a project, connects an agent, runs a project flow, edits a document, reviews the diff and deploys without leaving mdhouse for coordination
  - Acceptance: an owner adds only a GitHub username, the user authenticates through GitHub, receives the project as RW by default, changes to RO, then is removed; UI, active sessions and direct APIs enforce every transition immediately
  - Acceptance: an Agent Bus request and a scheduled flow can use an allowed existing RAG source and record source identity/citations without exposing credentials
  - Acceptance: Personal Workspace, Open Viewer, Private Viewer and Team Workspace each pass their full admission/read/write matrix, including trusted-network variants and profile switching
  - Acceptance: the remote Personal Workspace journey passes on iPad and a representative phone viewport without requiring a hardware keyboard, AI CLI or external editor
