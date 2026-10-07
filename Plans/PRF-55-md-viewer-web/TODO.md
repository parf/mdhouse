# TODO — mdhouse

- [ ] config: allow - list of CIDR
  - [ ] cli flag; kept in prefs
  - [ ] localhost always allowed
  - [ ] out of CIDR or no passwd = access denied
  - [ ] 404 when - no file + have access
- [ ] config: login / password - simple HTTP AUTH
  - [ ] several users - user:passwd; cli: `mdhouse user-add l:p` / remove
  - [ ] by default no http auth; once got any user - then it auto-on
  - [ ] asked from localhost too - protect from misconfigured nginx & alike proxies
  - [ ] with CIDR list - both required
  - [ ] no TLS - doc how to forward port with ssh
- [ ] prefs.json.dist - pretty print json with comments
- [x] wide mode - save in localStorage; one for all documents
- [x] add shortcut for open in editor link ( open edit:/.. url ) - e
  - [x] add "edit" link to our forms (answer, add) - edit:/path.md:line
  - [x] alt+e in a form (textarea focused) uses this url; replaces the edit form with "opened in external editor" notice, instead of save button
  - [x] control+shift+enter in the answer form - submit form + open next one (next unanswered question)
- [ ] config: auto-rw-path: list; any added folder under it is auto-rw - can be turned off in web config
- [ ] git "root" page - where we show branch and recent commits
  - [ ] url: /root/?git; add this switch to all directories (now root only)
  - [ ] recent commits - all, even w/o md files; recent-commits page
  - [ ] commit view - list all files; links to original repo web views (github/gitlab/most popular, or build a possible url)
  - [ ] list all files of the repo
  - [ ] later: viewers for images, html, txt - not our main goal
  - [ ] on-demand remote repo check - are there any new commits; read-only: `git ls-remote`, no fetch
  - [ ] when RW mode - buttons: commit, pull (`git pull --ff-only` - good start, later we'll fine tune), push

What is done is in [`DONE.md`](DONE.md); user-facing history in
[`CHANGELOG.md`](../../CHANGELOG.md).
