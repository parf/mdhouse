# Questions — TODO

## config: allow - list of CIDR

> ❓ Where is it set - prefs.json + settings page, or a CLI flag too?
> 💬 cli flag ; kept in prefs
> also create prefs.json.dist - pretty print json with comments

> ❓ Is localhost always allowed, so you cannot lock yourself out?
> 💬 yes

> ❓ Address outside the list - 403 page, or just close the connection?
> 💬 elaborate; unknown file - 404
> what list?

> ❓ With login/password too - listed CIDRs skip the login, or both are required?
> 💬 both

## config: login / password - simple HTTP AUTH

> ❓ One login, or several users?
> 💬 several
> user:passwd

> ❓ How is it set - `mdhouse --password` (stored hashed in prefs.json), settings page, or both?
> 💬 cli mode ; usual add  / remove
>
> mdhouse user-add l:p

> ❓ Asked from localhost too, or only from other addresses?
> 💬 yes;
> idea - protect from miscofigured nginx & alike proxies

> ❓ Basic auth over plain HTTP sends the password in clear - fine for a LAN, or add TLS (`--cert`/`--key`)?
> 💬 no TLS; so far product meant for intranet; for security we'll create doc how to forward port with ssh

## wide mode - save in cookie

> ❓ Cookie, or is localStorage fine (same effect, per browser)?
> 💬 localStorage

> ❓ One setting for all documents, or remembered per document?
> 💬 one for all

## config: auto-rw-path

> ❓ Meaning: any folder served from under this path is `--rw` without asking - e.g. auto-rw-path `~/src`, then `mdhouse ~/src/x` is writable?
> 💬 any added is auto-rw; however can be turned off in web-config

> ❓ One path, or a list?
> 💬 list

> ❓ Today write access is CLI only, on purpose. Turning it **on** from the web page lets anyone who can open the page make folders writable - ok, or web can only turn it off?
> 💬 thats why we have a limitation; 
> product is meant for trusted networks and developers

## git "root" page

> ❓ URL - `/git/<root>`, or `/<root>/` with the page at the top of the folder?
> 💬 we already have /root/ taken for dir view
> maybe /root/?git

> ❓ One page per served folder, or per git repo (two folders in one repo share it)?
> 💬 right now we have special git view for root only; 
> however it is a good idea to add this switch to all directories

> ❓ Recent commits "even w/o md files" - list every commit, including ones that touch no `.md`?
> 💬 yes, thats what i wrote

> ❓ Commit view - changed files with a diff for each, any file type (code as plain source diff)?
> 💬 so far i want to list all files and show links to original repo web views (where i can)
> we may introduce viewers for images, html, txt; however this is not our main goal

> ❓ "view files" - browse all files of the repo, not only `.md`, shown as highlighted source?
> 💬 in special git view - we'll list all files

> ❓ Remote check - runs `git fetch` on click; ok in a read-only folder (it writes only to `.git`)?
> 💬 we'll think of this later; maybe there is a way to ask it RO way

> ❓ Pull = `git pull --ff-only`, refused when it cannot fast-forward?
> 💬 yes - good start, later we'll fine tune

> ❓ Push - pushes what is already committed, or also a Commit button for the edits made on the page?
> 💬 yes; commit button needed

> ❓ Remote links - GitHub and GitLab only, or also Bitbucket / Gitea / any https remote?
> 💬 we'll try to cover most popular ones; or at least build a possible url
