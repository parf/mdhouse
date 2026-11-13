# Open questions — MDHOUSE Workspaces

> **Serg Parf:** Viewer mode  REMOVES all "rw" / interactivity elements
> so rw entries became RO

- <a id="Q-W1"></a>[№Q-W1](DECISIONS.md#Q-W1)
- <a id="Q-W2"></a>[№Q-W2](DECISIONS.md#Q-W2)
- <a id="Q-W3"></a>[№Q-W3](DECISIONS.md#Q-W3)
- <a id="Q-W4"></a>[№Q-W4](DECISIONS.md#Q-W4)
- <a id="Q-W5"></a>[№Q-W5](DECISIONS.md#Q-W5)
- <a id="Q-W6"></a>[№Q-W6](DECISIONS.md#Q-W6)
- <a id="Q-W7"></a>[№Q-W7](DECISIONS.md#Q-W7)
- <a id="Q-W8"></a>[№Q-W8](DECISIONS.md#Q-W8)
- [№Q-R3-RAG1](DECISIONS.md#Q-R3-RAG1) <a id="Q-R3-RAG1"></a>
- [№Q-R3-HTML1](DECISIONS.md#Q-R3-HTML1) <a id="Q-R3-HTML1"></a>
- [№Q-R3-ADMIN1](DECISIONS.md#Q-R3-ADMIN1) <a id="Q-R3-ADMIN1"></a>
- [№Q-R3-COUNTRY1](DECISIONS.md#Q-R3-COUNTRY1) <a id="Q-R3-COUNTRY1"></a>
- [№Q-R3-REALM1](DECISIONS.md#Q-R3-REALM1) <a id="Q-R3-REALM1"></a>
- [№Q-R3-COUNTRY2](DECISIONS.md#Q-R3-COUNTRY2) <a id="Q-R3-COUNTRY2"></a>
- [№Q-R3-RAGSYNC1](DECISIONS.md#Q-R3-RAGSYNC1) <a id="Q-R3-RAGSYNC1"></a>
- [№Q-R3-NAME1](DECISIONS.md#Q-R3-NAME1) <a id="Q-R3-NAME1"></a>
- [№Q-R3-MODE1](DECISIONS.md#Q-R3-MODE1) <a id="Q-R3-MODE1"></a>
- [№Q-R3-AB1](DECISIONS.md#Q-R3-AB1) <a id="Q-R3-AB1"></a>
- [№Q-R3-RELOAD1](resolved.md#Q-R3-RELOAD1) <a id="Q-R3-RELOAD1"></a>
- [№Q-R3-HANDOFF1](resolved.md#Q-R3-HANDOFF1) <a id="Q-R3-HANDOFF1"></a>

## Owner decisions — 2026-11-12

- [№Q-R3-VIEWADMIN1](DECISIONS.md#Q-R3-VIEWADMIN1) <a id="Q-R3-VIEWADMIN1"></a>

- [№Q-R3-EXPOSE1](DECISIONS.md#Q-R3-EXPOSE1) <a id="Q-R3-EXPOSE1"></a>

- [№Q-R3-HOSTNAME1](DECISIONS.md#Q-R3-HOSTNAME1) <a id="Q-R3-HOSTNAME1"></a>

- [№Q-R3-VIEWPROXY1](DECISIONS.md#Q-R3-VIEWPROXY1) <a id="Q-R3-VIEWPROXY1"></a>

- [№Q-R3-SUBSYS1](resolved.md#Q-R3-SUBSYS1) <a id="Q-R3-SUBSYS1"></a>

- [№Q-R3-REFDOC1](DECISIONS.md#Q-R3-REFDOC1) <a id="Q-R3-REFDOC1"></a>

- [№Q-R3-DATA1](DECISIONS.md#DATA-W2) <a id="Q-R3-DATA1"></a>

- [№Q-R3-CTL1](DECISIONS.md#Q-R3-CTL1) <a id="Q-R3-CTL1"></a>

- [№Q-R3-UX1](DECISIONS.md#Q-R3-UX1) <a id="Q-R3-UX1"></a>

- [№Q-R3-AUTO1](DECISIONS.md#Q-R3-AUTO1) <a id="Q-R3-AUTO1"></a>

- [№Q-R3-AUTO2](DECISIONS.md#Q-R3-AUTO2) <a id="Q-R3-AUTO2"></a>

## Open — 2026-11-12, evening

- ❓ Q-R3-REL1 Release now? `main` is 440+ commits ahead (RAG page, Viewer, flows, Settings/mobile, MW.7 control, `mdhouse docs`); 1554 tests pass. <a id="Q-R3-REL1"></a>
  Publishing also makes the AGENTS.md line's GitHub URL live; MW.16 starts right after.
  - ( ) publish after #md/review's independent pass (back after 01:19 EST) 🌟
  - ( ) publish now
  - ( ) wait — finish Changes / phone navigation / MW.11 slice 2 first

- ❓ Q-R3-CLAUDE1 CLAUDE.md (your file — you edit it): <a id="Q-R3-CLAUDE1"></a>
  - [ ] line 129: `doc/qa-playground.md` → `test/fixtures/qa-playground.md` (moved in 93e8f63)
  - [ ] "a route → serve() on its own 617xx port" → "on its own `testPort(617xx)` port (`test/ports.ts`)" (0d6fb0d)
  - [ ] Deploy checklist "~65 files, ~234 kB": today ~240 files, ~730 kB (flows + agent-bus.png)
  - [ ] Plans/R3/README.md: link DATA.md
