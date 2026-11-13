# Flow runtime — pure analysis-run core (checkpoint A)

Moved verbatim from `doc/flows/README.md` (the installed reference): implementation status of the shared runtime, not reference. The reference keeps the package schema and the [shared execution contract](../../doc/flows/README.md#runtime-boundary).

`createFlowRun(unknown)` validates explicit caller inputs and creates detached state.
`applyFlowRunEvent(unknown, unknown)` returns fresh state and a duplicate flag;
`validateFlowRunState(unknown)` replays its bounded input/events and compares derived state.
`previewFlowRun(unknown)` returns deterministic, unsaved Markdown. No clock/randomness, filesystem
operation, analysis provider, HTTP/UI, materialization, real approval or marker update occurs.

Inputs carry a supplied run ID/time, optional predecessor run ID, generic validated package snapshot,
64-hex package digest declaration, selected root/source declarations and 64-hex source digests,
shared scope/range/audience/output/destination, full 40-hex base/target revisions and separate dirty
source IDs. Paths are lexical declarations; they do not establish access, existing files or a real
Git range. Digests are caller declarations, not proof of a trusted installed artifact. A future
host independently checks trusted package/source identity, effective access and stale writes.

Each required evidence label occurs exactly once with caller-asserted `supplied`/`missing` status,
source IDs and a note. Supplied evidence requires a declared source reference. Unknown/duplicate
labels and undeclared source/question references fail. Questions declare canonical Q-number IDs,
words, requiredness, caller-reported answer status, source/evidence references and supplied turns.
These assertions establish neither semantic truth nor authenticated human answers or approval.

Events have a unique ID, expected version, actual valid UTC ISO timestamp (millisecond precision)
and an evidence assertion, question status/turn, analysis outcome or cancellation. Versions and node
order must match; times cannot precede the start or previous event. An exact normalized event retry
is idempotent, even after termination; reusing its ID with a different payload fails. Rejected input
never changes the supplied state. Terminal runs are immutable; a new run can link its predecessor.
Replay checks internal consistency, not authenticity or a tamper-proof journal.

Missing evidence with `missing: block` holds completion; `missing: report` adds warnings instead.
Required unanswered questions always hold completion. `held` is separate from a graph's terminal
`blocked`: evidence/question assertion events can release a hold, while explicit analysis
`blocked`/`failed` follows the terminal route. Analysis `complete` follows the package route only
when holds are clear. Consequential nodes and handoffs terminate visibly `unsupported`; no provider
success, external message or action approval is produced. The core does not execute analysis text.

Public inputs must be finite plain JSON-like data: no accessors, symbols, hidden properties, cycles,
sparse arrays or foreign prototypes. Limits: depth 32; 128 sources/evidence/questions; 256 events;
16 KiB UTF-8 per supplied string; 1 MiB serialized input/state; 4 MiB preview. Existing package/node
limits still apply. All public entry points revalidate unknown values and return detached data.

Preview has fixed headings and canonical open-question items with signed agent assertion notes.
Supplied words/IDs/turns/results remain in collision-safe fenced JSON, including caller-reported
answers; they cannot introduce Markdown controls, HTML, diagrams or owner turns. In-memory event
history is explicitly unsaved. There is no `last-commit-id` field or marker advancement.

The headless fixtures exercise the existing project-review and a generic Legal package. This proves
only the pure transition/preview slice. Jailed materialization (checkpoint B), access/content gates,
real manual UI/agent execution, external actions, durable resume and scheduling remain open.
