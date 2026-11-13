# Automation — Agent Bus Cron/At for AI pipelines

Status: draft — [№Q-R3-AUTO1](workspaces/DECISIONS.md#Q-R3-AUTO1) decided; [№Q-R3-AUTO2](workspaces/QUESTIONS.md#Q-R3-AUTO2) (who may run a committed registration) open. Slice 1 built and tested, not wired to the server (§11): no schedule exists, and every firing is refused until Q-R3-AUTO2 is answered. Task: [№MW.11](workspaces/TODO.md#MW.11); rule: [№AUTO-W1](workspaces/DECISIONS.md#AUTO-W1).

## 1. Principle

- Agent Bus owns time: cron, at and in; UTC; creator's reach checked at every firing; outcomes kept 7 days; never retried; one catch-up after downtime that counts the missed slots
- mdhouse adds no timer; a schedule is an Agent Bus schedule whose target is the instance's `#mdhouse` record and whose message is a small JSON run request
- mdhouse is the receiver, as it is for `mdhouse.ctl` (`src/lib/ab-control.ts`): request id, replay cache, sender rule, one JSON reply

## 2. Trigger

`agent-bus schedule add <record> '<cron>' <mdhouse-endpoint> '<json>'`, or `at` / `in` for one-offs.

- The bus delivers from `#bus`, topic `schedule`, tag `by <creator>`, with a bus-set stamp `{id, by, slot, late_by?, missed?}` — `by` the creator, `slot` an RFC 3339 UTC instant, `late_by` a Go duration cut to the second (`1m30s`, absent under a second), `missed` a count (checked in the daemon's source, `envelope.go`/`schedule.go`, and confirmed by its agent: `From` is always exactly `#bus`, a client-supplied stamp is discarded by every send, and the topic `schedule` and the tag `by …` are ordinary fields any sender can set — so only `from == #bus` together with a stamp counts, never the topic or tag; a firing past the schedule's `max_late` is never delivered; "run now" carries the same stamp with `slot` = now and goes through the same checks); the stamp is the only provenance mdhouse trusts, the body is untrusted input
- Body v1 (at most 4 KiB): `{ "v": 1, "op": "run", "project": "<root id>", "registration": "<id>" }` — it names a project and a registration and nothing else: no flow, range, path or trigger (an unknown key is refused); the request id is the stamp's `<scheduleId>:<slot>`, never the body's
- The topic is always `schedule`, so mdhouse dispatches on the stamp's schedule id plus `body.op`, and refuses a schedule id it has no registration for
- `requestId` is the schedule id plus slot, so a replay or a catch-up never starts one slot twice
- A catch-up (`missed > 0`) is one run over the whole range since the marker; a firing later than the registration's `maxLate` is recorded `skipped: late` (set `--max-late` on the schedule too)
- ❓ Whether a schedule may set its own topic is not stated in the bus docs; assumed no

## 3. Registration

A registration is team data ([№DATA-W1](workspaces/DECISIONS.md#DATA-W1)): one file per pipeline in `$PROJECT/.mdhouse/automation/<id>.json`, under Git with the project, never in the Markdown tree:
`{ id, flow, range, when, maxLate?, overlap?, notify? }` — strict, no other key; `id` is the file's name; `flow` a runnable package (`runnableFlow`); `range` `"since-last-run"` or `{"kind":"baseline","commit":"<4-40 hex>"}`; `when` `{"cron":"<5 or 6 fields>"}` or `{"at":"<RFC 3339 UTC>"}`; `maxLate` `"30m"` (1 s to 7 d, default 1 h); `overlap` only `"skip"` is built; `notify` `"#name@host"` — what to run, when, over what, and who hears of it.
Where it runs is not in the file: the bus schedule on this instance's `#mdhouse` record is only the timer, and it exists only where an administrator enabled the registration.

- A firing runs only if the project holds the registration file the schedule was made from and the administrator's approval of that file's content hash (the KV of the instance's `#mdhouse` record, [№DATA-W2](workspaces/DECISIONS.md#DATA-W2)) still matches; a file changed by a pull or a commit stops firing until it is approved again
- The page shows a registration it finds in a project but nobody enabled here as "not scheduled on this machine", with an **Enable** that shows the file's content and asks for the approval

- No registration: the reply is `{ ok: false, code: "unregistered" }` and the firing is logged; a bus schedule alone can never make mdhouse run anything
- Three separate checks apply: the creator's reach (bus), the registration (mdhouse), the project's effective access (mdhouse)
- Who may register: the instance administrator only; a Viewer never
- The flow must be a package in `doc/flows/catalog.json` with no consequential node in v1; consequential nodes stay `unsupported`/held as in [FLOW-RUNTIME-CORE.md](FLOW-RUNTIME-CORE.md)
- Schedules live on the instance's `#mdhouse` record, so one place lists and disables them; the run index and the approvals are per instance (its record's KV), the run documents and the registrations are the project's

## 4. Scope and outputs

- Inputs come from the request and the registration only: project, flow, git range (since the `last-commit-id` marker; a first run takes an explicit baseline the owner picks once), uncommitted files kept separate
- No free text from the message reaches a prompt except the registered scope fields; no analysis text is executed
- Outputs: the flow's run Markdown (inputs, owner, plan, evidence, findings, decisions, outcome) at `Plans/flows/runs/<package>/<UTC>-<runId8>.md` in the project tree — the same place as a manual run, visible and committable; plus one routed notice (the page, and the optional agent message)
- The marker advances only after every write and routed output succeeded; a failed or partial run leaves it, so the next slot covers the range
- Writes go through the existing jail and only to that run path (the runner's, never one chosen by the message)

## 5. Run history

- The bus keeps firing outcomes for 7 days (sent, refused, skipped)
- mdhouse keeps one index line per run, bounded (last 200): run id, schedule id and slot or `manual:<user>`, start/end, outcome (`ok`, `failed`, `skipped`, `held`, `running`), SHA range, output path; the run documents are the full record
- The page joins both by schedule id and slot, so "fired but mdhouse refused" and "ran and failed" read differently

## 6. Overlap and failure

- Overlap per registration, default `skip`: a firing while the same registration has an open run (its document says running or held) is answered `skipped: overlap` — the runner's `running` — and recorded; the open run stays visible to finish, mark partial or cancel; `queue1` keeps at most one pending
- No retry in mdhouse or the bus; a failed run is outcome `failed` plus a warning on the project page
- Auto-disable: after 3 consecutive failures this machine's approval of the registration is withdrawn (the file stays) and mdhouse answers `disabled`; the bus's own five-refusals rule then disables the schedule (mdhouse disables the bus schedule itself only if it maintains that record)
- Cap: 10 runs per day per registration, and a minimum interval of 5 minutes, enforced by mdhouse whatever the cron says
- mdhouse down at the slot: the bus holds the message to its time to live; a one-off fires once at start, a repeating one gets one catch-up with a missed count; no special code, the marker model covers it
- Restart mid-run: nothing is cut — analysis is not an in-process job, an agent or a person works against the run document; a run whose document says running or held is an open run, and the marker moves only when it completes

## 7. Consequential actions

- A scheduled run is analysis only in v1: no code execution, no commit, no push
- Anything else — writing outside the run document, committing, pushing, filing tickets, messaging people, running code — is a consequential node: the run ends `held: needs approval` with the proposed action as an open question
- A human approval turn is required per action, bound to the run id and exact target SHA; a new commit invalidates it
- Registering or enabling a schedule approves none of its future actions; an agent's reply never counts as approval

## 8. Viewer

- A Viewer sees the Automation section read-only: registrations, last runs, outcomes, next fire when its bus read access allows; no create, enable, disable or run-now controls (removed, not disabled)
- A Viewer instance accepts no `run` request: it answers `viewer`, and no run writes on its behalf

## 9. From the page

Project → Settings → Automation (or a ⏰ entry on a flow page): registrations with state, the schedule in words (`weekdays 09:00 UTC`, shown in the user's zone), the last 5 outcomes, **Run now**, **Disable/Enable**.

- Create: flow → scope (default since last run) → when (presets: daily, weekdays, hourly, in…, once at; or custom cron) → overlap → optional agent to notify → a preview "what will run, reading what, writing where" → Save
- Save writes `.mdhouse/automation/<id>.json` (an uncommitted change in the project: the page does not commit it; it is committed and shared like any file) and, as the administrator's approval of that content, creates the bus schedule as the user's own account, showing the exact `agent-bus` command; if the bus refuses, the file is kept and the registration stays not scheduled, with the reason
- Disable removes this machine's bus schedule and approval; the file stays in the project for the team (deleting a pipeline is deleting the file); the page says which step failed if one does
- **Run now** calls the same handler entry with origin `manual:<user>`, not through the bus
- On touch: the same form as a bottom sheet, presets first

## 10. First two pipelines

- **Code review of recent commits** — flow `recent-commits-review`; weekdays 08:30 UTC; scope since the marker, at most 30 commits per run (a larger range is split); its run document under `Plans/flows/runs/<package>/<UTC>-<runId8>.md`; findings as ❓/issue items for the Q&A strip; overlap skip; `maxLate` 1h
- **QA** — document-level in v1: nightly 02:00 UTC at the default branch HEAD, bound to that exact SHA; it analyses the project's QA matrix and the changes since the last QA run and writes a QA run document; running tests is a later capability that needs its own approval decision

## 11. Delivery order, after the owner answers

Slice 1 (steps 1–2) is built — `src/lib/automation.ts` (schema, `Automation` handler, `RunIndex`, `notApproved`), `src/lib/automation-registry.ts` (the jailed loader), tests with a fake runner — and fails closed: the approval it ships answers no, so a firing is `not-approved` and reaches nothing. Not wired to `serve()`.

Slice 2 is built — wired in `serve()` (bus control topic `schedule`, lock `auto`), approvals and the run index in the record's KV (`src/lib/automation-state.ts`), `GET /api/automation`, `POST /api/automation/approve|revoke` (step 5); the page (step 4) is next.

1. Contract: body v1, registration schema and a pure handler with tests (validate, replay cache, dispatch to a stub), like `ab-control`
2. Registry and run index, in the `rag-registry` pattern
3. Handler wired to the MW.3.3 entry `startFlowRun({ rootId, packageId, range, trigger: { kind: 'manual', actor } | { kind: 'schedule', id, slot } })` returning `{ status, runPath, url }` (agreed with #md/w1); for a schedule trigger the run id is a hash of the request id, so a repeated start finds the existing run document and returns its status; manual runs keep a random id; the marker never advances on blocked, failed, partial or cancelled; consequential nodes stay `unsupported` until approvals exist, then `held: needs-approval`
4. Automation page, Viewer-safe
5. Schedule create/disable through the SDK

Steps 1–2 need nothing from the runner.

## Decided, and open ❓

Q-R3-AUTO1, decided by the owner (the temporary CTO's defaults kept), written into the text above:

1. v1 scheduled runs are analysis only
2. Registration is by the instance administrator; a Viewer never
3. Auto-disable after 3 consecutive failures; 10 runs/day per registration
4. Schedules live on the instance's `#mdhouse` record
5. QA v1 is document-level; running tests needs a later, separate approval
6. Runs land in the project tree at `Plans/flows/runs/<package>/<UTC>-<runId8>.md`, the same as manual runs (not a registration field)
7. Notifications: the page, plus an optional agent message to one chosen agent

Decided: [№Q-R3-AUTO2](workspaces/DECISIONS.md#Q-R3-AUTO2) — the instance administrator approves the file's content hash on this machine (§3).
