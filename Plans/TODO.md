# TODO — mdhouse

- [ ] Say when search fell back from ripgrep (`search.ts` `degraded`) — today the page shows nothing
- [x] Agent Bus integration (`~/src/ai-agent-bus`) — must be enabled in config — plan: [ab-integration.md](ab-integration.md)
  - [x] When enabled and we do not know the suggested bus session — ask to select (checkboxes) one or more
  - [x] AI includes `<!-- AB: agent-bus name -->`; we check if the bus name is alive: dead → a dead notice; else several buttons + a textarea

What is done is in [`DONE.md`](DONE.md); user-facing history in
[`CHANGELOG.md`](../CHANGELOG.md).
