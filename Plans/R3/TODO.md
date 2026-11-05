# TODO — Release 3: Paradigm Shift

Release scope: [`README.md`](README.md). Detailed Workspace implementation backlog:
[`workspaces/TODO.md`](workspaces/TODO.md).

This file tracks release outcomes. A lower-level `MW.*` task may support more than one R3 group;
finishing that implementation task does not close a release outcome until the outcome is verified as
part of the complete product journey.

Execution states and assignments: [`EXECUTION.md`](EXECUTION.md). Unchecked outcomes are planned.

## [№R3a](#R3a) — Product identity {#r3a-product-identity}

- [ ] R3a Establish mdhouse as a Markdown-native work environment <a id="R3a"></a>
  - Builds: one product model and vocabulary across onboarding, Settings, CLI, README, package copy
    and release notes
  - Builds: mdhouse as the normal human interface, with the product goal of replacing direct
    Claude/AI CLI use and separate Markdown-editor use
  - Builds: change R3 and later distributions to PolyForm Strict License 1.0.0, copyright Sergey
    Porfiriev, with the canonical text in `LICENSE.md`
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
  - Acceptance: `LICENSE.md`, README/license links, package metadata and packed npm contents all name
    PolyForm Strict License 1.0.0 and Sergey Porfiriev consistently; no R3-facing GPL metadata remains
  - Acceptance: `package.json` uses `SEE LICENSE IN LICENSE.md`; a package-content test proves the
    license file ships, and release notes call out the license change
  - Acceptance: existing tags/published versions are not rewritten and third-party license notices
    remain intact
  - Tracks: [№MW.L](workspaces/TODO.md#MW.L), [№MW.0](workspaces/TODO.md#MW.0)
  - Home: [The paradigm shift](README.md#the-paradigm-shift)

## [№R3b](#R3b) — Workspaces and access {#r3b-workspaces-and-access}

- [ ] R3b Ship the Workspace/Viewer and Reader/Editor model <a id="R3b"></a>
  - Depends: [№MW.0f](workspaces/TODO.md#MW.0f), [№MW.0g](workspaces/TODO.md#MW.0g), [№MW.0h](workspaces/TODO.md#MW.0h); [№R3a](#R3a) vocabulary alignment proceeds in parallel
  - Builds: Workspace by default; explicit hard-RO Viewer; per-root RW/RO; per-user project grants;
    safe migration; server-side effective-write authorization
  - Acceptance: effective write requires Workspace + RW root + user project grant RW + Editor actor
  - Acceptance: Viewer removes write UI and refuses stale/direct/API mutations without erasing saved
    root modes
  - Acceptance: upgrading never silently makes an existing root writable
  - Acceptance: Settings, onboarding and CLI expose Personal Workspace, Open Viewer, Private Viewer
    and Team Workspace with the same enforcement semantics
  - Tracks: [№MW.0](workspaces/TODO.md#MW.0), [№MW.0c](workspaces/TODO.md#MW.0c), [№MW.0d](workspaces/TODO.md#MW.0d), [№MW.0e](workspaces/TODO.md#MW.0e)
  - Home: [Product identity, workspaces and access](README.md#r3a-r3b-product-identity-workspaces-and-access)

## [№R3c](#R3c) — Projects and setup {#r3c-projects-and-setup}

- [ ] R3c Make existing and new projects ready to work <a id="R3c"></a>
  - Depends: [№R3b](#R3b)
  - Builds: AI-executable `install.md`; `~/mdhouse/<project>` convention; web/CLI directory
    management; optional project names; new-project creation
  - Acceptance: a clean account can create or add a named project, choose its access, save it and
    open it without assembling unrelated CLI/config steps
  - Acceptance: web and CLI use the same canonical root-registration path and project identity
  - Acceptance: a newly created project starts with Plans, skills, Agent Bus and a first flow
  - Tracks: [№MW.1](workspaces/TODO.md#MW.1), [№MW.1a](workspaces/TODO.md#MW.1a), [№MW.4](workspaces/TODO.md#MW.4)
  - Home: [Projects, installation and connection](README.md#r3c-projects-installation-and-connection)

## [№R3d](#R3d) — Markdown interaction {#r3d-markdown-interaction}

- [ ] R3d Make a document a complete, clean work surface <a id="R3d"></a>
  - Depends: [№R3b](#R3b)
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
  - Tracks: [№MW.5](workspaces/TODO.md#MW.5), [№MW.5a](workspaces/TODO.md#MW.5a), [№MW.5b](workspaces/TODO.md#MW.5b), [№MW.5c](workspaces/TODO.md#MW.5c)
  - Home: [Complete Markdown interaction and editing](README.md#r3d-complete-markdown-interaction-and-editing)

## [№R3e](#R3e) — Agent collaboration {#r3e-agent-collaboration}

- [ ] R3e Make Agent Bus a native project capability <a id="R3e"></a>
  - Depends: [№R3b](#R3b), [№R3c](#R3c)
  - Builds: out-of-box connection; instance and per-space endpoints/defaults; explicit target
    precedence; typed authorized mdhouse control API
  - Acceptance: a project can ask the intended agent without a separate integration pass
  - Acceptance: the normal agent workflow lets a user start, follow, answer and continue work without
    opening Claude Code or another AI CLI directly
  - Acceptance: explicit panel target → document `<!-- AB: name -->` → space default → instance
    default, with no silent fallback from an unavailable higher-priority target
  - Acceptance: an authorized command can add/configure a project and open one jailed Markdown path
    in one named connected browser, idempotently and auditably
  - Tracks: [№MW.2](workspaces/TODO.md#MW.2), [№MW.2a](workspaces/TODO.md#MW.2a), [№MW.7](workspaces/TODO.md#MW.7)
  - Home: [Agent collaboration and control](README.md#r3e-agent-collaboration-and-control)

- [ ] R3f Integrate the Agent Bus RAG agent lifecycle <a id="R3f"></a>
  - Depends: [№R3e](#R3e)
  - Why: the Agent Bus RAG agent already provides ingestion, embeddings, indexing and retrieval; R3
    should expose the complete capability instead of treating RAG as future work
  - Builds: per-space/project sources; add/select/remove; ingest; index/reindex; progress, errors and
    freshness; retrieval testing; request/flow source selection; citations/provenance in Markdown
  - Boundary: Agent Bus owns RAG storage, embeddings, indexes, retrieval execution, source
    credentials and lifecycle operations; mdhouse owns the user/project UI and orchestration
  - Acceptance: source and job state are visible; missing/denied/failed sources and jobs fail
    explicitly; project grants and Agent Bus authorization remain enforced independently
  - First step: owner provides the versioned [RAG contract](RAG-CONTRACT.md); per-project instances are intended, exact API/grants remain open
  - Tracks: [№MW.2a](workspaces/TODO.md#MW.2a)
  - Home: [RAG through the Agent Bus RAG agent](README.md#r3f-rag-through-the-agent-bus-rag-agent)

## [№R3g](#R3g) — Flows and automation {#r3g-flows-and-automation}

- [ ] R3g Build the shared Markdown flow runtime <a id="R3g"></a>
  - Depends: [№R3c](#R3c), [№R3e](#R3e)
  - Builds: editable document/routing packages; common inputs; manual and optional scheduled runs;
    run history; provider adapters; previews and approvals
  - Acceptance: work, evidence, questions, decisions, transitions, approvals and outcomes remain
    inspectable and resumable in project Markdown
  - Acceptance: missing targets, loops, overlapping schedules and partial routes fail visibly without
    dropping or duplicating work
  - Acceptance: every generated document uses full `last-commit-id`; **since last run** advances its
    marker only after the whole run succeeds
  - Tracks: [№MW.3](workspaces/TODO.md#MW.3)
  - Home: [Flow platform](README.md#r3g-r3h-flow-platform-and-built-in-flow-library)

## [№R3h](#R3h) — Built-in flow library {#r3h-built-in-flow-library}

- [ ] R3h Ship a useful first version of every planned flow family <a id="R3h"></a>
  - Depends: [№R3g](#R3g)
  - Builds: Feature and delivery; Documentation; Recent commits; PR/incoming changes; Engineering and
    operations; Business; Ideas; Finance; Legal
  - Acceptance: every package has useful default inputs/output, evidence expectations, approval
    boundaries, one small example and manual/optional scheduled execution
  - Acceptance: ticketing, merge, deploy, financial and legal consequences remain separate,
    explicitly confirmed actions
  - Tracks: [№MW.3a](workspaces/TODO.md#MW.3a)–[№MW.3h](workspaces/TODO.md#MW.3h)
  - Home: [Built-in flow library](README.md#r3g-r3h-flow-platform-and-built-in-flow-library)

## [№R3i](#R3i) — Plans, markup and skills {#r3i-plans-markup-and-skills}

- [ ] R3i Turn the working conventions into a product protocol <a id="R3i"></a>
  - Depends: [№R3a](#R3a)
  - Builds: immutable installed reference root; current plan/markup/syntax documentation; shareable
    skills; project initialization; flow packages using the same visible states
  - Acceptance: a person or any compatible agent can inspect and continue work from project Markdown
    without private orchestration state
  - Acceptance: reference material is current and immutable; project documents remain ordinary,
    editable, versioned project files
  - Tracks: [№MW.0f](workspaces/TODO.md#MW.0f), [№MW.1](workspaces/TODO.md#MW.1), [№MW.4](workspaces/TODO.md#MW.4)
  - Home: [Plans, markup, skills and reference material](README.md#r3i-plans-markup-skills-and-reference-material)

## [№R3j](#R3j) — Team collaboration {#r3j-team-collaboration}

- [ ] R3j Make one mdhouse safe and understandable for a team <a id="R3j"></a>
  - Depends: [№R3b](#R3b)
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
  - Tracks: [№MW.0a](workspaces/TODO.md#MW.0a), [№MW.0b](workspaces/TODO.md#MW.0b), [№MW.0c](workspaces/TODO.md#MW.0c), [№MW.0d](workspaces/TODO.md#MW.0d), [№MW.0e](workspaces/TODO.md#MW.0e)
  - Home: [Team collaboration](README.md#r3j-team-collaboration)

## [№R3k](#R3k) — Safety, migration and compatibility {#r3k-safety-migration-and-compatibility}

- [ ] R3k Preserve hard boundaries across every new capability <a id="R3k"></a>
  - Runs across: [№R3b](#R3b)–[№R3j](#R3j)
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
  - Home: [Safety, migration and compatibility](README.md#r3k-safety-migration-and-compatibility)

## [№R3l](#R3l) — Release gate {#r3l-release-gate}

- [ ] R3l Review the complete Paradigm Shift journey <a id="R3l"></a>
  - Depends: [№R3a](#R3a), [№R3b](#R3b), [№R3c](#R3c), [№R3d](#R3d), [№R3e](#R3e), [№R3f](#R3f), [№R3g](#R3g), [№R3h](#R3h), [№R3i](#R3i), [№R3j](#R3j), [№R3k](#R3k)
  - Acceptance: fresh install → create/add project → connect agent → run flow → edit document →
    review diff/history → explicitly perform the next delivery action
  - Acceptance: the normal primary journey uses mdhouse as both the AI-agent interface and the
    Markdown editor; specialized and recovery paths may still leave mdhouse
  - Acceptance: the agent journey configures an allowed RAG source, completes ingestion/indexing,
    retrieves a cited result and preserves source IDs/citations/provenance in Markdown/run history
  - Acceptance: the journey passes in personal Workspace, Team Workspace, RO-root and Viewer
    configurations, including stale tabs and direct API attempts
  - Acceptance: the Team journey adds one GitHub username, authenticates it through GitHub, grants a
    project with default RW, changes it to RO, removes it and verifies immediate session/API
    enforcement at each step
  - Acceptance: unavailable agents, failed routes, rewritten Git history, disconnected clients and
    partial external actions retain recoverable state and precise errors
  - Acceptance: repository and packed artifacts pass the R3 license/metadata/package-content check
  - Acceptance: immutable installed references and every mutation family pass direct/stale authorization checks, including administrator versus project Editor
  - Acceptance: desktop and mobile full journey plus authored-text Copy are recorded in `QA.md`; unavailable browser/device checks remain open
  - Detailed Workspace gate: [№MW.6](workspaces/TODO.md#MW.6)
  - Home: [Release gate](README.md#r3l-release-gate)
