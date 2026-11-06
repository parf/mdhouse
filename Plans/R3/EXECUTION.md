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
