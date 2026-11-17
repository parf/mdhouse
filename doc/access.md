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

- Passwords are kept as an argon2id hash in `~/.config/mdhouse/secrets.json` (0600), never as text
- An older mdhouse (2.3 and before) reads only `prefs.json`: it still asks for a login and admits nobody until the users are added again there
- The login is asked from this machine too — behind a misconfigured nginx or alike proxy every
  request comes from 127.0.0.1
- This machine is always allowed by `--allow`, so you cannot lock yourself out
- Not allowed, or no login = access denied
- Changes apply to a running mdhouse at once

## Local administrator

- No users configured: a request that reaches mdhouse from loopback is the administrator — no `mdhouse admin` needed
- Loopback includes a proxy on this host (`--host-name` deployments too), `ssh -L` and other local OS users
- To require a sign-in, configure users: `mdhouse user-add ann`
- Not in a Viewer — there sign in with `mdhouse admin`

## Viewer — read-only for everyone

```sh
mdhouse --viewer        # every project read-only; saved
mdhouse --workspace     # projects writable by their own RW/RO again
```

- Refused (403): document writes, git commit/reset/pull/push, marks, author name, Agent Bus send
- No local administrator: sign in with `mdhouse admin` to change settings or projects, or switch back from
  Settings; with `--host-name` set no session can be minted — switch back with `mdhouse admin --workspace`
- Each project keeps its RW/RO; the page removes write controls and shows a Viewer — read-only badge
- Reads stay available — RAG search and the Agent Bus status page may message the bus
- A prefs.json this mdhouse cannot read (newer or malformed) is treated as a Viewer
- Downgrade: a Viewer prefs.json is version 3 — mdhouse ≤ 2.3.3 finds no saved RW project, a version-2
  mdhouse reads it read-only and never rewrites it; run `mdhouse --workspace` before downgrading

## Network address — read-only without a policy

- Served on an address other than loopback (`--host 0.0.0.0`, a LAN IP) with no users and no `--allow`: every project is read-only; the start line says why
- Read-only refuses every write a Viewer can't make — edits, git, flow runs, Agent Bus sends, author, marks — `403 {reason: 'exposed'}`
- To write: `mdhouse user-add <login>` or `mdhouse --allow <cidr,…>`
- `--host-name` doesn't count (it checks the Host header only); a proxy on this host binds loopback anyway
- An allow list with a `/0` entry (`0.0.0.0/0`, `::/0`) doesn't count
- Applies at once, like every access change

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
