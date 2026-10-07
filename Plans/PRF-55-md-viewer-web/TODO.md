# TODO — mdhouse

Answers: [`questions.md`](questions.md)

- [ ] config: allow - list of CIDR
  - [ ] cli flag; kept in prefs
  - [ ] localhost always allowed
  - [ ] outside the list - 404, as unknown file
- [ ] config: login / password - simple HTTP AUTH
  - [ ] several users - user:passwd; cli: `mdhouse user-add l:p` / remove
  - [ ] asked from localhost too - protect from misconfigured nginx & alike proxies
  - [ ] with CIDR list - both required
  - [ ] no TLS - doc how to forward port with ssh
- [ ] prefs.json.dist - pretty print json with comments
- [ ] wide mode - save in localStorage; one for all documents
- [ ] config: auto-rw-path: list; any added folder under it is auto-rw - can be turned off in web config
- [ ] git "root" page - where we show branch and recent commits
  - [ ] url: /root/?git; add this switch to all directories (now root only)
  - [ ] recent commits - all, even w/o md files; recent-commits page
  - [ ] commit view - list all files; links to original repo web views (github/gitlab/most popular, or build a possible url)
  - [ ] view files
  - [ ] on-demand remote repo check - are there any new commits; read-only: `git ls-remote`, no fetch
  - [ ] when RW mode - buttons: commit, pull (`git pull --ff-only`), push

What is done is in [`DONE.md`](DONE.md); user-facing history in
[`CHANGELOG.md`](../../CHANGELOG.md).
