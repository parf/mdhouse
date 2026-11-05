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

No implementation verification recorded yet. Repository baseline focused roots/access tests: CEO reports
34 passed at `c1fb27f35cbd82270c754e4dfc6a562d36e0924d`; this is not R3 acceptance.
