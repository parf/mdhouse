# TODO — mdhouse

- [x] config: allow - list of CIDR
  - [x] cli flag; kept in prefs - `mdhouse --allow <cidr,…>`, `--allow none`
  - [x] localhost always allowed
  - [x] out of CIDR or no passwd = access denied
  - [x] 404 when - no file + have access
- [x] config: login / password - simple HTTP AUTH
  - [x] several users - user:passwd; cli: `mdhouse user-add l:p` / `user-rm l` / `users`
  - [x] by default no http auth; once got any user - then it auto-on
  - [x] keep good hash(passwd) not passwd itself - argon2id
  - [x] asked from localhost too - protect from misconfigured nginx & alike proxies
  - [x] with CIDR list - both required
  - [x] no TLS - doc how to forward port with ssh - [doc/access.md](../../doc/access.md)
- [x] prefs.json.dist - pretty print json with comments - [doc/prefs.json.dist](../../doc/prefs.json.dist); comments are read, a save drops them
- [x] wide mode - save in localStorage; one for all documents
- [x] keyboard shortcuts popup is still outdated - update it (e, alt+e, ctrl+shift+enter)
- [x] add shortcut for open in editor link ( open edit:/.. url ) - e
  - [x] add "edit" link to our forms (answer, add) - edit:/path.md:line
  - [x] alt+e in a form (textarea focused) uses this url; replaces the edit form with "opened in external editor" notice, instead of save button
  - [x] control+shift+enter in the answer form - submit form + open next one (next unanswered question)
- [x] git history - on/off - we have it now - BUT we do not show state - add grey show/hide icons
- [x] config: auto-rw-path: list; any added folder under it is auto-rw - can be turned off in web config - `mdhouse --auto-rw <path,…>`, switch on the settings page
- [x] git "root" page - where we show branch and recent commits - plan and questions: [git-page.md](git-page.md)
  - [x] url: /root/?git; add this switch to all directories (now root only)
  - [x] recent commits - all, even w/o md files; recent-commits page
  - [x] commit view - list all files; links to original repo web views (github/gitlab/most popular, or build a possible url)
  - [x] list all files of the repo
  - [ ] later: viewers for images, html, txt - not our main goal
  - [x] on-demand remote repo check - are there any new commits; read-only: `git ls-remote`, no fetch
  - [x] when RW mode - buttons: commit, pull (`git pull --ff-only` - good start, later we'll fine tune), push
  - [x] `/` - make it a redirect to the root's git view
  - [x] commit: git commit -a -m "ASK FOR message" - show file list to be commited; prefilled when obvious; checkbox when commiting non MD files (non ours)
  - [x] pull/push with uncommited files - ask to confirm "You have uncommited files", allow only when ONLY md files
  - [x] subfolder git view - that subfolder only; origin only; git link only on folders inside one repo

- [x] git page - sync with origin, not "pulled 21d ago": the last exchange with origin, whichever direction
  - [x] came from origin, pulled yesterday → pulled yesterday
  - [x] created locally, never pushed → unpushed - yellow-on-red
  - [x] created locally, pushed → pushed <date>; + ↑N when commits came after the push
  - [x] separately: 1. unpushed commits  2. changed / added files (any type)
  - [x] ✎ N uncommitted in the same line - opens Commit
  - [x] line color: green = all committed and pushed, yellow = uncommitted/unpushed, yellow-on-red = no branch on origin
  - [x] remote check (ahead of origin by N…) runs by itself, async, after the page; server caches it 30 sec
  - [x] merge / rebase / conflicts in progress - warning, commit/pull/push off
- [x] known nothing to pull - pull button disabled; something to pull - bright
- [x] CHANGED / ADDED FILES - same format as for dirs: dir | filename | age | size

## NEXT iteration

- [ ] Questions with suggests - questions with suggested options - radio buttons or just buttons/checkboxes
- [ ] create MD file (SKILL) with typical instructions how to write questions+suggestions / desisions / answers

What is done is in [`DONE.md`](DONE.md); user-facing history in
[`CHANGELOG.md`](../../CHANGELOG.md).
