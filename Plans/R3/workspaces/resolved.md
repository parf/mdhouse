

## Owner decisions — 2026-11-12 (2)

- ✅ Q-R3-CTL1 MW.7 (an agent opens a file in a given mdhouse tab): who may send control commands by default? <a id="Q-R3-CTL1"></a>
  Temp CTO chose the first one (being built by #md/w1); worst case is navigation within readable projects, never a write.
  - ( ) the daemon's rule — only your own agents (`@owner`); `--ab-control '<pat>'` narrows, `--ab-control off` stops it 🌟
  - ( ) nobody until `--ab-control '<pat>'` is set (opt-in)
  > 💬 only agents/people who can send commands to mdhouse @ agent-bus -
  >  it has ACL list

- ✅ Q-R3-UX1 Phone/tablet UX review (MW.13, #opencode/md-api; screenshots in its touch walk) — structural changes: <a id="Q-R3-UX1"></a>
  Being done now without asking: one ⋯ per heading on touch, lighter tree rows/Q&A form/AB bottom sheet, reading-first phone header.
  - [ ] one "Changes" destination: file list + diff + message + "Commit 2 files"; the document shows only a status chip; Push only when a remote exists (no raw git error)
  - [ ] untracked files in "Changes": listed, unticked by default
  - [ ] phone navigation = 4 labelled destinations: Files · Changes · Search · Ask
  - [ ] one Search with a scope switch Files | Index (the RAG page becomes "Index"; [R] stays as a shortcut)
  > 💬 yes, do it now yourself, later we'll adjust

- ✅ Q-R3-AUTO2 Automation registrations are team data (`$PROJECT/.mdhouse/automation/`, Git). When one arrives by a pull or a commit from someone else, who lets it run on this machine? <a id="Q-R3-AUTO2"></a>
  Design in [AUTOMATION.md](../AUTOMATION.md#3-registration). Temp CTO chose the first: the usual practice (CI, git hooks, direnv) is that committed definitions do not run until a person approves their content.
  - (x) the instance administrator approves the file's content hash on this machine; a changed file stops firing until approved again 🌟
  - ( ) a registration found in a project runs at once, its schedule created by whoever pulled it (a pull can then start jobs)
  - ( ) only registrations created from this machine's page run; files from others are shown, never run
