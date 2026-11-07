# Navigation — technical inventory

[№MW.13.1a](../EXECUTION.md#navigation-research). Base `f646f80`. Read-only source inventory: delivered
behavior with `path:line`; options are listed separately and are not decisions. Paths are repo-relative.

## 1. URL and state boundaries

- Page addresses: `/<rootId>/<rel>` file, `/<rootId>/<dir>/` folder, `/<rootId>/` root page
  (`src/lib/urls.ts:2-3`, builders `:18-26`, parser `routeOf` `:36-45`). Reserved first segments
  `api ws vendor __app _bun settings d favicon.ico` (`src/lib/urls.ts:7`).
- Root id = `slugify(basename)` + `-2`… on a clash, in the order roots are added (`src/lib/roots.ts:70-76,196-199`);
  reference roots `_<name>`, default `_mdhouse` (`src/lib/roots.ts:223-230`). Persistence of an id across restarts: unverified.
- Legacy `/d/…` → 301 with the query kept; server only (`src/server.ts:535-539,607-608`). A folder
  named without its slash → 301 (`src/server.ts:550-563`); the client `replaceState`s on `{folder}` (`src/app.tsx:200-204`).
- Query: `?git` / `?git=favs|mine|commits|files` (folder git view, `src/app.tsx:95`, `src/ui/PageHead.tsx:5-19`);
  `?root=<id>` picks the first root on load only (`src/app.tsx:134-138`); `/` → `/<root>/?git` (`src/app.tsx:121-126`).
  No `?q`, `?view`, `?diff`, `?commit`, `?rev`, `?branch` anywhere.
- Hash: `#L<n>` scrolls and flashes a line, Markdown counted past front matter by `lineOffset`
  (`src/ui/Doc.tsx:955-985`); any other hash = heading/element id, opens a Q&A `<details>` (`src/ui/qa-page.ts:216-220`).
  Heading slugs `src/lib/render.ts:162-171`; code lines `id="L<n>"` `:137`; blocks `data-line` `:231`.
- History: `go()` = `pushState` + optional in-memory `jumpLine`, never in the URL (`src/app.tsx:103-107`);
  `popstate` `src/app.tsx:109-116`; links via `follow()` (`src/ui/PageHead.tsx:22-26`).
- Survives back/forward/reload: pathname, query, hash only. In memory only: sidebar tab, expanded folders,
  search query/scope, Recent author, Doc view and revision, QaStrip filter (`src/app.tsx:77-88`,
  `src/ui/Doc.tsx:263-266`, `src/ui/QaStrip.tsx:36-38`).
- localStorage (`mdhouse.*`): `sidebar`, `ignored`, `lastByRoot` (`src/app.tsx:26-30`), `views`
  (`src/ui/views.ts`), `dirKind`, `dirSort` (`src/ui/DirPage.tsx:18,50`), `wide` (`src/ui/wide.ts`), `history`
  (`src/ui/Doc.tsx:1434-1445`), `unpushedOpen` (`src/ui/GitPanel.tsx:10`), `edit.<p>` (`src/ui/edit-source.ts:37`),
  `qa.sign`, `addAs`, `ab.<p>` (`src/ui/QaEditor.tsx:52`, `src/ui/AddEditor.tsx:15`, `src/ui/AgentBusPanel.tsx:36-60`).

## 2. Views

- Main pane order: Settings → folder git view (`?git`) → folder page → Recent → Doc (`src/app.tsx:635-727`).
- Git view tabs Favs / Recent / Mine / Commits / Files, in the URL (`src/ui/PageHead.tsx:5-11,114-119`);
  Commits/Files fall back to Recent outside a repo (`src/ui/Home.tsx:83`).
- Doc views `doc | patch | marked`, local state; a new document always opens as `doc`, also when changed
  (`src/ui/Doc.tsx:27-30,255-277`). `marked` → `patch` for an older revision (`src/ui/Doc.tsx:1330-1333`).
- "Views" V1/V2 in code = hand-picked per-root sets of files/`dir/` in `mdhouse.views`, shown as sidebar tabs
  (`src/ui/views.ts:1-31`, `src/ui/Sidebar.tsx:252-268`, chips `src/ui/ViewChips.tsx:3-28`). Name clash with "view".

## 3. Files and filters

- Sidebar tree: Markdown only (`MD_EXT = /\.mdx?$/i`, `src/lib/filetypes.ts:5`; "No Markdown files here"
  `src/ui/Tree.tsx:214`); zero-byte files dropped (`src/ui/Sidebar.tsx:106`).
  Repo: `git ls-files -co --exclude-standard` (`src/lib/scan.ts:116-129`); else a walk skipping dot-dirs/deny list (`src/lib/scan.ts:209-213`).
- "Show ignored": gitignored Markdown, chip only when present, `mdhouse.ignored` (`src/ui/Sidebar.tsx:287-291`).
- MD / All files exists only on the folder page: `mdhouse.dirKind`, `all` → `/api/files` (`src/ui/DirPage.tsx:50,94-121,224-227`),
  any type, cap `LIST_CAP` 5000 (`src/lib/scan.ts:306-347`). Not in the sidebar tree, search or git view.
- Kinds md/html/image/pdf/video/audio/code/text/binary (`src/lib/filetypes.ts:66-76`); shown text ≤ `SHOW_MAX` 5,000,000 (`src/server.ts:172`).
- Deny: built-in list, `.git`, `.mdhouseignore` (`src/lib/ignore.ts:10-85`); jail `jailedPath` (`src/lib/roots.ts:92-108`).
- Marks favorite/muted/ignored, server prefs (`src/lib/prefs.ts:29-31`, `GET|POST /api/marks` `src/server.ts:1695-1718`);
  favorites first, muted last (`src/ui/tree-model.ts:35-41`).

## 4. Search and highlighting

- `/api/search?root=&q=&regex=&ignored=&limit≤500`: one root, Markdown only (`--iglob *.md *.mdx`),
  ≤20 hits/file, result `{hits:[{rel,line,text,ranges}],truncated,degraded}` (`src/lib/search.ts:14-29,87-99`;
  `src/server.ts:1569-1582`). No cross-root or all-files search.
- Client: one sidebar box; name match local fuzzy top 40, content via `/api/search` 160 ms debounce
  (`src/ui/Sidebar.tsx:132-139`, `src/app.tsx:271-293`); hits `<mark>` and open at the line by `jumpLine` (`src/ui/Sidebar.tsx:593-608`).
  A search has no URL; a hit's `href` has no line (`src/ui/Sidebar.tsx:406`).
- Change highlight: `mark-changes.ts` in the `marked` view (`src/ui/Doc.tsx:328-331`). Q&A level filter not persisted (`src/ui/QaStrip.tsx:11-77`).

## 5. Git

- Reads: `/api/git?p=<folder>`, `/api/git/commits?p=&skip=` (50/page), `/api/git/files`, `/api/git/remote`
  (30 s cache; `fresh=1` = network `ls-remote`), `/api/git/log?p=&limit≤50`, `/api/git/diff?p=&rev=`
  (`src/server.ts:1294-1331,1605-1691`). `rev` must match `/^[0-9a-f]{4,40}$/i` (`src/server.ts:1655`).
- Doc fields: `status`, `gitState`, `gitRevision` = HEAD of the innermost repo (`src/lib/store.ts:348-363`).
- UI: badges in tree/Recent (`src/ui/Tree.tsx:129,151-155`); branch/HEAD/remote display (`src/ui/GitPanel.tsx:30-68`);
  Commits paged + files per commit (`src/ui/GitPanel.tsx:332-410`); per-file History 5 rows → `diffRev` (`src/ui/Doc.tsx:1312-1317`).
- Writes: commit / commit-file / reset (`git-write`), pull / push (`git-sync`) (`src/server.ts:1353-1446`).
- Absent: content or tree at a commit/branch (`api.doc` takes no rev, `src/ui/api.ts:298-300`; only `diff` does `:316`);
  branch list (current branch only); author filter on the server. Commit file links open the working-tree page
  (`src/ui/GitPanel.tsx:19-27`). Author filters = Recent `<select>` and Mine, client side (`src/ui/Sidebar.tsx:274-285`).
- Watcher events `{t:'fs'|'git', root, paths}`, 120 ms debounce (`src/lib/watch.ts:15-24`); `/ws` subscribes to
  roots present at open (`src/server.ts:1741-1746`).

## 6. Access, reference, drafts

- Every route: `trustedHost` → `admit` (allow list 403, users 401) (`src/server.ts:352-362,421,507`); every route
  classified `read` or `mutation(family)` or startup fails (`src/lib/authz.ts:88-115`). Reads open to any admitted user;
  `root-admin` / `instance-config` need the admin cookie (`src/lib/authz.ts:27`, `src/server.ts:573-586`).
- `Root.writable` getter (`src/lib/roots.ts:208-211`); `writableAt` excludes reference (`:239-241`); `writeFile`
  the only tree write (`:342-361`). Reference roots: never writable/removable, outside `projects()`/`single`/`defaultRoot`
  (`src/lib/roots.ts:228,244-246`). Installed reference discovery/content: [№MW.17](../workspaces/TODO.md#MW.17) — not in this scope.
- UI on RO/reference: no ✎, no editor, no Agent Bus, Q&A controls only writable+`doc`+md, RO badge
  (`src/app.tsx:549-552`, `src/ui/Doc.tsx:188,432,517`, `src/ui/Sidebar.tsx:159-163`).
- Drafts: source editor `mdhouse.edit.<root/rel>` `{text, base}` + in-tab map (`src/ui/edit-source.ts:30-69`); kept on
  409; `beforeunload` while dirty (`src/ui/DocEditor.tsx:110,168-212`); a kept draft enables Edit on a
  non-writable Markdown doc (save still refused server-side) (`src/ui/Doc.tsx:188`). Q&A/Add drafts: module map by doc URL —
  survive in-app navigation, not reload (`src/ui/Doc.tsx:34,739-759`). Keys carry root+path: a root switch keeps them.
- Project switch: `RootSelect` hidden below 2 roots (`src/ui/RootSelect.tsx:156-198`); returns to `mdhouse.lastByRoot`
  if the page still exists (`src/app.tsx:417-432`); opening a page switches `rootId` (`src/app.tsx:209,438-442`).

## 7. Shared core vs Workspace seams

- Server read core: roots/urls/scan/ignore/store/filetypes/search/render/passive/watch/git reads; routes
  tree, doc, raw, files, search, recents, digest, marks GET, git reads, roots GET.
- Workspace server: doc-write (`task`, `qa`, `insert`, `source`), marks POST, author, git writes, `/api/ab*`,
  `/api/roots/*`, settings POST, admin session. `flow-*.ts`/`rag-sync*.ts` are not imported by `src/server.ts`
  (`src/server.ts:8-40`; `src/lib/authz.ts:10` — `flow` has no HTTP route).
- Client coupling: `Doc.tsx` statically imports `AgentBusPanel`, `QaEditor`, `AddEditor`, `DocCommit`, `loadDraft`
  (`src/ui/Doc.tsx:11-25`); `DocEditor` (CodeMirror) only by dynamic import (`src/ui/Doc.tsx:179-185`).
  `Home` ⇄ `GitPanel` import cycle (`src/ui/Home.tsx:4`, `src/ui/GitPanel.tsx:4`); git read lists and write actions
  share `GitPanel.tsx`. `Diff.tsx` depends only on `safe-html`, `Ago`.
- All document/file/diff HTML through `passive()` (`src/lib/render.ts:107,732,833`).

## 8. Constraints: MD/All filters vs Git axis

- MD/All is a file-kind filter today on one surface (folder page); tree, search, digest and Recent are Markdown
  only. Extending All needs `/api/files`-like listing (cap 5000) and search beyond `*.md` — both server changes.
- The Git axis has no backend for revision browsing: no tree/content at a commit, no branch list, no
  author query. Each needs new read routes (`git show <rev>:<path>`, `ls-tree`, `for-each-ref`, `log --author`)
  under the existing `rev` validation, argv and `--` rules, and the same jail/deny checks per path.
- A revision view cannot reuse working-tree semantics: writable, drafts, Q&A controls, Agent Bus and
  `#L` anchors assume the current file. Revision content would need to be read-only and labelled.
- State that must survive any new axis: root/path in the URL, `#L`/heading anchors, `lastByRoot`,
  drafts keyed by root+path, `mdhouse.*` preferences; today view/revision/search are not in the URL.

## 9. Options (not decisions)

- MD/All as one shared filter carried in the URL (e.g. a query flag) across tree/folder/search.
- Git as a separate axis: `?rev=` / `?branch=` on page URLs, read-only rendering, explicit "differs from working tree".
- Put Doc view (`doc|patch|marked`) and revision in the URL so back/reload keep them.
- Split reading core from Workspace UI imports before a standalone viewer (Doc ⇄ editor/AB coupling, Home ⇄ GitPanel).

## Open

- ❓ `/api/raw` refuses only `.git` (`src/server.ts:525-533`); `/api/files`/tree also apply `.mdhouseignore` explicit
  denies (`src/lib/scan.ts:323`, `src/lib/store.ts:244`) — intended difference not verified.
- ❓ Root id stability across restarts when roots change order — unverified.
- ❓ Same-document hash-only back navigation may not re-scroll (effect deps `[doc?.url, jumpLine]`, `src/ui/Doc.tsx:986`) — unverified.
- ❓ `/ws` sockets do not join roots added later (`src/server.ts:1741-1746`) — effect on live updates not verified.
