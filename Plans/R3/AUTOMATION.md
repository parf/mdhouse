# Automation — Agent Bus Cron/At for AI pipelines

Status: draft — owner decisions pending in [QUESTIONS.md Q-R3-AUTO1](workspaces/QUESTIONS.md#Q-R3-AUTO1). Design only: nothing here is implemented and no schedule exists.
Defaults below are the temporary CTO's; the owner may override any of them. Task: [№MW.11](workspaces/TODO.md#MW.11); rule: [№AUTO-W1](workspaces/DECISIONS.md#AUTO-W1).

## 1. Principle

- Agent Bus owns time: cron, at and in; UTC; creator's reach checked at every firing; outcomes kept 7 days; never retried; one catch-up after downtime that counts the missed slots
- mdhouse adds no timer; a schedule is an Agent Bus schedule whose target is the instance's `#mdhouse` record and whose message is a small JSON run request
- mdhouse is the receiver, as it is for `mdhouse.ctl` (`src/lib/ab-control.ts`): request id, replay cache, sender rule, one JSON reply

## 2. Trigger

`agent-bus schedule add <record> '<cron>' <mdhouse-endpoint> '<json>'`, or `at` / `in` for one-offs.

- The bus delivers from `#bus`, topic `schedule`, tag `by <creator>`, with a bus-set stamp: id, creator, slot, `late_by`, `missed`; the stamp is the only provenance mdhouse trusts, the body is untrusted input
- Body v1 (at most 4 KiB): `{ "v": 1, "op": "run", "project": "<root id>", "flow": "recent-commits-review", "scope": { "range": "since-marker" }, "requestId": "<scheduleId>:<slot>" }`
- The topic is always `schedule`, so mdhouse dispatches on the stamp's schedule id plus `body.op`, and refuses a schedule id it has no registration for
- `requestId` is the schedule id plus slot, so a replay or a catch-up never starts one slot twice
- A catch-up (`missed > 0`) is one run over the whole range since the marker; a firing later than the registration's `maxLate` is recorded `skipped: late` (set `--max-late` on the schedule too)
- ❓ Whether a schedule may set its own topic is not stated in the bus docs; assumed no

## 3. Registration

A firing runs only if the project holds a matching registration, kept in the project's settings ([№MW.14](workspaces/TODO.md#MW.14) data placement), never in the Markdown tree:
`{ scheduleId, project, flow, scope, outputs: { folder: "runs/" }, maxLate, overlap: "skip" | "queue1", enabled, approvedBy, approvedAt, notify?: <one agent> }`.

- No registration: the reply is `{ ok: false, code: "unregistered" }` and the firing is logged; a bus schedule alone can never make mdhouse run anything
- Three separate checks apply: the creator's reach (bus), the registration (mdhouse), the project's effective access (mdhouse)
- Who may register: the instance administrator only; a Viewer never
- The flow must be a package in `doc/flows/catalog.json` with no consequential node in v1; consequential nodes stay `unsupported`/held as in [FLOW-RUNTIME-CORE.md](FLOW-RUNTIME-CORE.md)
- Schedules live on the instance's `#mdhouse` record, so one place lists and disables them

## 4. Scope and outputs

- Inputs come from the request and the registration only: project, flow, git range (since the `last-commit-id` marker; a first run takes an explicit baseline the owner picks once), uncommitted files kept separate
- No free text from the message reaches a prompt except the registered scope fields; no analysis text is executed
- Outputs: the flow's run Markdown (inputs, owner, plan, evidence, findings, decisions, outcome) in the registration's output folder, default `runs/` in the project tree — visible and committable; plus one routed notice (the page, and the optional agent message)
- The marker advances only after every write and routed output succeeded; a failed or partial run leaves it, so the next slot covers the range
- Writes go through the existing jail and only inside the output folder

## 5. Run history

- The bus keeps firing outcomes for 7 days (sent, refused, skipped)
- mdhouse keeps one index line per run, bounded (last 200): run id, schedule id and slot or `manual:<user>`, start/end, outcome (`ok`, `failed`, `skipped`, `held`, `interrupted`), SHA range, output path; the run documents are the full record
- The page joins both by schedule id and slot, so "fired but mdhouse refused" and "ran and failed" read differently

## 6. Overlap and failure

- Overlap per registration, default `skip`: a firing while the same registration runs is answered `skipped: overlap` and recorded; `queue1` keeps at most one pending
- No retry in mdhouse or the bus; a failed run is outcome `failed` plus a warning on the project page
- Auto-disable: after 3 consecutive failures the registration is disabled and mdhouse answers `disabled`; the bus's own five-refusals rule then disables the schedule (mdhouse disables the bus schedule itself only if it maintains that record)
- Cap: 10 runs per day per registration, and a minimum interval of 5 minutes, enforced by mdhouse whatever the cron says
- mdhouse down at the slot: the bus holds the message to its time to live; a one-off fires once at start, a repeating one gets one catch-up with a missed count; no special code, the marker model covers it
- Restart mid-run: runs are not resumable in v1 (durable resume is open in [№MW.3](workspaces/TODO.md#MW.3)); the run is marked `interrupted` at the next start and the marker did not move

## 7. Consequential actions

- A scheduled run is analysis only in v1: no code execution, no commit, no push
- Anything else — writing outside the output folder, committing, pushing, filing tickets, messaging people, running code — is a consequential node: the run ends `held: needs approval` with the proposed action as an open question
- A human approval turn is required per action, bound to the run id and exact target SHA; a new commit invalidates it
- Registering or enabling a schedule approves none of its future actions; an agent's reply never counts as approval

## 8. Viewer

- A Viewer sees the Automation section read-only: registrations, last runs, outcomes, next fire when its bus read access allows; no create, enable, disable or run-now controls (removed, not disabled)
- A Viewer instance accepts no `run` request: it answers `viewer`, and no run writes on its behalf

## 9. From the page

Project → Settings → Automation (or a ⏰ entry on a flow page): registrations with state, the schedule in words (`weekdays 09:00 UTC`, shown in the user's zone), the last 5 outcomes, **Run now**, **Disable/Enable**.

- Create: flow → scope (default since last run) → when (presets: daily, weekdays, hourly, in…, once at; or custom cron) → overlap → output folder → optional agent to notify → a preview "what will run, reading what, writing where" → Save
- Save stores the registration and creates the bus schedule as the user's own account, showing the exact `agent-bus` command; if the bus refuses, the registration is saved disabled with the reason
- Disable turns off the registration and the bus schedule, and says which one failed if either does
- **Run now** calls the same handler entry with origin `manual:<user>`, not through the bus
- On touch: the same form as a bottom sheet, presets first

## 10. First two pipelines

- **Code review of recent commits** — flow `recent-commits-review`; weekdays 08:30 UTC; scope since the marker, at most 30 commits per run (a larger range is split); output `runs/review-YYYY-MM-DD.md`; findings as ❓/issue items for the Q&A strip; overlap skip; `maxLate` 1h
- **QA** — document-level in v1: nightly 02:00 UTC at the default branch HEAD, bound to that exact SHA; it analyses the project's QA matrix and the changes since the last QA run and writes a QA run document; running tests is a later capability that needs its own approval decision

## 11. Delivery order, after the owner answers

1. Contract: body v1, registration schema and a pure handler with tests (validate, replay cache, dispatch to a stub), like `ab-control`
2. Registry and run index, in the `rag-registry` pattern
3. Handler wired to the MW.3 runner once it exposes a headless entry (`run(flow, project, scope, runId, origin)` returning held/blocked/failed/complete, an output path, an `interrupted` state, never advancing the marker on failure)
4. Automation page, Viewer-safe
5. Schedule create/disable through the SDK

Steps 1–2 need nothing from the runner.

## Defaults awaiting the owner ❓

Q-R3-AUTO1, temporary CTO defaults written into the text above:

1. v1 scheduled runs are analysis only
2. Registration is by the instance administrator; a Viewer never
3. Auto-disable after 3 consecutive failures; 10 runs/day per registration
4. Schedules live on the instance's `#mdhouse` record
5. QA v1 is document-level; running tests needs a later, separate approval
6. Runs land in the project tree under a `runs/` folder, a registration field
7. Notifications: the page, plus an optional agent message to one chosen agent
