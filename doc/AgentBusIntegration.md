# Agent Bus integration

Talk to your running AI sessions from the page: tell one the document changed, ask it to work on
it, read its answer — without switching to its terminal. Needs [Agent Bus](https://github.com/parf/ai-agent-bus)
(`agent-busd`) on this machine.

![The Agent Bus panel on the right of a document: the agent it asks, the requests and the agent's answers, the note and the buttons](agent-bus.png)

## Turn it on

```sh
mdhouse --agent-bus               # on — the default socket, /run/agent-bus/user-<login>.sock
mdhouse --agent-bus /path/x.sock  # on, another socket
mdhouse --agent-bus off
```

- From the CLI only; saved, and a running mdhouse picks it up at once
- mdhouse joins the bus as its own agent, `#mdhouse@<host>`; agents reply to it

## On a page

- 🗨 in the header, or `a` — the panel opens on the right, the left sidebar closes
- **to** — whom it asks; **change** — pick others
- Buttons — the request names the file (full path) and the page (URL):

| # | Button | The agent is asked to |
|---|---|---|
| 1 | **Updated — reply** (Ctrl+Enter) | read the page and reply |
| 2 | **Send note** | the note alone |
| 3 | **Do 🎯** | do the 🎯 items, then reply |
| 4 | **Resolve** | carry the answered questions over, then reply |
| 5 | **Review** | review the page in the [agent markup](agent-markup.md), then reply |

- The note is added to any of them
- Alt+1…5 — a button; Esc — close
- Each agent: sent → read — working… → its answer · done · no reply in 10 min · reply lost (mdhouse restarted)
- 🗨 turns yellow while it waits, green when an answer came
- Each page keeps its last 20 requests and answers in the browser

## Whom it asks

1. The agents the document names — the agent writes its bus name into the file:
   `<!-- AB: #claude/x@host -->` (several allowed; one shown as code does not count)
2. Else the **default agents** — the settings page
3. Else you pick from the live ones

A named agent that is not running: *dead — not running*; not on the bus at all: *not on the bus*.

## Settings — Agent Bus

- Connection, and mdhouse's own bus name
- **Default agent** — checkboxes
- **Names filter** — which agents the lists show: a regex per line, against the name without its
  `#`; default `^claude` `^codex` `^opencode`; empty — all

## Notes

- Restarting mdhouse drops the requests still waiting; their answers are lost
- Any page the server lets in may send while it is on
