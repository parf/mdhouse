# Access — users, allowed networks, ssh

mdhouse is for trusted networks. By default it listens on 127.0.0.1 only, asks no login and
allows every address

```sh
mdhouse user-add ann              # asks the password (or reads stdin); any user turns the login on
mdhouse user-rm ann
mdhouse users                     # users and allowed networks
mdhouse --allow 192.168.1.0/24,10.0.0.5   # only these networks (and this machine)
mdhouse --allow reset             # every address again
```

- Passwords are kept as an argon2id hash in `~/.config/mdhouse/prefs.json`, never as text
- The login is asked from this machine too — behind a misconfigured nginx or alike proxy every
  request comes from 127.0.0.1
- This machine is always allowed by `--allow`, so you cannot lock yourself out
- Not allowed, or no login = access denied
- Changes apply to a running mdhouse at once

## Local administrator

- No users configured: a request that reaches mdhouse from loopback is the administrator — no `mdhouse admin` needed
- Loopback includes a proxy on this host (`--host-name` deployments too), `ssh -L` and other local OS users
- To require a sign-in, configure users: `mdhouse user-add ann`

## Viewer — read-only for everyone

```sh
mdhouse --viewer        # every project read-only; saved
mdhouse --workspace     # projects writable by their own RW/RO again
```

- Refused (403): document writes, git commit/reset/pull/push, marks, author name, Agent Bus send
- The administrator still changes settings and projects — `mode` in `POST /api/settings` switches back
- Each project keeps its RW/RO; the web page still shows write controls (refused on use)
- Downgrade: a Viewer prefs.json is version 3 — mdhouse ≤ 2.3.3 finds no saved RW project, a version-2
  mdhouse reads it read-only and never rewrites it; run `mdhouse --workspace` before downgrading

## No TLS — forward the port with ssh

Basic auth sends the password in the clear. Across a network you do not trust, leave mdhouse
on 127.0.0.1 and forward its port:

```sh
ssh -N -L 7777:127.0.0.1:7777 you@server     # then open http://127.0.0.1:7777 here
```

## Behind a reverse proxy

```sh
mdhouse --host-name notes.example,box   # only these Host names get in; saved
mdhouse --host-name reset               # localhost and IP addresses again
```

- nginx passes the name as is: `proxy_set_header Host $host;` (+ `Upgrade` / `Connection` for live reload)
- With names set, `localhost` and IP addresses are refused (421) — open it by the name only
