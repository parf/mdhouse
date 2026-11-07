# Navigation journeys — current source evidence (MW.13.1a)

[Cohort](../EXECUTION.md#navigation-research) · [UX Golden Set](../../UX.md) · W2 · source `f646f80`

Observed facts only. IA options and synthesis: [UX-NAVIGATION](../UX-NAVIGATION.md) (CTO).
Reference/install discovery and the single external-AI start file: dependency [№MW.17](../workspaces/TODO.md#MW.17), not covered here.

## Setup

- Scratch `safe-smoke` of `f646f80`, own process groups; AB off; no live instance.
- Synthetic Git project `acme` (RW, `--rw`):
  - Markdown, plus `src/*.ts`, `config.json`, `assets/logo.png`, `assets/spec.pdf`;
  - 6 commits by 3 authors over 6 days;
  - branch `feature/dashboard` (one Markdown file only on that branch);
  - one uncommitted edit (`docs/guide.md`).
- `handbook`: inherit, no auto-RW → RO, no Git. `empty`: no Markdown, one `notes.txt`. The mdhouse reference.
- Real CDP clicks/keys, a stated readiness condition per shot. Admin only for shot 11 (`mdhouse admin` under a pty, link in memory).
- Viewports 1280×900 and 390×844. Control counts = visible `a[href]`, buttons, inputs and tabs per region.

## Shots

| # | Journey | URL · action | Visible result |
|---|---|---|---|
| [01](images/01-home-recent-desktop-light.png) | J1/J2 | `/` → `/acme/?git` · first visit | Home = Git digest: branch card, raw `fatal: 'origin'…`, Commit/Pull/Push, unpushed list, changed files, commits. Sidebar compact. |
| [02](images/02-doc-from-tree-desktop-light.png) | J1 | tree: `docs` › `guide` | Doc: crumbs, title + view chips, Edit, ✎, ⚙, age/author, `uncommitted file`, Commit / Commit + Push, 1/2 done, 6 icon actions, TOC, History. 20 controls in the page head. |
| [03](images/03-search-dashboard-desktop-light.png) | J1 | press `/`, type `dashboard` | Sidebar widens to open. Names: none. Contents: one row per matching line (same file repeated). `plans/dashboard.md` (branch only) is not found. |
| [04](images/04-doc-source-editor-desktop-dark.png) | J1 | Doc › Edit | Source editor under TOC/History; Save / Close / Discard, `saved`; Edit becomes Page. |
| [05](images/05-git-commits-desktop-light.png) | J2 | `/acme/?git=commits` | Same branch card + actions; flat commit list, every row `unpushed`. Branch `feature/dashboard` is not shown anywhere. |
| [06](images/06-doc-local-diff-desktop-light.png) | J2 | Doc › History › Uncommitted changes | Inline diff panel with Reset file; URL unchanged. |
| [07](images/07-folder-all-files-desktop-light.png) | J3 | `/acme/` › ALL | Flat list grouped by folder: md, png, pdf, ts, json; `11 files` here vs `6 files` in the sidebar. All ages `just now` (file mtimes in a fresh checkout). ALL/MD is not in the URL. |
| [08](images/08-open-code-file-desktop-light.png) | J3 | ALL › `app.ts` | Code view with line numbers + History; the Markdown-only tree has no node for it. |
| [09](images/09-switch-to-ro-project-desktop-light.png) | J4 | project select → `handbook` › README | `RO` badge; no Edit/Commit; History "Not committed yet." The select shows path suffixes (`scratchpad/nav/handbook`), not names. |
| [10](images/10-settings-nonadmin-desktop-dark.png) | J4 | ⚙ → `/settings` (not signed in) | Not-signed-in note; project list + card; the Add project form is shown, disabled. |
| [11](images/11-settings-admin-add-project-desktop-dark.png) | J4 | admin link → Settings, scrolled | Same form enabled; Remove project active. |
| [12](images/12-curate-favorite-and-view-desktop-light.png) | J5/J6 | `roadmap` › Favorite, `+1`; sidebar Favs | Star on, chip `1` on, Favs lists `roadmap`; view tab shows count 1. No "Ask an agent" button (AB off). |
| [13](images/13-mobile-sidebar-overlay-light.png) | J7 | 390 · doc, sidebar compact | Sidebar overlays the doc with a scrim; the page behind is covered. |
| [14](images/14-mobile-doc-topstrip-light.png) | J7 | Ctrl+B → off | Topstrip with the file path; doc full width; actions wrap to 3 rows above TOC/History. |
| [15](images/15-mobile-git-recent-dark.png) | J7/J2 | 390 dark · `/acme/?git` | Tabs wrap to 2 rows; commit subjects truncated; full Git digest above the fold. |
| [16](images/16-empty-project-all-carryover-mobile-dark.png) | state/J3 | 390 dark · `/empty/` after ALL in `acme` | ALL carried over from another project: lists `notes.txt`; no empty state. |
| [17](images/17-empty-project-md-mobile-dark.png) | state | press MD | `0 files · 0`, "No Markdown files here." No next action. |
| [18](images/18-error-missing-doc-desktop-dark.png) | state | `/acme/docs/missing.md` | "Can't open that / not found"; no link back; sidebar stayed off from the mobile run. |

## Observations

Strengths:
- ✅ One click from the tree to a doc with Git context beside it (History, uncommitted badge, Commit) (02).
- ✅ Name + contents search in one field, with recent/mine filters (03).
- ✅ Access exception visible: RO badge, write controls absent (09).
- ✅ Non-Markdown files are reachable and readable (07, 08); diff in place (06).
- ✅ Curation is quick: star and view chips on the title (12).

Risks (screenshot-backed; severity is a proposal):
- 🟠 Content scope splits across surfaces: the sidebar tree is Markdown-only, ALL exists only on the folder page; two counts (`6 files` / `11 files`) without a scope label (07, 08).
- 🟠 MD/ALL is per-browser state, not URL or project: it carries into another project and hides its empty state (16).
- 🟠 Git axis is folder-scoped and branch-blind: no branch list/switch, the branch-only file is unsearchable, every commit `unpushed` without a remote (03, 05).
- 🟠 Doc head carries 20 controls (Hick: ≤7 primary); the primary action is not dominant (02, 14).
- 🟠 Raw Git error text on Home without a remote (`fatal: 'origin'…`) next to Pull/Push that cannot work (01, 05, 15).
- ⚪ Recent/Mine/Favs exist twice: sidebar tabs and Home Git tabs (01, 12).
- ⚪ Doc panels (diff, editor) and folder ALL are not in the URL (06, 04, 07).
- ⚪ Empty and error states give no next action (17, 18).
- ⚪ Project select labels are path suffixes, not project names (09).
- ⚪ Mobile: the sidebar overlay hides the page; doc actions take 3 rows before content (13, 14).
- ⚪ Disabled Add project form looks like the enabled one apart from contrast (10 vs 11).
- ⚪ Search lists one row per matching line, repeating the file (03).

## Coverage gaps

- ❓ Agent entry with Agent Bus on: not captured (AB off by scope); only its absence (12).
- ❓ Hover-only controls: headless Chrome reports `hover: none` and `setEmulatedMedia` did not change it, so desktop shots show the touch layout of heading actions (✎ ↓ ⇊ always visible, 44px).
- ❓ Not captured: loading state, Q&A answer flow, commit/push success, About modal, reference project, sidebar `open` at 1280 from the start, light/dark for every shot, 700px.
- ❓ Branch switching, author pages: no UI exists to capture.

## Evidence

- Accepted: 18 shots in [images/](images/), palette PNG.
- Scratch (not committed): capture script, fixture builder, `steps.json` (URL, sidebar state, controls, readiness), runs 1–8 logs.
  - Harness failures kept: title text vs H1 (run 1), hidden search input (run 2), commits selector (run 3), ALL carry-over (run 5 → became shot 16), touch layout and stub-size fixture (runs 6–7).
  - Accepted run: 8.
