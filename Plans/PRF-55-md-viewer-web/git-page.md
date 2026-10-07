# Git page — plan

From TODO: git "root" page — branch and recent commits, its own url, all commits, files, links
to the repo's web view, remote check, commit / pull / push in `--rw`.

## What exists now

- `/` (Home) — the root's front page: branch, HEAD commit, "pulled N ago", then uncommitted
  files and commits **that touched Markdown**, grouped by commit; Favs / Recent / Mine tabs.
  No url of its own per root: `/?root=<id>`, or `/` with one root
- `/d/<root>/<dir>/` — a folder's page: every `.md` under it, in one table. Its header has a
  link to `/`
- `lib/git.ts` — `recentChanges` (log --name-status, md only), `repoHead`, `fileHistory`,
  diffs; one `git log` per repo, never a call per row

## Proposal

**Url** — `/d/<root>/<dir>/?git`: the git view of any folder, the root's at `/d/<root>/?git`.
Every folder page gets a **GIT** link beside its title, the git view a **DIR** link back.

**Header** — repo, branch, HEAD commit (subject, age, author), pulled N ago, and a link to the
repo on its host (from `origin`). **Check remote** button: `git ls-remote origin <branch>`,
read-only — "up to date" / "the remote has new commits" / "ahead by N, not pushed".

**Commits** — every commit that touched this folder (`git log -- <dir>`), any file type: subject,
author, age, short hash linked to the commit on its host. A click opens the commit: every file
it changed, with status (M A D R); a `.md` opens here, at that revision's diff; anything else
links to the file on its host at that commit. 50 at a time, **More** for the next 50.

**Files** — every file git tracks under the folder (`git ls-files`), as a tree; `.md` open here,
the rest link to the host's file view.

**Host links** — built from the `origin` url, ssh or https:
- GitHub, GitLab, Gitea / Forgejo / Codeberg: `/<owner>/<repo>/commit/<sha>`, `/blob/<sha>/<path>`
  (GitLab: `/-/commit/`, `/-/blob/`; Gitea: `/src/commit/<sha>/<path>`)
- Bitbucket: `/commits/<sha>`, `/src/<sha>/<path>`
- any other https host: the GitHub shape, as "a possible url"

**`--rw` buttons** — on a writable folder only, same-origin POST like every write:
- **Commit** — a message box; commits the changes under this folder
- **Pull** — `git pull --ff-only`; refused (with git's message) when it cannot fast-forward
- **Push** — `git push` to the branch's upstream; never `--force`

## Decided — answers below

- `/` redirects to the root's git view, `/d/<root>/?git`; the git view keeps what `/` showed
- Commit = `git commit -a -m "<message>"`: the files it will take are listed first; message
  prefilled when obvious (one file: "Update TODO.md"); a non-`.md` file in the list needs a
  checkbox ticked first
- Pull / push with uncommitted files: confirm "You have uncommitted files" — allowed only when
  they are all `.md`, refused otherwise
- A subfolder's git view: that subfolder only
- Remote: `origin` only
- The git link appears only on folders inside one repo

## Questions

> ❓ `/` — keep it as the front page it is now (md-only commits, Favs / Recent / Mine), with the
> new git view beside it at `/d/<root>/?git`? Or should `/` become the root's git view?
> 💬 make it a redirect

> ❓ Commit — what goes in: every change under the folder (`git add -A <dir>`), only `.md`
> files, or only the files changed from the page (ticks, answers, notes)?
> 💬 git commit -a -m "ASK FOR message" << show file list to be commited

> ❓ Commit message — always typed, or prefilled (e.g. "mdhouse: answers in TODO.md") and
> editable?
> 💬 prefilled when obvious

> ❓ Pull / push with uncommitted changes in the folder — allow (git refuses only on a real
> conflict), or refuse until committed?
> 💬 ask to confirm - "You have uncommited files"
>  but allow (when ONLY md files)
>
> ask for checkbox when commiting non MD files (non ours)

> ❓ Git view of a subfolder — commits and files of that subfolder only, or always the whole
> repo with the subfolder highlighted?
> 💬  that subfolder only,

> ❓ Remote — only `origin`, or every remote the repo has?
> 💬 origin

> ❓ A root that holds many repos (`~/src`) — the git view lists the repos and each has its own
> page, or the git link appears only on folders inside one repo?
> 💬  git link appears only on folders inside one repo
