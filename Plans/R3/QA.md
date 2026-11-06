# R3 verification matrix

CTO owns this matrix. Worker evidence names exact revision, scratch root/config/port, browser/device,
action, expected/actual result and retained artifact. Unrun checks remain open. Never test on live :7777.

## Required checks

| Surface | Required journey/check | Evidence / state |
| --- | --- | --- |
| Desktop Chrome | install → project → agent/RAG → Feature/delivery flow → full edit/save → Copy → diff/history → explicit delivery approval | planned |
| Desktop Edge | normal journey, keyboard/context-menu Copy, source glyphs retained | planned; browser availability unverified |
| Desktop Safari | normal journey, keyboard/context-menu Copy | planned; host cannot provide Safari |
| Firefox | safe documented Copy fallback; authored text and controls remain usable | planned; availability unverified |
| iPad Safari portrait + landscape | remote Personal admission, project/agent/flow, touch heading add, full edit with virtual keyboard, stale draft, Copy, diff/commit | planned; real device required |
| Phone Safari + Chrome | same compact primary journey, visible touch equivalents, no hover-only action | planned; real device checks open |
| Scratch responsive Chromium | light/dark and ≤720px navigation, agent/editor panels, Copy, visible controls/focus | planned; supplements device checks |
| All profiles | personal/open-viewer/private-viewer/team; trusted/untrusted networks, project RO/RW/none, active/revoked users, profile switch | planned |
| Every mutation family | document, Git, flow, control, settings, roots, users/grants/profiles, external sends; allowed/direct/stale/cross-origin/Reader/non-admin denial | planned |
| Immutable references | packed content; explicit/duplicate/alias roots, autoRw, remove/promote, Git overlap, symlink/direct writes | planned |
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
