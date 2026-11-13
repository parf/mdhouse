# RAG — requirements and open questions

Research and proposed two-corpus architecture: [RAG research](RAG-RESEARCH.md). Proposals remain design-only.
Delivered static capabilities, integration gaps and proposed per-corpus pilots: [capability/pilot design](RAG-PILOTS.md). No execution authorized.

Current owner direction: implementation deferred. Design two independent indexes: end-user documents only, and a shared developer/AI-agent code-and-documentation index. Preserve repository/revision identity and access boundaries. Historical provider setup below does not supersede this direction. See [№RAG-W2](workspaces/DECISIONS.md#RAG-W2).

<!-- AB: #cx/mdhouse-ceo -->

For the owner implementing the Agent Bus RAG agent. mdhouse integration: [№R3f](TODO.md#R3f) / [№MW.2a](workspaces/TODO.md#MW.2a).
Scope: [release](README.md#r3f-rag-through-the-agent-bus-rag-agent),
[implementation](workspaces/TODO.md), [№Q-R3-RAG1](workspaces/QUESTIONS.md#Q-R3-RAG1).
API names below describe capabilities, not agreed method names. Provider answers are recorded below;
RAG 0.3.0 static capabilities are verified; dedicated-instance provisioning and end-to-end acceptance remain open; FileScan typed docs/fixture are delivered with the limitations below.

## Technical handoff routing

Confirmed AB-DVP CTO is `#ab-dir` (CEO receipt `efcbca36dfc3bdd6`, AB-CEO confirmation
`ddd9cabf1b108f19`). Technical RAG/FileScan/T-48/T-49 work is mdhouse CTO ↔ #ab-dir directly;
owner choices go #ab-dir → #ab-ceo. No AB worker/lead/QA contact or duplicate requests.

#Ab-dir receipt `ab68c17627ef4f09`: T-48 is plans-only pending owner approval. Large Markdown plan
`Plans/R1.0-Release/rag/large-files.md` on `ab-w1a/T-48` (`bbc5fcf4`) is in review; chunking stays
RAG-owned, with Q368–Q371 for transport/read grant/TTL/size-cost cap. Finite FileScan sync plan is
`Plans/R1.1/filescan.md`; completion counts whole files confirmed by RAG, never capped scans as
success. T-49 is an external-user setup step list for dedicated records on #runner/parf-user,
with parf-only steps and gaps explicit. Await delivered lists/approved contract and exact live
readiness; ETA and draft review are not deployment or execution authorization.

## Execution boundary — separate on-demand bin

[№RAG-W1](workspaces/DECISIONS.md#RAG-W1): mdhouse owns implementation of a separate executable
RAG sync bin; it remains in R3 prioritization, but runs only on explicit owner demand. No unsolicited
provider status sync, background sync or service calls from normal cohorts. Existing contract
requirements below do not authorize live provisioning, subscriptions, paid calls or a permanent
watcher. One FileScan per folder: owner/AB-CEO provision roots, record/Configuration.dir, token/reload
and caller grants; only afterward does our bin configure agreed endpoint/namespace/table subscription
and inspect status/sub list. Finite on-demand sync lifetime is owner-approved via T-48: no subscription/watch/timer remains;
actual runtime/API delivery is pending, not permission to use a persistent subscription. Official setup input: `/usr/local/src/ai-agent-bus/docs/agents/filescan.md`.

Reference-only #ab-ceo message `bd5eaa2868d8cedc` reports FileScan deployed/not running and those setup
steps; its old pack 1.0.1 label is not new verified deployment evidence. It is not an execution task.

## Owner direction

> we can make instances of rag; each one have own namespace
>
> #rag/project1
>
> напиши все вопросы и пожелания по RAG в отдельный файл. я сделаю/добавлю нужную функциональность в #rag agent

- Owner implements missing RAG-agent functionality; mdhouse implements project UI and orchestration.
- Use one `#rag/mdhouse` instance; every call requires the stored project namespace (default: project ID), strictly isolated from RAG 0.3.
- FileScan owns source ingestion, refresh and progress; Agent Bus event-log subscriptions deliver updates.
- RAG owns storage, classification, embeddings, indexes, retrieval execution and source credentials.
- mdhouse enforces project grants independently; RAG access never grants mdhouse filesystem access.

## First live sync — 2026-11-12

- ✅ `/home/parf/src/mdhouse` `*.md` → `#filescan/mdhouse@parf.us` → `#rag/mdhouse@parf.us` (RAG 0.4.5, shared `#qdrant`, `rag_mdhouse`, voyage-3.5/1024): 184/184 confirmed, `mdhouse-rag-sync sync --apply --until-done` exit 0.
- Voyage free tier (3 RPM) throttled the first run; paid tier since 23:08Z; FileScan `max_per_scan` 20.
- Keyword search returns cited records (`source`, `content_hash` = sha256 of the file bytes, `chunk_index`, large-file `lines`/`heading_path`); small-file citations computed by mdhouse (MW.2a.4).

## Current provider checkpoint — 2026-11-06

Provider also reports J122 Python reply delivery fixed (`on_reply`; `call()` refuses `wait`).
This is deployment information, not mdhouse end-to-end or paid-sync evidence.



T-48 first-build limitation (provider receipt `990f468334f46a9e`): the Python client cannot yet
carry the inline reply to a long upsert, so large-file confirmation uses free RAG check. A refusal
may remain unknown/incomplete until the sender deadline/wait ends, unlike small files. The bin
must show that latency/uncertainty, not success on delivery or timeout, and no automatic on-demand
paid resend. Only complete:true plus matching identity/source/hash confirms; an unavailable or
inconclusive check stays unknown. A client improvement is filed, not scheduled/deployed evidence.


Source-selection blocker J124 is provider-reproduced: include matching ancestors made *.md include
x.md/secret.txt. Provider fix applies includes to the regular file's whole path, leaves exclude
narrowing on ancestors, and tests Markdown root/nested cases. Provider reports fix deployed on
bus 1.0.52 / agent pack 1.0.4 (`3ddc7678bc9f8cc8`); FileScan restarted in demand with 195 tracked.
Provider read-only state.json audit (`d3b60e465f10c17d`) confirms 195/195 keys remain selected;
no residue cleanup is needed. The selector/audit gate is satisfied by provider evidence; actual
indexing remains unproven and still waits Qdrant key/runtime readiness. CTO also narrowed config to
exclude bower_components/jspm_packages with provider-approved patterns, preserving demand/root/all
other settings; targeted restart applied. Effective selection normalization must use the fixed
known mapping, not ignore unknown rules or silently widen source disclosure.

The app's old unfiltered reconnect drain shares #mdhouse's inbox with the separate bin. The connected
cohort must narrow app cleanup to its own topic and test interleaved bin replies; uncertainty is not
a substitute for that source fix. No live :7777 restart is authorized/performed here; source identity
does not prove the old process upgraded. Live acceptance must distinguish provider/operator proof
from connected-bin/shared-reader behavior rather than claim all reply-loss races eliminated.
CEO subsequently verified the owner-authorized local mdhouse reload (`95ff0d32e65091bd`):
HTTP/root readiness and preserved original roots plus immutable reference; topic-scoped drain is
now applied. Missing runtime dependencies were installed with frozen lock; package/lock unchanged.
No provider sync/index/search was performed by that local reload.

### T-49 actual setup checkpoint

T-48 is provider-reported deployed (bus 1.0.51 / pack 1.0.3, 14:22). CTO applied the authorized
FileScan mode=demand change, preserving every other config field, then targeted restart of only
filescan/mdhouse. Actual status returned mode/effective_mode demand, 195 tracked, paused null,
subscribers empty; no scan/sync/ingestion occurred. RAG queue TTL is unset, not below the 30-minute
large-upsert sender budget. Real daemon long-wait behavior is provider-investigated, not claimed
proven here; unknown outcomes require free check, never automatic paid resend.

Delivered FileScan `sync <rag> as rag <namespace> <table> [resend:true]` returns result confirmed/
incomplete/unknown/failed, confirmed/remaining/sent counts, capped and bounded per-file states.
Capped/unknown/failed never map to success; rerun resumes provider marks without auto-resending
unknown. Actual adapter must verify mode=demand, agreed source configuration and live RAG capability;
no subscription/watch workaround or policy guessed from a draft. First real owner-demand sync is
app use/live proof, not a paid test; record result, status and matching get/check for a large file.
Dedicated Qdrant/RAG runtime still waits on the private key handoff before that first sync.


Latest Q376–Q378 choices are settled through #ab-dir: shared Voyage/production AI, own Qdrant proxy
to existing store. Store URL is explicitly `http://127.0.0.1:6333`; the key install is a private
owner-side step and is not yet confirmed. No Qdrant/RAG enable/start/reload/collection/index is run
before that handoff. Root runner secrets are not read or borrowed. #mdhouse registration is not a
blocker: it already exists as parf-owned. FileScan Allow now includes it, verified by record metadata.

Frozen future completeness check `b0b435f4` is `get` with `check:true`, explicit namespace/tableName/id;
response namespace/tableName/id/source/content_hash/indexed_at/complete. Only complete:true plus all
expected identity/source/hash fields confirms a whole file. No data/vectors/labels are returned;
not_found/incomplete/different-source/hash confirm nothing; storage/deadline remains unknown and
never authorizes paid upsert. This is a reviewed plan contract, not deployed capability yet.


FileScan live status is provider-confirmed: Owner parf, Maintainer CTO, account runner, expected
root/mask/exclusions, tracked 194, paused null, subscribers empty (receipt `8d1e090322ae8fd8`).
Owner says mdhouse provisions its subagents as parf. Account-socket identity check returned parf;
`#mdhouse@parf.us` already existed, Owner parf/active, and was preserved rather than re-registered.
CTO additively admitted it to FileScan. No FileScan sub add/scan/ingestion was performed.

CTO registered/configured `#rag/mdhouse@parf.us` (Owner parf, Maintainer CTO; Allow @owner, exact
FileScan and mdhouse) and `#qdrant/mdhouse@parf.us` (own proxy, Allow @owner + RAG(write)). RAG uses
shared `#voyage@parf.us`/`#ai@parf.us`, own collection rag_mdhouse, voyage-3.5/1024, classify false;
rerank unset. Its own credential was handed only to the protected runner token file (0600), never
printed/committed. No separate Voyage/AI instances or keys: owner settled Q377/Q378. Shared AI is
production, only real app use, never tests/probes. Voyage visibility was clarified by provider: RAG
is admitted even though parf's unadmitted ls could not see the record.

Q376 is settled: own Qdrant proxy to existing `http://127.0.0.1:6333`. The existing-store key must
be installed privately by owner/AB-CEO (0600 user-runner env), not copied from root-runner secrets.
Runtime enable/start/reload, collection/index and all ingestion remain waiting for that handoff;
no such operation was run here. No grant to workers/wildcards or runtime mdhouse manager role.

T-48 owner options Q368–Q375 are provider-reported approved; build starts with light whole-file
get/check and finite FileScan sync. Code/deploy/frozen shape are not yet delivered. After deployment
CTO must switch FileScan to the documented on-demand configuration (Q375), not leave implicit watch.
Provider accepted no automatic paid resend without free check (sync resend caller-only; watch only
incomplete within the shared core confirmed-delivery resend bound (FileScan S1)), and duplicate-sibling/fenced-heading chunk identity tests. Physical
old-chunk cleanup remains unproven, not a new dedup guarantee.

### Authorized first setup target

Owner authorizes starting setup for `/home/parf/src/mdhouse/**/*.md`. CEO already requested dedicated
RAG/FileScan prerequisites from #ab-ceo; do not duplicate provisioning or capability requests.
FileScan include/exclude arrays exist; `include: ["*.md"]` matches root and recursive Markdown per
provider test evidence relayed by CEO. Keep default dotfile exclusions and exclude node_modules /
dependency trees; no .git/.scratch ingestion. Proposed namespace `mdhouse`, table `docs`, production
production caller `#mdhouse@parf.us` was found already registered as parf-owned and preserved.
Dedicated record/grant setup is recorded above; runtime readiness is still partial.

CTO read-only local estimate: 194 visible nonignored Markdown files, five over 32 KiB (EXECUTION,
workspace TODO, `Plans/issues/2026-10/2026-10-07.md`, R3 README, CHANGELOG). This is not a FileScan scan
or completeness proof. Current `as rag` skips >32 KiB texts (and may delete an older indexed record);
never report full Markdown coverage or silently cut/chunk files. Full estimate is retained at
`.scratch/cto/rag-markdown-scope.json`.

CEO has already requested provider evaluation/planning for bounded on-demand scan/completion and
>32 KiB Markdown ingestion. Provider changes are AB-CEO-owned; our separate bin/index/search
integration remains mdhouse-owned. Mask arrays require no provider change. No subscription/watch/
ingestion has been started here; on-demand versus watch lifetime must be settled before persistent
behavior, and setup authorization does not silently authorize arbitrary paid/provider calls.


Owner-question locations verified read-only in Agent Bus `Plans/R1.1/QUESTIONS.md` (not R1.0):
[№Q353](http://localhost:7777/ai-agent-bus/Plans/R1.1/QUESTIONS.md#rag-for-mdhouse) — endpoint choice, provider-reported approved via T-49, original commit `d75b1da7`;
[№Q355](http://localhost:7777/ai-agent-bus/Plans/R1.1/QUESTIONS.md#owner-items-from-2026-11-06) — FileScan roots, provider-reported approved via T-49, original commit `47bfb0a0`
(warning `ee15f008`, subsequently fixed/deployed per provider). Provider relay `af433a09927c623d` (CEO receipt `9ab6320591fda0db`) reports approval: parf stays
record Owner; `#cx/mdhouse-cto` becomes Maintainer on `#rag/mdhouse@parf.us` and
`#filescan/mdhouse@parf.us` for scoped config/access/subscriptions/scan/reset. T-49 record/config/grant setup is recorded above; wait for owner key handoff, verified runtime and
T-48 bounded/large-text deployment before ingestion. Maintainer
status is not permission for destructive reset/replay, worker/wildcard grants or unrelated work. Provider receipt `5a254e80e274e4b8` reports RAG 0.4.1 deployed at `#rag@parf.us`,
2026-11-06 11:20 EST, bus 1.0.50 / agent pack 1.0.2. Advertised methods add count/similar/complete/
classify to the earlier ten; complete prefix index exists, classify is off unless configured.
This is provider deployment evidence, not new mdhouse discovery or adopted feature scope. T-49
live readiness remains pending; no calls or grants were performed here.

FileScan paid-replay defect: provider receipt `e6f9c7a3de48dd99` reports fix `0f5340c3` deployed
2026-11-06 02:07 EST, verified upstream against real RAG core with fake providers. Acknowledgment now
requires matching namespace/table/id/source/content_hash; not_found settles deletes only. CTO read
local source/docs revision descriptions and fixture, without running providers or verifying live
roots. The earlier HIGH warning is historical below; dedicated-instance/root provisioning confirmation still blocks live wiring.

T-45 docs `7a26cf1b` and replay fixture are delivered: local official
`docs/agents/filescan.md#reference-for-a-consumer`, `docs/agents/rag.md#troubleshooting`,
`src/agents/filescan/fixtures/filescan-session.jsonl`, `src/agents/filescan/replay.py` in
`/usr/local/src/ai-agent-bus`. No FileScan root/record is provisioned per provider report.
`pending:0` plus `paused:null` means caught up only for scanned state; full-scan completion additionally
requires non-null last_scan and latest scan capped:false. No rename/pause message, source registry,
job/progress API, scan history or event stream is supplied. Subscriber change messages and status
snapshots are available, not a promised durable lifecycle stream. R1–R12/A1–A9 gaps stay explicit.

Free get inspection of an unknown upsert compares content_hash/source/table/id and indexed_at;
matching text alone does not prove classification/metadata/old-chunk cleanup. No request-id dedup or
automatic safe retry is implied. A4/A7/history/generation acceptance remains open.


Provider reports RAG 0.3.0 live at `#rag@parf.us`. CTO help and free `capabilities` returned version
0.3.0, keyword/semantic/hybrid modes, voyage-3.5 with 1024 dimensions, and methods upsert/get/list/
search/keyword_index/delete/prompts/capabilities/namespaces/drop_namespace. Limits include 32 KiB
record data, eight chunks, 16 records/page and 128 namespaces. Discovery makes no paid/provider-storage
call and does not prove backend readiness or data-path isolation; no paid lookup or mutation was run.
Local official reference: `/usr/local/src/ai-agent-bus/docs/agents/rag.md`.

Provider recommends a separate `#rag/mdhouse@parf.us` instance/collection, pending owner provisioning
([№Q353](http://localhost:7777/ai-agent-bus/Plans/R1.1/QUESTIONS.md#rag-for-mdhouse), provider-reported approved);
`#rag@parf.us` is not the final mdhouse endpoint. Intended initial caller is production
`#mdhouse@parf.us` already exists and was preserved. Earlier no-CTO-grant assumptions are superseded by owner-approved
Maintainer authority for `#cx/mdhouse-cto` on the two dedicated records, within the explicit sync scope.
No CEO/workers/Review or wildcard grants are authorized; exact live grants still require confirmation. mdhouse project grants and
stored namespace mapping remain independent access boundaries. No grant change was performed here.

Delivered provider followup T-45 is docs/fixture-only: exact typed FileScan source/progress/event/snapshot
contract and replayable fixture; free get/content_hash inspection guidance for unknown upsert
outcomes; explicit A4/history/generation limitations. A7 request-id dedup remains unmet; a replayed
upsert may pay twice. Do not infer safe automatic retry from same record ID. A4 end-to-end and the
remaining lifecycle/history/recovery acceptance remain open; current evidence does not close them.

## Verified baseline — 2026-11-05

Local `docs/agents/rag.md` and `src/agents/rag/agent.json` in `/usr/local/src/ai-agent-bus`, v0.2.0:

- Existing: `upsert`, `get`, `list`, BM25 `search`, `keyword_index`, `delete`, `prompts`.
- `upsert` already classifies, chunks and embeds; BM25 search does not perform semantic retrieval.
- No advertised source registry, asynchronous source/job lifecycle, progress or refresh API.
- Namespace/table are labels, not access locks; admitted callers can access all namespaces.
- One source record is limited to 32 KiB / eight chunks; calls have a 120-second total budget.
- Unknown/incomplete outcomes require inspection; repeating upsert may spend again or replace newer data.
- No provider mutations or paid calls were made for this discovery.

## R3 integration requirements

- [ ] RAG-R1 Instance routing and isolation
  Resolve project → endpoint + RAG agent + namespace; reject cross-project access without silent fallback {#RAG-R1}

- [ ] RAG-R2 Source registry
  Add/list/inspect/select/remove allowed sources using stable source IDs and safe display metadata {#RAG-R2}

- [ ] RAG-R3 Ingestion and indexing
  Start ingestion, embedding/indexing and refresh/reindex; return stable job IDs for long operations {#RAG-R3}

- [ ] RAG-R4 Observable jobs
  Expose state, stage, progress, timestamps, failures and recoverable partial results {#RAG-R4}

- [ ] RAG-R5 Freshness
  Expose source revision/content hash, index generation and last successful refresh; distinguish stale/partial/ready {#RAG-R5}

- [ ] RAG-R6 Retrieval
  Query explicitly selected sources; support semantic retrieval and identify effective search mode/version {#RAG-R6}

- [ ] RAG-R7 Evidence
  Return citations/provenance sufficient to preserve inspectable references in Markdown and flow history {#RAG-R7}

- [ ] RAG-R8 Authorization
  Check provider grants separately from mdhouse grants; distinguish read/query from source/index mutations {#RAG-R8}

- [ ] RAG-R9 Recovery
  Define replay/idempotency, timeout/unknown/incomplete outcomes and safe retry without duplicate work/spend {#RAG-R9}

- [ ] RAG-R10 Live updates
  Deliver job/source changes without browser/server polling; support reconnect and state reconciliation {#RAG-R10}

- [ ] RAG-R11 Secrets and paths
  Keep credentials server-side; no source connector, path or URL may bypass its own explicit grant {#RAG-R11}

- [ ] RAG-R12 Common request contract
  Manual requests, retrieval tests and scheduled flows use the same source selection and evidence contract {#RAG-R12}

## Questions for the provider

- ❓ RAG-Q1 How is each instance bound to its namespace and caller grants?
  Can `#rag/project1` pin its namespace and reject a supplied different namespace on every method?
  Is isolation enforced by a dedicated collection, restricted backend credentials, agent policy, or a combination?
  Can the same mdhouse identity use several instances without gaining cross-project access?
  > 💡👾 Pin the namespace in instance configuration; keep collection/credential choices provider-owned.
  >
  > 💬👾 (#ab-ceo, for the owner) One instance, `#rag/mdhouse`, and mdhouse passes `namespace = <project>` on every call. From RAG 0.3 the namespace is required on every method, with no cross-namespace default; search, list, get and delete touch only that namespace, and an id from another namespace answers not_found. `#rag/mdhouse` admits only mdhouse's bus identity, so the namespace is a label only mdhouse sets and mdhouse keeps enforcing project grants itself. A separate `#rag/<project>` instance stays possible for an untrusted caller later.

  >
  > 💬👾 (#ab-ceo, clarification) FileScan→RAG path: the FileScan instance itself calls `#rag/mdhouse` upsert/delete. A subscription is `sub add #rag/mdhouse as rag <namespace> …`, created by mdhouse. So `#rag/mdhouse`'s Allow admits mdhouse's identity AND its FileScan instances (`#filescan/<project>`), not mdhouse alone. FileScan also checks at `sub add` that the subscription's author (mdhouse) may send to `#rag/mdhouse`. Read the "mdhouse only" in my Q1/Q10 answers as "mdhouse and the FileScan instances it set up".

- ❓ RAG-Q2 What is the instance setup and capability-discovery contract?
  Who creates/configures an instance and its storage/grants? What exact address does mdhouse persist?
  How does mdhouse discover API version, supported methods/search modes, limits and readiness without a paid call?
  > 💡👾 Explicit owner provisioning; a read-only versioned capabilities response; unsupported features fail visibly.
  >
  > 💬👾 The owner provisions `#rag/mdhouse` (records, Allow, Qdrant collection, keys); mdhouse persists that bus name. RAG 0.3 adds a free `capabilities` call: RAG app version, methods, search modes, limits and embedding model; no paid call. An unsupported method is refused by name.

- ❓ RAG-Q3 Which source kinds and ingestion inputs should R3 support?
  Text/upload, jailed project files/directories, Git revisions, URLs or connected services: which are available first?
  Who enumerates files, handles ignores/symlinks, chunks large documents and attaches source revisions?
  How are size/file-count/type limits, URL redirects and credential references validated?
  > 💡👾 Start with explicitly selected project Markdown/text; remote connectors need separate explicit grants.
  > Keep source fetching/credentials provider-owned where supported; mdhouse exports only authorized jailed content.
  >
  > 💬👾 Not in `#rag`: sources and ingestion come from FileScan (`#filescan/<name>`, in build now). It watches one project folder (poll plus inotify), sends RAG upserts and deletes for new, changed, renamed and removed files, feeds the existing files on first setup, follows symlink and size rules, and sends files over RAG's inline limit by bigfile or as size plus hash. mdhouse points one FileScan instance at each project folder with `namespace = <project>`.

- ❓ RAG-Q4 What is the source registry and lifecycle schema?
  Define create/list/get/update/remove, stable identity, duplicate registration, pagination and source validation.
  Does removal detach a project selection, delete indexed data, or delete the source itself?
  What happens to in-flight jobs and retained citations after removal or a source move?
  > 💡👾 Separate detach from destructive deletion; report unavailable historical evidence without rewriting it.
  >
  > 💬👾 A source is a FileScan instance plus its subscription to `#rag/mdhouse`. Detaching is removing the subscription (indexed data stays); deleting data is RAG 0.3's explicit "drop namespace" call, or FileScan's delete events per file. Citations keep their record id and content hash; a removed record answers not_found, so mdhouse can show "source removed" without rewriting history.

- ❓ RAG-Q5 What are the asynchronous job and progress contracts?
  Define start/inspect/list and states for ingestion/index/refresh/reindex, stage/counts, timestamps and error details.
  Which operations remain synchronous? How do job IDs survive the current 120-second request deadline or a restart?
  Can mdhouse cancel a job, and what data/cost remains after cancellation?
  >
  > 💬👾 No RAG job system: an upsert stays one synchronous call per record. Long work (a folder's first feed, refresh) is FileScan's, which reports progress in its `status` (pending, sent, confirmed, failed per subscriber) and survives restarts with its state file. Cancel = stop or pause that FileScan instance; records already upserted stay.

- ❓ RAG-Q6 How are long-running source/job changes delivered without polling?
  Are there Agent Bus subscriptions/events or a single deferred completion/progress route?
  Define event identity/order, terminal delivery, missed-event reconciliation and retention after restart.
  > 💡👾 Subscribe plus an authoritative snapshot/cursor on reconnect; publish revisions so duplicates are harmless.
  >
  > 💬👾 Through Agent Bus: FileScan and RAG write notices, warnings and alerts to their own agent event logs, and mdhouse subscribes to those logs (`#bus` `sub add`); alerts survive a daemon restart. On reconnect mdhouse reads FileScan `status` as the authoritative snapshot; events carry ids, so a duplicate is harmless.

- ❓ RAG-Q7 How do refresh, reindex and freshness interact?
  Who detects changed/deleted source documents? Are refreshes explicit, scheduled, event-driven, or combined?
  Can a query select a consistent index generation while another is building? What happens after partial failure?
  How are model/chunking changes and old index cleanup handled without mixing incompatible generations?
  > 💡👾 Preserve the last complete readable generation until replacement succeeds; expose stale/partial state.
  >
  > 💬👾 Change detection is FileScan's (content hash per file, deletes guarded against an unmounted or emptied folder). Refresh is continuous, not a separate job. Index generations (build new, then swap) are not planned now; a model or chunking change is a re-feed into a new namespace, then mdhouse switches to it and drops the old one.

  >
  > 💬👾 (#ab-ceo, clarification) Namespace vs re-feed: mdhouse STORES the namespace per project; it doesn't derive it from the project name at call time. The default is namespace = <project id>. On a model or chunking change mdhouse:
  > - creates a new FileScan subscription into `<project id>.<n>` (e.g. `proj1.2`), which feeds the whole folder (the first-run replay);
  > - waits for FileScan `status` to show it caught up;
  > - switches the stored mapping to `proj1.2`;
  > - removes the old subscription, then drops namespace `proj1`.
  > Queries never mix the two, because RAG 0.3 stores the embedding model per namespace and refuses a query with a different one.

  >
  > 💬👾 (#ab-ceo, correction; supersedes earlier answer) Q7 re-feed: the embedding model and dimension are bound per namespace before any paid call. A model with a DIFFERENT DIMENSION needs a new Qdrant collection or a new #rag instance, not just a new namespace. Same dimension (e.g. a chunking change): the new-namespace re-feed works as I described.

- ❓ RAG-Q8 What is the semantic/keyword/hybrid retrieval request and response?
  Define source filters, query, result/token limits, scores/order, pagination, no-result and missing-source behavior.
  Can queries require a generation or minimum freshness? Does retrieval return evidence or also generate an answer?
  Are reranking and hybrid search supported, optional, or unavailable?
  > 💡👾 Return evidence separately from answer generation; never silently substitute another source or search mode.
  >
  > 💬👾 RAG 0.3 adds semantic and hybrid search (dense vectors plus the existing BM25, fused); the request names namespace, query, mode and limit, and the answer names the effective mode. Evidence only: answer generation is a separate call to `#ai`. Reranking is not planned yet.

- ❓ RAG-Q9 What citation and provenance fields will retrieval return?
  Need instance/source/record/chunk IDs, source URI or jailed project-relative path, revision/hash, excerpt,
  location (lines/page/section when available), index generation and indexed/retrieved timestamps.
  Which IDs remain resolvable after refresh/delete, and how can a user inspect the exact cited revision?
  > 💡👾 Return stable citation objects; mdhouse renders safe links and records effective sources/version in Markdown.
  >
  > 💬👾 RAG 0.3 results carry namespace, record id, chunk index, the source path FileScan sent, content hash, excerpt, scores and indexed time. A record id stays resolvable until its file is deleted or the namespace is dropped.

- ❓ RAG-Q10 How are permission changes and revocation enforced?
  Which caller may query, list sources, ingest, reindex, cancel, delete or administer the instance?
  If mdhouse calls as a service identity, how are project/user denials and active-session revocation handled?
  Does an in-flight job stop publishing results when access is revoked, and can events leak source metadata?
  > 💡👾 mdhouse checks the current user/project grant on requests, delivery and reconnect; provider checks its grants.
  > Instance IDs, namespace names, source IDs and job IDs are identifiers, never credentials.
  >
  > 💬👾 The bus checks who may call `#rag/mdhouse` (its Allow: mdhouse only) and RAG's roles separate read from mutating methods. mdhouse checks its own user and project grants on every request and delivery. Bus names, namespaces and record ids are identifiers, never credentials.

  >
  > 💬👾 (#ab-ceo, correction; supersedes earlier answer) Q10: RAG 0.3 has NO separate read vs write role. Anyone admitted to #rag/mdhouse can query and mutate; the split is the bus Allow (mdhouse + its FileScan instances) plus mdhouse's own grants. Dropping a namespace is the exception: manager-only, with a confirm.

- ❓ RAG-Q11 What makes mutations safe to replay or resume?
  Define request-id scope/lifetime, same-ID/different-body rejection, deduplication and concurrency/conflict behavior.
  How does the caller resolve an unknown result without blindly repeating a paid upsert or destructive operation?
  Which incomplete operations have a continuation token, and which require explicit user confirmation to retry?
  > 💡👾 Persist operation outcomes; expose inspection/resume before retry and never claim unchanged state after uncertainty.
  >
  > 💬👾 Today an upsert is a replace by record id, so a repeat after an unknown outcome overwrites with the same content (it may re-embed, a small cost); FileScan resends until RAG confirms and never sends twice once confirmed. A request id with a stored outcome is the next step after 0.3, not in it.

- ❓ RAG-Q12 What are the errors, limits and usage contracts?
  Define denied/missing/unsupported/stale/busy/rate-limited/provider-unavailable errors and retry guidance.
  Expose document/batch/storage/concurrency/deadline limits and estimated/actual provider usage where available.
  Can mdhouse preview paid or destructive work before confirmation without invoking a paid provider?
  > 💡👾 Keep expensive and destructive operations explicit; no automatic retries after ambiguous outcomes.
  >
  > 💬👾 Refusals are named (not_found, forbidden, busy, limit, provider refused); limits are in `capabilities`. Cost: an embedding per upserted chunk and one per semantic or hybrid query; keyword search is free. Destructive calls (drop namespace) are explicit and never retried automatically.

## RAG 0.3 provider update — pending deployment

> 💬👾 (#ab-ceo) The RAG 0.3 plan is approved and building (ready ~01:00).
>
> GAPS (not in 0.3)
> - no source registry, jobs or events in #rag: that's FileScan + agent event logs;
> - no history or index generations;
> - data written without a namespace (legacy) is refused, with no migration.
>
> IN 0.3
> - one namespace-bound access object: a foreign-namespace id gets the same not_found;
> - keyword search stays the free default; semantic costs one query embedding; hybrid = RRF with each branch namespace-filtered; no silent mode downgrade;
> - drop namespace: manager-only, confirm = the namespace name, resumable only by an explicit confirmed call.

Acceptance reconciliation; no gate closed by this provider report:

- №RAG-R1/№RAG-R8/№RAG-R11 and №RAG-A2/№RAG-A3/№RAG-A6: mdhouse grants plus bus Allow; no RAG read/write role. Verify manager-only confirmed namespace deletion and legacy-data refusal.
- №RAG-R2–№RAG-R4/№RAG-R10 and №RAG-A4/№RAG-A6: FileScan and event-log contracts, not RAG jobs; typed schemas and recovery fixtures remain required.
- №RAG-R5/№RAG-R7 and №RAG-A5/№RAG-A8: no provider history/index generations. Historical evidence and generation acceptance remain gaps; same-dimension namespace re-feed is not history retention. Different dimensions require a new collection or instance.
- №RAG-R6/№RAG-R12 and №RAG-A1/№RAG-A9: verify explicit effective mode, namespace-filtered hybrid branches, citations and limits after deployment.
- №RAG-R9/№RAG-A7: stored request-id outcomes remain unavailable; replay-without-duplicate-work acceptance remains open.

## Requested handoff and acceptance

- [ ] RAG-A1 Versioned typed schemas and examples for every supported capability, including errors and limits. {#RAG-A1}
- [ ] RAG-A2 Instance provisioning/grant runbook and a safe fixture; no secrets in docs or example responses. {#RAG-A2}
- [ ] RAG-A3 Shared instance: mdhouse denies cross-project selection; RAG confines every method and record ID to the supplied namespace. {#RAG-A3}
- [ ] RAG-A4 Add source → ingest/index → progress/completion → inspect freshness → retrieve cited result. {#RAG-A4}
- [ ] RAG-A5 Change source → refresh/reindex → retrieve the intended generation; test deletion and stale citations. {#RAG-A5}
- [ ] RAG-A6 Exercise unavailable/denied source, revoked access, cancellation, crash/reconnect and partial provider failure. {#RAG-A6}
- [ ] RAG-A7 Replay one request ID without duplicate work; resolve unknown outcome before any repeat paid call. {#RAG-A7}
- [ ] RAG-A8 Manual request and scheduled-flow fixtures preserve the same source IDs, versions and provenance. {#RAG-A8}
- [ ] RAG-A9 Document supported retrieval modes; missing required capability leaves [№MW.2a](workspaces/TODO.md#MW.2a)/[№R3f](TODO.md#R3f) acceptance open. {#RAG-A9}

Nice to have, subject to provider support: cost preview/usage, cancellation, hybrid search/reranking,
generation retention controls and richer file/URL/service connectors. These are questions and wishes,
not additional R3 release gates beyond the approved lifecycle, retrieval, isolation and evidence contract.

## Historical FileScan paid-replay warning

🔴 FileScan→RAG wiring blocked: provider receipt `33de2bc2e7a56822` reports a sink expecting
`status:ok`, which real upsert does not return. Successful writes stay pending and are resent,
repeating paid embeddings/classification. Provider reports no live FileScan root/process here;
mdhouse has not enabled this path. Do not connect FileScan until corrected confirmation matches
namespace/table/id/content_hash, real-core regression passes and provider confirms deployment.
Direct RAG calls are not affected by this sink defect; this is not authorization for paid calls.
ETA is not deployment evidence. T-45 docs/fixture must retain the warning until resolved.


Superseded for the deployed fix by the current provider checkpoint; retained as incident history.
