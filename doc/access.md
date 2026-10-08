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
