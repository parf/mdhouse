# TODO — Release 3: Paradigm Shift

Release scope: [`README.md`](README.md). Detailed Workspace implementation backlog:
[`workspaces/TODO.md`](workspaces/TODO.md).

This file tracks release outcomes. A lower-level `MW.*` task may support more than one R3 group;
finishing that implementation task does not close a release outcome until the outcome is verified as
part of the complete product journey.

## R3.1 — Product identity

- ⏳ R3.1 Establish mdhouse as a Markdown-native work environment
  - Builds: one product model and vocabulary across onboarding, Settings, CLI, README, package copy
    and release notes
  - Builds: mdhouse as the normal human interface, with the product goal of replacing direct
    Claude/AI CLI use and separate Markdown-editor use
  - Includes: projects/spaces, Workspace/Viewer, Personal/Team, Reader/Editor and Markdown-native
    flows
  - Acceptance: no primary surface describes R3 as only a viewer or presents editing, agents and
    flows as unrelated add-ons
  - Acceptance: the fresh-install journey explains what mdhouse is, what adding a project grants and
    how to choose Workspace or Viewer
  - Acceptance: the normal end-to-end journey can be completed without opening an AI CLI or external
    Markdown editor; specialized and recovery paths may still use them
  - Acceptance: a single owner can run Personal Workspace locally without login or remotely with
    optional GitHub login/trusted-network admission, including from an iPad or phone
  - Tracks: [`MW.0`](workspaces/TODO.md#w0-workspace-by-default)
  - Home: [The paradigm shift](README.md#the-paradigm-shift)

## R3.2 — Workspaces and access

- ⏳ R3.2 Ship the Workspace/Viewer and Reader/Editor model
  - Depends: R3.1
  - Builds: Workspace by default; explicit hard-RO Viewer; per-root RW/RO; per-user project grants;
    safe migration; server-side effective-write authorization
  - Acceptance: effective write requires Workspace + RW root + user project grant RW + Editor actor
  - Acceptance: Viewer removes write UI and refuses stale/direct/API mutations without erasing saved
    root modes
  - Acceptance: upgrading never silently makes an existing root writable
  - Acceptance: Settings, onboarding and CLI expose Personal Workspace, Open Viewer, Private Viewer
    and Team Workspace with the same enforcement semantics
  - Tracks: [`MW.0`, `MW.0c`, `MW.0d`, `MW.0e`](workspaces/TODO.md#w0-workspace-by-default)
  - Home: [Product identity, workspaces and access](README.md#r3-1-r3-2-product-identity-workspaces-and-access)

## R3.3 — Projects and setup

- ⏳ R3.3 Make existing and new projects ready to work
  - Depends: R3.2
  - Builds: AI-executable `install.md`; `~/mdhouse/<project>` convention; web/CLI directory
    management; optional project names; new-project creation
  - Acceptance: a clean account can create or add a named project, choose its access, save it and
    open it without assembling unrelated CLI/config steps
  - Acceptance: web and CLI use the same canonical root-registration path and project identity
  - Acceptance: a newly created project starts with Plans, skills, Agent Bus and a first flow
  - Tracks: [`MW.1`, `MW.1a`, `MW.4`](workspaces/TODO.md#w1-install-and-connect)
  - Home: [Projects, installation and connection](README.md#r3-3-projects-installation-and-connection)

## R3.4 — Markdown interaction

- ⏳ R3.4 Make a document a complete, clean work surface
  - Depends: R3.2
  - Builds: full-source Markdown editing; existing focused markup actions; stale-draft preservation;
    diff/history/commit; configurable external-editor scheme; content-clean Copy
  - Acceptance: an Editor can change and review a complete document without losing focused Q&A,
    task and insertion workflows
  - Acceptance: the normal complete-document workflow requires no external Markdown editor;
    specialized and recovery work may use the optional external edit link
  - Acceptance: concurrent changes refuse the stale save and preserve the draft
  - Acceptance: copied document selections exclude mdhouse controls such as injected `#`, `✎`, `↓`
    and `⇊`, while identical source-authored glyphs remain content
  - Acceptance: the primary agent/document/edit/review journey is responsive and touch-usable on
    iPad and phone; no critical action is hover-only or keyboard-only
  - Tracks: [`MW.5`, `MW.5a`, `MW.5b`, `MW.5c`](workspaces/TODO.md#w4-full-document-editing)
  - Home: [Complete Markdown interaction and editing](README.md#r3-4-complete-markdown-interaction-and-editing)

## R3.5 — Agent collaboration

- ⏳ R3.5 Make Agent Bus a native project capability
  - Depends: R3.2, R3.3
  - Builds: out-of-box connection; instance and per-space endpoints/defaults; explicit target
    precedence; typed authorized mdhouse control API
  - Acceptance: a project can ask the intended agent without a separate integration pass
  - Acceptance: the normal agent workflow lets a user start, follow, answer and continue work without
    opening Claude Code or another AI CLI directly
  - Acceptance: explicit panel target → document `<!-- AB: name -->` → space default → instance
    default, with no silent fallback from an unavailable higher-priority target
  - Acceptance: an authorized command can add/configure a project and open one jailed Markdown path
    in one named connected browser, idempotently and auditably
  - Tracks: [`MW.2`, `MW.2a`, `MW.7`](workspaces/TODO.md#w1-install-and-connect)
  - Home: [Agent collaboration and control](README.md#r3-5-agent-collaboration-and-control)

- ⏳ R3.5a Connect existing Agent Bus RAG sources
  - Why: Agent Bus already supplies RAG, so mdhouse needs a thin source-selection/request integration
    rather than its own RAG implementation
  - Builds: discover allowed sources; select defaults per space/project; attach stable source
    IDs to Agent Bus requests and flows; retain citations/provenance in Markdown output
  - Boundary: Agent Bus owns ingestion, embeddings, retrieval, credentials and source administration
  - Acceptance: source availability is visible; missing/denied sources fail explicitly;
    project grants and Agent Bus authorization remain enforced independently
  - First step: verify and document the Agent Bus source-list and request contract
  - Tracks: [`MW.2a`](workspaces/TODO.md#w1-install-and-connect)
  - Home: [Connected Agent Bus RAG sources](README.md#connected-agent-bus-rag-sources)

## R3.6 — Flows and automation

- ⏳ R3.6 Build the shared Markdown flow runtime
  - Depends: R3.3, R3.5
  - Builds: editable document/routing packages; common inputs; manual and optional scheduled runs;
    run history; provider adapters; previews and approvals
  - Acceptance: work, evidence, questions, decisions, transitions, approvals and outcomes remain
    inspectable and resumable in project Markdown
  - Acceptance: missing targets, loops, overlapping schedules and partial routes fail visibly without
    dropping or duplicating work
  - Acceptance: every generated document uses full `last-commit-id`; **since last run** advances its
    marker only after the whole run succeeds
  - Tracks: [`MW.3`](workspaces/TODO.md#w2-existing-projects)
  - Home: [Flow platform](README.md#r3-6-r3-7-flow-platform-and-built-in-flow-library)

## R3.7 — Built-in flow library

- ⏳ R3.7 Ship a useful first version of every planned flow family
  - Depends: R3.6
  - Builds: Feature and delivery; Documentation; Recent commits; PR/incoming changes; Engineering and
    operations; Business; Ideas; Finance; Legal
  - Acceptance: every package has useful default inputs/output, evidence expectations, approval
    boundaries, one small example and manual/optional scheduled execution
  - Acceptance: ticketing, merge, deploy, financial and legal consequences remain separate,
    explicitly confirmed actions
  - Tracks: [`MW.3a`–`MW.3g`](workspaces/TODO.md#w2-existing-projects)
  - Gap: Feature and delivery still needs its own `MW.3x` task or explicit acceptance under `MW.3`
  - Home: [Built-in flow library](README.md#r3-6-r3-7-flow-platform-and-built-in-flow-library)

## R3.8 — Plans, markup and skills

- ⏳ R3.8 Turn the working conventions into a product protocol
  - Depends: R3.1
  - Builds: immutable installed reference root; current plan/markup/syntax documentation; shareable
    skills; project initialization; flow packages using the same visible states
  - Acceptance: a person or any compatible agent can inspect and continue work from project Markdown
    without private orchestration state
  - Acceptance: reference material is current and immutable; project documents remain ordinary,
    editable, versioned project files
  - Tracks: [`MW.1`, `MW.4`](workspaces/TODO.md#w1-install-and-connect)
  - Home: [Plans, markup, skills and reference material](README.md#r3-8-plans-markup-skills-and-reference-material)

## R3.9 — Team collaboration

- ⏳ R3.9 Make one mdhouse safe and understandable for a team
  - Depends: R3.2
  - Builds: Personal zero-config default; Team setup; GitHub OAuth login; user add/edit/remove by
    GitHub username; per-browser fallback author; Reader/Editor sessions; per-project RO/RW grants;
    known-users-only mode; optional trusted localhost/CIDRs; visible identity/role; attributable actions
  - Acceptance: an owner can add, edit, disable and remove a user and manage that user's project
    grants; a newly added project grant defaults to RW and can be changed to RO
  - Acceptance: normal Add user requires only a GitHub username; local username/password accounts
    are secondary Advanced compatibility/recovery configuration
  - Acceptance: teammates authenticate through GitHub and sign work as their GitHub username without
    identity itself granting project permission
  - Acceptance: grants bind to immutable GitHub user ID; a username rename refreshes display identity
    without losing grants or transferring access to a later owner of the old username
  - Acceptance: no grant hides/refuses the project; RO grants cannot mutate; RW grants remain subject
    to Workspace mode, root RW and stale-write checks
  - Acceptance: the instance can admit known users only, optionally also admitting trusted localhost
    or configured CIDRs without weakening access for other addresses
  - Acceptance: removing/denying a user or grant revokes active access without erasing authored
    Markdown or audit history
  - Acceptance: concurrent edits preserve the losing draft and never overwrite newer content
  - Tracks: [`MW.0a`, `MW.0b`, `MW.0c`, `MW.0d`, `MW.0e`](workspaces/TODO.md#w0-workspace-by-default)
  - Home: [Team collaboration](README.md#r3-9-team-collaboration)

## R3.10 — Safety, migration and compatibility

- ⏳ R3.10 Preserve hard boundaries across every new capability
  - Runs across: R3.2–R3.9
  - Builds: permission matrix tests; canonical-path and symlink tests; immutable reference-root checks;
    same-origin/session security; prefs/access migration; external-action failure recovery
  - Acceptance: all request-derived paths resolve through the jail and no root/config/control path
    enables access outside an explicit grant
  - Acceptance: credentials remain server-side and actor identity, role and project access are tested
    independently
  - Acceptance: live updates remain `fs.watch` → WebSocket with no polling
  - Acceptance: Personal/Team, Workspace/Viewer, Reader/Editor, RW/RO, saved/session and
    connected/disconnected combinations have explicit expected behavior, including per-project user
    grants and trusted-source admission
  - Home: [Safety, migration and compatibility](README.md#r3-10-safety-migration-and-compatibility)

## Release gate

- ⏳ R3.G Review the complete Paradigm Shift journey
  - Depends: R3.1, R3.2, R3.3, R3.4, R3.5, R3.5a, R3.6, R3.7, R3.8, R3.9, R3.10
  - Acceptance: fresh install → create/add project → connect agent → run flow → edit document →
    review diff/history → explicitly perform the next delivery action
  - Acceptance: the normal primary journey uses mdhouse as both the AI-agent interface and the
    Markdown editor; specialized and recovery paths may still leave mdhouse
  - Acceptance: the agent journey selects an existing allowed RAG source and preserves effective
    source IDs and citations/provenance in Markdown/run history
  - Acceptance: the journey passes in personal Workspace, Team Workspace, RO-root and Viewer
    configurations, including stale tabs and direct API attempts
  - Acceptance: the Team journey adds one GitHub username, authenticates it through GitHub, grants a
    project with default RW, changes it to RO, removes it and verifies immediate session/API
    enforcement at each step
  - Acceptance: unavailable agents, failed routes, rewritten Git history, disconnected clients and
    partial external actions retain recoverable state and precise errors
  - Detailed Workspace gate: [`MW.6`](workspaces/TODO.md#gate)
  - Home: [Release gate](README.md#release-gate)
