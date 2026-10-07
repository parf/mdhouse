# Questions — TODO

## config: allow - list of CIDR

> ❓ Where is it set - prefs.json + settings page, or a CLI flag too?

> ❓ Is localhost always allowed, so you cannot lock yourself out?

> ❓ Address outside the list - 403 page, or just close the connection?

> ❓ With login/password too - listed CIDRs skip the login, or both are required?

## config: login / password - simple HTTP AUTH

> ❓ One login, or several users?

> ❓ How is it set - `mdhouse --password` (stored hashed in prefs.json), settings page, or both?

> ❓ Asked from localhost too, or only from other addresses?

> ❓ Basic auth over plain HTTP sends the password in clear - fine for a LAN, or add TLS (`--cert`/`--key`)?

## wide mode - save in cookie

> ❓ Cookie, or is localStorage fine (same effect, per browser)?

> ❓ One setting for all documents, or remembered per document?

## config: auto-rw-path

> ❓ Meaning: any folder served from under this path is `--rw` without asking - e.g. auto-rw-path `~/src`, then `mdhouse ~/src/x` is writable?

> ❓ One path, or a list?

> ❓ Today write access is CLI only, on purpose. Turning it **on** from the web page lets anyone who can open the page make folders writable - ok, or web can only turn it off?

## git "root" page

> ❓ URL - `/git/<root>`, or `/<root>/` with the page at the top of the folder?

> ❓ One page per served folder, or per git repo (two folders in one repo share it)?

> ❓ Recent commits "even w/o md files" - list every commit, including ones that touch no `.md`?

> ❓ Commit view - changed files with a diff for each, any file type (code as plain source diff)?

> ❓ "view files" - browse all files of the repo, not only `.md`, shown as highlighted source?

> ❓ Remote check - runs `git fetch` on click; ok in a read-only folder (it writes only to `.git`)?

> ❓ Pull = `git pull --ff-only`, refused when it cannot fast-forward?

> ❓ Push - pushes what is already committed, or also a Commit button for the edits made on the page?

> ❓ Remote links - GitHub and GitLab only, or also Bitbucket / Gitea / any https remote?
