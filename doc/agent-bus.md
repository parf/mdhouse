# Agent Bus — AI agent chat panel

**Main idea — AI agent chat about the current page.** History preserved!

Runs on [Agent Bus](https://github.com/parf/ai-agent-bus) — https://github.com/parf/ai-agent-bus

![The Agent Bus panel on the right of a document: the agent it asks, the requests and the agent's answers, the note and the buttons](agent-bus.png)

## The idea

- 💬 Chat with an AI agent about the page you are on — it reads the same file
- 💾 History preserved — every page keeps its own chat
- 📄 The document is the shared workspace; the chat only points an agent at it
- 🔁 The agent edits the file → the page follows live → you answer on the page → "updated" hands it back
- 🎯 One click asks for the usual next step: re-read, do the 🎯 items, carry answers over, review
- 📌 A page can belong to an agent — it writes its bus name into the file
  (`<!-- AB: #claude/x@host -->`); else you pick, or the default one answers
- 🤝 Nothing new for the agent: a plain message on [Agent Bus](https://github.com/parf/ai-agent-bus);
  it replies as to any peer

## Turn it on

```sh
mdhouse --agent-bus          # off: mdhouse --agent-bus off
```

Settings → Agent Bus: the default agents, which names to list.

## Remote Agent Bus

Over TCP, with a token:

```sh
mdhouse --agent-bus http://host:6767     # asks for the token, or reads it from stdin
```

- The token is saved in `~/.config/mdhouse/prefs.json` (0600), never in argv; `--agent-bus <x.sock>` drops it
- Not `AGENT_BUS_TOKEN`: in an AI session's shell that is the session's own — mdhouse would act as it

Or forward the remote socket over ssh — no token:

```sh
ssh -N -o StreamLocalBindUnlink=yes \
    -L /tmp/ab-rdvp.sock:/run/agent-bus/user-<login>.sock rdvp &
mdhouse --agent-bus /tmp/ab-rdvp.sock
```

- You join as your login on that host — sshd runs as you; no token
- The remote agents read the path mdhouse sends — the same tree must be there (a shared mount, the same checkout)
- The tunnel is down → settings say *not connected*
