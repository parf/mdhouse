# R3 execution

Owner-authorized complete R3 implementation/testing; CTO owns shared plan edits/status. No push, publish or deploy.
Base implementation revision: `c1fb27f35cbd82270c754e4dfc6a562d36e0924d`; launcher-only main update:
`3af3ca0c939c7d5830685bbe175cad654eac5d00`. Target: `main`.

## States

Planned → assigned → working → ready → reviewed → integrated → done.
A checkpoint closes only after acceptance/checks pass on integrated HEAD and its SHA is recorded.
Read-only evidence and acknowledgements do not prove implementation. Every worker owns its commits.
All implementation uses isolated worktrees; CTO integrates serially. Plans remain CTO-owned.

## Initial slices

| Task | Owner | State | Checkout / branch | Scope and acceptance | Dependencies / verification |
| --- | --- | --- | --- | --- | --- |
| R3-A1 | W1 | done (analysis only) | main at base | roots/access/prefs/CLI mutation evidence; no implementation | report on Agent Bus r3-kickoff/r3-evidence-20261105 |
| R3-A2 | W2 | done (analysis only) | main at base | Copy and mobile premise evidence; browser check pending | same evidence route |
| R3-A3 | W3 | done (analysis only) | main at base | actual npm pack license mismatch and missing flow family confirmed | same evidence route |
| R3-A4 | Review | done (advisory only) | base revision, read-only | independent foundation sequencing advisory; no future-code approval | B1–B3/S1–S3 incorporated; exact-target verdicts still required |
| MW.0f.1 | W1 | ready; review follow-up | `.scratch/worktrees/r3-reference` / `r3/reference-foundation` | roots/server/control types and focused tests; immutable root kind, explicit reference registration, promotion/removal/direct write denial, project identity preserved; no auto-mount/default flip | no implementation dependencies; preserve Git overlap denial; independent exact-SHA review + focused/all tests/tsc |
| MW.5b | W2 | integrated; partial acceptance | `.scratch/worktrees/r3-copy` / `r3/copy-controls` | document chrome Copy exclusion in styles/Doc if needed; preserve source glyphs, focus/accessibility; no access defaults | independent; scratch light/dark/narrow selection/clipboard and controls checks; unavailable Safari/Firefox checks stay open |
| MW.L | W3 | integrated; checks pending | `.scratch/worktrees/r3-license` / `r3/license` | LICENSE → LICENSE.md, package.json, README, CHANGELOG, package-content test; official approved text/copyright, actual tarball regression | independent; no version/dependency changes; focused pack test/all tests/tsc, CTO review |

Worker docs: report needed shared Plans/README and R3 checkpoint updates to CTO. CHANGELOG overlap is
resolved during integration; preserve other workers' entries. Ready reports include exact base/target,
owned paths/commit, checks, gaps and next step. Material fixes invalidate prior review.

Implementation base for all three initial slices: `035b46510454a79b365288985e5f40c4f02919bb`.
W2 working receipt `432972659a6078d0`; W3 working receipt `54bc509df588a0d5`; W1 working verified
by owned roots/test diffs in the assigned worktree (23:22 UTC), following acknowledgement `50e89a3b6bb6e473`.

## Continuing assignments

| Task | Owner | State | Base / checkout / branch | Scope / acceptance |
| --- | --- | --- | --- | --- |
| MW.5c.1 | W2 | working (review revision) | `d7b0ef7c193b19d873c53ce6e160c5fb82afd343`; r3-copy / r3/touch-actions | touch/focus visibility and 44px controls; light/dark phone/tablet tap/overflow checks; real devices still open |
| MW.3.1 | W3 | working | `4a3472a564106cfd9ad411aad7f6f9cae9766dd3`; `.scratch/worktrees/r3-flows` / r3/flow-packages | approved pure schema/loader, catalog and four Feature/delivery authoring packages/examples, strict graph/asset validation and actual tarball tests; independent architecture/path review required; no executor |

## Next dependency slices

- MW.0f.2: installed reference package content and auto-mount after immutable primitive review.
- MW.0g: actor/admin enforcement and explicit bootstrap; no Editor/trusted-source administration.
- MW.0h: migration/Viewer caps; MW.0c → MW.0d → MW.0e dormant access primitives, then MW.0 activation.
- MW.0a attribution and MW.3a–h package authoring may proceed independently; runtime checks still gate completion.
- MW.1/MW.7 root/config controls wait for MW.0g; full editor/flow/RAG work follows owned foundations.

## Capacity — 2026-11-05 23:16 UTC

Kitty status readouts: W1 default Claude 5h 99% remaining/reset in 4h54m, 7d 99%/6d22h;
W2 account 2 Claude 5h 87%/0h34m, 7d 98%/6d13h. Shared CEO/CTO/W3 Codex weekly 43%
remaining, short-window/reset unavailable. OpenCode GLM Pro reports 5% short-window used (reset ~19:43, timezone unspecified), 1% weekly used.
Decision: three bounded independent worker slices; serial review/integration; preserve Codex capacity
for CTO/CEO checkpoint handling, prefer existing worker context. Recheck roughly hourly while active.

## Open technical boundary

Reference files inside an explicitly RW overlapping project remain protected by current Git overlap
checks in MW.0f.1. Do not bypass them. Installed reference mount/overlapping alias policy needs explicit
resolution before MW.0f.2; no effect on the safe primitive slice.

## Administrator bootstrap contract

CEO confirmed protected OS-owner CLI/control bootstrap is consistent with Personal optional login
(Agent Bus `mdhouse-r3-start/kickoff-confirmed`, 2026-11-05). Local Personal use needs no GitHub/account
onboarding: possession of the existing OS-protected control/CLI authority may establish a browser admin
session. Network location alone, first visitor, project Editor or fallback author cookie never grants it.
Use bounded single-use proof and a revocable HttpOnly session; same-origin, expiry/replay and URL/history/log
secret handling require exact-target review/tests. Security advisory `aef295e88cd01293` accepts the seam; durable contract is ADMIN-W1 in DECISIONS.md.
Admin bootstrap is independent of ordinary project session authentication. Recovery stays OS-controlled.

## RAG prerequisite — verified 2026-11-05 23:21 UTC

MW.2a provider contract is not confirmed. Owner now owns provider enhancements and intends per-project RAG instances; [RAG-CONTRACT.md](RAG-CONTRACT.md), committed by CEO `4a3472a`, collects the required handoff. `#rag@parf.us` help/help-json v0.2.0 advertises record
upsert/get/list, keyword search/index, delete and prompts; no source/job lifecycle or semantic search.
Upsert does perform classification/embeddings. The local provider docs explicitly say namespaces are labels, not access locks. No provider writes or
paid calls ran. [Q-R3-RAG1](workspaces/QUESTIONS.md) is routed to CEO; independent slices continue.
Do not claim the approved full RAG lifecycle is implemented by these record methods.

## Integration evidence

- Copy: author `08dddd35ba00a6b5eb4c9b63115b2272cd087d05` reviewed by CTO; integrated unchanged as `d7b0ef7c193b19d873c53ce6e160c5fb82afd343`. Suite 307/307 and tsc passed; CTO scratch Chromium 390px light/dark real text+HTML clipboard preserves authored glyphs and removes injected chrome; focus/click opens add form. Artifacts `.scratch/r3-cto-qa/{light,dark}.png`. Safari/Firefox/context-menu/real iOS checks remain open, so MW.5b stays partial.
- License: author target `625253e90c93ff238d9cccdbad4070cef4966edb` reviewed by CTO; integrated `ecf0e5b` + `e9c1b779de23ce4741e9fd9a0ee896a6a813000e`. CHANGELOG conflict resolved by retaining both Copy and license entries. Actual tarball/full checks on main pending; parent R3a stays open.
- References: author target `0104385c13257360da184e16f5ecd8e21748ec7d`, Review PASS `aaa49e279395f61f` with reproduced 315 tests/tsc. Integration held for CTO follow-up on `/api/ab/send` reference mutation delegation; material fix needs fresh verdict. No production auto-mount exists yet.

All release/parent checkpoints remain open.

## Test coordination

Baseline full suite on docs-only main: 306 pass, C6 failed binding 61914 while W3 ran another suite;
W3 saw C1/C4 concurrently. Evidence names a fixed-port collision, not a license/code regression.
All workers now serialize route/CLI/full suites using `flock /tmp/mdhouse-r3-tests.lock bun test`.
W3 locked CLI rerun: 10 pass / 0 fail (C1/C4 included); full suite pending. Typecheck on docs-only
main passed. Integrated HEAD still requires its own tests.
