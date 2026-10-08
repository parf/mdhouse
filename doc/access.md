# Access — users, allowed networks, ssh

mdhouse is for trusted networks. By default it listens on 127.0.0.1 only, asks no login and
allows every address

```sh
mdhouse user-add ann              # asks the password (or reads stdin); any user turns the login on
mdhouse user-rm ann
mdhouse users                     # users and allowed networks
mdhouse --allow 192.168.1.0/24,10.0.0.5   # only these networks (and this machine)
mdhouse --allow none              # every address again
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

- A reverse proxy under a name (nginx → `notes.example`) is unsupported: that name is refused
  (421); with `Host` rewritten to 127.0.0.1 reads work, but every write and live reload is refused
  as cross-site (403). Forward the port over ssh instead
