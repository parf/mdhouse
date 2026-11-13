# R3 verification matrix

CTO owns this matrix. Worker evidence names exact revision, scratch root/config/port, browser/device,
action, expected/actual result and retained artifact. Unrun checks remain open. Never test on live :7777.

## Current evidence checkpoint — 2026-11-06

Immutable references and fallback browser author are accepted integrated scopes (`ea7ebda` independent
cohort identity PASS; mount `052eaf8`, content `4de0d3`, author `b11e47f`). Copy/touch implementation
has recorded Chromium checks; cross-browser/real-device parents remain open. MW.8 is integrated with
latest controlled 703/0 + tsc and final independent CEO PASS; dormant classification is integrated.
MW.0d.1 `b9986d2` is reviewed and integrated as `e5382e1` for pure/mock scope only. MW.0d.2 codec/store is reviewed and integrated as `c529bf1`; one combined 108/0 + types gate, no landing rerun. Detailed reports below retain
historical failures/pending states; later confirmed cleanup/verdicts supersede those states.

Standalone RAG planning bin is integrated (`ae04901`, approved `4087601`): combined pure/CLI/
actual-artifact gate and independent review PASS; connected sync/index/search remains not-wired.

## Required checks

| Surface | Required journey/check | Evidence / state |
| --- | --- | --- |
| Desktop Chrome | install → project → agent/RAG → Feature/delivery flow → full edit/save → Copy → diff/history → explicit delivery approval | planned |
| Desktop Edge | normal journey, keyboard/context-menu Copy, source glyphs retained | planned; browser availability unverified |
| Desktop Safari | normal journey, keyboard/context-menu Copy | planned; host cannot provide Safari |
| Firefox | safe documented Copy fallback; authored text and controls remain usable | planned; availability unverified |
| iPad Safari portrait + landscape | remote Personal admission, project/agent/flow, touch heading add, full edit with virtual keyboard, stale draft, Copy, diff/commit | planned; real device required |
| Phone Safari + Chrome | same compact primary journey, visible touch equivalents, no hover-only action | planned; real device checks open |
| Scratch responsive Chromium | light/dark and ≤720px navigation, agent/editor panels, Copy, visible controls/focus | Copy/touch/passive slices verified; complete journey open, supplements devices |
| All profiles | personal/open-viewer/private-viewer/team; trusted/untrusted networks, project RO/RW/none, active/revoked users, profile switch | planned |
| Every mutation family | document, Git, flow, control, settings, roots, users/grants/profiles, external sends; allowed/direct/stale/cross-origin/Reader/non-admin denial | planned |
| Immutable references | packed content; explicit/duplicate/alias roots, autoRw, remove/promote, Git overlap, symlink/direct writes | verified integrated scope; see MW.0f evidence below |
| Artifact/migration | actual tarball license/copyright/metadata, fresh install, safe repeated upgrade/downgrade, unknown config | planned |
| Failure recovery | stale source, denied/missing agent/source/route, rewritten baseline, disconnected browser, failed/partial external action | planned |

## Release acceptance

Focused tests plus `bun test` and `npx tsc --noEmit -p .` pass on integrated HEAD. Required independent
reviews bind to that exact revision; material fixes/conflict resolutions require new verdicts. Browser
journey runs against a packed install as well as the scratch development instance. External consequences
use simulations or separately authorized destinations. A test gate does not authorize production delivery.

## Evidence

Integrated `80c17e65017c5a4febf14502c1ac52348aea2e62`: CTO full 317/317 + tsc; independent
Review PASS with focused 70/70, full 317/317 and tsc. Covers immutable root primitive/direct/overlap/Git/
control/AB-dispatch guards, actual packed license/metadata, Copy and touch CSS. Installed reference
mount, full profiles and complete journey remain open.

Copy [№MW.5b](workspaces/TODO.md#MW.5b): CTO scratch Chrome 390 px light/dark, real Ctrl+C text+HTML preserves source glyphs/excludes chrome;
focus/click opens add form. `.scratch/r3-cto-qa/{light,dark}.png`. Safari/Firefox/context-menu/real-device
checks remain open.

Touch [№MW.5c.1](workspaces/TODO.md#MW.5c.1): W2 touch-emulated390×844/768×1024/1024×768 light/dark, tap add/target/reply/done, 44px controls,
no horizontal overflow or target/text overlap; CTO inspected light/dark 390 px evidence. Artifacts
`.scratch/r3-cto-qa/touch/`. Virtual keyboard, long-press Copy, real devices and full journey still open.

Repository baseline focused roots/access tests: CEO reports
34 passed at `c1fb27f35cbd82270c754e4dfc6a562d36e0924d`; this is not R3 acceptance.

## Later integrated evidence

Exact `ea7ebda946f10059bf2f67a3f5d1e2b1d175fa4d`: CTO 483/483, 2525 assertions, tsc clean;
independent Review PASS `c1669691ad2979a6`, focused 180/180. Reference content/mount, author fallback,
scheme/inline UI, dormant admin primitive and eleven flow authoring packages are integrated.
[№MW.8](workspaces/TODO.md#MW.8) passive content, admin wiring and full runtime/profile journeys remain open.

## Scratch incident and corrected smoke

Failed attempt: W1 packed smoke selected busy `:7796` and stopped foreign PID `3199274`; that attempt
provides no valid smoke evidence. Review confirmed ownership: completed scheme-review scratch, no pending
check dependency, PID absent/port free/temp directory removed; no restoration required. W2 unaffected.
The live `:7777` instance was not involved.

Correction: busy port aborts before start; capture own PID; verify listener ownership and expected scratch
root; cleanup only captured own PID. Negative test against W1's own busy `:7841` aborted without touching
its listener. Separate repeat on own `:7840` verified packed reference README/plans/skills payloads and
DOM/screenshot. Review confirmed these results for author target `c4a18e3`. Incident receipts:
`251912e9bbb99c81` (owner/impact) and `e2f03b7933a47668` (containment/repeat).

## W2 scratch port incident — impact pending

W2 reports starts on `:7794` without preflight, and earlier restarts using kill-by-listener without
recorded PID ownership verification. The final PID was checked against W2's scratch args and stopped;
earlier cleanup ownership/impact is not yet established. Do not claim absence of impact or restore a
process by guessed args. Review was asked to confirm ownership and affected checks.

A start on busy `:7795` failed; a subsequent corpus attempt made GET/404 requests against foreign
`/tmp/opencode/mdhouse-0f2/repo`. W2 reports no mutation or stop of that process. That attempt is failed
and supplies no valid acceptance evidence; record valid owned-server reruns separately. W2 must ensure
start/cleanup harnesses enforce busy-port abort, captured own PID/listener/root verification and no
foreign-process cleanup before further smoke runs. Incident receipt `2494a0954841b148`.

Owner procedure gate: all new browser smoke is on hold until the common safe launcher passes its
busy-port negative, owned startup/bind/root and cleanup checks plus independent safety review.
W1 owns the helper/test implementation; pure tests and analysis may continue. Failed foreign-endpoint
attempts are not acceptance evidence. Early PID impact/recovery remains unconfirmed.

W2 followup receipt `a78361e47714210c`: earlier `:7794` starts/restarts were approximately 19:32–20:05
local on 2026-11-05. Final stop used a checked captured PID; earlier listener-based stops still lack
ownership proof. W2 reports no remaining own server/Chrome/probe listeners. The new raw/nested-action
fixtures and corrected launcher are unrun during owner HOLD; no browser fix has been verified from them.

Safe-smoke author mutation tests deliberately broke cleanup and left three own test process groups
and one own temp directory. W1 reports they were removed using verified captured IDs/path; no foreign
cleanup is claimed. These are failed guard-test attempts, distinct from later green procedure tests.
The helper still has source-found stop/start lifecycle defects pending fixture reproduction/fix and
independent safety review. Browser HOLD remains in effect.

Incident clarification: W1 receipt `3560768638530e0d` confirms no process/check on `:7794` during
19:32–20:05 local. Review confirms its active combined-check ports were different and unaffected.
Early W2 listener-stop PID identities remain undocumented, so overall absence of impact is not claimed.

The `:7795` listener is still present: PID 3167577, start 18:41:26, cwd `r3-reference-install`, serving
`/tmp/opencode/mdhouse-0f2/repo`. This is distinct from the older `:7796` PID 3199274 incident.
W2 receipt `4e9f68e1a19b67e6` identifies failed start 20:12:37 in `srv9.log` and the invalid
`final-corpus.out` (40 failures, foreign GET/404 requests), followed by separate own-server
`final-corpus2.out`. Review's earlier empty-port explanation is contradicted by current listener and
API evidence; owner-log reconciliation/cleanup is pending. CTO made no mutation/stop of that process.

### Confirmed cleanup of the separate 7795 leak

Review receipts `d6e57885cef3af4e` and `c80566f8c777187a` establish ownership of PID 3167577 from
live argv, cwd and port: its completed MW.0f.2 scratch leaked after cleanup killed a captured subshell
wrapper rather than Bun. Scratch/log deletion had hidden the error; the port was not rechecked.
W2's invalid GET/404 run therefore reached a live retired instance, not an empty port. Review's earlier
empty-port explanation was wrong and is superseded by this attribution.

Review stopped only the confirmed own PID. CTO independently verified no listener on 7794/7795,
PID 3167577 absent and old PGID 3167572 absent. No restoration is required for that retired scratch;
active Review checks used other ports and are confirmed unaffected. This does not establish ownership
of earlier W2 listener-selected stops on 7794; that uncertainty stays separate. Common launcher tests
must cover wrapper/child group cleanup and post-cleanup verification before clean browser reruns.

## W1 injected-cleanup fixture leak — blocked remediation

Receipt `af5767607563804b` and gitignored handoff
`.scratch/incidents/w1-safe-smoke-leak-2026-11-05.md`: fail-first EPERM cleanup test on old `96cdfcc`
left own group 250110 (fixture Bun on 61741 with child sleep 250118) and own sleep group 250141.
CTO independently read listener/process/cwd/args: start 20:46:12; unique deleted fixture path matches
W1's test. Sleeps may expire naturally; persistent server remediation is not claimed.

Claude Code auto-mode classifier denied the targeted group-kill command with full reason:
"Permission for this action was denied by the Claude Code auto mode classifier. Reason:
[Interfere With Workloads]." The exact denied command and attribution are in the handoff sent to CEO;
no other agent/process/command may proxy around that rejection. Supported manual approval path was
requested from W1, not assumed. New injection/browser runs are held; only read-only attribution and
unrelated pure analysis/tests continue. Corrected failure fixtures must use independent captured-own
cleanup in finally rather than the cleanup function being deliberately broken.

W1 followup `6706fde76053127c`: no manual approval prompt was offered. The rejection text names
owner-managed permission rules or stopping to explain; W1 has asked the owner and proposed a manual
owner cleanup in its session. No permissions/mode were changed and no proxy retry was attempted.
Both sleep fixtures expired naturally; W1 reports only fixture-server group 250110 still holding
61741. Cleanup completion remains pending owner action/approved path; injection/browser HOLD continues.

### Owner-mediated fixture cleanup confirmed

Owner reply, verbatim: «done». CEO receipt `9c053f95c199c924` independently verified fixture PIDs
250110/250118/250141 and listener 61741 absent. CTO repeated read-only checks with the same result.
W1 confirms the verified own group was stopped after owner approval. The classifier-denied action
was not proxied through another agent/command. Cleanup blocker is removed; injection/browser HOLD
remains until corrected helper review. No old-code fail-first run is to be repeated.

## Clean passive-content verification

Verified common launcher `814c10a` replaces both ad-hoc process lifecycles. W2 clean runs used it;
no live instance or foreign endpoint was used. Fixed actions 33/33 and hostile/style corpus passed;
baseline `31e4992` failed the five new exact-node/double-click checks as expected. Full candidate
suite 689/689 and tsc passed; source/marker/draft preservation is covered.

Raw HTML first failed at the harness layer (framed:false); those runs prove no in-frame negative or
positive result. Corrected test-only `0f44675` reads iframe DOM/CSS through CDP: scripts/handlers/SVG
markers absent before any fetch, no probes or frame navigation, parent unchanged; empty sandbox and
page/source modes confirmed. X06 shows passive text/table/details and green computed h1. Control on
old `b11e47f` detects execution/probes/navigation; X03 did not fire there and X06 only fails the old
sandbox attribute assertion, so neither is claimed as a positive exploit control. Link/form click
landing is not asserted. Real Safari/Firefox/device checks remain open in release QA.

## MW.8 final integration

Independent CEO verdict `778af26a90369eae`: PASS on exact `fdb4098a5a99c6b7d8a0172fc022d3f2529cb87a`,
base `964ade7`, including the `e8f5ccd` → `fdb4098` script-only fixes. Exceptional entrypoint cleanup
and complete positive-check key sets are covered by no-process fake regressions. No additional
production blocker was found in the inspected delta.

Latest controlled verification: isolated frozen checkout, lock-matched dependencies, shared flock,
nice 19 and CPUs 22/23; start 2026-11-06 04:37:34 UTC at load1 8.26, full 703 pass / 0 fail,
tsc exit 0. Completed 04:38:32 UTC; pre/post inventory has no new mdhouse processes. Full logs,
exit codes and inventories: `.scratch/cto/final-verification/`. Earlier W2 full run on `093550f`
reported 24 failures / 6 errors after output truncation; names/errors are lost and its historical
cause remains unknown. Missing/mismatched inherited dependencies were subsequently observed; they
are not proof of every historical failure. The controlled latest green run replaces indefinite
waiting for that lost evidence, not the incident history.

Integrated main `3b044d53c85e24b33dcc7e89eef289f2827cfcc3` preserves RAG and authenticated-signature
decisions. Production, scripts, package/lock and tests are byte-identical to the approved target;
focused render/harness checks pass 65/65. Dirty launcher bytes were preserved. No new full/browser
run, live reload, push or deployment was performed during integration.

Safari/Firefox and verified raw link/form click landing remain release QA. Raw sandbox execution
negatives and passive-page compatibility have Chrome evidence; best-effort clicks do not prove
landing. Admin wiring, authenticated attribution enforcement and whole-workspace acceptance remain
separate open work; closing [№MW.8](workspaces/TODO.md#MW.8) does not close them.

## Retired Review scratch servers cleaned

Review receipt `2665f2e93227048a` attributes all six orphan Bun processes to its old ad-hoc
subshell launcher: 3403526/3585699/3588771/3749502/4066681/4133645, ports 7841/7843–7847.
Review reports exact-PID cleanup after argv/cwd attribution; CTO independently verified all six
PIDs absent and all six ports without listeners on 2026-11-06. No current job depended on these
retired checks. The subshell pattern is retired; future launches use the reviewed safe-smoke helper.
This closes this orphan audit, not the separate unknown early 7794 kill identities.

## Pure session history and mock GeoIP checkpoint

Independent Review PASS `d9af66a698d50342` binds to exact `b9986d2`; integrated `e5382e1` has identical
source/tests/dependencies. Focused integrated user-session-model + geoip: 65/65, no real lookup or
process launch. LastSeen/MRU, idle >30d, per-session every-country-transition, pending/unbound states,
async observedAt/IP/session binding and mock sequential provider failure handling are covered.
No full/tsc/browser rerun for the identity merge. Pure historyView consumes caller declarations;
this is not self/admin route authorization. Persistence, OAuth/routes/UI/live GeoIP and initial-unknown
policy are outside the accepted slice and remain open.

## Session persistence combined checkpoint

Approved `3dd661e`, independent PASS `8fa9a3de019bd381`; integrated `c529bf1` with exact
source/tests/dependency identity. Combined focused 108/0 and types exit 0, retained under
`.scratch/cto/session-cohort-gate/`; Review independently exercised codec/store temp-FS behavior.
No duplicate full/types/browser gate at integration. Earlier save-alias/in-place-no-op defects were
reproduced and fixed before the single gate; tests cover persisted-byte snapshot agreement.
No runtime auth/grants are supplied by snapshot consistency. Same-owner path replacement races and
best-effort inert temp cleanup remain documented limitations; initial-unknown and live wiring are open.

## Standalone RAG local-plan bin checkpoint

Exact independent PASS `0140cdf207c56a6b` on `4087601`; integrated `ae04901` source/bin/package/tests
identity unchanged. One combined 35/0 + types gate retained in `.scratch/cto/rag-bin-cohort-gate/`;
actual tarball exports/runs new-bin --help and retains canonical license and all 39 authoring packages.
No repeated landing gate. Local adversarial temp-tree checks cover exclusions, UPPER.MD, symlinks,
oversize and explicit partial inventory; no network/provider/server process was used. This proves
help/local preview only; no connected indexing/search/paid effects, runtime authorization or source
content/atomic snapshot proof is claimed.


## Connected RAG bin checkpoint

Exact `8f3d134` independent PASS `60def3a69dfdbd14`, integrated `1fd503a` with unchanged
source/bin/package/tests/docs identity; current owning Plans preserved without conflict.
One combined gate: all 123 non-package focused cases passed; package test initially failed only
on obsolete help wording, corrected and rerun PASS. Types exit 0; frozen-lock modules and actual
npm artifact/help/license/39-flow coverage. Logs: `.scratch/cto/rag-connected-741a97f/`.
Integrated pure runtime check 13/0; no repeated full/types/browser/provider gate.

Review exercised the same exact cohort checkout after its review-checkout module symlink proved
broken; that dependency failure is not source regression evidence. Strict result decoding, explicit
apply/paid intent, owner-config/root binding, scoped correlation and topic-only app reconnect cleanup
are accepted in fake/local scope. Live key/collection readiness, J124 deploy/tracked-key audit and
operator-authorized upgrade of the old running app remain separate. No live indexing/search proof,
provider call, production AI test, automatic resend, background sync or app reload was performed.


## Ignored Markdown browsing checkpoint

[№MW.9](workspaces/TODO.md#MW.9): independent exact-target PASS `16f57421c7b2d3d9` on
`2dce337`, integrated `9b90362` without conflicts or source/test/package/cohort-doc delta.
Combined focused 108/0 and types exit 0 with own frozen-lock modules; evidence `.scratch/cto/mw9/gate/`.
Review checked the exact cohort checkout and focused subset. Integrated views check 9/0; no duplicate
full/types/browser gate for the identity merge, no version bump or live reload.

Scratch browser via reviewed safe-smoke/finally+flock: toggle show/hide, direct `.ai-team/` content
without changing the global toggle, selected `.ai-team/` + vendor scope in main, V1/V2 strict own
entries, return to default union, explicit ALL denial. Opened desktop light and phone dark screenshots.
First attempt stopped on an incorrect text selector for SVG V buttons; next targeted attempt stopped
on harness reload/localStorage timing; both cleaned own processes. Corrected targeted views smoke
passed. Logs/results/screenshots under `.scratch/cto/mw9/`; final owned groups verified absent.

Focused temp-Git negatives cover explicit `.mdhouseignore`/extraDeny, hard `.git`, malformed scopes,
inside/outside symlinks and aliases into excluded paths. Pre-existing ALL explicit-exclusion and
base-scan metadata leaks were reproduced and regressed within this cohort. Registry-before-stat
preserves the existing jail seam; it does not claim elimination of same-OS-owner filesystem races.
Cost: one realpath per listed path per invalidation plus ignored-list discovery; caching retained.
Safari/Firefox and broader release/device journeys remain open. No live7777/provider/paid calls.


## Agent Bus canonical Personal registration

CTO-authored compatibility fix `5736c14`, base `2b0485e`, integrated by fast-forward with exact
source/test/doc identity. Independent Review PASS `91b54b42d62424c4`; the report's W1 attribution
was incorrect (W1 neither authored nor tested this task), correction requested. CTO reproduced 400
on a strict fake with the old `personal:true` member; replacement `tags:["personal"]` passes the
focused agent-bus/rag-sync-bus 44/0 gate (`.scratch/cto/bus-personal-tag/focused.out`).

Create-only If-None-Match/412 and allow @owner stay unchanged; existing records are not retagged,
managed or widened. No other register/manage retired member was found in src. Official local AB
record docs and strict decoder inspected, provider CTO confirmed canonical creation contract.
No full/types/browser/provider rerun for this one-field compatibility fix; local reload/reconnect
verification remains pending with CEO, no parallel CTO restart.


Canonical registration runtime followup: CEO verified enabled/connected true, identity #mdhouse@parf.us,
error null and all nine roots/path/RW intact after targeted local reload (`ab8cbd08d366ed48`). No test
message, paid/provider call or parallel CTO restart. This supersedes the pending-runtime note above.


## File Git state and Mermaid XML cohort

Exact `1436b33` reviewed PASS `e445c303801b82c4`, integrated `8fa40e1` with source/test/package/docs
identity unchanged. W1 actual Git metadata, W2 shared palette/direct selection, W3 XML serializer;
CTO inventory/cohort. Inspectable gate `.scratch/cto/file-ui/gate/`: focused119/0, types0, own frozen
install; integrated pure15/0. Owned safe-smoke browser: initial full owner-copy diagram and ordinary/br
labels decode, XML valid, IMG-only; native malformed/namespace/hostile fixture passed with probe0.
Direct ignored file selected/expanded, ignored/untracked distinct right badges, tracked neutral;
shared ignored name/badge/right colors light/dark. Opened desktop/phone screenshots. No source edits
or live checks by CTO; cleanup completed.

Review additionally reported an unassigned full992 run despite no-full request. Its command piped to
tail, no disk log/original exit retained, time approximate; this is a process deviation, not acceptance
evidence. No repeat authorized. Review instructions now require explicit paths and disk/original exit.

CEO's owner-authorized local reload exposed a NEW same-URL lifecycle gap: safeBody changes on refetch,
but Mermaid effect depended only on URL/hasMermaid. Source pre replaces the image without a new render.
CTO independently reproduced via fixture FS watcher (`refresh-baseline.out/.json`): initial decoded
owner-copy image → same-URL HTML refetch → rendered null/images0. [№MW.8c](workspaces/TODO.md#MW.8c)
remains open; initial XML proof does not establish refreshed/live completion. Narrow followup pending.


## Mermaid same-URL followup and live result

W3-authored exact `4f8dd03` independent PASS `91743b8a207ebe15` / `3551fd6e01d9861d`, integrated
`4ccd007` with unchanged source/test identity. One Doc.tsx delta: safeBody/actToken trigger, cleanup
live-generation/connected-container guards around awaits, marker after decoded img insert and unique
render IDs. Serializer/strict config/CSP/action boundary unchanged. No repeated full/types/cohort gate.

Meaningful native watcher regression: initial decoded owner-copy diagram → write same fixture file →
SAME URL HTML refetch. Baseline `1436b33`/`8fa40e1` leaves rendered null/images0; fixed target decodes
NEW target text, XML valid, no live SVG, URL unchanged. Logs/json/exit in `.scratch/cto/file-ui/refresh-*`;
owned safe-smoke/probe cleaned, no realty source edits. The reset bug was effect dependency mismatch,
not a failure of the initial XML serializer; initial fresh-load proof alone was insufficient.

CEO verified owner-authorized reload on actual `http://md/realty/.ai-team/README.md`
(`c86638049f8af01f`): pre rendered1, complete image natural261x150, decoded SVG XML valid, inlineSVG0;
all nine roots/RW preserved, initial no-image regression gone. User may refresh. CEO subsequently confirmed repeat navigation/reload PASS
(`76e2e7a98e14c732`): image261x150 displayed, viewBox `4 4 1669.7158203125 960`, XML parsererror false,
source labels include #r/cto. No additional checks were run by CTO.


## Unchanged-body and history live acceptance

Exact `ca538e6` independent PASS `eba835700b0b53f3`, integrated `c568e3b`, production/test identity
unchanged. Inspectable gate32/0+types0 and finalhistory12/0; native `.scratch/cto/doc-stability/`
proves metadata3/conditional1 with body mutations0/gapframes0, samePre/img/token and fullBodies0;
real changed source produces new body/token/decoded valid IMG. Untracked empty/past history and
tracked preservation covered. Reviewer corrected unrelated inherited RAG/session probes out of scope.
CEO actual15s observation (`693b4d284727048e`): samePre/sameImg true, childMutations0/gapFrames0,
261x150 decoded; ignored history/actions absent, nine roots/RW retained. No realty edits/paid calls.


## Projects Settings current-controls checkpoint

[№MW.10](workspaces/TODO.md#MW.10): worker-authored exact `be56acd` non-author CTO review PASS
(UI/copy/descriptive read DTO, no new mutation/authority). Fast-forward integration preserves source/
package/test identity. Focused project-groups + project-roots 5/0; logs `.scratch/cto/projects-settings/`.
No full/types/CLI blanket run for copy/layout. CLI diff inspected: human strings only, parser/flags/
template expressions unchanged. RootInfo DTO stays allowlisted; writableBy is descriptive only, absent
for RO/reference; reference removal stays403. No admin grant follows from RW or author cookie.

Owned safe-smoke scratch proof: Saved/This session/Reference groups, selection preserves URL/last
shown document, canonical path and actual access/persistence, explicit RW reason, immutable reference,
remove selected saved project falls back, last remaining project removal disabled. Light desktop/dark
phone screenshots opened, own processes cleaned. Existing authorized controls preserved; new project
name/RW/save/AB override edits not implemented or disguised as working controls.

CEO applied targeted local reload (`e061cd7d59e9822f`): actual Settings Projects/group/details,
canonical path/access/kept visible; browser and all-project scopes distinct, chooser Switch project.
Nine roots/path/RW preserved, no build/provider call/version bump. Parent add/naming/per-space AB and
admin gates remain open until their own complete acceptance; only this scoped checkpoint closes.


## Local Personal administrator wiring — integrated {#local-personal-admin-wiring}

[№MW.0g.2b](workspaces/TODO.md#MW.0g.2b), candidate `101fe1865ef6104ac393872497859bfcd48f2177`.
W1 author `e897a53`, W2 author `9f4e2b6`; combined without conflicts. CTO malformed metadata fixture
cast `a451b27` preserves the negative assertion and repairs the pre-existing type-check failure.
Combined gate: 223 passed, 0 failed across 12 explicit impacted test files; `tsc` exit 0.
Complete output and original exits: `.scratch/worktrees/r3-admin-local-cohort/.scratch/admin-gate/`.
W1 retained initial seven expected failures in `.scratch/worktrees/r3-admin-local-backend/.scratch/first-run.log`;
these were missing-session/inventory assertions updated for the intended boundary, not silently rerun flakes.
W2 author browser checks used mocked admin routes; these do not establish real-backend acceptance.
Native combined proof PASS on `4af60fd`: actual CLI PTY link, first API request exchange before app APIs,
clean URL, admin state and protected setting save; CLI revoke then 401 preserves the scheme draft;
replay 403, malformed fragment without exchange, logout/direct denied POST, same-page link sign-in.
Local fake-bus fixture verifies default/filter save with admin, disabled without admin and stale refusal
without losing the filter draft. Only register/token/consume/list reached the fake socket; no external send.
Light/dark/390px screenshots inspected; safe-smoke captured groups stopped cleanly.
Artifacts: `/tmp/claude-1001/-home-parf-src-mdhouse-Plans-ai-team-w2/dc2bbd38-3932-4687-9b33-5750de821884/scratchpad/accept.log`,
`accept.ts` and `accept/*.png`. Earlier harness issues (non-TTY script invocation and ambiguous input
selector) were corrected in the scratch harness; no source fix or hidden test retry into a pass.
Independent nonauthor CEO PASS on exact `4af60fd8af140df04bb2bfbade10bc249ed32807`, base `5273ebe`;
allowed admin-session/admin-wiring/admin-entry tests 62/0, original exit 0, complete logs/verdict in
`.scratch/worktrees/r3-admin-local-ceo-review/.scratch/ceo-security-review/`.
Fast-forward integration into main preserves exact reviewed HEAD and tested source/test/doc/script identity.
Proof/session primitive expiry uses deterministic unit checks; HTTP proof-expiry e2e is not yet exercised.
Successful root removal is covered by server tests; native browser fixture had one project and correctly
kept the last-project remove control disabled. Browser Host/cross-origin/non-loopback negatives are
covered at backend level. Cross-browser/real-device checks remain release QA.
Team/OAuth, remote bootstrap, new project properties and marks policy remain outside this accepted scope.


## Optional Project names — integrated slice {#optional-project-names}

[№MW.1a.1](workspaces/TODO.md#MW.1a.1), code candidate `8408be3617969da18a6dd1d6563a2e5df86c79d1`.
W1 author `1b91474`, canonical-path followup `b821a2e`; W2 author `ab7bf74`, duplicate chooser followup `554de32`.
All author commits combined without conflicts. Owner chose session-only name lifetime until explicit save
([№Q-R3-NAME1](workspaces/DECISIONS.md#Q-R3-NAME1)); this does not save a root or change its access.
Initial combined gate: 196/0 across 14 named impacted test files, types exit 0; complete output/original exits
in `.scratch/worktrees/r3-project-name-cohort/.scratch/name-gate/`.
Canonical-path material fix: targeted 48/0 across project-name-wiring/project-name/prefs/prefs-dist,
final types exit 0; `canonical-delta.log/.exit` and `final-types.log/.exit` in the same directory.
No repeated full suite. Original first failures retained: W1 cold foreground saved-name test expected
`Foreground Saved` but got directory label (`.scratch/cli-fg-first-failure.log`); W2 duplicate shortened
chooser labels (`project-name-ui-labels` scratch); CTO reproduced alias retarget transferring a label,
W1 recorded the canonical-key fixture failure in `r3-project-name-backend-canonical/.scratch/canonical-first-failure.log`.
Fixes preserve the claims and tests; later pass evidence does not erase those failures.
W2 initial browser proof mocked only root-name routes and does not establish final backend acceptance.
Real-backend proof and final pinned independent verdict completed below; historical failures remain recorded.
Parent [№MW.1a](workspaces/TODO.md#MW.1a) remains open on the absent [№MW.7](workspaces/TODO.md#MW.7)
Agent Bus control inventory; existing control ping is not that surface. No new RW/save/endpoint editor,
mode migration, Team/OAuth, live reload, version bump, publication, provider or ACL change.


Project-name security review `63c78eb` was HOLD, despite 28/0 on the three allowed name test paths:
reviewer identified missing CLI `--name` value being treated as intentional empty/reset. W1 actual
scratch reproduction reset an existing saved `Keep` label; fail-first expected exit 2 but observed 0.
Author `7486d97` distinguishes missing argv from explicit empty/reset, refusing before writes; three
missing-value forms preserve byte-identical prefs, label, saved-state and RW. Explicit empty still resets.
Evidence in `.scratch/worktrees/r3-project-name-backend-name-value/.scratch/name-value-repro.log`,
`name-value-first-failure.log` and `name-value-after-fix.log`.
W1 also retained a foreground-start test race (`fg-race-first-failure.log`): HTTP bound before final CLI
startup metadata was applied. The fixture now waits for completed named startup; no hidden product
change or silent retry into a pass. Author diagnostic repeat logs remain available.
Final CLI-only code candidate `a9f3a6075515582389992287822c968653144e5e`: targeted CLI name tests 5/0,
final types exit 0, full output/original exits in `r3-project-name-final/.scratch/final-name-gate/`.
Server/UI/doc/scripts are unchanged from the frozen browser candidate `63c78eb`; a new exact nonauthor
verdict is required for this material CLI fix. The old pinned checkout remains unchanged.


Native name acceptance on the frozen `63c78eb` code identified two harness problems, retained rather
than declared PASS: headless input before `document.hasFocus()` (no typed value/POST) and an invalid
views fixture `{repo:{probe:true}}` that crashed existing views code after reload. The fixture now uses
valid V1/V2 arrays; focus/ready conditions precede input and screenshots. Product views code is unchanged.
The initial run4 had no script error but missed updates under fixed sleeps; it is not a clean PASS.
Run5 with explicit waits confirmed duplicate full paths, then failed on the CLI-reset live update.

Real product finding: every roots event closes/reopens the live socket, and a second rename in the gap
was missed because hello was ignored. W2 deterministic before-fix logs show server Second/tab First
and exit 1. Author `6b96f9d` reloads roots on hello as well as roots, with no polling, tree/body refresh
or permission changes. Actual after-fix proof: server Second/tab Second, same URL/body node, zero body
mutations, unchanged metadata/body/views/marks; only roots GETs. Cleanup clean.
Proof checkout `r3-project-name-resync-proof` uses `63c78eb` plus exactly this app.tsx change; final CLI
missing-value guard is independently tested and does not change those server/UI surfaces.
Original and corrected artifacts are in W2 scratchpad
`/tmp/claude-1001/-home-parf-src-mdhouse-Plans-ai-team-w2/dc2bbd38-3932-4687-9b33-5750de821884/scratchpad/`:
`names-final-run4.log`, `names-final-run5.log`, `names-final/*.png`, `names-dup*.log`,
`names-gap-before-fix.log`, `names-gap-after-fix.log`; scripts `names-final.ts`, `names-gap.ts`.
Other native cases verified: name set/reset and text rendering; current path and IDs unchanged; both tabs'
labels/title/crumb, reference no field/direct 403, nonadmin direct 401, revoked-admin draft retained;
session/saved lifetime hints, CLI name without saving, ready light/dark/390px Settings/document screenshots.
Final combined resync code `e5ba18d`: types exit 0, output/original exit in
`r3-project-name-final/.scratch/final-name-gate/resync-types.log` and `.exit`. Fresh nonauthor verdict pending;
previous `314e97c` PASS does not by itself approve this material UI delta.


Accepted [№MW.1a.1](workspaces/TODO.md#MW.1a.1): exact final nonauthor CEO PASS on
`ba0b19c13c859b6c198871534335fb841bd49feb`, with source identity on fast-forward integration into main.
Final review inspected App early-return/hello snapshot path and actual native before/after artifacts; no duplicate
full/types/browser run. Verdict retained in `r3-project-name-resync-review/.scratch/ceo-resync-review/verdict.txt`.
Native acceptance is the combined verified cases plus the corrected deterministic reconnect regression, not a
claim that run4/run5 were clean. Meaningful 390px ready screenshots live under W2 scratchpad `names-narrow/`,
not the earlier spinner artifacts: `4-narrow-doc-dark.png` and `4-narrow-settings-light.png` inspected by CTO;
other light/dark counterparts retained. CLI missing-argv negative coverage applies to the final parser code,
while server/UI proof checkouts differ only in that separately verified parser guard.
Remaining: absent Agent Bus control inventory ([№MW.7](workspaces/TODO.md#MW.7)); parent
[№MW.1a](workspaces/TODO.md#MW.1a) stays open. Cross-browser/real-device release QA remains unverified.


## Existing-project explicit save — integrated slice {#existing-project-explicit-save}

[№MW.1.1](workspaces/TODO.md#MW.1.1), code candidate `533513a5dc41224c4f4121f0b98f3406a8815384`.
W1 backend `2a2c5bc`, W2 UI `5f154b3`, combined without conflicts. Dependency check is in
[execution scope](EXECUTION.md#existing-project-explicit-save): preserve configured `rwAsked` and the
existing auto policy; no MW.0h/default/profile/Viewer activation. Owner's name lifetime B is retained.
One combined gate: 166 passed, 0 failed across 13 impacted explicit test paths, types exit 0.
Complete output and original exits: `.scratch/worktrees/r3-project-save-cohort/.scratch/save-gate/`.

Prerequisite failures were reproduced before edits: failed Prefs write installed candidate values in memory;
broken-file fallback also aliased the old object. W1 retained `prefs-commit-first-failure.log` and
`prefs-broken-first-failure.log` under the backend worktree `.scratch/`; initial injection that failed
before the lock/change was not treated as proof. Actual EACCES/symlink target and broken fallback failures
are distinguished from the existing archive/recovery policy. Guard/admin-recheck/effective-as-configured
mutants each failed the corresponding negative test; `save-mutant-*.log` retained.
Initial integration-test inventory/allowlist failures remain in W1 `focused-1.log`, followed by the intended fixes.

Backend checks: RO/explicit RW/auto-only save and reload, name B transfer, canonical IDs/URLs/marks;
14 denied requests with byte-identical prefs and unchanged session name/revision; stale mode/name/auto/save;
controlled lock interleavings with external save/auto and admin revocation; name/save and remove/save races;
pre-rename IO and future-version failures preserve disk, process memory, runtime and session metadata.
No production test-only lock export. Saved mode never promotes automatic write access to an explicit grant.
W2 author UI proof used mocked root/save routes (other admin paths real), 13/13 cases; it does not establish
real-backend acceptance. Its initial input-after-dialog harness failures are retained in `save-ui-run*.log`.
Native combined browser proof and pinned independent review completed below. No live/service/session actions,
full-suite duplicate, version bump, provider/ACL or publication action. Parent [№MW.1](workspaces/TODO.md#MW.1)
and [№MW.0h](workspaces/TODO.md#MW.0h) remain open.


Accepted [№MW.1.1](workspaces/TODO.md#MW.1.1): exact nonauthor CEO PASS on
`ad7b5fc1abfceaa2c138ac950ab2d80e7b3fb61e`, base `b968f06`; three allowed project-save/prefs/authz paths
53/0, original exit 0, full output/verdict in `r3-project-save-review/.scratch/ceo-save-review/`.
EACCES/newer-version stack output is expected negative-path evidence, not a hidden test failure.
Fast-forward integration into main preserves exact reviewed/tested source identity.

Native proof on exact `ad7b5fc`: 20/20 PASS, true backend, no response mocks. Three RO/explicit RW/auto-only
confirmations show canonical Folder/Name/Access; three cancels send no POST. Save transfers `Read Only Notes`,
removes saveRev/unsaved badge, shows plain saved text and updates another Settings tab. Natural stale revision
(created by blocking only the observing tab's roots GET while CLI renames) refuses 409 without saving;
refresh and a new confirmation succeeds. Auto-only remains configured RO and conditionally writable by auto.
Explicit RW stays explicit RW. CLI revoke before accept refuses 401, leaves the root unsaved and disables save.
Document tab retains URL/title/body node, zero body mutations, identical metadata/body/views/marks and root IDs;
only roots metadata is requested. Backend tests establish restart persistence and IO/future-version/lock behavior.

Artifacts in W2 scratchpad
`/tmp/claude-1001/-home-parf-src-mdhouse-Plans-ai-team-w2/dc2bbd38-3932-4687-9b33-5750de821884/scratchpad/`:
`save-native.log`, `save-native-run1.log`, `save-native-run2.log`, `save-native.ts`, `save-native/*.png`.
Initial harness run1 could not capture a background target; bringToFront precedes capture. Run2 narrow framing
missed Kept; final capture scrolls it into view. Both failed harness runs are retained, not counted as product PASS.
CTO inspected ready `5-narrow-unsaved-light.png` and `5-narrow-saved-dark.png`; light/dark counterparts retained.
All own smoke groups stopped cleanly. Cross-browser/real-device release QA remains open, as do the broader
[№MW.1](workspaces/TODO.md#MW.1)/[№MW.0h](workspaces/TODO.md#MW.0h) mode and installation work.


## Scoped project access — integrated cohort {#scoped-project-access}

[№MW.0h.1](workspaces/TODO.md#MW.0h.1)/[№MW.1.2](workspaces/TODO.md#MW.1.2), code candidate
`7c1ac70dae0a2fcf585c8717de9c4658a7c9b163`: backend author `0775b9c`, UI author `6f4b144`, combined without conflicts.
Approved A is [№Q-R3-MODE1](workspaces/DECISIONS.md#Q-R3-MODE1), clarified for one process per machine.
No actual coexistence incident, process/restart scanner or live reload is part of this implementation.

Backend exact-tree impacted gate reused by cherry-pick/source identity: 457 passed, 0 failed across 24 paths,
original `bun-exit=0`, types exit 0. Full paths/output in `r3-project-access-backend/.scratch/logs/`:
`gate-impacted.paths`, `gate-impacted.log`, `gate-tsc.log`.
Evidence gap disclosed by W1: the first gate command used zsh without splitting the test-path variable;
Bun ran zero tests, exit 1, “filters did not match any test files”. The bash diagnostic rerun executed the
actual gate with no source changes, but overwrote the first command log. It was not a product assertion
failure and is not claimed as a clean first invocation; no rerun was used to recreate the lost log.
Retained earlier `first-run.log` has four expected old-format/inventory fixtures updated; new access tests
passed first time (`access-first-run.log`). Fifteen mutation logs `mut-*.log` confirm guard/migration/RO/CLI
negative tests detect removed protections. Original evidence is retained separately from final passes.

Combined targeted UI contracts: 23/0 across doc-refresh-ui/project-groups/project-name-ui, types exit 0;
full logs/original exits in `r3-project-access-cohort/.scratch/access-gate/`. Broad 24/full gate not duplicated.
Backend tests include the real base-code old-reader fixture, idempotent migration/current-choice matrix,
blocked formats, mode/save/name/CLI lifetimes, locked stale/admin/failure guards, slow-hook queued Git/task
write denial after RO, no cancellation of the running command, unchanged files/repo on denied operations.
W2 author mock proof (12 cases) establishes controls, draft and body/token/Mermaid behavior only; true-backend
mode/write-denial native proof and pinned independent security verdict remain pending.
Parent [№MW.0h](workspaces/TODO.md#MW.0h) stays open for default/profile/Viewer activation; parent
[№MW.1](workspaces/TODO.md#MW.1) stays open for remaining setup/properties. No live/service/session/provider/
ACL/push/publish/deploy actions or package-version bump. Storage version 2 is the explicitly authorized migration.


Native material finding on `a69b3c0`: an open Q&A draft survived the mode flip but detached from the page
after a real denied POST `/api/qa` (403), because reload installed new HTML/token while placement effects
required writable access. It was not counted as PASS. W2 author fix `984d1a0` keeps answer/add form
placement independent of permission; server save denial remains authoritative and the draft stays visible.
Initial failure: W2 scratch `mode-native-run2.log`, QA 403 with no visible note/form afterward.
Combined fixed code `d9efade`: types exit 0, captured in `r3-project-access-final/.scratch/access-gate/draft-types.log/.exit`.
Native after-fix proof and independent fixed-target review completed below; original candidate/pinned HEADs
were not advanced during review/proof. No broad impacted gate was repeated for this Doc-only delta.


Accepted scoped access cohort: independent Review PASS exact `9957efe2bafaec42aed13a717229f2a1f9139bf2`,
base `35aa562`, pinned HEAD/tracked tree unchanged. Full source/behavior/format/CLI/UI diff inspected;
allowed focused command 95/0 and saved-RO CLI test 1/0, original exits 0. Complete output/exits:
`r3-project-access-fixed-review/.scratch/review/{focused-access,cli-saved-ro}.{log,exit}`.
Source identity to native proof `13ae5ec` confirmed for src/test/doc/scripts. Exact reviewed commit fast-forward
integrated into main; parent scopes remain open as stated above. No new root/default/profile/Team authority.

True-backend native after-fix: 18 PASS, 0 FAIL, exit 0, own safe-smoke groups stopped cleanly. Inherit-auto→RO
confirmation/cancel; explicit RO remains RO under auto; direct valid task and real Q&A Save return 403 with
unchanged file hashes, visible draft and refusal note. The original detached-form failure is retained, not hidden.
Stale accessRev refresh/reconfirm and revoked-admin 401 preserve user state. UI RW restores real task/Q&A writes;
three mode changes retain source/body node/Mermaid img+src/data-act tokens/text, changing only genuine controls.
Session RO plus name Auto B saves to canonical readonly[] with autoRwRules intact and legacy autoRw empty.
Proof log and scripts under W2 scratchpad
`/tmp/claude-1001/-home-parf-src-mdhouse-Plans-ai-team-w2/dc2bbd38-3932-4687-9b33-5750de821884/scratchpad/`:
`mode-native-proof-final.log`, `mode-native.ts`, `mode-native-proof/*.png`.
Original product failures: `mode-native-a69b3c0.log`, `mode-native-run1.log`, `mode-native-run2.log`.
Retained harness failures: old 403 matched a later RW wait; task lookup found a fenced code line;
compact framing initially left the sidebar open. Final harness waits use the current action, actual task
and ready focused page; broad backend gate was not repeated for these harness corrections.
CTO inspected `5-narrow-dark.png` and `3-doc-ro.png`; light/dark wide/compact counterparts retained.
Cross-browser/real-device release QA remains unverified; no actual live instance was reloaded.

### Deferred cosmetic follow-ups

- ⚪ ACCESS-F1 Remove the redundant accessRev cast when Settings next changes
  Reviewer found no behavioral/security effect; no source-only cleanup added to the frozen target.
- ⚪ ACCESS-F2 Clear an earlier administrator error after same-page re-sign-in
  Existing [№MW.0g](workspaces/TODO.md#MW.0g) behavior reported by W2; it does not grant authority or
  lose a draft. Handle in the owning admin flow, not this migration/access checkpoint.


## Settings Add project — integrated cohort {#settings-add-project}

[№MW.1.3](workspaces/TODO.md#MW.1.3), base `917f8c0cd54d0ab09933ce4a17bf222554cecfee`,
exact accepted target `c7c2ef4f1b6434789b163543fe4c2bfa8ce77104`, fast-forward integrated into `main`.
Author backend `94ffed3`, UI `6a5125f` + `481aa7a`; combined source identity confirmed for both authors,
pinned review and detached native proof. Shared docs included before freeze; package version unchanged.

- Combined gate: `.scratch/worktrees/r3-project-add-cohort/.scratch/add-gate/paths.txt` names 28 impacted files.
  One invocation, 488 pass / 0 fail; `bun-test.log` complete and `bun-test.exit` original 0.
  `tsc.log` complete (empty), `tsc.exit` original 0. No full-suite duplicate or first gate failure.
- Independent nonauthor OpenCode review: exact target pinned in `.scratch/worktrees/r3-project-add-review`,
  HEAD unchanged, tracked tree clean. PASS, no blocking findings; only assigned
  `project-add`, `roots`, `authz`, `project-add-ui` tests, 60 pass / 0 fail, original exit 0.
  Full `.scratch/review/focused-add.log` and `.exit`; no types/full/browser duplication by reviewer.
- Author fail-first/new routes: `.scratch/worktrees/r3-project-add-backend/.scratch/logs/add-fail-first.log`
  retains 14 failures on unchanged code; `add-impl-run1.log` 14 pass, `focused-run1.log` 148 pass.
  Expected injected watcher/broken-prefs error stacks are negative-path evidence, not failed tests.
  Route matrix covers exact schema, absolute path/length/NUL, missing/file, canonical duplicate,
  reference and descendants, no/forged/revoked admin under lock, same-origin/sec-fetch, externally saved
  fresh policy, symlink retarget, unknown/broken config byte preservation, no auto-RW window,
  watcher rollback and save/name B. Registry prepare/install is shared with control/CLI; existing CLI
  reference-descendant RO behavior is retained. Add writes neither project files nor prefs.
- Native proof: `.scratch/worktrees/r3-project-add-proof` detached at exact target, source unchanged.
  Real backend, no mocks, safe-smoke own-group cleanup, 21 PASS / 0 FAIL, exit 0.
  Artifacts under `/tmp/claude-1001/-home-parf-src-mdhouse-Plans-ai-team-w2/dc2bbd38-3932-4687-9b33-5750de821884/scratchpad/`:
  `add-native-run3.log`, script `add-native.ts`, screenshots `add-native/`.
  Signed-out controls disabled/direct 401; no mode preselection; relative/tilde paths not submitted;
  double Enter/click exactly one POST; RW session add and real checkbox write 200; explicit RO under auto-RW,
  no live write controls from first render, valid-hash task 403 with unchanged file SHA;
  second tab chooser updates live; duplicate path/symlink 409 selects existing card without mode/name/save change;
  missing/file/reference/descendant refuse without root addition and retain draft;
  explicit save keeps RO plus session name “Added B”; revoke 401 disables form and retains typed path/mode.
  Stale canonical/policy is covered by deterministic route tests, not native proof.
  Retained harness failures: run1 counted a signed-out direct POST as a form POST and used a wrong baseline;
  run2 CDP Enter lacked carriage-return text and submitted nothing. No product native failure.
  CTO inspected `2-added-rw-light.png` and `7-narrow-dark.png`; light/dark desktop and 390px ready screenshots retained.

### Evidence limits and existing follow-ups

- ⚪ ADD-E1 Author mutation definitions were not retained as a script. Some zero-failure logs cannot
  distinguish a surviving redundant guard from a no-op mutation; `mut-saved-final-only` is disclosed no-op,
  `mut-saved-both` is not counted as evidence. Negative route tests and effective both-layers removals
  support the guards; do not claim every mutation was caught. Preserve scripts/annotated mutations next time.
- Existing [№ACCESS-F2](#ACCESS-F2) same-page admin re-sign-in can retain prior session-ended text until the
  next action; also seen below Add. No new follow-up duplicate or behavioral expansion in this checkpoint.
- Existing CLI `-p`/`--name` late prefs-write partial-state behavior is outside this web-add slice.
  Transient prefs lock creation is expected; read-only validation does not repair/migrate/write the prefs file.
- No live reload/service/session/provider/ACL/push/publish/deploy/version changes. Full parent
  [№MW.1](workspaces/TODO.md#MW.1), defaults/profile/Viewer/Team/install runbook/AB endpoint are not closed.


## Per-project Agent Bus — integrated cohort {#project-agent-bus}

[№MW.2.1](workspaces/TODO.md#MW.2.1), base `35cb4402247e94af216cb0dd010aada0126883cd`;
initial frozen `b69982edda0e1faf541e57dcee61ded3c077e641`, final accepted
`fe7bac8239689c3e56c6485b332ba933614412a5`; integrated merge `2f0ef62e86fbf9de67a0d915f3004a0b43e938e9`.
Merge retained CEO doc-only editor/RAG/automation decisions/research, no conflicts;
final src/test/doc/scripts identity checked, package version/dependencies unchanged.

- Combined gate on exact initial frozen target: `.scratch/worktrees/r3-project-ab-cohort/.scratch/ab-gate/`
  `sha.txt`, `cmd.txt`, `bun.log`/`bun.exit`, `tsc.log`/`tsc.exit`: one invocation, 18 impacted files,
  245 pass / 0 fail, original bun exit 0, types exit 0. No full-suite duplicate, no masked pipeline or rerun.
- Independent OpenCode prior PASS at `.scratch/worktrees/r3-project-ab-review`, detached/pinned/clean;
  assigned project-ab/agent-bus/prefs/authz/ab-targets only: 94 pass / 0 fail, original exit 0,
  `.scratch/review/focused-ab.log`/`.exit`. Final delta PASS exact accepted target in new
  `.scratch/worktrees/r3-project-ab-fixed-review`, old checkout untouched; only ab-targets test,
  18 pass / 0 fail, original exit 0, `.scratch/review/delta-ab-targets.log`/`.exit`.
  Delta is only Settings/ab-targets helper/test. Unchanged backend prior verdict/gate/native reused.
- Backend author evidence `.scratch/worktrees/r3-project-ab-backend/.scratch/logs/`:
  `ab-routes-fail-first.log` (9 failures), `ab-drain-race-fail-first.kept.log`,
  `ab-final-guard-fail-first.log` retain reproduced failures. Fixes: shared all-drains barrier and
  synchronous active accounting; final admin/blocked/saved recheck before memory install.
  `ab-final-guard-fixed.log` 19 pass, `ab-tsc-3.log` exit 0. Mutation definitions retained in
  `mut-ab.py`, `mut-drain-2.py`; M1–M15 and valid drain mutation caught. M11 initially survived,
  test strengthened and second run caught it; first log retained. `mut-drain-1` invalid/hung because
  it removed set cleanup, explicitly not counted; explanation retained.
- UI author original failures retained at W2 scratchpad below: `ab-race-51dc351.log` reproduces lost
  dirty draft and stale out-of-order config; `ab-select-race-077a17f.log` reproduces late save A
  replacing current B input. Fixes `077a17f`/`75c6b78` keep dirty drafts, latest-read sequence,
  and selected-project identity. Fixed logs include `ab-race-fixed.log`, `ab-select-race-fixed.log`,
  `ab-race-after-select-fix.log`; CDP-answered config reproductions are explicitly not real-bus proof.

Native evidence root:
`/tmp/claude-1001/-home-parf-src-mdhouse-Plans-ai-team-w2/dc2bbd38-3932-4687-9b33-5750de821884/scratchpad/`.
`ab-native-run5.log`, scripts `ab-native.ts`/`fake-bus.ts`, screenshots `ab-native/`:
27 PASS / 0 FAIL, exit 0, exact initial frozen target in detached project-ab-proof, source unchanged,
3 local loopback fake buses only; safe-smoke own-group cleanup. No real bus/provider calls.

- Settings config reads and session config save make zero daemon calls; no-connect metadata/editor.
  Tokens absent from HTML, both-tab WS frames and server logs; fake A echo-token error becomes safe HTTP500 words.
  A sees only its provisioned credential/minted token, instance sees only its own, B sees no inherited credential.
- Root endpoint/default route independently; instance default, project default, document AB names and explicit
  picked targets covered. Unavailable document agent remains visible, send refused before POST with no fallback.
  Explicit pick wins and survives reload per document. Two credentials at same endpoint get simultaneous replies;
  override changes during an active job retain its answer. Deterministic held-drain/lock interleaves are unit/route tests.
- Remote config change keeps dirty draft; stale direct/UI requests 409 with no mutation, fresh metadata shown;
  revoke 401 keeps draft and disables controls. Session endpoint/default absent from prefs until explicit save
  with mode/name B; clear removes entry, leaves `[AB]`, routes back to instance.
- CTO viewed `5-editor-light.png` and `6-narrow-dark.png`; screenshots also cover panel/unavailable/stale/revoke,
  light/dark desktop and 390px. Original native runs 1–4 retained: harness picker toggled closed twice,
  wrong expected safe-error wording, per-document assertion strengthened; no product failure on initial frozen target.

Native finding: original `[unsaved]` confirmation omitted the AB metadata newly carried by save.
`ab-confirm-b69982e-run2.log` retains 2 FAIL; fix `fe7bac8` captures saveRev before fresh no-connect config read,
shows endpoint/default/inheritance without credentials, adds busy/entry guard, refuses unreadable config before POST.
`ab-confirm-fe7bac8-run2.log`: 5 PASS / 0 FAIL, exit 0, real backend + local fake bus, clean cleanup;
fresh metadata/zero bus calls, cancel/no save POST, remote default change during confirm → 409 with no persist,
then fresh confirm saves name B plus AB endpoint/default and no credential. Script `ab-confirm.ts` retained.
Run1 on both SHAs was harness setup assuming a prefs file existed for session-only startup, retained separately.
Author final focused tests 18 pass/types exit 0; independent final delta verdict confirms closure.

Public no-connect metadata exposes sanitized endpoint/default and hasCredential boolean to admitted readers,
consistent with existing settings visibility; grants remain administrator-only. Terse unavailable-agent labels
use existing short names (cosmetic). Existing same-page admin-error follow-up remains separate.
Full [№MW.2](workspaces/TODO.md#MW.2), install/provider/RAG/control lifecycle are not accepted by this checkpoint.
No live reload/service/session/provider/ACL/push/publish/deploy/version actions.


## Full Markdown source editor — integrated cohort {#full-source-editor}

[№MW.5.1](workspaces/TODO.md#MW.5.1) and parent [№MW.5](workspaces/TODO.md#MW.5) accepted.
Base `1e630e25a0f7b02202bb0dc5226c5459f23b6faf`, exact final target
`8d84762d56b631c746f10b481b3ea1e0c1c03fa1`, fast-forward integrated into `main`.
Authors: backend `57876ee` + bounded-read follow-up `bfbf052`; UI `66508da` + loading fix `66a1c54`,
in-flight lifecycle fix `ae73889`, theme fix `e22c426`. No conflict or source resolution delta.

- Combined proportional gate `.scratch/worktrees/r3-full-editor-cohort/.scratch/editor-gate/`:
  `sha.txt`/`cmd.txt`, `bun.log`/`bun.exit`, `tsc.log`/`tsc.exit`. One invocation, 9 assigned paths,
  143 pass / 0 fail, original exit 0; types exit 0. Exact UI dependency/lock identity and node_modules link recorded.
  No full-suite duplicate or gate rerun. Final main installed exact frozen lockfile with `--ignore-scripts`;
  tracked source/dependencies stayed identical; package version 2.3.3 unchanged.
- Independent OpenCode PASS: `.scratch/worktrees/r3-full-editor-review` detached/pinned/clean, HEAD never moved.
  Only doc-source/authz/edit-source tests: 44 pass / 0 fail, original exit 0;
  `.scratch/review/focused-editor.log`/`.exit`, complete output. Whole source/UI/dependency/docs diff reviewed.
- Backend author logs `.scratch/worktrees/r3-full-editor-backend/.scratch/logs/`:
  `src-fail-first.log` retains 10 failures on tests-only base; `src-run2.log` 10 pass,
  `src-impacted-1.log` 58 pass, `src-tsc-3.log` types 0. Definitions `mut-src.py`, summary retained;
  S1–S15 finally caught, initial S10 early-RO/S14 read-cap survivors kept before strengthened tests/bounded read.
  Follow-up `.scratch/worktrees/r3-full-editor-backend-cap/.scratch/logs/`: `cap-fail-first.log` proves unbounded
  queued reread, `cap-fixed-2.log` 11 pass; C1 length-check and C2 unbounded-read mutations caught,
  definitions in `mut-cap.py`. Additional author types run disclosed; not a second combined gate.
- Raw-byte matrix: UTF-8/BOM/CRLF/LF/no-final-newline/legacy text/U+FFFD exact, no convertLegacy;
  invalid encoding 422, input and bounded-read size cap, SHA-256 whole-source key, stale/queue competition,
  final live RW/ref/jail recheck, cross-origin/strict schema/admission, atomic IO failure/mode preservation.
  A grown file beyond cap returns 409 even for a forged prefix hash; read spy proves bounded bytes.

W2 artifacts under
`/tmp/claude-1001/-home-parf-src-mdhouse-Plans-ai-team-w2/dc2bbd38-3932-4687-9b33-5750de821884/scratchpad/`:

- `editor-native.ts`, `editor-native-run7.log`: 24 PASS / 0 FAIL, exit 0, safe-smoke clean;
  proof `cab9be3` combines backend `57876ee` + final UI `e22c426`. Full source shown; real typing/Ctrl+S,
  raw bytes exact; page refresh, diff, same-page real commit and history proved; repository clean after commit.
  CRLF+BOM newline and no-final-newline preserved; mixed endings/invalid UTF-8 explicitly refused, U+FFFD allowed.
  Close/navigation/reload/per-document draft retained; external edit → 409, draft kept, file equals external bytes;
  Discard cancel/confirm, clean follow, live RW→RO disables editor/save, direct current-hash save 403 without write,
  RW restores draft save; emulated composition commits once; phone390 and iPad820 touch type/save, light/dark.
- Final proof `2254145` = backend `bfbf052` + UI `e22c426`; source/test/scripts/package/lock identity equals target.
  Difference from full native proof is only queued bounded read and its test, independently gated/reviewed.
  `editor-targeted-2254145-run2.log`: 4 PASS / 0 FAIL, exit 0, no full repeat; theme colors light/dark,
  emulated IME and phone/iPad touch saves. `editor-targeted/` screenshots retained; CTO inspected
  `6-editor-dark.png` and `7-phone.png`. Run1 was an undeclared harness counter, retained.
- Four async product regressions: `editor-inflight-66a1c54.log` retains fail-first typing-during-save marked clean,
  stale response storing old sent text, closed/reopened draft deleted by old callback, typing during discard lost.
  `editor-inflight-fixed.log` / `editor-inflight-e22c426.log` prove all four fixed (8 PASS conditions), using real
  backend and delayed requests only. Text newer than a successful POST stays dirty on new hash; failed POST stores
  current text; epoch guards discard old-component callbacks; discard/follow never replace newer input.
- Additional original failure: `editor-native-run1.log` exposed an empty editor accepting typing before source load;
  fixed by creating CodeMirror with its source snapshot. Native runs1–6/harness logs retained, including source-ready
  waits, commit-message preset, virtualized lines/main scrolling and background requestAnimationFrame;
  `editor-ro-repro-run1/2.log` were harness diagnostics, not product hangs. `edit-source-fail-first.log` retained.

Source engine selection uses official MIT/ESM/mobile documentation and current Forgejo/npm metadata;
GitHub archives reflect upstream migration, not abandonment. Monaco's documented lack of mobile support
made it unsuitable; npm unpacked package sizes were not presented as bundle size.
Served app scripts measured (Mermaid excluded): baseline 197,592 raw / 68,898 gzip bytes, final 534,576 / 180,119;
delta +336,984 raw / +111,221 gzip bytes. Bun HTML bundler inlines the dynamic import; no separate network chunk.
Only Markdown highlighting is imported, no nested-language/autocomplete/lint engine; transitive installed packages
remain exact-lock dependencies. Physical iOS/Android keyboards and real IMEs not tested, CDP emulation only.
Mixed/bare-CR endings explicitly unsupported; paste follows the file's existing separator (not a native paste case).
No custom editor/serializer/merge engine, authority expansion, new Git operation or live action.
RAG implementation and live Cron/At jobs remain deferred; no provider/ACL/push/publish/deploy/release action.


## Access badge presentation — Workspace checkpoint {#access-badge-presentation}

[№MW.12.1](workspaces/TODO.md#MW.12.1), base `e4ce7310747d9a2485ebdb6926292b8f940bf85d`;
W2 original `bbdb15fb05d1288cf2876181dbd464bfaebbb9d8`, follow-up
`75b576a0550c5aa6343a933c9c2790a24f4a5b44`, integrated source `71e51636fb5acc1889454fbc4e62e59aa71d3620`.
Owner plan/UX reference commits preserved. Source/test/package/lock identity equals final author;
backend/lib/CLI/API/live-access helpers/Home unchanged from base. No new fields, mode or permission.

- CTO exact-source nonauthor UI review PASS: pure accessBadge reads existing live effective writable,
  hides RW, shows RO for explicit/inherited/capped projects; missing/nonboolean/reference makes no claim.
  Sidebar header and sidebar-off topstrip reuse this helper. Settings chooser shows RO, never decorative RW;
  actionable mode control behavior/disabled/admin checks unchanged. Default RW muted, RO/unsaved highlighted;
  reference read-only/kept neutral, ordinary saved persistence muted, configured AB value accent only.
- One author focused run `bun test test/access-badge.test.ts`: 3 pass / 9 expectations, reported in author
  handoff `d170473a1c209583`. Cases cover explicit/auto RW, explicit/inherited/capped RO, missing/unstated/reference.
  Reused on source-identical cohort; no duplicate run, full suite or types for presentation-only changes.
- Native real-backend safe-smoke, real CLI PTY admin, source unchanged when committed. Artifacts under
  `/tmp/claude-1001/-home-parf-src-mdhouse-Plans-ai-team-w2/dc2bbd38-3932-4687-9b33-5750de821884/scratchpad/`:
  `badge-native-run2.log`, script `badge-native.ts`, screenshots `badge-native/`. Explicit RW, inherited auto-RW,
  inherited RO, saved RO, immutable reference verified. No RW list badges; RO only on actual RO projects;
  [RW] control visible/muted, [RO] visible/warn, unsaved warn, saved/reference muted. Header RW absent/RO warn.
  Real Settings toggle RO→RW→RO: two confirms, two mode POST200, list and open doc header update live.
  First `badge-native-run1.log` retained: harness regex /ro/ matched `project-ab`; actual default colors were muted.
- Audit found sidebar-off topstrip lacked the RO status. Follow-up scope recorded before edits; no PageHead/layout rewrite.
  `badge-topstrip-run1.log` targeted native PASS on first run; script `badge-topstrip.ts`, `badge-topstrip/` screenshots.
  Real Ctrl+B: sidebar absent/topstrip visible; RW/reference no badge, RO warn within strip at desktop and 390px light/dark;
  live two-way real toggle confirmed with sidebar still off. Unchanged helper/full native not repeated.
  CTO viewed `badge-native/settings-light.png`, `badge-native/header-ro-dark.png` and
  `badge-topstrip/strip-ro-390-dark.png`. Own scratch cleanup completed.

Configured AB accent was source/CSS reviewed, not exercised in the native fixture (AB off).
At 390px existing sidebar overlay covers most Settings; row tags remain visible, layout was not changed.
[№MW.12.2](workspaces/TODO.md#MW.12.2) remains blocked on real authoritative Viewer metadata;
no synthetic appBaseline or dormant production Viewer branch. Configured/effective distinction is unchanged.
Parent [№MW.12](workspaces/TODO.md#MW.12) stays open; this is an accepted Workspace presentation checkpoint.
[UX reference](../UX.md) retained without inferring permission to restyle brand/remove access/security confirms.
No live reload/service/session/provider/ACL/push/publish/deploy/version action.


## Shared page-header top alignment {#page-header-top-alignment}

[№MW.15](workspaces/TODO.md#MW.15), base `35575900c4c606f5928dc41de89dfe585de9aa65`;
W2 exact author source `b4cdd006971c9fdf3f2011585cd79e081fc841f6`, integrated source checkpoint
`edabbe30ef5ac8fcba2b746ca5cc41eee69ad24f`. Source/test/scripts/package/lock identity verified;
code delta is only `src/styles/app.css` (+17/−9). Backend/app/UI logic, policy, source, dependencies and version unchanged.
Owner navigation brainstorm backlog retained; broad [№MW.13](workspaces/TODO.md#MW.13) is not claimed completed.

### Reproduction and cause

Read-only actual owner URLs: `http://md/ai-agent-bus/CHANGELOG.1.0.md` and `http://md/ai-agent-bus/`.
CTO computed boxes: sidebar head y0/h41/padding7px8px; brand y9.5/h21, centre20;
doc crumbs y22/h18, title y44/h33; folder h1 y24/h33, main y0. Viewport/scroll explicit in tool transcript.
W2 live 1280/390 light/dark matched. Live old bundle/RW indicator is known; no live source change or reload performed.
Root cause: independent wrapper padding 22/24/40, partial mobile 16 overrides, topstrip 38 vs sidebar 41;
not a title-font or content problem. Fix centres each first row in existing sidebar's 41px band, rather than
forcing breadcrumb and later title onto one line. Sidebar-off strip shares the same metric.

### Proportional native geometry gate

W2 artifacts under
`/tmp/claude-1001/-home-parf-src-mdhouse-Plans-ai-team-w2/dc2bbd38-3932-4687-9b33-5750de821884/scratchpad/`:

- Initial audit: `pad-measure-run1.log`, `pad-measure/` live top 140px crops;
  `pad-audit-run1.log`, `pad-audit/rows.json` and top 130px crops. No source edits during audit.
- One before/after matrix on actual scratch smokes, AB off, scroll 0: 10 states × 1280/700/390 × compact/open/off = 90 cells.
  `pad-before-run1.log`, `pad-after-run1.log`, `pad-before/rows.json`, `pad-after/rows.json`;
  compare script/log `pad-compare-run1.log` retains original 9 failures: spinner's animated getBoundingClientRect
  measured the rotated square (~20.5px) instead of intrinsic 15px. Centre already passed.
  Only loading cells remeasured with offsetWidth/offsetHeight: `pad-before-loading-run2.log`,
  `pad-after-loading-run2.log`; `pad-compare-run2.log` ALL PASS 90. No production fix hidden behind a rerun.
- States: doc, nested doc, doc diff, root folder, subfolder, Git, Home, Settings, error, loading (9 cells each).
  Before main-relative row centres 31/33.3/40.5/33/52.8/47.5 wide, varied 25/27.3/32.5/40.5/52.8 narrow;
  after 20.5 in all fixture cells. Side header 41 / brand 20 unchanged; strip 38→41, brand 18→19.5–20,
  sidebar-off main.top 41 and content centre 61.5. Difference against sidebar brand ≤1px.
- Doc title centre 60.5→61.5 for one crumb (deliberate hierarchy), nested 65→61.5, narrow 54.5→61.5.
  Crumb-to-title box gap 4→4, wrapper x/width/side and bottom padding/max-width/title x/gear x unchanged;
  no horizontal scroll. Wrapping grows naturally, never clipped solely to enforce a centre.
  Spinner intrinsic 15×15 / radius 50% remains intact, centre 20.5; notice gear centre 20.5.
- Relevant crops: `pad-after/` includes 1280/390 light/dark, 700/open light; `pad-pairs/wide.png` before/after
  doc-light/folder-dark/error-dark/subfolder-light, `pad-pairs/narrow.png` doc 390/off/dark and Settings 390/light.
  CTO viewed both sheets and confirmed first-header alignment while title hierarchy remains separate.
- Targeted empty states only, no 90-cell repeat: `pad-empty.ts`, `pad-empty-{before,after}-run1.log`,
  `pad-empty-{before,after}/rows.json`, `pad-empty-compare-run1.log` ALL PASS 8.
  Empty Favorites `/repo/?git=favs` and actual root with only notes.txt `/empty/`, widths 1280/390,
  compact/off, light/dark crops. First h1 centre 40.5/32.5→20.5, horizontal geometry unchanged;
  heading→metadata→empty order preserved, narrow wrapped header grows without overlap.
  Transient `mdhouse / Pick a file` notice has no stable URL; no app-state injection was used.
  Structural coverage is the same first h2 notice rule proved by error cases; do not claim native traversal of that transient state.

CTO nonauthor exact-diff review PASS for the CSS-only cohort. No full suite/types/unit mirror tests were run;
compiled real-page visual/native matrix is the proportional gate. No live Settings connection checks (scratch AB off).
No new navigation/brand/source/access/control semantics, provider action, service/session/live reload, push/publish/deploy/version bump.

## Settings and RAG search at 390/768 — touch checkpoint {#settings-mobile}

[№MW.5c](workspaces/TODO.md#MW.5c). Scratch instances only (CLI-started, so a loopback browser is the local administrator; one Viewer instance), touch-emulated
Chromium 390×2800 and 768×2000, light and dark, `/settings` and `/rag` with a search; before = HEAD `8d7bb3b`.

- Before: at 390 the sidebar drawer opened over Settings and `/rag` on load (default `compact`, saved by the first visit); 9 of 11 ⓘ tips ran past the right edge at 390,
  2 at 768, and the ⓘ was 15×15; buttons were 32–39px; at 768 the project list and details shared a cramped two-column row.
- After: drawer starts closed at ≤720px whatever a wider screen saved, and is not saved there; tips are a bottom sheet (all 11 inside 12…378 of 390, 12…756 of 768 and a 22px ⓘ
  with a 44px area); buttons, picks and checkbox rows ≥44px on coarse pointers (the checkbox itself is 22px inside a 44px label); sidebar-header icons keep 26px with a 44px
  hit area; project list stacks to 900px. `scrollWidth == width` on every cell; no element past the right edge; Viewer instance: same, Mode buttons disabled with the sign-in line.
- Not covered: real iOS Safari keyboard/viewport behaviour, ⓘ tap on a physical device. No full suite beyond the tests named in the commit.

## Primary journey on a phone and a tablet — touch walk {#touch-walk}

[№MW.5c.2](workspaces/TODO.md#MW.5c.2). Scratch instance (CLI-started, local administrator, Agent Bus on a scratch fake bus, a scratch git repo with the Q&A playground
copied in), Chromium with touch emulation (`mobile` + touch events, real touch taps at element centres, `prefers-color-scheme`), 390×844 and 768×1024, light and dark.
An in-page audit after every step reports interactive elements whose size **with their hit area** is under 44px on either axis, controls cut off or past the viewport,
controls that overlap or are covered at their centre, controls kept invisible until hover, text fields under 16px (iOS zoom) and `scrollWidth` against the width.
Each step also checks the result on disk (tick, answer, edit, commit) or in the page (diff, Agent Bus reply, search hit).
Re-run: `scripts/touch-walk.ts` (usage in its first line; scratch instances only, refuses :7777) with `scripts/touch-audit.js`.

| Step | Result at 390 / 768, light / dark | Found before → fixed |
| --- | --- | --- |
| Open project (drawer, tabs, folder, file) | pass, 4/4 | tabs 27–28px, tree rows 24px, root select 22px, logo 22×13; compact sidebar 220px too narrow for five 44px tabs at 768 → `8ff0a3b` |
| Open a document from the drawer | pass, 4/4 | the drawer stayed open over the page it opened → closes on navigation at ≤720px `f175d6e` |
| Read a document (header, TOC, history, chips) | pass, 4/4 | header icons 26px, +V1/+V2 33×21, breadcrumbs 14px, Edit 28px, TOC links 20px, summaries 18px, title row ran into the Edit button → `8ff0a3b` |
| Tick a task | pass, 4/4, by touch and by keyboard (Space) | 13px box → 44px target (the native input is kept, restyled with a 22px drawn box) (follow-up to the walk) |
| Add a block under a heading (↓ ⇊) | pass, 4/4 | kind buttons 28px, 14px font → `8ff0a3b` |
| Q&A answer (❓ → 💬 save) | pass, 4/4, answer on disk | action buttons and 💬 22px, textarea 14px (zoom), mic 32px overlapping the text, options 24px → `8ff0a3b` |
| Full editor edit + save | pass, 4/4, edit on disk | Save/Close/Discard 32px → `8ff0a3b`; CodeMirror was already 16px |
| Diff (uncommitted) | pass, 4/4 | Reset 21px, inline links 15px → `8ff0a3b` |
| Commit (doc, then the git page) | pass, 4/4, commit in `git log` | Commit buttons 21px, message field 12px/24px, file rows 15px → `8ff0a3b` |
| Agent Bus panel (pick agent, note, action, reply) | pass, 4/4, reply shown | action buttons 30px, 14px-less note field 13px, pick 19px, agent rows 24px, mic → `8ff0a3b` |
| `/rag` (R button, search, open a hit at its line) | pass, 4/4 | already clean after the Settings pass |

Hover-only and keyboard-only: the tree rows' ★/mute buttons exist only on `:hover` (`.row:hover .marks`) — the same two actions are visible in the document header, so no action
depends on hover. Every desktop shortcut used in the journey has a visible control: `a` (Agent Bus button), `e` (✎ and the Edit button), `/` (search icon), Alt+1…9 and Ctrl+Enter
(the numbered action buttons and 💬 Save), Ctrl+Shift+Space (the mic).

The sticky Q&A filter strip is one 57px row below 720px on a coarse pointer (its chips sit behind a `Filter · N` toggle that shows the active level as `🟠 13 of 22`); it was about 100px
when the chips wrapped. Tablet widths keep the chips.

Remaining: real-device virtual keyboard and viewport behaviour (iOS Safari, Chrome Android), long-press Copy ([№MW.5c.1](workspaces/TODO.md#MW.5c.1)); the glyph of an open question's form
is 21px (the row itself is the target).

## Phone UX fixes from the touch journey {#touch-ux}

[№MW.13.1b](workspaces/TODO.md#MW.13.1b). Same scratch setup and audit as the [touch walk](#touch-walk) (`scripts/touch-walk.ts`), 390×844 and 768×1024, light and dark.

| Item | Result at 390 / 768, light / dark | Evidence |
| --- | --- | --- |
| 2 One ⋯ per heading | pass, 4/4: ⋯ opens Edit section · Add below · Add at end · Copy link (44px rows with text); Add below opens the form; `#` stays a link; audit clean (the open menu covers the next heading's ⋯ by design) | `h3-<w>-<scheme>-02-heading-menu.png` |
| 5a Drawer row = name + one git badge | pass: size, age, heat flame, ∅ and the M/U/S/D letter are hidden in the drawer on touch (they stay in the widened sidebar); a small file is muted, not struck through; the size stays in the row's title | `f5-390-light-03-drawer-folder-open.png` |
| 5b Q&A form on touch | pass, 4/4: 💬 · 1 ✅ settled · 2 🚫 drop · Cancel · More ▾ (the other actions, the edit link and 👤 sign), 44px; Alt+number still finds every button; answer saved to disk | `f5-<w>-<scheme>-09-qa-form.png`, `-10-qa-form-more.png` |
| 5c Agent Bus panel on a phone | pass, 4/4 at 390 (sheet ≤720px): 60dvh bottom sheet, the page above it stays in view and scrolls (padding-bottom), the bus address behind Connection; desktop panel unchanged | `f5-390-light-26-ab-typed.png`, `-24-ab-panel.png` |

Not changed: the strikethrough for small files on a pointer device (desktop), and the full-width Agent Bus panel at tablet widths above 720px.

