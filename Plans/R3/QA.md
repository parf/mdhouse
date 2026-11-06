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
