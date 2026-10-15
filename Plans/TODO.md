# TODO — mdhouse

<!-- Items in the suggested syntax — [agent-markup.md](../doc/agent-markup.md): a glyph, an ID (`T1`, `T2` …), a one-line title -->

- ✅ T1 Root switch keeps the file / folder open in this session
  When switching session (root-select) — preserve the file / directory opened in it.
  When page is missing or no page — just do not switch to it (current way).
- ✅ T2 Per-session views V1 / V2 — the left list filtered to the selected folders and files
  Working with several directories in a big project is really hard today.
  - select several directories / files into a view; the left list shows only them
  - in view mode muted files are hidden
  - selected items stored in localStorage
  - two views: `V1` and `V2`
  - turned on by a switch in the left icon block (below root select) — V1 / V2 tabs after Mine; Files is "all"
  - `+V1` / `+V2` appearing near breadcrumbs (dir)
  - add: `[+V1] [+V2]` in the h1 doc-title, shown on mouseover
  - remove: a selected doc always shows `[V1]` / `[V2]` in the doc-title; a click de-selects
- ✅ T3 HTML page title: `FileName - PATH(last2) - Root - MDHOUSE`
  When PATH is too similar to root — merge them.

What is done is in [`DONE.md`](DONE.md); user-facing history in
[`CHANGELOG.md`](../CHANGELOG.md).
