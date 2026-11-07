# Navigation and project views

⚠️ Working proposal for [№MW.13.1a](workspaces/TODO.md#MW.13.1a), not an implementation decision.
Base `f646f8092a9a8014c5c1f391150002eebefe2e64`. Current journey evidence and technical inventory pending.
[Scope](EXECUTION.md#navigation-research) · [UX reference](../UX.md).

## Goal and evidence standard

Help a person find/read a project file, understand what changed and return to the same context.
Workspace additionally permits authorized editing and agents. Future standalone viewer scope follows
agreed navigation and implemented views; extraction is not part of this report.

Source observations, captured interaction results and design inference are different evidence.
Synthetic journeys show affordances and failure modes, not real-user frequency, preference or task time.
The comparison below is documentary research, not a usability test of competitors.

## Primary-source patterns

Checked 2026-11-07. These are patterns to evaluate, not authority to copy another product's full UI.

| Source | Documented pattern | Possible mdhouse application | Tradeoff |
|---|---|---|---|
| [GitHub code browsing announcement](https://github.blog/changelog/2022-11-09-introducing-an-all-new-code-search-and-code-browsing-experience/) (2022 historical design description) | A persistent tree and file search preserve repository context while browsing files | Keep project/path visible when moving from Markdown to code | A code-first tree can swamp a document reader; retain a Markdown filter |
| [VS Code source history](https://code.visualstudio.com/docs/sourcecontrol/history) | Repository graph, active-file Timeline and line blame are distinct scopes; selecting a commit for inspection need not check it out | Separate project activity from file history; make historical inspection visibly read-only | Three scopes need clear labels; no checkout/branch mutation is implied |
| [Obsidian File explorer](https://obsidian.md/help/plugins/file-explorer) | A file tree can reveal the active file; additional actions are in context menus | Match tree selection to the displayed file; disclose secondary actions on demand | Hidden actions still need a discoverable entry and keyboard access |
| [Obsidian Tabs](https://obsidian.md/help/tabs) | Notes remain navigable through tabs; mobile has a dedicated tab-management entry | Preserve return context on narrow screens without retaining a wide side panel | An extra in-app tab system competes with browser tabs and draft lifetimes |

Inference: borrow context preservation and separation of scope; do not add a complete IDE shell or a
second tab manager merely because a comparator has one. The owner asks for a useful workspace with a
reader-oriented entry, not an assumed VS Code clone.

## Structures to compare

| Option | Find/read | Understand changes | Mobile and disclosure | Future viewer fit | Main cost |
|---|---|---|---|---|---|
| A. MD / All / Git modes | Obvious starting choices; each mode owns its navigation | Dedicated Git destination | One expandable destination selector | Easy to describe | MD/All are filters while Git is an activity dimension; switching may lose selection/context |
| B. Files with MD / All filter, separate Git activity | One selected project/path and matching tree; MD is the initial filter | Git hub for changes/commits/branches/authors, contextual file history | Files/Git entry plus expandable filters; return to same file | Shared read/files/search/Git spine | Requires explicit rules for a selected non-MD file when changing to MD |
| C. Project dashboard hub | Recent/pinned/search entry for returning users | Activity summaries lead to details | Compact summaries can work well | Useful optional landing | Adds an intermediary page; duplicates lists unless it replaces them |
| D. Quick-open first | Fast known-name retrieval | Commands jump to history or changes | Must retain visible browse/search fallback | Useful accelerator | Recall burden and poor first-use discovery if primary navigation depends on commands |
| E. Tree / content / context panels | Strong file context and adjacent history | Context panel for history/diff | Panels collapse into a sequential flow | Reader core can omit work actions | Wide-screen density and competing panels (TOC, history, AB) |

Provisional recommendation: B as the structural spine, D as an accelerator and a restrained E for
contextual details. A remains a simpler alternative to test; C is optional after task evidence justifies
another landing. This recommendation must be checked against current screenshots before acceptance.

## Proposed context and transitions

The following are requirements for a later scoped design, not new route or persistence contracts.

| Transition | Context to retain | Visible result and recovery |
|---|---|---|
| MD → All files | Project, folder, selected Markdown file, scroll where practical | Tree and folder list share the filter; file selection remains visible |
| All → MD with a code file selected | Project and folder; do not silently select another document | Explain that the selected file is outside the filter; offer All files or the Markdown folder list |
| File → project Git activity → file | Project/path and current working-tree context | History/commit detail distinguishes project-wide changes from this file's history; Back restores the prior view |
| Commit → historical file | Repository identity, immutable commit and relative path | Show revision context; inspection must not checkout or grant writes |
| Branch/author → commits | Repository and selected read filter | Distinguish viewing a branch from changing the checked-out branch; authors are filters, not access principals |
| Search → result → return | Search term, scope and result position | File path/project remain recognizable; return does not restart the search |
| Change project | Per-project navigation context and per-document drafts | No old project's async response may replace the new project's selection or draft |
| Desktop → mobile | Same selected file/view and meaningful URL | One content surface, an explicit navigation entry, expandable secondary actions, visible return path |

URLs should represent shareable content filters and activity selections. Durable project identity remains
canonical path/root ID; display names do not become identity. Exact URL parameters, back-compatibility and
preference lifetimes need a bounded implementation design after direction is agreed. A shareable URL must
not carry credentials or drafts. Historical source requires an immutable revision, not the live file with a
historical label. Do not treat a proposed branch browser as authorization for checkout, fetch or writes.

## Suggested implementation sequence, subject to direction

1. Unify MD/All scope between folder contents and the left tree, preserve path/context, define URL and
   browser Back behavior. Reuse existing passive rendering/highlighting and access checks.
2. Consolidate overlapping activity destinations without deleting personal curation semantics; keep file
   history contextual and introduce a read-only Git hub incrementally from delivered APIs.
3. Design branch/commit/author representations with verified backend gaps and independent access review;
   do not bundle missing revision APIs into the first tree/filter change.
4. Define standalone viewer retained scope, then extract only after the shared views work in mdhouse.

Installed reference discovery and future install navigation link to [№MW.17](workspaces/TODO.md#MW.17):
one external-AI start file with mandatory links; reference remains immutable. This report does not
remove/reorganize installed documentation or create a competing AI entrypoint.

No new storage layout is selected here. [№MW.14](workspaces/TODO.md#MW.14) precedes persistent Teams,
flows and automation definitions/state. Viewer product extraction, global Viewer activation, RAG ingestion,
Cron/At jobs and provider lifecycle are separate work.

## Acceptance still pending

- [ ] Current-source numbered journey screenshots and observations reviewed.
- [ ] Technical inventory checked against the proposal and gaps linked.
- [ ] Findings prioritized by observed impact; accessibility and coverage limits stated.
- [ ] Nonauthor fact-check and source/link review; recommendation submitted for direction.
