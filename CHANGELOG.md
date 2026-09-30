# Changelog

## 0.3.3 — 2026-09-29

The sidebar shows file sizes and makes stubs stand out.

- **Sizes.** Every file shows its size in at most three digits: `87`, `1.1K`, `150K`, `1.2M`.
  Bare numbers are bytes. The compact sidebar leaves the size off files that carry a stub mark.
- **Stubs.** A file under 101 bytes gets a white **∅** on hot pink, and one under 500 a white
  **S** on violet. Its name is struck through. The mark appears in the tree and in search,
  Favorites, Recent and Mine.
- **Empty files** are left out of the tree and its folder counts.
- **No page icon on file rows.** Every row is Markdown, so the icon said nothing, and it looked
  like the folder icon. Names move left into its space. A favourite's star now sits in the
  chevron's slot.
- **Folders** are dark brown, with bold file counts. The folders above the open document are
  bold.
- **Favicon** redrawn as the logo's house, with its source kept in `doc/favicon.svg`.

## 0.3.2 — 2026-09-17

- A logo, at the top of the README and in front of every document title.
- Relative `<img src>` inside raw HTML now resolves. Before, the logo was a broken image in
  mdhouse while GitHub showed it fine.

## 0.3.0 — 2026-09-17

0.2.0 was never published; this release replaces it.

- **Diffs on the document page.** The document can be shown as a patch, or as the whole document
  with the change marked on it: added blocks tinted, deleted text put back struck through.
  Patch lines are rendered as Markdown. Uncommitted files open on their diff. Rows in the
  history panel open that commit's change.
- **Runs in the background** until `mdhouse exit`, with output going to syslog.
- **A second `mdhouse <dir>`** hands its directories to the server already running on that port.
- **The root switcher** is available in every sidebar state.
- **The contents list** appears from two headings, down from three.

## 0.1.2 — 2026-09-16

- Opening a document no longer waits for git to find the file's first commit. The document
  loads in 10 ms instead of 950 ms, and authorship arrives with the history panel.

## 0.1.0 — 2026-09-14

First release. A Bun server that browses and searches every `.md` and `.mdx` file under a
directory. It is read-only unless started with `--rw`.

- **Browse.** A sidebar tree, cycled between bar, compact and open with `Ctrl+B`. It covers
  git-tracked files, plus untracked files git does not ignore, and falls back to a directory walk
  where there is no repository. It also works in a directory its own repository ignores.
- **Search.** File names match as you type. Full text goes through ripgrep, and a hit opens the
  file at its line. Chips narrow it to names or contents, and to recent files or your own.
- **Recent and Mine.** Uncommitted work first, then the files touched by recent commits, with
  modification times filling in when git runs out. Each row shows file, folder and commit
  subject, and `❖` marks your own work. Ages are coloured by heat.
- **Favorites**, plus mute and ignore marks.
- **Document page.** A breadcrumb, the original and last author, a table of contents (the H3
  level can be toggled), per-file git history, and a full-width toggle. Headings get one colour
  per level.
- **Front page.** What changed in this root, grouped by commit, with your own commits
  highlighted.
- One mdhouse per port.
