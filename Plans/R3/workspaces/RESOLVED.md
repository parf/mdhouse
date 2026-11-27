

## Release and CLAUDE.md — 2026-11-12

- ✅ Q-R3-REL1 Release now? `main` is 440+ commits ahead (RAG page, Viewer, flows, Settings/mobile, MW.7 control, `mdhouse docs`); 1554 tests pass. <a id="Q-R3-REL1"></a>
  Publishing also makes the AGENTS.md line's GitHub URL live; MW.16 starts right after.
  - (x) publish after #md/review's independent pass (back after 01:19 EST) 🌟
  - ( ) publish now
  - ( ) wait — finish Changes / phone navigation / MW.11 slice 2 first

- ✅ Q-R3-CLAUDE1 CLAUDE.md (your file — you edit it): <a id="Q-R3-CLAUDE1"></a>
  - [x] line 129: `doc/qa-playground.md` → `test/fixtures/qa-playground.md` (moved in 93e8f63)
  - [ ] "a route → serve() on its own 617xx port" → "on its own `testPort(617xx)` port (`test/ports.ts`)" (0d6fb0d)
  - [ ] Deploy checklist "~65 files, ~234 kB": today ~240 files, ~730 kB (flows + agent-bus.png)
  - [ ] Plans/R3/README.md: link DATA.md
  > 💬 review and do yourself, BUT keep in mind CLAUDE.md - ONLY real project knowledge, no junk, keep it small - review and use best practices
  > 💬👾 → done: CLAUDE.md (testPort, fixture playground, package size, two scratch rules), Plans/R3/README.md links DATA.md.

## Public project access — 2026-11-27

- ✅ USER-W9 Public read-only grants approved.
  > 💬 👤parf http://md/settings/users?project=mdhouse
  > congig =>  access => Groups
  >   show Public group - only two options - No Grant / Read-Only
  >
  > что понял
  >
  > 💬 👤parf yes, go

Applied to [№USER-W9](DECISIONS.md#USER-W9) and [№MW.0d.4](TODO.md#MW.0d.4).

## Dedicated Markdown editor — 2026-11-27

- ✅ EDIT-W3 Separate editor and optional Preview approved.
  > 💬 👤parf idea - add similar code to us, - SEPARATE page editor only case for MD edits
  >
  > discuss
  >
  > 💬 👤parf да + да (preview); хотя и preview не очень нужен (тк this editor ~= preview by itself)
  >
  > дискутируем дальше
  >
  > 💬 👤parf OK, создавай plan md file; и реализуй через CTO

Applied to [№EDIT-W3](DECISIONS.md#EDIT-W3) and [№MW.5d](TODO.md#MW.5d).
