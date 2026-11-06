# R3 execution

Owner-authorized complete R3 implementation/testing; CTO owns shared plan edits/status. No push, publish or deploy.
Base implementation revision: `c1fb27f35cbd82270c754e4dfc6a562d36e0924d`; launcher-only main update:
`3af3ca0c939c7d5830685bbe175cad654eac5d00`. Target: `main`.

## Current checkpoint — 2026-11-06

Done/integrated: [№MW.0f](workspaces/TODO.md#MW.0f) immutable references, [№MW.0a](workspaces/TODO.md#MW.0a)
fallback author, license/scheme/Copy-touch implementation slices, 39 authoring packages and pure-run
core, [№MW.8](workspaces/TODO.md#MW.8) passive content (`3b044d5`) and dormant classification
(`484a277`). Latest controlled full: `fdb4098`, 703/0 + tsc; no new suite for documentation changes.
[№MW.0d.1](workspaces/TODO.md#MW.0d.1): approved `b9986d2`, integrated `e5382e1`, pure/mock scope done.
[№MW.0d.2](workspaces/TODO.md#MW.0d.2): approved cohort `3dd661e`, integrated `c529bf1`; codec/store foundation done, no runtime authentication or routes.
[№MW.2a.1a](workspaces/TODO.md#MW.2a.1a): approved cohort `4087601`, integrated `ae04901`; standalone local-plan bin done, no connected provider transport/index/search.
Admin/OAuth/access wiring, materialization, RAG runtime and cross-browser/real-device release QA stay
open. Country/identity rules are current in [DECISIONS](workspaces/DECISIONS.md); historical pending
reports below are chronological evidence, not current blockers.

## States

Planned → assigned → working → ready → reviewed → integrated → done.
A checkpoint closes only after acceptance/checks pass on integrated HEAD and its SHA is recorded.
Read-only evidence and acknowledgements do not prove implementation. Every worker owns its commits.
All implementation uses isolated worktrees; CTO integrates serially. Plans remain CTO-owned.

## Initial slices

| Task | Owner | State | Checkout / branch | Scope and acceptance | Dependencies / verification |
| --- | --- | --- | --- | --- | --- |
| <a id="R3-A1"></a>R3-A1 | W1 | done (analysis only) | main at base | roots/access/prefs/CLI mutation evidence; no implementation | report on Agent Bus r3-kickoff/r3-evidence-20261105 |
| <a id="R3-A2"></a>R3-A2 | W2 | done (analysis only) | main at base | Copy and mobile premise evidence; browser check pending | same evidence route |
| <a id="R3-A3"></a>R3-A3 | W3 | done (analysis only) | main at base | actual npm pack license mismatch and missing flow family confirmed | same evidence route |
| <a id="R3-A4"></a>R3-A4 | Review | done (advisory only) | base revision, read-only | independent foundation sequencing advisory; no future-code approval | B1–B3/S1–S3 incorporated; exact-target verdicts still required |
| [№MW.0f.1](workspaces/TODO.md#MW.0f.1) | W1 | done (primitive slice) | `.scratch/worktrees/r3-reference` / `r3/reference-foundation` | roots/server/control types and focused tests; immutable root kind, explicit reference registration, promotion/removal/direct write denial, project identity preserved; no auto-mount/default flip | no implementation dependencies; preserve Git overlap denial; independent exact-SHA review + focused/all tests/tsc |
| [№MW.5b](workspaces/TODO.md#MW.5b) | W2 | integrated; partial acceptance | `.scratch/worktrees/r3-copy` / `r3/copy-controls` | document chrome Copy exclusion in styles/Doc if needed; preserve source glyphs, focus/accessibility; no access defaults | independent; scratch light/dark/narrow selection/clipboard and controls checks; unavailable Safari/Firefox checks stay open |
| [№MW.L](workspaces/TODO.md#MW.L) | W3 | done | `.scratch/worktrees/r3-license` / `r3/license` | LICENSE → LICENSE.md, package.json, README, CHANGELOG, package-content test; official approved text/copyright, actual tarball regression | independent; no version/dependency changes; focused pack test/all tests/tsc, CTO review |

Worker docs: report needed shared Plans/README and R3 checkpoint updates to CTO. CHANGELOG overlap is
resolved during integration; preserve other workers' entries. Ready reports include exact base/target,
owned paths/commit, checks, gaps and next step. Material fixes invalidate prior review.

Implementation base for all three initial slices: `035b46510454a79b365288985e5f40c4f02919bb`.
W2 working receipt `432972659a6078d0`; W3 working receipt `54bc509df588a0d5`; W1 working verified
by owned roots/test diffs in the assigned worktree (23:22 UTC), following acknowledgement `50e89a3b6bb6e473`.

## Continuing assignments

| Task | Owner | State | Base / checkout / branch | Scope / acceptance |
| --- | --- | --- | --- | --- |
| [№MW.5c.1](workspaces/TODO.md#MW.5c.1) | W2 | done (touch-control slice) | `d7b0ef7c193b19d873c53ce6e160c5fb82afd343`; r3-copy / r3/touch-actions | touch/focus visibility and 44px controls; light/dark phone/tablet tap/overflow checks; real devices still open |
| [№MW.3.1](workspaces/TODO.md#MW.3.1) | W3 | done (authoring/schema only) | `4a3472a564106cfd9ad411aad7f6f9cae9766dd3`; `.scratch/worktrees/r3-flows` / r3/flow-packages | approved pure schema/loader, catalog and four Feature/delivery authoring packages/examples, strict graph/asset validation and actual tarball tests; independent architecture/path review required; no executor |
| [№MW.0f.2](workspaces/TODO.md#MW.0f.2) | W1 | done (mount/UI slice) | `a9b331f6ab411cd590a771db4cc36efe94adb776`; `.scratch/worktrees/r3-reference-install` / r3/reference-install | installed doc auto-mount, conservative duplicate/ref-only handling, read-only UI identity and no agent-send; independent exact-SHA review + actual packed install/browser checks |
| [№MW.5a](workspaces/TODO.md#MW.5a) | W2 | done (scheme + inline layout) | `80c17e65017c5a4febf14502c1ac52348aea2e62`; `.scratch/worktrees/r3-edit-scheme` / r3/edit-scheme | configurable custom editor scheme, reject browser/executable schemes, atomic config validation, encoded links and Settings UI; independent URI/config review |

## Next dependency slices

- [№MW.0f.2](workspaces/TODO.md#MW.0f.2): installed reference package content and auto-mount after immutable primitive review.
- [№MW.0g](workspaces/TODO.md#MW.0g): actor/admin enforcement and explicit bootstrap; no Editor/trusted-source administration.
- [№MW.0h](workspaces/TODO.md#MW.0h): migration/Viewer caps; [№MW.0c](workspaces/TODO.md#MW.0c) → [№MW.0d](workspaces/TODO.md#MW.0d) → [№MW.0e](workspaces/TODO.md#MW.0e) dormant access primitives, then [№MW.0](workspaces/TODO.md#MW.0) activation.
- [№MW.0a](workspaces/TODO.md#MW.0a) attribution and [№MW.3a](workspaces/TODO.md#MW.3a)–[№MW.3h](workspaces/TODO.md#MW.3h) package authoring may proceed independently; runtime checks still gate completion.
- [№MW.1](workspaces/TODO.md#MW.1) web root/config controls wait for [№MW.0g](workspaces/TODO.md#MW.0g); [№MW.7](workspaces/TODO.md#MW.7) is read-only query + targeted open, no AB mutations; full editor/flow/RAG work follows owned foundations.

## Capacity — 2026-11-05 23:16 UTC

Kitty status readouts: W1 default Claude 5h 99% remaining/reset in 4h54m, 7d 99%/6d22h;
W2 account 2 Claude 5h 87%/0h34m, 7d 98%/6d13h. Shared CEO/CTO/W3 Codex weekly 43%
remaining, short-window/reset unavailable. OpenCode GLM Pro reports 5% short-window used (reset ~19:43, timezone unspecified), 1% weekly used.
Decision: three bounded independent worker slices; serial review/integration; preserve Codex capacity
for CTO/CEO checkpoint handling, prefer existing worker context. Recheck roughly hourly while active.

## Open technical boundary

Reference files inside an explicitly RW overlapping project remain protected by current Git overlap
checks in [№MW.0f.1](workspaces/TODO.md#MW.0f.1). Do not bypass them. Installed reference mount/overlapping alias policy needs explicit
resolution before [№MW.0f.2](workspaces/TODO.md#MW.0f.2); no effect on the safe primitive slice.

## Administrator bootstrap contract

CEO confirmed protected OS-owner CLI/control bootstrap is consistent with Personal optional login
(Agent Bus `mdhouse-r3-start/kickoff-confirmed`, 2026-11-05). Local Personal use needs no GitHub/account
onboarding: possession of the existing OS-protected control/CLI authority may establish a browser admin
session. Network location alone, first visitor, project Editor or fallback author cookie never grants it.
Use bounded single-use proof and a revocable HttpOnly session; same-origin, expiry/replay and URL/history/log
secret handling require exact-target review/tests. Security advisory `aef295e88cd01293` accepts the seam; durable contract is [№ADMIN-W1](workspaces/DECISIONS.md#ADMIN-W1) in DECISIONS.md.
Admin bootstrap is independent of ordinary project session authentication. Recovery stays OS-controlled.

## RAG prerequisite — verified 2026-11-05 23:21 UTC

[№MW.2a](workspaces/TODO.md#MW.2a) provider contract is not confirmed. Owner now owns provider enhancements and intends per-project RAG instances; [RAG-CONTRACT.md](RAG-CONTRACT.md), committed by CEO `4a3472a`, collects the required handoff. `#rag@parf.us` help/help-json v0.2.0 advertises record
upsert/get/list, keyword search/index, delete and prompts; no source/job lifecycle or semantic search.
Upsert does perform classification/embeddings. The local provider docs explicitly say namespaces are labels, not access locks. No provider writes or
paid calls ran. [№Q-R3-RAG1](workspaces/QUESTIONS.md#Q-R3-RAG1) is routed to CEO; independent slices continue.
Do not claim the approved full RAG lifecycle is implemented by these record methods.

## Integration evidence

- Copy: author `08dddd35ba00a6b5eb4c9b63115b2272cd087d05` reviewed by CTO; integrated unchanged as `d7b0ef7c193b19d873c53ce6e160c5fb82afd343`. Suite 307/307 and tsc passed; CTO scratch Chromium 390px light/dark real text+HTML clipboard preserves authored glyphs and removes injected chrome; focus/click opens add form. Artifacts `.scratch/r3-cto-qa/{light,dark}.png`. Safari/Firefox/context-menu/real iOS checks remain open, so [№MW.5b](workspaces/TODO.md#MW.5b) stays partial.
- License: author target `625253e90c93ff238d9cccdbad4070cef4966edb` reviewed by CTO; integrated `ecf0e5b` + `e9c1b779de23ce4741e9fd9a0ee896a6a813000e`. CHANGELOG conflict resolved by retaining both Copy and license entries. Actual tarball/full checks passed at `80c17e6`; [№MW.L](workspaces/TODO.md#MW.L) done, parent [№R3a](TODO.md#R3a) stays open.
- References: author target `0104385c13257360da184e16f5ecd8e21748ec7d` integrated as `be776cf254f3be0bf945f6c164a6f93a832d26ca`; dispatch author `a9b331f6ab411cd590a771db4cc36efe94adb776` integrated as `6bd2300`. Review exact-HEAD PASS `64822a48f88075d7` and CTO full suite 317/317 + tsc at `80c17e65017c5a4febf14502c1ac52348aea2e62`; [№MW.0f.1](workspaces/TODO.md#MW.0f.1) closed, parent [№MW.0f](workspaces/TODO.md#MW.0f) open for auto-mount/content/UI.
- Touch controls: author `e4bbcdb` + `0f603c3`, integrated `f434fd5` + `80c17e6`; CTO inspected light/dark 390px screenshots and diff; six touch-emulated dimensions/themes passed tap/overflow checks, with 44px targets and no target/text overlap. Full 317/tsc green on integrated HEAD. [№MW.5c.1](workspaces/TODO.md#MW.5c.1) closed; parent mobile journey/device/keyboard gaps remain open. Artifacts `.scratch/r3-cto-qa/touch/`.


All release/parent checkpoints remain open; only named implementation slices and [№MW.L](workspaces/TODO.md#MW.L) are closed.

## Test coordination

Baseline full suite on docs-only main: 306 pass, C6 failed binding 61914 while W3 ran another suite;
W3 saw C1/C4 concurrently. Evidence names a fixed-port collision, not a license/code regression.
All workers now serialize route/CLI/full suites using `flock /tmp/mdhouse-r3-tests.lock bun test`.
W3 locked CLI rerun: 10 pass / 0 fail (C1/C4 included); full suite pending. Typecheck on docs-only
main passed. Integrated HEAD still requires its own tests.

## Integrated cohort — exact `ea7ebda946f10059bf2f67a3f5d1e2b1d175fa4d`

CTO full suite: 483 pass, 0 fail, 2525 assertions; tsc clean. Independent Review receipt
`c1669691ad2979a6`: exact-HEAD PASS, focused 180/180 and tsc; source identity with approved targets.
This verifies the integrated scopes, not content isolation or admin wiring.

| Scope | Author target / integration | Actual checkpoint |
| --- | --- | --- |
| [№MW.0f.2](workspaces/TODO.md#MW.0f.2) | `bfee754` / `052eaf8` | mount/UI complete; reference editor/AB/write controls absent |
| [№MW.0f](workspaces/TODO.md#MW.0f) content | `c4a18e3` / `4de0d3`; CEO pointer update `b5e81a3` | packaged skills, plans/index, canonical symlink and rendered links verified |
| [№MW.0g.1](workspaces/TODO.md#MW.0g.1) | `0fed9cf` / `27f6800` | dormant proof/session primitive complete; no production wiring |
| [№MW.0a](workspaces/TODO.md#MW.0a) | `78344d9` / `b11e47f` | fallback author attribution implemented; real authenticated precedence remains future OAuth acceptance |
| [№MW.5a](workspaces/TODO.md#MW.5a) | `5b944b4` / `6721a90`; inline `744febc` / `282a98d` | scheme complete; reference gate retained |
| [№MW.3.1](workspaces/TODO.md#MW.3.1) | `6f7e023` / `bf4d205` + `0fc6aec` | schema/loader + four initial packages complete; no runner |
| [№MW.3a](workspaces/TODO.md#MW.3a) | `368499e` / `6fa8afe` | five documentation authoring packages shipped; runtime acceptance open |
| [№MW.3b](workspaces/TODO.md#MW.3b), [№MW.3c](workspaces/TODO.md#MW.3c) | `cee699b` / `ea7ebda` | commit/incoming authoring assets shipped; execution acceptance open |

[№MW.8a](workspaces/TODO.md#MW.8a): W1 passive server HTML/raw/CSP work in isolated
`r3/passive-server`, base `b11e47f`. [№MW.8b](workspaces/TODO.md#MW.8b): W2 browser/Mermaid
work in `r3/passive-browser`, same base. Both await exact-target security review and combined browser
acceptance. Admin wiring stays on hold. Current main still uses trusted HTML.
[№MW.3d](workspaces/TODO.md#MW.3d): first four Engineering assets ready at `a9318cfe8a90abb057c1761fa9cccb8e8bb6e4b1`,
base `ea7ebda`; CTO review/integration pending. No source/runtime scope claimed.

## Updated administration contract

[№ADMIN-W1](workspaces/DECISIONS.md#ADMIN-W1): CLI/control uses protected local process-OS-owner
administration, without GitHub/web-admin/project grants. Personal/no users keeps owner management;
users require Team with valid configured admin bound to immutable provider ID. First-user/admin setup
is atomic; invalid mode/profile/admin combinations fail closed. Team web user management, external-root
add and project properties (RW/RO included) require configured admin. No broader inside-workspace grant
is inferred. [№MW.7](workspaces/TODO.md#MW.7) AB scope is read-only query/inventory plus authorized,
jailed targeted page opening; root/config/user/grant mutations removed from implementation acceptance.
Current source has no new AB control mutation implementation to remove; CLI/control and page agent-chat
remain separate. Future web/admin/profile wiring must implement these checks and negative transition tests.

## Capacity — 2026-11-06 00:00 UTC

W1 default Claude: 5h 94% remaining/reset 4h09m; 7d 99%/6d21h. W2 account 2:
5h 99%/4h49m; 7d 97%/6d12h. Shared Codex weekly 41% remaining; short-window/reset unavailable.
No fresh Review quota available. Continue bounded worker slices; serialize tests/review/integration.

## Engineering authoring checkpoint

[№MW.3d](workspaces/TODO.md#MW.3d), first four packages: CTO reviewed target
`a9318cfe8a90abb057c1761fa9cccb8e8bb6e4b1` from `ea7ebda`; integrated without conflict as
`25cb68a9ad4288604e68d8495b99eda1cbc378f1`. Assets/catalog/coverage/tests are byte-identical to
that target; source/schema unchanged. Exact integrated HEAD: full 497/497, 2753 assertions, tsc clean.
The library now ships 15 authoring packages. Missing rollback/setup evidence blocks dependent claims;
unknown ownership/security/license remains unknown. No execution or permissions are implemented.
Second Engineering batch approved: incident/regression, delivery sync, API/schema impact, maintenance/debt;
W3 owns assets/catalog/coverage/tarball tests/CHANGELOG only, preserving the first 15 packages.
Parent and manual/scheduled runtime acceptance remain open.

## Passive-content review handoff

[№MW.8a](workspaces/TODO.md#MW.8a) target `d9f4290c8facf8681d84d7fa0a0ed22e86525a46`
(base `b11e47f`) is frozen for independent security review; it is not integrated. W1 reports server
sanitizer/raw/CSP positive and negative browser evidence, full 528/528 and tsc; independent verdict pending.

[№MW.8b](workspaces/TODO.md#MW.8b) prototype found a material control-forgery gap: authored HTML with
renderer classes and exact current data-line/data-hash caused a real target write after one decoy click.
This is a blocker for the combined boundary. W1 owns a separate provenance followup commit, including
exact list-shaped forgery negatives and genuine control positives; current reviewed target stays frozen.
W2 owns client HTML sinks, empty raw-HTML iframe sandbox and locked strict Mermaid rendered as inert
SVG images. Diagram labels become non-selectable; callbacks stay inactive. Repeatable baseline/fixed
browser corpus is approved without adding a DOM test runtime. Shiki/table styles must survive the client
filter; element counts alone do not prove that. W1 coordinates any direct sanitizer dependency/lock
followup. Whole boundary and admin wiring remain open pending combined exact-SHA review and tests.

Server-only Review receipt `7832e89cdff448e6`: PASS bound to frozen `d9f4290`; independent full
528/528, 2604 assertions and tsc, plus additional live adversarial URL/CSS/namespace/raw-header checks.
No whole-boundary/admin-wiring approval. Integration waits for the provenance followup and fresh review.

Superseded CTO direction (not integrated) for [№MW.8a](workspaces/TODO.md#MW.8a): generated HTML tokens are
tracked by identity; authored raw HTML start tags lose class/role/renderer data attributes before final
passive sanitization. Markdown attribute syntax accepts authored IDs only, not classes: `{.tgt}` can
otherwise impersonate a genuine control. Preserve anchors and source Copy; update syntax/Markdown docs
and CHANGELOG with the implementation. Test malformed/cross-token fragments, exact nested list forgery
and genuine controls. Direct DOMPurify dependency is planned to be pinned to 3.4.17, with Mermaid deduplication only
inside its declared compatible range; W1 owns the manifest/lock followup, W2 consumes the shared version.
Official [release notes](https://github.com/cure53/DOMPurify/releases/tag/3.4.17) confirm the maintained
version's security fixes. A directly imported HTML parser must also be a declared dependency.

Compatibility correction: CEO confirmed that `{#id .class}` and raw passive classes are an existing
promised feature. CTO withdrew the class-removal/id-only direction before integration; syntax docs and
main implementation remain unchanged. Preserve arbitrary passive classes and explicit IDs. The action
boundary must prove generated-control provenance independently of CSS selectors, exact line/hash and
matching list structure. W1/W2 are assessing a fresh per-render unpredictable marker attached only while
constructing generated actionable nodes, checked on the exact action element against trusted payload
metadata, or an equivalent mechanism. Inherited ancestor markers and a blanket final-HTML marking pass
are insufficient. Strip/isolate authored provenance attributes; guessed/copied/stale markers must fail.
The design is under analysis, not an implemented guarantee. Require arbitrary-passive-class positive
fixtures and real-click forgery negatives alongside genuine control positives; any remaining necessary
compatibility loss goes to CEO before integration. Whole content boundary/admin wiring remain on hold.

## Engineering authoring coverage complete

[№MW.3d](workspaces/TODO.md#MW.3d) second batch target `b5ef918d14f4fe26d31b1621d90ffffeac6e924f`
(base `c2178e8`) received CTO asset/coverage review and integrated without conflict as
`7fb4fbba58057a2a03a48c66c659bce3e2b5fcbd`. Catalog/assets/tests are byte-identical to that target;
first-four defaults/semantic assertions and all prior 15 packages are preserved. Exact integrated HEAD:
full 510/510, 2998 assertions, tsc clean. All eight Engineering authoring packages now ship; parent
manual/scheduled/runtime acceptance remains open. Next W3 batch: five Business authoring packages under
[№MW.3e](workspaces/TODO.md#MW.3e), assets/catalog/independent coverage/tarball tests/CHANGELOG only.

Provenance implementation handoff: W1/W2 coordinate `actToken` in the trusted document payload and
`data-act` on generated action/context nodes only. Fresh per-render randomness; authored provenance
attributes stripped; exact action and context checks, no ancestor fallback. This design is approved
for implementation/testing, not yet verified. Preserve passive classes/styles and explicit IDs.
Require raw/attrs forgery, current line/hash/context, nested control/DOM-repair, guessed/stale-token
negatives at real click sinks plus genuine-action positives. Client sanitization must retain generated
provenance and the approved server passive-style contract. Whole boundary/admin wiring remains open.

## Provenance followup — intermediate target and approved next step

W1 intermediate `2947f56d23951ae9290d78438636bf4d6ce49672` follows frozen `d9f4290`, without
amendment or integration. Authored classes/IDs remain supported. Authored raw HTML loses renderer data
attributes; unfinished start tags/comments become inert text across token boundaries. W1 reports full
531/531 and tsc; independent review of this followup is pending. Direct htmlparser2 12.0.0 and DOMPurify
3.4.17 are pinned, with compatible Mermaid resolution; lock changes need fresh review.

W1's real browser probe demonstrated that authored list markup can re-parent a genuine question control
under a different item. Ancestor lookup can then apply a genuine action to the wrong line/hash. The
approved next server/client step therefore puts each generated action's own line/hash/op/option on the
actionable node, with a fresh 128-bit per-render `actToken` in the trusted payload and matching `data-act`
on that node. Authored provenance attributes are stripped. Client reads no ancestor action context;
a re-parented genuine control acts on its original item or becomes inert, never another item.

W1 owns server generation/payload/allowlist and W2 owns exact-node checks. Verify malformed/nested
fragments, copied/guessed/stale tokens, generated descendants, live updates, superseded responses,
document switches and open drafts/forms. Payload/token and rendered DOM must stay paired. This token
is DOM provenance, not server authorization: same-origin, root/actor and stale-write checks remain
independent. Final combined target still requires fresh exact-SHA security review and real-click
negative/positive browser evidence. Whole [№MW.8](workspaces/TODO.md#MW.8) and admin wiring remain open.

## Business authoring checkpoint

[№MW.3e](workspaces/TODO.md#MW.3e) Business target `7ef988a1ba4b579116c806d72bcbdb95fa481bd3`
(base `d931d94`) received CTO asset/coverage review and integrated without conflict as
`74c018d4c3f5784f93e80673b7d3e96f173280cd`. Catalog/assets/matrix/tests match the author target;
all previous 19 packages and checks remain. Exact integrated HEAD: full 527/527, 3300 assertions,
tsc clean. Library now ships 24 authoring packages. Examples preserve metric/cohort comparability,
source limitations, scenario assumptions and pending decision authority. No runtime or provider call
is implemented. Ideas and the parent manual/scheduled/runtime acceptance remain open.
Next W3 batch: five Ideas packages, assets/catalog/independent coverage/tarball tests/CHANGELOG only;
no source/schema/Plans changes or live research/actions.

Browser prototype receipt `d1dc5343485d9e8a`: W2 reports 34 hostile and two positive fixtures passing;
no committed browser target yet. Baseline active HTML produced script/probe/navigation effects.
A mixed allowed/forbidden CSS declaration initially preserved a `url()` request; W2 corrected attribute
reconstruction and reran the affected negatives/positives. Keep this regression in the repeatable
corpus. Computed passive colours, font styles, author classes, Shiki colours and table alignment were
checked; this does not yet prove action provenance. W1/W2 may share a pure style-allowlist module in
the next unfrozen target to prevent policy drift, subject to fresh review.

Client payload/DOM pairing uses the trusted Preact body ref with `data-act-root`, never an authored
ancestor/ID/class selector; authored root-marker attributes are stripped. Action metadata must be
validated on the generated control itself. Final real-click forgery/genuine-action and live-draft
checks await W1's exact server metadata commit. Whole content boundary/admin wiring stays open.

## Server token target sent for fresh review

[№MW.8a](workspaces/TODO.md#MW.8a) exact target
`c6a1965f61b0891e36a6e7ac0340b5643af67c4d` is frozen on `r3/passive-server`, clean, from
`b11e47f` through `d9f4290` and `2947f56`. New commit marks generated actionable nodes with per-render
`actToken` and their own qa/line/hash/k/severity/option/reply metadata. Authored `data-act*` is removed;
passive allowlist adds exactly eight generated provenance names, not arbitrary root-marker attributes.
Nested renders/file highlighting/diff lines receive no action token. Classes and syntax remain supported.
W1 reports full 537/537 and tsc, plus normal Q&A/Shiki/Mermaid scratch checks; independent server-stack
review requested under `mw8a-c6a1965-server-stack`. W2 has the exact server target/API for client tests.

No client gate is connected in that server target; it does not yet stop action forgery or close the
whole boundary. Require final operation dispatch to use trusted generated action metadata and reject
class/role/ancestor confusion, alongside token/context checks and stale guards. Client real-click
negative/positive/lifecycle corpus and combined exact-SHA security review still gate integration.
Shared style policy extraction, if needed, is a separate followup; frozen targets stay unchanged.

Shared-style followup `09b3cd7461044fec0a02443bdcbe9689384379f0` is a separate commit above frozen
`c6a1965`. CTO compared the delta: identical style-property/value regexes moved into pure
`src/lib/passive-style.ts`, imported by server; new CSS edge-case tests cover comments, important,
escapes, case, duplicates and mixed declarations. W1 reports full 538/538 and tsc. Fresh final-target
delta review requested; W2 consumes the shared policy. Standard CSS property normalization and
case-sensitive custom properties need explicit client/server corpus checks. No source integration or
whole-boundary completion is claimed before the client gate and combined review.

## Ideas authoring checkpoint

[№MW.3e](workspaces/TODO.md#MW.3e) Ideas target `843d405b3ed55570274e0a978270a07fa119e4fb`
(base `84d3891`) received CTO asset/coverage review and integrated without conflict as
`c580622cbe1f3f39e6910cb141c028cadc07bed2`. Assets/catalog/matrix/tests match the author target;
all previous 24 packages/defaults/checks remain. Exact integrated HEAD: full 544/544, 3597 assertions,
tsc clean. Library now ships 29 authoring packages. Original idea IDs, rejected alternatives and
unanswered questions remain; project handoff is inert metadata, not creation/configuration/send.
Business and Ideas authoring are represented; parent/runtime/manual/scheduled acceptance remains open.
Next W3 batch: five Finance packages under [№MW.3f](workspaces/TODO.md#MW.3f), assets/catalog/
independent coverage/tarball tests/CHANGELOG only; no source/schema/Plans, provider calls or financial actions.

## Independent server provenance verdict

Review receipt `64916c558e64eefb`: PASS bound exactly to
`c6a1965f61b0891e36a6e7ac0340b5643af67c4d`, full 537/537, 2744 assertions, tsc clean,
plus independent authored-fragment and live metadata/class-preservation checks. This covers the
server stack only. Shared-style `09b3cd7` is excluded from that verdict and remains in the final
combined-review scope. Passive authored control classes remain in the DOM intentionally; client
exact-node action checks must prove they are inert before whole-boundary completion.

Process correction: CTO allowed the next separate author commit while the same checkout was under
review. Review reproduced the exact target in a detached checkout; the target commit itself was not
changed. Final combined security review will use a dedicated checkout pinned to its exact SHA until
verdict; author worktrees stay separate. No content-boundary integration/admin-wiring approval follows
from this server-only PASS.

Review receipt `c462f6c137cde2ba`: final server target
`09b3cd7461044fec0a02443bdcbe9689384379f0` PASS, superseding `c6a1965` for server integration.
Independent passive/render 115/115, full 538/538, 2751 assertions, tsc clean; extraction has no policy
delta. Direct edge probes confirm exact custom-property casing, property-key case sensitivity,
comment/entity handling, duplicates, mixed filtering and allowed `!important`. CTO retains the existing
passive `!important` behavior on whitelisted properties; W2 must test parser consistency with the shared
policy or explicitly report conservative differences. Final server target remains frozen/unintegrated;
client action gate and combined review still block whole [№MW.8](workspaces/TODO.md#MW.8)/admin wiring.

## Finance authoring checkpoint

[№MW.3f](workspaces/TODO.md#MW.3f) target `c59750a9ba239ccdd8efc76d1cdfffa7fa4390bb`
(base `7dbafe0`) received CTO asset/coverage review and integrated without conflict as
`25c3515edcd151e446287b6c64e70a0e59588af6`. Assets/catalog/matrix/tests match the author target;
all prior 29 packages/defaults/checks remain. Exact integrated HEAD: full 562/562, 3966 assertions,
tsc clean. Library now ships 34 authoring packages. Formula tests reconcile supplied synthetic table
cells; unknown balances, zero baseline, nonpositive contribution, restricted cash and unexplained
invoice differences retain their limits. No provider access/financial action or production calculation
engine is implemented. Parent/runtime/manual/scheduled acceptance remains open. Next W3 batch is
five Legal authoring packages under [№MW.3g](workspaces/TODO.md#MW.3g), same bounded asset/test scope.

## Capacity — 2026-11-06 01:01 UTC

Kitty status: W1 default Claude 5h 76% remaining/reset 3h12m, 7d 96%/6d21h;
W2 second account 5h 96%/3h48m, 7d 97%/6d11h. Shared Codex weekly 38% remaining;
short-window/reset unavailable. Review shows GLM session context, no fresh provider quota.
Continue bounded independent slices and serialized test/review/integration; reserve shared Codex
capacity for final security checkpoint and handoff. Recheck roughly hourly during active work.

## Legal and full authoring-library checkpoint

[№MW.3g](workspaces/TODO.md#MW.3g) target `345fee13f1d27a689ea5be220400ac6635b8521f`
(base `8df08f5`) received CTO asset/coverage review and integrated without conflict as
`c76a512947d46ff9ed2317fe923148c6ef15a61a`. Assets/catalog/matrix/tests match the author target;
all prior 34 packages/defaults/checks remain. Exact integrated HEAD: full 580/580, 4346 assertions,
tsc clean. Source citations, date/jurisdiction uncertainty, confidentiality and qualified-review stops
are explicit; there are no filings/signatures/sends/reminders or provider calls.

W3 read-only coverage audit found no missing named authoring package: Documentation 5, commits 1,
incoming 1, Engineering 8, Business/Ideas 10, Finance 5, Legal 5; with Feature/delivery 4, catalog 39.
The independent expected-ID matrix and real tarball cover the complete library. This closes the
asset-delivery checkpoints only. [№MW.3a](workspaces/TODO.md#MW.3a)–[№MW.3g](workspaces/TODO.md#MW.3g)
and parent/runtime acceptance stay open for the runner, source controls, permissions/stale checks,
materialization/history/markers, live routing/approvals, manual/schedules and end-to-end checks.

Next W3 assignment is read-only runtime architecture under [№MW.3](workspaces/TODO.md#MW.3) and
[№MW.3h](workspaces/TODO.md#MW.3h): propose the smallest shared manual analysis-run vertical slice,
separating pure transition/state handling from jailed materialization and external-action executors.
Use existing schema/packages and explicit source selection; cover hold/failure/history/marker semantics,
preview/approval seams, effective access and stale writes without inventing grants or new policy.
Map dependencies and owned paths, acceptance/fail-first tests, then return a concrete CTO-reviewable
proposal before any implementation/worktree. No HTTP/admin/schedule/external-action code is assigned yet.

## Pure run-core assignment

[№MW.3.2](workspaces/TODO.md#MW.3.2), owner W3: checkpoint A approved from exact
`06a980ce8296bf114d31ccb852ac97e602830f6d` in isolated `r3/flow-run-core`.
Owned paths: `src/lib/flow-run.ts`, `src/lib/flow-run-markdown.ts`, their two tests,
`doc/flows/README.md`, CHANGELOG. Pure validated run state/transitions and deterministic preview only;
no filesystem/provider/HTTP/UI, permissions or real approval/materialization. Existing package schema
and loader stay unchanged. Caller supplies structured results and source declarations; this headless
harness is not a manual UI or AI executor.

Before editing W3 posts concrete exported input/state/event/result types and limits. Public unknown
inputs are validated into fresh no-alias state; deterministic run ID/time are supplied. Package/source
snapshots and exact revision declarations are bound to the run. Evidence/question statuses are caller
assertions, not verified semantic truth or authenticated owner approval. Honor package missing-evidence
block/report policy; unanswered required questions hold dependent completion. A hold is distinct from an
explicit graph blocked terminal. Consequential nodes and live handoffs stop as unsupported boundaries.

Events carry expected version and ID: exact duplicate delivery is idempotent; same ID with changed
payload, stale/out-of-order or invalid outcomes are rejected without mutation. Terminal runs stay
terminal; a new run may reference its predecessor. Preview uses canonical stable IDs/threads and
preserves supplied words as data, without inventing human approval/decisions or accepting active
Markdown control injection. Bound collections/journal/output sizes. Test existing project-review and
one unrelated generic package, malformed/duplicate/stale events, holds, outcomes and inert boundaries.
Focused/full/tsc and independent exact-SHA architecture review gate integration.

Checkpoint B remains unassigned: jailed writes, actor/access/stale rechecks, apply confirmation,
saved history/marker transactions wait for the required access/content gates and separate approval.
No core-preview result claims a saved document or advanced marker.

Run-core type sketch accepted: create/apply/validate/preview accept unknown public data; state is
reconstructed by bounded replay and compared with derived fields. Input has explicit selection,
validated package snapshot, declared digests/revisions, sources/dirty inputs and evidence/question
assertions. Events update assertions, submit analysis outcomes or cancel; each carries ID/version/time.
Exact duplicates are idempotent; changed-ID payloads, stale nodes/versions/times and terminal changes
are rejected. Limits: 128 nodes/evidence/sources/questions, 256 events, 16 KiB supplied text, 1 MiB
input/state, 4 MiB preview. Public data must be finite bounded JSON-like data, rejecting cycles/depth
and oversize values. Digests/revisions are exact hex; timestamps are valid supplied UTC values.

Caller digests are declarations, not proof of a trusted installed artifact; replay checks consistency,
not authenticity or a tamper-proof journal. Later materialization independently rechecks trusted
packages, sources and access. Evidence keys bind to declared package requirements; duplicate/unknown
entries or invalid references are rejected. Preview keeps supplied payloads in collision-safe inert
JSON fences, never dynamic Markdown controls or fabricated human approvals. No additional paths or
materialization scope is authorized by this accepted sketch.

## Run-core architecture review handoff

[№MW.3.2](workspaces/TODO.md#MW.3.2) target `8fe2df3d4ff671c320a3fe210a05cac69b70e54b`
(base `06a980c`) is ready/frozen, exactly six assigned paths. Author reports focused/full/tsc OK,
project-review and generic Legal fixtures, replay/idempotency/hold/limit/accessor/cycle tests and
hostile-preview rendering negatives. No schema/assets/dependency/lock/Plans change is in the target.
CTO prepared dedicated detached checkout `.scratch/worktrees/r3-flow-run-core-review` pinned to that
SHA and sent independent architecture review under `flow-run-core-8fe2df3`. That checkout remains
unchanged until verdict; author branch is separate. Target is not integrated. Review covers bounded
public-data/state replay, fresh snapshots, event-order/retry semantics, unsupported boundaries and
inert preview/provenance claims. Materialization and live runtime remain outside this checkpoint.

## Combined browser/security review handoff

[№MW.8b](workspaces/TODO.md#MW.8b) browser target
`31e4992b26e5d11d6e9f02c1c2b43f202fb205aa` is based on final server
`09b3cd7461044fec0a02443bdcbe9689384379f0`. Dedicated detached checkout
`.scratch/worktrees/r3-passive-combined-review` is pinned to that target until verdict; review route
`mw8-combined-31e4992`. Author reports hostile/style corpus, real-click action cases, draft/live/doc
switch checks and full/tsc green. Passive classes/styles and Mermaid image behavior are included.
No whole-boundary verdict or source integration is claimed.

Remaining browser gap: raw `.html` iframe lacks an actual browser fixture; W2 owns a separate test-only
followup with active negative/passive positive evidence. CTO also found `markedAt()` using
`closest('[data-act]')` despite the exact-clicked-node handoff. W2/Review must reproduce unmarked
nested descendants at the real action sink, assess source-reparent applicability and fix or justify
the precise rule without silently weakening the provenance acceptance. Pinned review target stays
unchanged while author followups use new commits. Whole content/admin gate remains on hold.

## Pure core integration and smoke-procedure hold

Independent receipt `9c6c21f4f63f3bdc` approved [№MW.3.2](workspaces/TODO.md#MW.3.2) exactly at
`8fe2df3`; integrated as `d10524ea413e94ef946ddaec9bc56b4d5a089c76`. Source, tests and flow README
are byte-identical; integration adds Plans/README module/boundary documentation and preserves the
CHANGELOG. Full 598/598 and tsc passed; the documentation amendment changes no tested source.
Exact-HEAD identity/focused recheck requested under `flow-core-d10524e`, in dedicated pinned checkout
`.scratch/worktrees/r3-flow-run-integrated-review`. Checkpoint closure waits for that verdict.
Materialization/live runtime stays unassigned; keep caller-assertion disclaimers in later output.

Owner now holds all new browser smoke until a common reusable startup/cleanup procedure is verified.
Pure tests/static analysis continue. W1 owns `scripts/safe-smoke.ts` and `test/safe-smoke.test.ts` in
`r3/safe-smoke`, base `4399dd6`; no browser is needed for the allowed procedure tests. Preflight all
ports; reject live/invalid/duplicate ports; never reuse a foreign endpoint. Capture spawned own PIDs/
process groups, verify binding and expected canonical roots, and abort on startup/identity failure.
Cleanup only captured owned processes/groups, never a listener-derived PID; temporary cleanup only
own mkdtemp paths. Test busy foreign fixture stays alive, normal own start/cleanup and failure paths,
then focused/tsc and independent safety review before lifting browser HOLD. CEO's CLI/common docs
fix `4399dd6` has been read. Impact/ownership of earlier W2 cleanup is still pending.

Browser followups above frozen `31e4992`: test-only
`b165a2d4251ae085f93b00779a3b8bef7d9a7798`, then fix
`1f4e47502155387a3512a5b8750985a01e6e6b33`. W2 confirms ancestor fallback by source inspection;
new browser reproduction remains unrun during HOLD. Fix restricts writes/form buttons to the exact
marked event target; item/reply containers may open their own form only. Double-click selection is
limited to marked glyph/row, with the UX change in CHANGELOG. New tests cover nested planted children,
raw HTML active/passive iframe fixtures and baseline/fixed behavior, but are not yet acceptance evidence.
Static delta review was requested; pinned `31e4992` remains unchanged.

W2's new `passive-lib` process helper must consolidate with W1's common safe-smoke lifecycle rather
than creating a second independent launcher. Fixture/CDP helpers may remain separate. After the
procedure passes review, run clean baseline/fixed corpora through the common helper; retain failed
attempts separately. Whole content boundary and browser smoke remain on hold until the respective gates.

## Common safe-smoke review

W1 helper target `8df1d5e22c8b55bf38926fde814d1c9402db6571` from `4399dd6` is ready/frozen;
exactly `scripts/safe-smoke.ts` and `test/safe-smoke.test.ts`. Shared CLI/import lifecycle preflights
ports, starts detached owned groups, verifies listener/root identity and tears down captured groups.
Author reports focus/full/tsc green with non-browser fixtures. Dedicated pinned checkout
`.scratch/worktrees/r3-safe-smoke-review`; independent safety review `safe-smoke-8df1d5e` requested.

Source findings: run-after-stop can start an untracked-for-cleanup group; startup continuation may
spawn after stop begins. W1 is assigned fixture reproduction and a separate guarded followup branch/
commit, leaving pinned target unchanged. Review also examines signal/ESRCH cleanup races, hidden
listener identity and startup errors. These are not yet cleared; no procedure PASS or browser-HOLD
lift. W2's corpus lifecycle must reuse the common helper once accepted.

Combined browser receipt `76991e96b77086a3` gives PASS only to old `31e4992`, with author-followup
`1f4e475` still outside that verdict. Timing of Review browser checks versus owner HOLD is being
confirmed; do not count disputed runs as clean acceptance. Raw-file and exact-node followups must run
through the reviewed helper after the procedure gate. Final combined source remains unintegrated.

[№MW.3.2](workspaces/TODO.md#MW.3.2) closed for checkpoint A: independent integrated receipt
`5b3cf2a135e5e49d` PASS bound exactly to `d10524ea413e94ef946ddaec9bc56b4d5a089c76`.
Source/tests/flow README match approved `8fe2df3`; focused 85/85 and tsc passed. CTO full-suite
evidence remains 598/598 on the unchanged integrated code. Materialization B/live runtime stays
unassigned; W3 pauses implementation at this verified boundary while other gates complete.

Static followup receipt `36f9eae8dec1006d` accepts exact-node production fix `1f4e475`, with
full/tsc green; dynamic tests remain unrun during HOLD. Its claim that `b165a2d` contains no launcher
was disproved by CTO reading the exact `scripts/passive-lib.ts` blob: Bun.serve probe/free-port,
Bun.spawn server/Chrome and kill-loop lifecycle are present. Review was asked to correct the scope.
This does not invalidate the separately inspected exact-node handler delta, but no launcher safety
approval follows from that report. W2 must replace duplicate lifecycle with the common reviewed
safe-smoke helper before clean browser acceptance.

Safe-smoke followup `96cdfccef50f6a388e19d7b96521a920604be440` follows frozen `8df1d5e`;
only helper and its tests change. W1 reproduced old failures without Chrome: signal during startup
continued into command/fake-Chrome with wrong exit status, run-after-stop launched a group, and ESRCH
aborted cleanup leaving own temp data. New guards reject start/run after stop begins and tolerate
ESRCH; signal exit status is preserved. Brief PID-hidden startup state is bounded to two seconds,
then refuses use. Author reports focus 22/22 twice, full/tsc green and no remaining own fixtures.
Dedicated pinned review checkout `.scratch/worktrees/r3-safe-smoke-guard-review`, safety review
`safe-smoke-96cdfcc`. Review must still examine mixed visible/hidden listener identity and spawn/
cleanup failure paths. No helper approval/browser-HOLD lift yet. Existing CLI test path parsing may
misread a checkout name containing `stop`; W1 renamed its worktree, without changing that unrelated test.

Independent helper receipt `eed9ddf803e42ce5`: old `8df1d5e` NEEDS FIX. Review reproduced two
own-listener hidden-PID failures (17/19), plus ESRCH cleanup and run-after-stop defects. Followup
`96cdfcc` addresses these and is under fresh review. CTO also requires per-row listener attribution
for mixed visible/hidden sets and a handled async spawn-error path; W1 owns another separate
followup atop `96cdfcc`, with fail-first non-browser fixtures. No helper PASS/browser-HOLD lift.

Review reports in `e14f34b3675470fa` that its old combined browser runs finished before receiving
owner HOLD, with no subsequent browser run. This is retained as reviewer-confirmed chronology;
clean final acceptance will still use the reviewed common helper. Its repeated empty-port explanation
for `:7795` remains contradicted by live listener/API evidence; a separate narrow current-PID ownership
query was sent. Active Review-check impact is confirmed separately, not used to infer unknown cleanup
ownership or a stopped `:7795` process.

Consolidated old-helper receipt `e843c7825f57f552` adds cleanup failure semantics: temporary-directory
removal errors must not skip other owned cleanup/bookkeeping, and surviving groups cannot yield a
green result. W1 is assigned best-effort cleanup with explicit final failure for survivors or failed
own-temp removal, robust signal/finally handling, and non-browser injected fixtures for these paths.
ESRCH alone is treated as already gone; other failures remain diagnostics/failure. Mixed listener
identity is checked per row, not by assuming one PID per line. Fresh final target/review is still
required; browser HOLD remains in force.

Port 7795 attribution/cleanup is now confirmed in [QA](QA.md#confirmed-cleanup-of-the-separate-7795-leak):
Review's completed scratch leaked through subshell-PID capture, was stopped by its verified owner,
and CTO independently checked listener/PID/group absence. No restoration is needed for that retired
scratch. Earlier 7794 PID uncertainty and the common-launcher/browser HOLD remain separate gates.

Helper `96cdfcc` review receipt `5a44e21b3e20e1a3` confirms F1/F2/F3/F6 fixes by code and a
run-after-stop probe; focused-suite verdict is blocked by confirmed W1 fixture PID 250110 on 61741.
Repeated failures against that occupied fixture port are environmental, not a clean acceptance run.
Review was told not to rerun until owner-mediated cleanup resolves the classifier denial. `96cdfcc`
is not the final target: per-row attribution, spawn errors, removal failure and non-green leftovers
remain required CTO fixes. W1 may continue static edits while injection/browser HOLD persists; one
clean final-target rerun and safety verdict follow cleanup. No proxy termination is authorized.

## Final common-launcher static gate

W1 final corrected target `814c10a36b120842ae5e0c9ca95de6d34af8594a` follows `8df1d5e` → `96cdfcc`.
It adds per-row listener ownership, handled spawn errors, best-effort all-owned cleanup with explicit
failure for survivors/removal errors, all-settled signal cleanup, independent test-finally cleanup and
a wrapper-orphan regression. Author tsc/pure ownership check passed; full/injection tests are unrun
under HOLD. Dedicated pinned checkout `.scratch/worktrees/r3-safe-smoke-final-review`; priority static
safety review `safe-smoke-final-814c10a` requested. CTO inspected the final delta and typecheck.

Owner-mediated fixture cleanup is confirmed in [QA](QA.md#owner-mediated-fixture-cleanup-confirmed).
Next step: static safety verdict for corrected target, then one scoped clean procedure-fixture run
without Chrome and final safety verdict. Do not rerun unsafe old-code fail-first cases. Browser HOLD
is independent and stays until the common procedure is accepted. W2 consolidates its lifecycle on
`startSmoke` meanwhile; no second launcher. This is the concrete remaining verification gate, not
missing implementation scope or an unresolved permission to continue pure/static work.

W2 consolidation target `38270421a3dcb449503e036f0992b4866ecf674d` imports common `startSmoke`;
server/Chrome lifecycle is removed from passive-lib. Its copied helper is still old `8df1d5e` and
must not be used dynamically. W2 is assigned a separate sync to final `814c10a` plus adapter cleanup
that closes its own probe/staging even when helper stop fails, propagating failure. Review must verify
exact helper identity and exclude obsolete helper snapshots during candidate assembly. No browser
run from this consolidation target has occurred; helper safety gate remains pending.

## Final passive-content verification candidate

Common helper `814c10a` received independent final PASS (`faf204e0030adcfe`): corrected procedure
suite and full/tsc green, no process/port/temp leftovers. Scoped browser testing resumed only through
that helper; ad-hoc lifecycle and old unsafe fail-first runs remain prohibited.

Candidate `5617731` combines server `09b3cd7`, client production `1f4e475`/adapter `19f3886` and
helper `814c10a` with canonical CLAUDE/Plans invariants. CTO full 689/689, tsc clean, new-renderer
R3 audit 384 links/zero errors. No production-code identity drift was introduced. Final test-only
raw harness `0f44675` and current main's shared-marks question are added in the followup candidate;
the old pinned review target remains unchanged.

W2 clean helper runs: fixed actions 33/33, hostile 34 and passive-style positives 3 pass; baseline
`31e4992` reproduces the five newly asserted action/double-click differences. Draft/live/document
switch behavior and marker exclusion from Copy/source pass. Initial raw HTML checks failed to
observe the sandboxed frame and were not acceptance evidence. Corrected X01–X06 checks use DOM/CSS
protocols for the isolated static iframe, not a nonexistent default JS context: fixed local markers
absent, no probe/navigation/parent effect, empty sandbox, working source/page toggle; passive text and
green computed heading preserved. Old `b11e47f` control detects execution/navigation for applicable
vectors. Raw link/form mouse delivery is best-effort, not asserted; Safari/Firefox remain release-QA
gaps. Cleanup after each owned run was checked clear.

Final combined exact-SHA review still gates integration. Main stays on the pre-security source until
that verdict; admin wiring and materialization remain unassigned. Early undocumented 7794 PID
ownership is preserved as incident uncertainty, separate from the accepted common procedure.

## Passive content boundary integrated

[№MW.8](workspaces/TODO.md#MW.8), [№MW.8a](workspaces/TODO.md#MW.8a) and
[№MW.8b](workspaces/TODO.md#MW.8b) are integrated at `3b044d53c85e24b33dcc7e89eef289f2827cfcc3`.
Independent CEO final PASS binds to `fdb4098a5a99c6b7d8a0172fc022d3f2529cb87a`; merge introduced no
production/helper/dependency/test delta. Latest isolated full 703/0 + tsc exit 0, followed by focused
integrated 65/0; no repeated full or browser run. RAG decisions, signature policy and dirty launcher
were preserved. [QA evidence and limitations](QA.md#mw8-final-integration).

Historical W2 24-failure/6-error run remains unexplained; its output was lost, not silently waived.
The authorized single controlled run supplies the latest result. Safari/Firefox and raw click landing
remain release QA; admin wiring is not implemented. W2 receives no assignment during its quota pause.

## Dormant route classification integrated

[№MW.0g.2a](workspaces/TODO.md#MW.0g.2a) integrated at `484a277e00a7d87f81bd4ef51291c18689237e05`.
Independent CEO PASS `45e8e665e03490e3` binds to exact `da05ea90587953248639bb0c3caede5d36a39a6b`
(base `8b3b781`). Initial `437b4c4` NEEDS FIX accepted unknown bare/opaque routes as reads; explicit
same-value read/bundle tags now reject unclassified registrations, conflicts and duplicate mutations.

Integrated source and authz test are byte-identical to the approved target. Focused pure checks:
14 pass / 0 fail; live route-inventory test excluded, no full/browser run. Existing handlers, method
statuses and guards are unchanged; Actor is dormant and does not read author cookies. GET
`/api/git/remote?fresh` retains its documented network/cache effect; declared read is not effect-free.
Current main docs and dirty launcher were preserved. [№MW.0g](workspaces/TODO.md#MW.0g), admin wiring,
project authorization and [№Q-R3-ADMIN1](workspaces/QUESTIONS.md#Q-R3-ADMIN1) remain open.

## User-session history technical planning

[№USER-W6](workspaces/DECISIONS.md#USER-W6) / [№MW.0d](workspaces/TODO.md#MW.0d): W1 completed a
read-only plan; no code, OAuth activation or real-IP lookup. Proposed GeoIP pair is ipwho.is primary
→ free.freeipapi.com secondary, sequential on failure only. Official docs checked 2026-11-06:
[ipwho.is API](https://ipwhois.io/documentation), [FreeIPAPI](https://freeipapi.com/),
[FreeIPAPI docs](https://freeipapi.com/docs/get-started/introduction). Primary advertises HTTPS,
no key, commercial use and 1,000 requests/day per client IP; secondary advertises HTTPS public use,
commercial use and 60 requests/minute. Provider limits/terms must be current at implementation.

Neither documented response supplies county: preserve a distinct unavailable field, never substitute
region/country or claim complete county coverage. Secondary error semantics need strict validation.
No live wiring is approved by the pair proposal. Authenticated user/OAuth substrate is absent.

Plan review requires: pure model separated from persistent-store filesystem work; no arbitrary
session-history cap or deletion on user removal without a retention decision; trusted-proxy config
and new endpoints remain proposals. Async GeoIP must bind the requested canonical IP and observation
time, recheck current user/access before applying, and never resurrect removed users or overwrite
newer history/UA. Idle checks remain per session before touch; admin TTLs are independent. Future
implementation is bounded per slice and independently security-reviewed before integration.

Owner clarification supersedes the county coverage gap above: «yes, i meant city,country (for use city,state,country)». [№USER-W6](workspaces/DECISIONS.md#USER-W6) now uses city/state/country, with provider region mapped honestly to state. County is not required; the gap is closed without a third provider.

## Plan accountability audit

Owner: «http://localhost:7777/mdhouse/Plans/R3/workspaces/TODO.md << точно up 2 date; CTO must take care about keeping todo lists & docs real
minimize testing after minor changes
try to close simple tasks first».

Closed stale MW.0f and MW.0a parents only after checking integration ancestry, independent cohort
identity evidence and existing route/package/browser checks. Team authenticated precedence remains
MW.0d work, not a fallback-cookie dependency. Restored explicit done Copy/touch implementation
checkpoints; their cross-browser/device parents remain partial. Corrected automatic username refresh
wording across current release/workspace plans to USER-W7 admin-confirmed same-principal changes.
Shared rules now require checkpoint accuracy and risk-sized verification; no heavy check was run.
Next: finish the already-ready pure model's independent review; close small approved documentation
and implementation checkpoints first, without starting wider runtime scope.

## Pure session history and mock GeoIP integrated

[№MW.0d.1](workspaces/TODO.md#MW.0d.1): independent Review receipt `d9af66a698d50342` PASS exact
`b9986d20614b69794d46587c1ee5d9aeb3c2658c`, base `fce2bfa`. Integrated
`e5382e166b09c48aaafea02d79471ba3fc8ee33e` with source/tests/package/lock byte-identical to target,
current owner decisions and dirty launcher preserved. Integrated pure/mock checks 65/65; no new
full/tsc/browser/provider calls. Review separately covered adversarial country transitions and async
bindings. GeoIP transport is required injection, without live wiring.

This closes only the pure model and mock adapter slice. Caller-declared auth is not authenticated
route enforcement; pending/unbound is not action permission. Initial-unknown country policy remains
undecided. Persistent store, OAuth/GitHub reauthentication, self/admin APIs/UI, trusted-proxy config,
identity/signature enforcement and live provider wiring remain open under [№MW.0d](workspaces/TODO.md#MW.0d).

## RAG 0.3 free discovery and provisioning handoff

Provider receipts `253c17898b1ded0d` and `8b998ed0ce663e26`; CTO help/free capabilities verified
0.3.0 at `#rag@parf.us`, voyage-3.5/1024 and advertised modes/methods/limits. No paid embed, classify,
mutation, load test or grant change. [Current contract](RAG-CONTRACT.md)
records proposed separate `#rag/mdhouse@parf.us` (Q353, pending), production caller `#mdhouse@parf.us`
without manager privilege and exact-project FileScan grants only after provisioning. T-45 supplies
FileScan typed docs/fixture and unknown-outcome guidance; [№MW.2a](workspaces/TODO.md#MW.2a), A4/A7
and release RAG acceptance remain open. Discovery is not a backend-readiness/data-path test.

## Overnight workflow cohort — session-history persistence foundation

Owner direction: «do what u can, going sleep; put questions into questions».

> No bump per landing. Landings stop raising the version, and I raise PATCH once per deploy with one changelog entry covering everything in that deploy.
> Tasks land together. The leads group small and medium tasks into one branch and one gate run, so they're tested together. That starts now, before the code change.
> yes - makes bumps more significant; combine small/medium tasks into one make => test together

[№MW.0d.2](workspaces/TODO.md#MW.0d.2) is one bounded cohort: W3 owns a strict versioned pure
session-history snapshot codec; W1 owns a protected atomic snapshot store consuming that codec.
Separate author branches/files, one CTO integration branch `r3/session-persistence-cohort`, one exact
combined security review via OpenCode, one proportional combined gate. Local author checks are
focused; no separate full gates or version bumps. The gate covers codec/model invariants and store
filesystem failure/permissions/concurrency behavior; no browser/provider/network test.

No routes, OAuth/session-cookie authentication, trusted-proxy config, live GeoIP, session truncation,
purge or new TTL. Persistence is of the approved history model, not a claim that authenticated user
sessions exist. Unknown versions/corrupt data refuse writes without resetting records; isolation,
restrictive owner permissions, atomic replace and concurrent/stale snapshot safety require review.
New material decisions remain in QUESTIONS; [№Q-R3-COUNTRY2](workspaces/QUESTIONS.md#Q-R3-COUNTRY2),
marks and realm do not block independent snapshot foundations. RAG provisioning/FileScan handoff
remain provider-owned per [contract](RAG-CONTRACT.md). This is not publish/push/deploy authorization.

## FileScan paid-replay safety hold

Provider receipt `33de2bc2e7a56822` reports a HIGH FileScan RAG-sink acknowledgment defect causing
successful paid upserts to remain pending and repeat. No FileScan wiring is authorized until the
provider confirms corrected record-identity/hash matching, real-core verification and deployment.
Provider reports no FileScan root or running instance here; no live impact is claimed by mdhouse.
This does not affect the independent session-persistence cohort or authorize direct paid RAG calls.

## Session persistence cohort ready for security review

[№MW.0d.2](workspaces/TODO.md#MW.0d.2): exact base `43d3408` → frozen cohort
`3dd661e8b3ba53145e51f87fe0761753fe3bf237`. W3 codec `ec5115a`; W1 store `55ac7d7` plus snapshot
consistency fix `1a653bd`; CTO module inventory only. Five paths, dependencies/version unchanged.
CTO pre-gate temp-FS probes found save-result aliasing and in-place update false no-op; author fix
returns snapshots decoded from persisted bytes and validates/copies input before async queue work.
Regressions are included in the single combined model/GeoIP/codec/store gate: 108/0 + types exit 0,
logs `.scratch/cto/session-cohort-gate/`. No full/browser/provider/server run.

Independent combined review `session-cohort-3dd661e` is assigned to OpenCode with a dedicated pinned
checkout `r3-session-persistence-review`. Author and candidate checkouts stay frozen. Ready is not
integrated or done; filesystem permissions/concurrency/outcome boundaries and documented no-openat
race limitation are part of the review. No new author task is started while findings are pending.

## FileScan T-45 delivered; provisioning and lifecycle acceptance remain open

Provider receipt `e6f9c7a3de48dd99` reports paid-replay fix `0f5340c3` deployed 02:07 EST and real-RAG
core regression with fake providers. CTO read local official docs `7a26cf1b` and replay-fixture paths;
no tests/provider calls/roots/subscriptions were run here. RAG stays 0.3.0. The earlier sink-defect
hold is superseded by provider fix evidence; live wiring remains blocked on owner Q353/Q355.
T-45 documents available change messages/status snapshots and missing registry/jobs/history/events;
[№Q-R3-RAG1](workspaces/QUESTIONS.md#Q-R3-RAG1) and [current contract](RAG-CONTRACT.md) retain those
acceptance gaps. Unknown upsert inspection is free get + exact identity/hash/source/indexed_at;
matching text alone does not prove all side effects or authorize a paid retry.

## Session persistence cohort integrated

[№MW.0d.2](workspaces/TODO.md#MW.0d.2): independent Review receipt `8fa9a3de019bd381` PASS exact
`3dd661e8b3ba53145e51f87fe0761753fe3bf237`, base `43d3408`. Combined author cohort (W3 codec + W1
store/fix) integrated at `c529bf1f6c7b1de6136d3c8a3eb5dea13973fd5b`. Source/tests/dependencies/version
are byte-identical to approved target; current owner workflow/contact rules, questions and tooling
were preserved. No merge conflict or material delta, so no repeated tests/types gate at landing.

Single combined gate: model/GeoIP/codec/store 108/0 + types exit 0. Review inspected those logs and
performed independent focused/temp-FS adversarial checks. It confirmed strict/refuse-not-repair
snapshot codec, permissions/nofollow, CAS/revision/lock behavior, atomic outcomes and no-alias fixes.
Known limits: no openat means same-OS-owner path race is narrowed, not eliminated; failed best-effort
temp removal may leave inert 0600 temporary data, without replacing the old snapshot. Runtime wiring,
OAuth/cookie authentication, self/admin APIs/UI, live GeoIP and initial-unknown policy remain open.
No version bump, publish, push, deploy or provider call. Unreleased facts are unchanged for this inert
foundation; future owner-authorized deployment groups product changes in one entry.

## RAG owner-question link audit

CEO receipt `a58845f469baf657`: owner-linked Agent Bus R1.0 QUESTIONS/DECISIONS do not contain the
provider-reported Q353/Q355. Those historical references are not verified current owner links.
CTO requested exact file/anchor/status from #ab-ceo via authorized integration contact. Current
RAG-CONTRACT and owning TODO/QUESTION now describe pending provider provisioning confirmation,
without presenting missing IDs as owner-answerable blockers. External files/services were untouched.

## Verified RAG owner-question locations

Provider receipt `1993e0637c2f4caa` supplies current R1.1 links, not the previously checked R1.0 file.
CTO verified local `Plans/R1.1/QUESTIONS.md` and commit descriptions read-only: [№Q353](http://localhost:7777/ai-agent-bus/Plans/R1.1/QUESTIONS.md#rag-for-mdhouse)
endpoint choice is open (`d75b1da7`); [№Q355](http://localhost:7777/ai-agent-bus/Plans/R1.1/QUESTIONS.md#owner-items-from-2026-11-06) roots is open
(`47bfb0a0`, warning `ee15f008`). Current contract/TODO/QUESTION links are corrected; no external
files, grants or services changed. RAG 0.4.1 is provider-reported landed but no live capability
claim or paid call was made; awaiting provider deployment status.

## RAG 0.4.1 provider deployment report

Provider receipt `5a254e80e274e4b8`: `#rag@parf.us` 0.4.1 deployed 11:20 EST, bus 1.0.50 / agent pack
1.0.2; 14 advertised methods include count/similar/complete/classify, prefix index present, classify
off unless configured. Current contract records this as provider report; mdhouse has not made new
capabilities/data/paid calls or expanded its integration scope. Dedicated endpoint/access Q353 still
requires owner decision; no grant or provider configuration changed.

## Separate RAG sync bin ownership and setup plan

Owner correction: «не так - rag sync is separate bin module; still yours». [№MW.2a.1](workspaces/TODO.md#MW.2a.1)
remains our implementation task in normal R3 prioritization; the earlier instruction to exclude all
work was incorrect and is superseded. Execution only on explicit owner demand; no unsolicited
provider status/calls, automatic subscriptions, provisioning or paid/live calls. Reference FileScan
setup message `bd5eaa2868d8cedc` is retained as input, not a new execution assignment or verified
pack/deploy status. Owner/AB-CEO provision one instance per folder with roots/record/config/token/
grants; our future bin configures subscription and reads status/sub list only after that setup.

Next bounded work: W3 read-only bin/adapter plan from existing official local docs/contracts; no
provider contacts, tests or source edits. Reuse open endpoint/root questions, record watch/poll
lifetime/cleanup in owning QUESTIONS; no guessed background-sync behavior.

## First Markdown search setup scope and provider ownership

Owner authorizes setup for mdhouse/**/*.md. CEO receipts `b0455044ed3f51a6` and
`955e7dcd269bafb4` cover the single existing AB-CEO prerequisite request: dedicated RAG/FileScan,
root `/home/parf/src/mdhouse`, recursive Markdown include mask, default dotfile/node_modules
exclusions, production caller only, proposed namespace mdhouse/table docs. Include/exclude arrays
already work; no provider feature request for masks. Owner/AB-CEO handle approvals/account-runner
provisioning; our bin/integration ownership remains intact.

CTO read-only `rg --files`/byte-size estimate: 194 visible nonignored .md files, five >32 KiB;
`.scratch/cto/rag-markdown-scope.json` is not an actual scan/completeness record. Current RAG sink
skips large texts, so index/search acceptance cannot claim full Markdown coverage. CEO already asked
AB-CEO to evaluate/plan reasonable provider changes for bounded on-demand scan/completion and large
Markdown ingestion; do not duplicate those requests. W3 receives this concrete target for bin/index/
search planning. No subscription/watch/ingestion, provisioning or paid call was performed by CTO.

## Provider-reported owner approval for dedicated sync setup

CEO receipt `9ab6320591fda0db` relays AB-CEO `af433a09927c623d`: Q353/Q355 approved with a change to
initial access assumptions. parf remains record Owner; CTO becomes Maintainer on dedicated
`#rag/mdhouse@parf.us` and `#filescan/mdhouse@parf.us` within approved sync setup scope. T-49
registration is in progress, not verified readiness. FileScan account runner/root/mask/exclusions
and mdhouse/docs are specified; #mdhouse identity is unregistered and its registration ownership
is still an owner decision. Await exact records/grants and T-48 contract before starting sync.
No subscription, ingestion, grant mutation, reset or paid call was performed; worker/wildcard grants
and destructive replay are not implied by Maintainer capability.

## Confirmed AB-DVP CTO technical route

AB-CEO confirmation `ddd9cabf1b108f19` and direct #ab-dir receipt `ab68c17627ef4f09`: technical
RAG/FileScan integration now routes directly CTO↔CTO through `#ab-dir`, owner choices through
#ab-dir→#ab-ceo. Shared init/common and owning contract record the exact alias. No duplicate
T-48/T-49 requests or AB worker/lead contacts. T-48 large-text and finite-sync plans await owner
approval; T-49 setup lists are pending delivery, not live readiness. W3 read-only bin plan is ready;
next bounded implementation may cover pure/mock planning before provider-dependent execution,
without claiming dry-run as complete indexing/search or inventing a permanent watcher.

## T-49 authorized record preparation and bin cohort selection

Provider #ab-dir confirms FileScan running with 194 tracked, empty subscribers, approved config;
Q376–Q378 are settled as own Qdrant proxy to existing store, shared Voyage/AI, no separate provider
keys/instances. CTO acted as parf via protected account socket: verified existing mdhouse record and
preserved it; additively admitted it to FileScan; created RAG/Qdrant records, nonsecret configs and
exact caller/maintainer grants; handed only the dedicated RAG credential to protected runner token
file without disclosure. No root-runner secret read. Owner/AB-CEO must install the store key privately;
no runtime create/start/reload/collection/index/subscription/scan/ingestion or provider spend here.

[№MW.2a.1a](workspaces/TODO.md#MW.2a.1a) next coherent cohort: W3 pure bounded sync-plan metadata,
W1 separate executable with real jailed local Markdown inventory/help/preview. No provider transport,
OAuth/agent registration on bin invocation or guessed T-48 calls. One integration branch, combined
focused/package-export/types gate and exact security review; no per-task full/version bump. Connected
index/search remains an explicit later acceptance after actual provider readiness/T-48 deployment,
not claimed complete by this preview foundation. Shared technical route is #ab-dir only.

## T-49 partial setup and finite-sync contract clarified

Owner choices relayed by #ab-dir settle shared Voyage/AI and existing-store Qdrant proxy; URL is
127.0.0.1:6333, key install remains a private owner-side handoff, not a remaining product choice.
CTO has not enabled/started RAG/Qdrant or created collection/index before that handoff. Existing
parf-owned mdhouse identity and explicit FileScan Allow were verified; credential values were never
printed or committed. No subscription/scan/ingestion/provider spend occurred.

T-48 approved finite sync closes [№Q-R3-RAGSYNC1](workspaces/DECISIONS.md#Q-R3-RAGSYNC1): no watcher/
subscription/timer survives, unknown on-demand outcomes never auto-resend. Provider check shape
`b0b435f4` is fixed and read; whole-file confirmation needs complete:true and all identity/hash/source
fields. Code/deploy still pending. Retry-bound label J116 was corrected by provider: existing shared
confirmed-delivery resend/FileScan S1, applicable only to standing watch, not this bin's on-demand run.

Bin foundation API is agreed by W3/W1: pure full-metadata plan/digest, root dev/ino binding,
10,000-source bound, explicit complete/issues, fixed dependency exclusions, actual jailed local
metadata CLI inventory, zero transport on import/help/plan, sync/search explicitly not-wired. One
cohort gate/review follows frozen author outputs, with no source-version bump or per-task full run.

## First-build large-file confirmation limitation

Provider receipt `990f468334f46a9e`: first T-48 uses free completeness check for large-file upserts
because the Python client cannot return their long inline reply yet. A refusal can stay unknown/
incomplete through the wait/deadline; the future bin must report that, never success on timeout or
automatic paid resend. Small-file handling is unchanged; followup client fix is only filed. Current
planner/bin foundation still has no live adapter and made no provider call/test.

## Standalone RAG local-plan bin cohort ready

[№MW.2a.1a](workspaces/TODO.md#MW.2a.1a): base `01c842c` → frozen target
`40876012259e70306540c977d4bc3453fb5581a9`. W3 strict planner `b9f9439`; W1 CLI/bin `ea98b2e`
plus case-sensitive Markdown-mask fix `fdff00d`. CTO pre-gate temp-FS check found UPPER.MD made the
whole plan fail because CLI/planner mask semantics differed; exact *.md matching now has regressions.
CTO added module inventory, one Unreleased fact and actual npm artifact bin-export/help assertions.
Package version/dependencies/lock are unchanged; no provider or application server is started.

One combined gate: planner/CLI/actual tarball + all 39 package assets and packed new-bin --help,
35/0 + types exit 0. Logs `.scratch/cto/rag-bin-cohort-gate/`. Exact independent review assigned
OpenCode at pinned `r3-rag-bin-review`; ready is not integrated/done. Connected sync/search deliberately
return not-wired; metadata preview is not indexing/search completion or provider-readiness evidence.

Usage footer check during active work: W1 5h 49% (reset 1h01m), 7d 63% (6d02h); W2 5h 87%
(reset 3h12m), 7d 70% (5d19h). Current Codex/OpenCode usage not available from those footers.
The old W2 1% pause is superseded by this fresh display; no extra task or heavy rerun was assigned.

## Standalone RAG local-plan bin integrated

[№MW.2a.1a](workspaces/TODO.md#MW.2a.1a): independent Review receipt `0140cdf207c56a6b` PASS exact
`40876012259e70306540c977d4bc3453fb5581a9`, base `01c842c`. Integrated cohort
`ae04901d2be8a82f775548176a08b2e7e4ba87e1` without conflict; source/bin/package/lock/tests identical
to approved target, current owner/provider/routing docs preserved. One combined gate 35/0 + types,
including actual npm tarball/license/39-flow preservation and executable packed-bin help; no landing
rerun/full/browser/provider call. Package adds only the bin entry, version/dependencies unchanged.

The executable supports help and actual jailed local Markdown metadata planning, not fake index
or search completion. Import/help have no work; sync/search return not-wired with zero effects.
Metadata digest/readiness/caller are declarations, not contents/auth/provider readiness. Incomplete/
empty/oversize coverage remains explicit. Review notes direct module invocation is a no-op (published
bin is the entrypoint) and hardlink paths remain separate metadata sources; neither expands scope.
[№MW.2a.1](workspaces/TODO.md#MW.2a.1) and parent RAG acceptance remain open until real adapter,
index/search, T-48 deployment and T-49 runtime readiness are satisfied. No publish/push/deploy.

## FileScan demand switch and connected-bin cohort selected

Provider #ab-dir reports T-48 deployed at 14:22. CTO performed only the authorized configuration
switch to demand (all other fields preserved) and targeted runner restart `filescan/mdhouse`.
Actual status confirms demand/demand, 195 tracked, no pause/subscribers. Evidence retained at
`.scratch/cto/filescan-demand-config.json` and `filescan-demand-restart.json`; no sync/scan/ingest
or paid provider call. RAG queue TTL remains unset; owner private Qdrant-key installation is pending.

[№MW.2a.1b](workspaces/TODO.md#MW.2a.1b) is selected before code: W3 typed strict provider-response
client/orchestration, W1 bounded correlated account-socket bus transport and explicit CLI wiring.
One coherent integration branch/gate/security review, no version bump; tests use injected transport
only. Missing/unsupported live capability or non-demand/mismatched source config refuses before
paid effects. No AgentBus.connect/drain/registration, no implicit reset/drop/config/grants/sub/watch.
Explicit sync apply is needed; keyword search is default, paid query modes and unknown resend require
separate explicit intent. This does not authorize a live test against production AI/Voyage. Actual
first sync waits for reviewed code and runtime readiness; its results are app proof, not test upserts.

## Connected-cohort selector and shared-inbox safety

W1 design exposed known-safe selection string differences and the app's unfiltered reconnect drain.
CTO extended the same coherent cohort by a narrow AgentBus app-topic-only cleanup/test compatibility
fix; bin correlation alone cannot prevent another reader discarding replies. No live app reload or
new identity is guessed. Wrong-service record names must be rejected before data RPC.

FileScan include-prefix source widening was reported through #ab-dir and reproduced as J124:
*.md selected x.md/secret.txt. Provider fixes whole-file include semantics, audits other sites and
will redeploy/audit tracked keys. First real sync is blocked until that confirmation, not hidden by
an arbitrary filter guess. Authorized dependency exclusions for bower/jspm were added as narrowing
patterns, demand/root/other config preserved, exact FileScan instance restarted/status checked without
sync. Runtime normalization accepts only the fixed known-equivalence selection, rejects unknowns.
No paid provider test or background RAG sync was started.


## Connected-bin candidate ready for independent review

[№MW.2a.1b](workspaces/TODO.md#MW.2a.1b): base `53fbe64` → frozen `8f3d134` on
`r3/rag-connected-cohort`; pinned detached `r3-rag-connected-review`. W3 runtime `aa84206`,
W1 transport/CLI/topic-scoped reconnect cleanup `2b6ee3c`, CTO inventory/packaged-module checks.
Independent security review requested; candidate not integrated and checkpoint remains open.

One combined focused/package gate found only a stale packed-help assertion (`plan --root` versus
new `plan <target>`). All other focused tests passed. Corrected assertion; package-only rerun and
types passed, production unchanged after the focused run. Disk logs:
`.scratch/cto/rag-connected-741a97f/` (`focused.out`, `package-fixed.out`, `types.out`, exit files).
Own frozen-lock modules, no full/browser/live/provider/production-AI calls. J124 fix is provider-reported
in review; first sync still waits deploy/tracked-key audit plus private key/runtime readiness.


## Connected-bin cohort integrated

[№MW.2a.1b](workspaces/TODO.md#MW.2a.1b) accepted: independent exact-target PASS
`60def3a69dfdbd14` on `8f3d134`; integrated `1fd503a` without conflicts or production delta.
Source/bin/package/tests and cohort inventory/changelog are byte-identical to the reviewed target;
current Plans retained. Integrated pure runtime check passed; no repeated full/types/browser gate.
[QA limitations](QA.md#connected-rag-bin-checkpoint) preserve separate provider/readiness and old
running-app gates. Parent [№MW.2a.1](workspaces/TODO.md#MW.2a.1) remains open for actual indexing/search;
no version bump, deployment, live app reload or paid/provider call.


## Ignored browsing cohort selected before code

[№MW.9](workspaces/TODO.md#MW.9) implements the owner-approved browsing rule and correction:
V1/V2 remain isolated selections; their selected ignored folders also appear in main/default.
Current Sidebar always renders an ignored chip; normal Store.tree excludes gitignored Markdown,
so the tree-fed DirPage and V tabs cannot reveal missing files. `listFiles` already falls back for
an ignored folder's ALL listing. Built-in vendor deny is separate from gitignore; explicit exclusions
and `.git`/Registry security remain boundaries. One coherent backend/UI cohort with focused gate,
owned scratch browser check and exact independent review; no live app checks or version bump.


## Ignored-browsing API and explicit ALL boundary

[№MW.9](workspaces/TODO.md#MW.9): W1/W2 designs agreed before implementation. Tree response gains
hasIgnored/revealed/capped; repeated reveal parameters carry at most 32 scopes, 1024 UTF-8 bytes each,
16 KiB total. Scope visibility never overrides explicit exclusions, `.git` or canonical path jail;
main selected-folder union is separate from each V tab's own selection. No global toggle mutation.
W1 reproduced a pre-existing folder ALL bypass in a temporary tracked Git fixture: tree excluded
secret/x.md via `.mdhouseignore`, but listFiles returned it. CTO expanded the same backend cohort to
preserve explicit excludes/jail in ALL, with focused negative coverage; no unrelated listing expansion.

CEO independently completed owner-authorized live app reload (`95ff0d32e65091bd`) after frozen-lock
runtime dependency installation. HTTP/roots verified; topic-only drain now applied. This is not
[№MW.9](workspaces/TODO.md#MW.9) implementation evidence or live RAG indexing proof.
