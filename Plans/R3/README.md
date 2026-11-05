# Release 3 — Paradigm Shift

R3 is not a collection of viewer improvements. It changes what mdhouse is: from a tool that renders
Markdown and offers selected write actions into the primary environment where people and AI agents
organize projects, work through structured Markdown, collaborate, edit, review and deliver.

R3's product ambition is for mdhouse to replace direct use of Claude and other AI command-line
interfaces, and to replace a separate Markdown editor for normal project work. The browser becomes
the human interface for both: agents are selected, instructed and followed through mdhouse, while
Markdown is read and edited in the same workspace. AI CLIs may still run behind Agent Bus and an
external editor remains an optional escape hatch. R3 attempts to make neither necessary in the
normal journey without claiming that every specialized use is covered immediately.

The Markdown workspace is one major R3 program, not the name or full boundary of the release. Its
detailed plan now lives under [`workspaces/`](workspaces/README.md). This document is the release
umbrella: it explains the paradigm change, summarizes every known change group and separates the
shared R3 outcome from each program's implementation plan.

Release work is tracked in [`TODO.md`](TODO.md).

Detailed Workspace requirements and acceptance criteria remain in
[`workspaces/TODO.md`](workspaces/TODO.md); rationale and settled choices are in
[`workspaces/README.md`](workspaces/README.md) and
[`workspaces/DECISIONS.md`](workspaces/DECISIONS.md); question history is in
[`workspaces/QUESTIONS.md`](workspaces/QUESTIONS.md).

## The paradigm shift

R3 moves mdhouse across several boundaries at once:

| Before R3 | R3 direction |
| --- | --- |
| Markdown viewer with a few write actions | Markdown-native work environment |
| Files and directories are content to browse | Directories are named projects/spaces with configuration and capabilities |
| Personal local tool | Personal by default, intentionally team-ready |
| One server-wide author identity | Per-browser people, authenticated roles and attributable collaboration |
| Read-only by default, terminal grants exceptions | Explicitly added projects are workspaces by default; Viewer is the explicit hard-RO mode |
| Agent chat attached to a page | Agents participate in routable, resumable project flows and can control a selected workspace/browser |
| Claude/AI CLI is the user's agent interface | mdhouse aims to be the user's agent interface; AI CLIs become replaceable execution backends |
| Individual Q&A, checkbox and insert operations | Complete Markdown editing while focused markup actions remain available |
| A separate Markdown editor is required for full changes | mdhouse aims to be the complete Markdown editor; external editors are optional integrations |
| One-off AI requests | Reusable document packages with routing, schedules, evidence and Git checkpoints |
| Plans and markup are repository conventions | Plans, markup, skills and reference material become product-level operating protocols |
| Project delivery happens around mdhouse | Planning, review, editing and delivery coordination happen through mdhouse |

The common idea is that **Markdown becomes both the durable artifact and the visible workflow
state**, and mdhouse becomes the primary user interface around it. mdhouse aims to replace the direct
AI CLI and Markdown-editor experience; it orchestrates rather than replaces Git, Agent Bus and
external issue trackers.

## Release outcome

After R3, a new user can install mdhouse, create or add a project, open it as a writable workspace,
work with AI agents without opening an AI CLI, edit complete documents without opening a separate
Markdown editor, review the change and coordinate delivery. The same instance can be exposed to a
team with public Reader access and controlled Editor access, or configured as a hard read-only
Viewer.

R3 keeps four boundaries visible:

- adding a root grants mdhouse access only inside that root; the realpath jail remains the filesystem
  boundary;
- effective write access requires Workspace mode, an RW root, a user project grant RW and an Editor
  actor;
- analysis and document generation do not silently perform consequential actions such as filing a
  ticket, merging, deploying, signing or paying;
- flow state, evidence, decisions, routing and outcomes remain inspectable in Markdown rather than
  hidden in an orchestration service.

## Change groups at a glance

| Group | Outcome | Main work |
| --- | --- | --- |
| R3a — Product identity | mdhouse aims to become the primary project UI, not a larger viewer | replacement goal for direct AI CLI and Markdown-editor use, project/space concepts, coherent onboarding and language |
| R3b — Workspaces and access | Workspace is the default; Viewer and project access are explicit | modes, migration, user management, per-project RO/RW grants, Reader/Editor authorization |
| R3c — Projects and setup | A project becomes usable without a manual integration pass | AI installation runbook, directory management, project names and new-project creation |
| R3d — Markdown interaction | mdhouse aims to replace a separate Markdown editor | existing markup actions, full-document editor, stale-write safety, diff/history/commit, optional external editor |
| R3e — Agent collaboration | mdhouse aims to replace direct Claude/AI CLI interaction | out-of-box agent UI, per-space routing, explicit target precedence and mdhouse control API |
| R3f — RAG lifecycle | RAG is native to the R3 product through the Agent Bus RAG agent | ingestion, embeddings, indexing, retrieval, source administration and citations/provenance |
| R3g — Flows and automation | Projects gain reusable, inspectable workflows | document/routing runtime, optional schedules, run history, Git checkpoints and approval boundaries |
| R3h — Flow library | Common project and organizational work ships ready to run | feature, documentation, review, engineering, business, ideas, finance and legal packages |
| R3i — Plans, markup and skills | The working protocol is available wherever a project needs it | immutable reference root, project initialization, Plans convention, markup/review skills |
| R3j — Team collaboration | Multiple people can safely share one mdhouse | user CRUD, project grants, login, trusted networks, attribution and concurrency behavior |
| R3k — Safety and compatibility | The broader product retains mdhouse's hard boundaries | path jail, canonical roots, write authorization, same-origin protection, migration and explicit mutations |
| R3l — Complete journey | The pieces work as one product | install → project → agent → flow → edit → review → delivery validation |

## R3a–R3b — Product identity, workspaces and access

### Workspace and Viewer

Workspace becomes the default product mode. A directory explicitly added by the user is RW by
default; `--ro` opts that root out. There is no list of special protected user paths: the explicit
add is the grant, and canonical root resolution prevents access outside it.

Viewer remains a persisted, deliberately selected mode. It is a hard read-only presentation, not
just a different default: every root becomes effectively RO, write and interaction controls are
removed, and server mutation routes refuse requests from stale tabs or direct callers. Configured
per-root RW/RO choices are preserved so returning to Workspace restores the prior setup.

Existing installations must migrate without silently making a previously RO root writable.
Onboarding, Settings, CLI help, package copy and release notes must all describe the same mode model.

### Supported access profiles

R3 exposes four first-class access profiles. They are product-level presets over admission,
Workspace/Viewer and user/project grants, not four unrelated authorization implementations.

| Profile | Config value | Who enters | Effective project access |
| --- | --- | --- | --- |
| **Personal Workspace** | `personal` | One owner; login optional | RW by default; explicit root RO and immutable references remain RO |
| **Open Viewer** | `open-viewer` | Anyone who can reach the admitted host/network | RO for everyone; all write UI and routes disabled |
| **Private Viewer** | `private-viewer` | Approved GitHub users only | Granted projects are RO for everyone |
| **Team Workspace** | `team` | Approved GitHub users only | Per-user, per-project RO/RW grants |

`Personal Workspace` is single-owner, not localhost-only. The normal localhost installation needs no
login. A remote personal instance — for example on AWS, used from an iPad or phone — may require the
owner's GitHub login or rely on an explicitly trusted CIDR/VPN/reverse-proxy boundary. Binding beyond
loopback requires an explicit admission choice rather than silently publishing RW access. `Open
Viewer` means open only inside the configured host/CIDR boundary; it does not bypass trusted-host or
network policy.

Private Viewer and Team Workspace may optionally admit explicitly trusted localhost/CIDRs without
GitHub login. Settings then shows the profile as, for example, **Team Workspace + trusted network**
and requires an explicit project policy for those requests. Switching profiles previews the access
changes and asks for confirmation. Viewer profiles preserve stored root/user grants but cap them at
RO; returning to a Workspace profile makes the preserved grants effective again.

### Personal and shared use

Personal use stays zero-configuration and local. Shared use is represented by Private Viewer or
Team Workspace: both combine network exposure, GitHub authentication and browser identity into an
understandable profile, while their underlying admission, Viewer/Workspace and grant checks remain
independently enforced.

Personal Workspace also supports remote single-owner use. Login is optional at the profile level:
the owner may use GitHub login, or an explicitly configured trusted network. Local no-login remains
the zero-config default.

Authenticated Team users are identified by their GitHub username, for example `@octocat`, in Q&A
replies, document edits and audit history. A persistent per-browser author-name setting remains for
personal or explicitly trusted anonymous use instead of reusing the server owner's name for every
browser. It is attribution only: it cannot authenticate a user, override an authenticated GitHub
identity or grant Editor access.

### Reader and Editor

Reader and Editor are actor capabilities:

- Reader can browse content allowed by the instance's network and host policy;
- Editor can use document and Git mutation actions when the selected root is also RW;
- Viewer always reduces everyone to Reader, regardless of login, address or saved root mode;
- Open Viewer gives unauthenticated Reader access inside its admitted network;
- Private Viewer gives approved GitHub users Reader access to granted projects;
- Team Workspace derives Reader/Editor capability from each user's project grant;
- localhost and explicitly configured intranet CIDRs may optionally receive Editor without login.

Every server mutation enforces `Workspace + root RW + user project RW + actor Editor`. The UI
reflects the effective role, offers Login to edit, and removes unavailable mutation controls for
Readers. Login elevation must preserve the current page and drafts. Session cookies,
logout/revocation, CSRF, trusted-proxy behavior and multi-user isolation are part of this work.

### Users and project grants

Team Settings and matching CLI commands provide user management. The normal **Add user** form asks
for one value only: GitHub username. Normal Team login uses GitHub OAuth. mdhouse resolves the
supplied username to GitHub's immutable numeric user ID and stores provider + ID as the account
identity; the current username is display/routing metadata and may be refreshed after a GitHub rename
without losing grants or allowing the old name to inherit them. Status and project grants are edited
afterward; adding from a project's access panel grants that project as RW by default.

Local username/password accounts are secondary compatibility and recovery accounts. They live under
an explicit Advanced path, are not created by the normal Add user flow and are not part of standard
Team onboarding. Provider identity keeps local and GitHub accounts distinct even if their visible
names match.

Instance `ACCESS` allows that known GitHub user to sign in; access to project content is then granted
per canonical project/root as `RO` or `RW`. When an administrator adds a project grant, the form
defaults to `RW`, with `RO` available explicitly. No project grant means that project is not listed
and its routes are unavailable to that user.

A user-level `RW` grant is permission, not a way around project safety. Effective reading requires
instance admission plus a project grant. Effective writing requires all of: Workspace mode, root RW,
user project grant RW and an authenticated Editor session. Viewer or root RO reduces every user to
effective RO for that project. Changing a display name never changes grant identity.

Removing or disabling a user revokes their active sessions and future access without deleting their
existing authored Markdown or audit history. Editing or removing a project grant takes effect for
open tabs and direct API requests immediately.

The instance has an admission option for **known users only**. Localhost and explicitly configured
CIDRs may optionally be trusted as an alternative admission path; requests from everywhere else must
complete GitHub login as a known user. Trusted-source access is visible in Settings and receives an
explicit project access policy rather than silently inheriting an administrator's grants. Forwarded
client addresses are ignored unless a separately configured trusted proxy supplies them.

The GitHub OAuth authorization callback validates state and the returned GitHub identity on the
server, then creates mdhouse's secure, revocable session cookie. OAuth client secrets and tokens
never enter browser application state or project files. Existing local credentials and HTTP Basic
may remain for explicit Advanced compatibility and recovery, but they are not the normal Team web
login. This settles
[`Q-W8`](workspaces/QUESTIONS.md#Q-W8).

## R3c — Projects, installation and connection

### AI-executable installation

R3 adds `install.md`, a safe-to-repeat, step-by-step runbook an AI agent can execute. The standard
managed location is `~/mdhouse/<project>`, with managed projects ready for RW workspace use. A clean
account should reach an open writable sample or project without the user having to assemble CLI
flags and integrations manually.

Every instance also exposes a current immutable RO reference root from the installed package. It
contains the plan convention, markup and syntax documentation, and shareable skills needed to work
with mdhouse documents. It is not a user-added root and can never be promoted to RW.

### Directory management

CLI and web Settings edit one persisted root model in `prefs.json`. `Settings → Directories` gains
Add directory and uses the same canonical registration operation as the CLI. A root is added RW by
default in Workspace, with an explicit RO choice.

Directory rows use compact state/actions:

- a saved root has no saved badge;
- a session-only root shows `[unsaved]`; clicking it confirms and saves its current canonical path
  and access mode;
- every Workspace root shows `[RW]` or `[RO]`; clicking confirms and toggles immediately in both
  directions;
- saved-root changes persist, while unsaved-root changes remain in the session until saved;
- every row always shows `[AB]`; a configured per-space value appears beside it only when present;
- a legend explains `[unsaved]`, `[RW]` / `[RO]` and `[AB]`.

Open tabs receive live root-state changes, and write routes begin refusing immediately after a root
becomes RO. Viewer hides access toggles because its effective state is always RO.

### Project names

A root may have an optional human display name keyed by its canonical path. It can be supplied in
Settings or by CLI, for example `mdhouse ~/mdhouse -p --name "All MDHouse Projects"`. Empty/reset
removes the override.

Names appear in the root switcher, Settings, headings and Agent Bus inventory. They are display-only:
renaming never changes the filesystem directory, root ID, document URLs, views, marks or per-space
configuration keys. Duplicate names are allowed because identity remains path/ID based.

### Agent Bus out of the box

Installation leaves a project able to open Agent Bus, send a request and receive a reply. An
instance-wide endpoint and default agents are fallbacks; each canonical project root may override
its endpoint and default agents. Endpoint credentials remain server-side.

Endpoint selection and agent selection are independent. Agent targets resolve in this order:

1. explicit selection in the document's right panel;
2. document directive `<!-- AB: name -->`;
3. per-space defaults;
4. instance defaults.

A missing higher-priority target is shown as unavailable and is never silently replaced. Clearing
all fields in a space's `[AB]` editor deletes the override and restores fallback behavior, but the
button remains visible.

## R3g–R3h — Flow platform and built-in flow library

### Shared flow runtime

A flow is an editable package of Markdown documents plus routing, with optional scheduling. Common
inputs cover scope, change range, audience, output, destination, route and run mode. A route may hand
the next step to another document, a person or team, an Agent Bus target, or an allowlisted external
adapter.

The runtime records inputs, plan, evidence, findings, checks, decisions, approvals, transitions and
outcome in project Markdown/run history. Missing destinations and loops fail visibly. Manual and
scheduled runs use the same package; schedules show next/last execution, can be disabled without
deleting the flow, and cannot overlap for the same flow and space.

Every generated document records a full Git `last-commit-id`. A later **since last run** execution
processes `<last-commit-id>..HEAD` and advances the marker only after all document writes and routed
outputs succeed. Initial scope is explicit; rewritten-away history asks for a new baseline;
uncommitted changes are reported separately.

External mutations are separate, previewed actions. A report may propose an edit, ticket, merge or
deploy, but it does not execute one implicitly. Provider integrations are adapters, and every result
remains useful as Markdown without a connected tracker.

### Feature and delivery flows

The core delivery package covers:

- add a feature: clarify → plan → implement → test → review;
- review an existing project or selected subsystem;
- update → review → deploy, including readiness and rollback checks;
- start the next feature while carrying forward decisions and unresolved work.

This family is part of the R3 product scope and is currently described in the plan narrative, but it
does not yet have its own `MW.3x` item in `TODO.md`. Before implementation begins it must either gain
an explicit work item and acceptance criteria or be named as a concrete deliverable of `MW.3`.

### Documentation flows

Documentation flows generate and maintain a trustworthy system description:

- inventory a project, split it into meaningful subsystems, create deep documentation and summaries;
- refresh docs against current code, configuration, APIs and recent changes;
- generate audience-specific overviews for executives, product/marketing, development, QA,
  operations, security or a custom reader;
- limit work to a project, subsystem, aspect, path or timeframe;
- organize material as tutorials, how-to guides, reference and explanation;
- report missing coverage, duplication, orphaned pages, sources, owners, confidence and drift risk.

Refresh output distinguishes verified evidence from inference and leaves unresolved contradictions
visible.

### Recent commits review

Commit review runs manually or on a schedule for a range, author, branch, subsystem or timeframe. It
produces user-, developer-, operations- and project-facing summaries, release notes and documentation
drift findings. Author summaries include commits, files and LoC as factual context, never as a
productivity score.

The flow finds likely errors, regressions, risky hotspots, missing tests and incompatible API/config
changes; compares delivery with plans/issues; and may generate evidence-backed tasks. Filing tickets
is optional, previewed and provider-neutral.

### Pull requests and incoming changes

Incoming-change flows summarize intent, affected subsystems, owners, linked plans/issues and
user-visible impact. Review covers correctness, tests, security, dependencies, compatibility,
documentation and operational risk, then routes findings and tracks resolution/re-review.

Merge readiness reports conflicts, checks, required reviews, unresolved threads, migrations, release
notes and rollback notes. Merge is always a separate explicitly confirmed action whose provider
response is recorded. Post-merge work updates docs, changelog and linked tasks. The same model also
reviews vendor and upstream changes.

### Engineering and operations flows

R3 ships a first useful version of every planned engineering/operations package:

- **Release readiness** — breaking changes, migrations, rollout, observability, rollback and
  stakeholder brief;
- **Architecture and ownership** — subsystem, dependency and data-flow maps, ADR proposals,
  ownership gaps and routing;
- **Project health** — dependencies, vulnerabilities, licenses, flaky tests, CI drift, deprecated
  APIs and maintenance backlog;
- **Onboarding and handoff** — clean-account setup verification, role tours, glossary, first task and
  ownership/contact map;
- **Incident and regression investigation** — symptom/change correlation, timeline, reproduction,
  rollback, runbook updates and remediation;
- **Requirements and delivery sync** — compare plans, tickets, code, tests and docs for missing or
  stale coverage;
- **API/schema impact** — inventory endpoint, event, database/config schema and downstream-consumer
  changes, with compatibility/migration guidance;
- **Maintenance/debt sweep** — dead code, expired flags, TODO/FIXME clusters, duplication and
  abandoned docs, turned into small reviewable tasks.

Each package needs a useful default scope/output, evidence requirements, approval boundaries and a
small example, and must work both manually and on an optional schedule.

### Business flows

Business packages create source-backed working documents for product and company decisions:

- **Business overview** — product, customers, value, channels, revenue, costs, risks and priorities;
- **Strategy and planning** — goals, constraints, options, trade-offs, milestones, assumptions,
  owners and measurable outcomes;
- **Market/customer brief** — market, segment, customer and competitor evidence separated from
  assumptions and unanswered questions;
- **KPI/operating review** — targets, actuals, drivers, risks, decisions and follow-up for weekly,
  monthly or quarterly use;
- **Decision memo** — framing, alternatives, evidence, cost, risk, reversibility, recommendation and
  recorded final rationale.

### Ideas flows

Ideas packages move an unstructured thought toward validated work:

- capture the problem, audience, outcome, constraints and questions without prematurely selecting a
  solution;
- research related work, evidence and objections, cluster duplicates and create an opportunity brief;
- prioritize by impact, confidence, effort, urgency, strategic fit and reversibility while preserving
  the assumptions behind scores;
- design the smallest experiment with success and guardrail metrics, duration and decision rule;
- promote a selected idea into a project, plan or feature flow without losing rejected alternatives
  and unresolved questions.

### Finance flows

Finance packages cover budget/forecast, variance/management reporting, unit economics/pricing,
cash/runway and financial-document review. Outputs cite inputs, expose formulas and assumptions,
label estimates and scenarios, and require human approval for consequential action.

They produce analytical drafts and checklists. They never initiate payments, move funds or present
their output as financial advice.

### Legal flows

Legal packages cover contract review, obligation/renewal registers, policy/compliance comparison,
legal-change impact and legal-request briefs. Outputs preserve source references, uncertainty and
confidentiality boundaries.

They identify issues and prepare work for a qualified person. They never file, sign, accept terms or
present drafts as legal advice; interpretation and external communication require human approval.

## R3c — New-project creation

The web UI creates a new AI-ready project under `~/mdhouse/`, initializes it, adds the `Plans/`
convention and mdhouse markup/review skills, connects Agent Bus and starts the first selected flow.
The project opens writable and uses Parf's planning, markup and review conventions immediately,
without a second setup pass.

Project creation uses the same canonical directory registration, access modes, display names and
per-space Agent Bus configuration as existing-project setup. Partial initialization must be visible
and recoverable rather than leaving an apparently ready but inconsistent project.

## R3d — Complete Markdown interaction and editing

R3 adds a real full-source Markdown editor alongside the existing focused checkbox, Q&A and insert
actions. A writable Editor can change an entire document, save it, inspect its diff and history, and
commit from the document workflow.

This is the default complete editing experience, not a companion that requires Typora, VS Code or
another Markdown editor. External-editor links remain available for preference, specialized tools or
recovery, but the R3 journey and acceptance gate cannot depend on them.

The primary workspace journey is touch-usable and responsive on iPad and phone browsers: open a
project/document, work with agents, answer questions, run/review flows, edit Markdown and review or
commit changes. Critical actions cannot depend on hover or a hardware keyboard.

The editor preserves current safety contracts: all paths use the jail, only effective-RW documents
can be saved, concurrent file changes refuse a stale write without losing the draft, and live updates
continue through filesystem watch and WebSocket rather than polling.

Rendered-document copy is content-clean. Selecting and copying a heading, paragraph or larger range
copies the document text, not mdhouse's injected UI chrome: heading `#`, `✎`, `↓`, `⇊`, action labels,
badges and similar controls are excluded. Identical glyphs authored in the Markdown remain ordinary
content and are copied. The behavior must be reliable in the supported Chrome, Edge and Safari
targets, with Firefox degrading safely.

External-editor links remain available. Their URL scheme becomes configurable as
`settings.editScheme`, defaulting to `edit`. A user may register `mdedit:/path:line` for Typora while
keeping `edit:` for a common editor. Settings shows the scheme next to Edit link only while the link
is enabled; disabling hides but preserves the value. Scheme validation, migration, rendering,
keyboard behavior and platform documentation are included.

## R3e — Agent collaboration and control

mdhouse is the human-facing agent environment: people select agents, give them work, answer their
questions, inspect progress and continue routed flows without operating Claude Code or another AI
CLI directly. Agent Bus abstracts the execution backend so the visible workflow does not depend on
one vendor's terminal interface.

An authorized Agent Bus sender can use a small versioned typed control API to:

- list available project `rootId` values and connected browser/tab `clientId` values with useful
  labels and state;
- add a saved or session project directory with RW/RO selection;
- set an allowlisted subset of that project's configuration;
- open one specific jailed Markdown path in one explicitly selected connected browser/tab.

There is no pairing workflow and no broadcast fallback. The caller supplies `rootId`, `clientId` and
path. An unknown/disconnected client still receives the canonical URL with `opened: false`.

Control IDs are identifiers, not credentials. Authorization is checked separately, privileged
configuration is allowlisted, operations are idempotent by request ID, and commands produce an audit
record. Add + configure + open is atomic from the caller's point of view and reports the exact failed
step without leaving a half-configured project. All root and document paths reuse the same canonical
registration and resolution boundaries as CLI, Settings and HTTP.

### R3f — RAG through the Agent Bus RAG agent

R3 includes native RAG capability as part of the mdhouse product. The Agent Bus RAG agent provides
the backend lifecycle: source ingestion, chunking/embeddings, indexing, refresh/reindex, retrieval
and source administration. mdhouse provides the project-facing UI and flow integration instead of
implementing a second RAG stack inside the mdhouse process.

A space/project can add or select allowed sources, start and monitor ingestion/index jobs, see
progress/errors/freshness, refresh or remove an index, test retrieval and use the selected sources in
document requests and scheduled flows. Generated Markdown and run history record effective source
IDs, citations and provenance.

Agent Bus owns RAG storage, embeddings, indexes, retrieval execution and source credentials. mdhouse
uses the RAG agent's typed lifecycle/request API and displays its state. A user's project grant and
Agent Bus authorization apply independently; a RAG source never grants mdhouse filesystem access or
exposes server-side credentials. Verifying and documenting that Agent Bus API is the first
implementation step, not a reason to defer RAG beyond R3.

## R3i — Plans, markup, skills and reference material

R3 promotes the existing Plans convention, agent markup and review skills from useful repository
customs into a first-class working protocol:

- every mdhouse instance exposes a current immutable reference root with the plan convention,
  supported markup/syntax and shareable skills;
- a new AI project can install the Plans structure and the appropriate markup/review skills during
  creation;
- flow packages use ordinary Markdown documents and the same visible question, decision, finding,
  task, owner and status conventions;
- humans and different agent implementations can inspect and continue the work without access to
  private orchestration state;
- references stay versioned and read-only, while project copies and generated documents remain
  normal project-owned Markdown.

This is a product protocol, not a requirement that every repository use one rigid template. The
reference explains the common semantics; projects may extend their documents and route packages
without requiring a new mdhouse UI for each domain.

## R3j — Team collaboration

The team change is broader than adding login. One running mdhouse may serve several people who must
remain distinguishable and must not overwrite or impersonate each other:

- each browser has its own author attribution;
- authenticated people are identified by their current GitHub username and immutable GitHub ID;
- Reader/Editor capability is separate from the displayed author name;
- owners can add, edit, disable and remove known users;
- project access is granted per user as RO or RW, with new grants defaulting to RW;
- a Team setup joins listen/network policy, authentication and identity without changing the chosen
  Workspace/Viewer mode;
- the instance may admit known users only, optionally also trusting localhost or selected CIDRs;
- trusted local/CIDR editing is optional and explicit;
- concurrent changes retain stale-write refusal and preserve the losing browser's draft;
- login, logout, role and effective root access are visible in the UI;
- audit-relevant flow transitions and external actions record their initiating actor.

Personal use remains the default and must not acquire mandatory account setup. Team capability is an
additional deployment shape built from the same project, document and authorization model.

## R3k — Safety, migration and compatibility

Paradigm Shift expands what mdhouse can do, so existing boundaries become more important rather than
less important:

- every request-derived document path still enters through canonical root resolution and the
  realpath jail;
- symlinks cannot grant reads or writes outside an added root;
- an explicit root grant replaces path-specific protection lists, but does not weaken the jail;
- every mutation checks product mode, root mode and actor role on the server;
- the immutable reference root remains RO regardless of Workspace, CLI, prefs or control commands;
- state-changing browser requests retain same-origin/CSRF protection and trusted-host checks;
- credentials, Agent Bus endpoint tokens and password hashes remain server-side;
- flow analysis is separated from edits and external consequences, with preview and confirmation;
- Viewer, old saved roots and prefs migrate without silently expanding access;
- existing URLs, project IDs and config keys do not change when a project receives a human name;
- live updates continue through filesystem watch and WebSocket; R3 introduces no polling path;
- stale writes, failed routes and partial external actions preserve user work and report their exact
  state instead of guessing or silently continuing.

R3 testing therefore crosses modes and capabilities, not only features: Personal/Team,
Workspace/Viewer, Reader/Editor, RW/RO, saved/session roots, local/network access and connected/lost
Agent Bus clients.

## R3 delivery order

1. Establish the four access profiles, Workspace/Viewer migration and Reader/Editor authorization.
2. Add browser author identity and Personal/Team setup.
3. Ship the installation runbook, managed workspace convention and directory/project controls.
4. Make Agent Bus connection, per-space routing and the RAG agent lifecycle work out of the box.
5. Build the shared Markdown flow runtime, routing, scheduling and Git checkpoint semantics.
6. Ship the first version of every existing-project flow family.
7. Create new AI projects from the web UI using the same primitives.
8. Add full-document editing and configurable external-editor links.
9. Add the Agent Bus control API for project setup and targeted document opening.
10. Run the complete release gate across fresh install, personal, team, Viewer, RO and failure paths.

The order is architectural, not necessarily a single serial implementation plan. Flow templates can
be authored while runtime work proceeds, but no package is complete until it passes the shared
runtime and permission contracts.

## R3l — Release gate

R3 is complete when a fresh installation can:

1. start locally as a Personal Workspace without account setup, or run the same single-owner profile
   remotely with optional GitHub login/trusted-network admission from an iPad or phone;
2. create or add a named project with an explicit effective access state;
3. connect Agent Bus, address the intended agent, ingest/index an allowed RAG source and retrieve a
   cited result using the documented authorization;
4. run a project flow whose evidence, decisions, routing and Git checkpoint remain in Markdown;
5. edit the full document without bypassing path, role, root-mode or stale-write checks;
6. review the diff/history and explicitly perform the next delivery action;
7. expose the same instance as a Team workspace where Readers cannot mutate and Editors are
   individually authenticated, attributed and limited to their per-project grants;
8. add a user using only their GitHub username, authenticate them through GitHub, issue the default
   RW project grant, change it to RO and remove it, with each change taking effect immediately in UI,
   open tabs and direct API calls;
9. switch to Viewer and prove that UI, direct HTTP calls, stale tabs and Agent Bus control cannot
   write;
10. recover cleanly from unavailable agents, routing errors, rewritten Git history, disconnected
   browser IDs and partially failed external actions.

The access matrix is also tested directly: Personal Workspace, Open Viewer, Private Viewer and Team
Workspace, each with direct requests and stale tabs; trusted-network variants are tested separately.

The detailed Workspace dependency gate is [`MW.6`](workspaces/TODO.md#gate).

## Not in R3

The following are planned extensions after the workspace, flow and control primitives are stable:

- visual Agent Bus team building in web and CLI;
- a shared flow/template marketplace and broader package library;
- email and webhook triggers (manual and scheduled runs are in R3);
- controlled database access for AI scripts;
- broader automation audit/reporting beyond the R3 run history and control-command audit.

They remain recorded in [`workspaces/FUTURE.md`](workspaces/FUTURE.md) and should not
expand the R3 gate unless explicitly promoted.

## Open decisions and tracking gaps

- Feature and delivery flows need an explicit `MW.3x` task or an explicit inclusion in `MW.3` before
  work is estimated and assigned.
- R3 is intentionally broad. Scheduling should be based on vertical release slices and the complete
  gate, not on marking isolated UI controls or template files complete.
