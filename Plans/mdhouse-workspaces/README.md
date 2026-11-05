# MDHOUSE Workspaces

MDHOUSE becomes the local workspace where a person and AI agents install, review, change and
ship projects together. The first layers are installation and project flows; teams and general
automation build on them later.

Active work: [`TODO.md`](TODO.md). Decisions: [`DECISIONS.md`](DECISIONS.md). Open choices:
[`QUESTIONS.md`](QUESTIONS.md). After-project automation: [`FUTURE.md`](FUTURE.md).

## Next release

The next release changes the product default from a Markdown viewer/tool into a **personal-first,
team-ready Markdown workspace**: added projects are meant to be changed, discussed with people
and agents, reviewed and shipped. It stays a zero-config personal workspace by default and becomes
a shared team workspace when configured. Viewer remains a configured mode for publishing or
browsing Markdown without edits.

These are independent choices:

- **Workspace / Viewer** — whether the served roots are edited or viewed read-only.
- **Personal / Team** — whether one person uses the instance locally or authenticated teammates
  connect with their own browser identity.

Viewer is a hard read-only presentation: every root is effectively RO and document write controls
are absent. It preserves configured per-root modes for a later return to Workspace.

The product term is **Markdown workspace**. The Team setup remains open in
[`Q-W6`](QUESTIONS.md#Q-W6).

## Workspace

- `~/mdhouse/<project>` is the standard always-RW directory for mdhouse-based development.
- `install.md` is a step-by-step installation runbook an AI agent can execute.
- Installation is safe to repeat.
- Agent Bus works out of the box after installation. An instance-wide endpoint is the fallback;
  a space may select its own endpoint, which takes precedence for documents in that root. Agent
  targets resolve separately: an explicit right-panel choice wins over `<!-- AB: name -->`, which
  wins over space and instance defaults. In Settings every directory has an `[AB]` button beside
  its `[RW]` / `[RO]` access badge; its per-space value appears next to the button only when set. Emptying it deletes the
  override while the button remains.
- Every explicitly added root is RW by default and `--ro` opts out in Workspace; Viewer forces every
  root effectively RO. There is no protected-path list: adding a root is the user's grant. A symlink must never
  grant access outside that root; the existing realpath jail and `Registry.writeFile()` remain the
  write boundary.
- Directory rows omit the normal saved state: only a session root shows `[unsaved]`, which saves it
  after confirmation. In Workspace, `[RW]` / `[RO]` shows and toggles the effective access, with
  confirmation; saved roots persist the choice. Viewer removes this action and forces effective RO.
- A project directory may have an optional human display name configured from CLI or Settings.
  For example, `~/mdhouse` may appear as **All MDHouse Projects** while its path, root ID and URLs
  remain unchanged.
- Web directory management and the automatically supplied RO reference root are settled in
  [`DECISIONS.md`](DECISIONS.md); their implementation is tracked in [`TODO.md`](TODO.md).

## Existing-project flows

The web UI starts a named flow against an existing project. Each flow uses the project's files as
the shared workspace, hands work to Agent Bus sessions and leaves its plan, source evidence,
findings, checks and outcome visible in Markdown.

### Common flow controls

A flow is a set of Markdown documents plus routing between them, with an optional schedule. A flow
may move from brief → questions → plan → work/review → decision/report, routing each step to
another document, a person/team, an Agent Bus target or an external destination. Built-in flows ship
as editable packages, so adding a domain or improving a workflow usually changes documents and
routing rather than application code. Flows share one set of inputs instead of multiplying into
nearly identical buttons:

- **scope** — whole project, subsystem, directory, aspect or selected files;
- **change range** — since this document's last run, last commit, branch/commit range, PR, since a
  date, week or month;
- **audience** — executive, marketing/product, development, QA, operations, security or custom;
- **output** — document, summary, findings, tasks, release notes or tickets;
- **destination** — project Markdown, Agent Bus, Linear/Jira/GitHub or another configured tracker;
- **routing** — the entry document and next destination for each outcome or approval;
- **run mode** — one time or an optional schedule.

Every mutating or external action is previewed separately from analysis: generating a report does
not silently edit docs, file tickets, merge a PR or deploy.

Every generated document records `last-commit-id`. Its next **since last run** refresh starts at that
commit and ends at the current HEAD, then advances the marker only after the run succeeds. This
generalizes the existing issues-review convention, where the next review starts at the previous
review range's ending SHA. A rewritten-away commit stops for a new baseline instead of guessing.

### Feature and delivery

- add a feature: clarify → plan → implement → test → review;
- review the existing project or a selected subsystem;
- update → review → deploy, including readiness and rollback checks;
- add the next feature after deployment, carrying forward decisions and unresolved work.

### Documentation

- **Generate/update** — inventory the system, split it into meaningful subsystems, generate deep
  documentation for each one and produce project/subsystem summaries.
- **Refresh/verify** — compare docs with current code, configuration, APIs and recent changes;
  correct stale or contradictory claims and report what could not be verified.
- **Project overview** — generate an overview for a selected audience: executive, marketing,
  development, QA, operations or another named reader. Optionally limit it to a subsystem, aspect,
  path or change timeframe such as the last week or month.
- **Documentation architecture** — separate tutorials, task-oriented how-to guides, reference and
  explanation; find missing coverage, duplicate pages and orphaned docs.
- **Documentation trust report** — record sources, last verified change, owners and confidence so
  scheduled refreshes focus on documentation most likely to have drifted.

### Recent commits review

This flow can run manually or on a schedule for a commit range, author, branch, subsystem or
timeframe.

- generate project-change, user-facing, developer-facing and operations-facing summaries;
- produce changelog/release-note drafts and identify documentation that should change;
- review by author: commits, files and LoC plus a factual work summary — LoC is context, never a
  productivity score;
- detect likely errors, regressions, risky hotspots, missing tests and incompatible API/config
  changes;
- generate tasks from confirmed findings and optionally file tickets in the configured tracker;
- compare the period with its plan/issues: completed, unplanned, partially delivered and stale.

### Pull requests and incoming changes

- summarize intent, changed subsystems, owners, linked plans/issues and user-visible impact;
- review correctness, tests, security, dependencies, compatibility, docs and operational risk;
- route findings to the right owners and track comment resolution and re-review;
- check merge readiness: conflicts, checks, required reviews, unresolved threads, migrations,
  release notes and rollback notes;
- merge only through an explicit confirmed action, then update docs, changelog and linked tasks;
- review incoming vendor/upstream changes before accepting them into the project.

### Engineering and operations flows

- **Release readiness** — version/change inventory, breaking changes, migrations, rollout,
  observability, rollback and stakeholder release brief.
- **Architecture and ownership** — subsystem/dependency/data-flow map, ADR proposals, ownership gaps
  and change routing.
- **Project health** — dependency freshness, vulnerabilities, licenses, flaky tests, CI drift,
  deprecated APIs and maintenance backlog.
- **Onboarding and handoff** — verify setup from a clean account; generate role-specific tours,
  glossary, first-task guide and ownership/contact map.
- **Incident and regression investigation** — correlate symptoms with recent changes, build a
  timeline, propose reproduction and rollback, then update runbooks and remediation tasks.
- **Requirements and delivery sync** — compare plans, tickets, code, tests and docs; expose missing
  acceptance coverage, stale tickets and features implemented without documentation.
- **API/schema impact** — inventory changed endpoints, events, database/config schemas and downstream
  consumers; generate compatibility and migration guidance.
- **Maintenance/debt sweep** — find dead code, expired flags, TODO/FIXME clusters, duplication and
  abandoned docs, then propose small independently reviewable tasks.

### Business flows

- **Business overview** — explain the product, customers, value proposition, channels, revenue model,
  costs, risks and current priorities for a selected audience.
- **Strategy and planning** — turn goals and constraints into options, trade-offs, milestones,
  assumptions, owners and measurable outcomes.
- **Market/customer brief** — collect source-backed market, segment, customer and competitor evidence;
  distinguish observations from assumptions and unanswered questions.
- **KPI/operating review** — summarize targets, actuals, drivers, risks, decisions and follow-up work
  for a weekly, monthly or quarterly cadence.
- **Decision memo** — frame a decision, alternatives, evidence, costs, risks, reversibility and the
  recommended next step; preserve the final decision and rationale in Markdown.

### Ideas flows

- **Idea capture and clarification** — turn a rough note into problem, audience, desired outcome,
  constraints and open questions without prematurely prescribing a solution.
- **Idea research and synthesis** — gather evidence, related work and objections; cluster duplicates
  and produce a short opportunity brief.
- **Prioritize ideas** — compare impact, confidence, effort, urgency, strategic fit and reversibility;
  preserve assumptions instead of hiding them inside a score.
- **Experiment design** — define the smallest validation, success/guardrail metrics, audience,
  duration and decision rule.
- **Idea to project** — promote a selected idea into a project, plan or feature flow while retaining
  its evidence, rejected alternatives and unresolved questions.

### Finance flows

- **Budget and forecast** — create or refresh assumptions, scenarios, cash plan and variance notes
  from supplied financial sources.
- **Variance and management report** — explain plan-vs-actual movement, material drivers, uncertainty
  and actions for a selected period or business unit.
- **Unit economics and pricing** — document revenue/cost assumptions, contribution margin, sensitivity
  and break-even scenarios with inspectable calculations.
- **Cash/runway review** — summarize balances, commitments, burn, scenarios and upcoming decisions;
  never initiate payments or move funds.
- **Financial document review** — extract terms, dates, amounts and inconsistencies from invoices,
  statements or models, then create a review checklist rather than silently changing source records.

Finance outputs cite their inputs, show formulas and assumptions, label estimates, and require human
approval before any external or consequential action. They are analytical drafts, not financial advice.

### Legal flows

- **Contract review** — summarize parties, dates, obligations, money, renewal/termination, unusual
  clauses, missing terms and questions for counsel.
- **Obligation and renewal register** — extract commitments, owners, notice windows and evidence into
  a maintained Markdown register with optional reminders.
- **Policy/compliance review** — compare a policy or implementation with a supplied requirement set;
  cite sources and mark uncertain interpretation for human review.
- **Legal change impact** — map a supplied regulatory/contractual change to products, processes,
  documents and owners, then draft remediation tasks.
- **Legal request brief** — package facts, timeline, documents, questions and desired outcome for a
  lawyer without presenting the result as legal advice.

Legal flows preserve source references and confidentiality boundaries. They identify issues and draft
work; a qualified person approves interpretation, filings, signatures and external communication.

## New-project flow

The web UI creates a new AI project ready to work:

- create `~/mdhouse/<project>`;
- initialize the project;
- add the `Plans/` convention;
- add mdhouse markup and review skills;
- connect the project to Agent Bus;
- start its first project flow.

The generated project uses Parf's plan, markup and review conventions immediately, not after a
separate setup pass.

## Full Markdown editor

Edit the complete source document in mdhouse, not only checkboxes, replies and inserted blocks.
The editor keeps the current safety contract:

- writable roots only;
- paths through the existing jail;
- stale writes refused without losing the draft;
- live updates through the watcher and WebSocket;
- diff, history and commit from the same document page.

External-editor links keep `edit:` as their default scheme, but the scheme is configurable. For
example, `mdedit:` may be registered to open Markdown in Typora without replacing the user's common
`edit:` handler. Settings shows the scheme next to Edit link only while that link is enabled.

## Agent Bus control

Agent Bus can drive a small typed mdhouse control API. mdhouse reports available root and connected
browser/tab IDs; an open command names the IDs and a specific Markdown path, so Agent Bus decides
exactly where the page opens. It can also add a project directory and supply that
project's allowed configuration, so an agent can create or connect a workspace and take the user
straight to its starting document. Root registration and document paths keep the same canonical
path and jail rules as CLI, Settings and HTTP routes; privileged control senders are explicitly
authorized and every command is auditable.

## Delivery order

1. Workspace-by-default mode, Viewer configuration and safe upgrade from existing prefs.
2. Personal-by-default setup and an explicit, safe Team profile.
3. `install.md` and the workspace convention.
4. Agent Bus out of the box.
5. Existing-project flows.
6. New-project creation from the web UI.
7. Full Markdown editor.
8. Agent Bus control: add/configure projects and open a specific Markdown document.
9. Agent teams and automation from [`FUTURE.md`](FUTURE.md).
