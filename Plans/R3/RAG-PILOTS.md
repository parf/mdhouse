# RAG capability gaps and two pilot designs

Design date: 2026-11-07. [№MW.2a.2](workspaces/TODO.md#MW.2a.2), [№RAG-W2](workspaces/DECISIONS.md#RAG-W2).
Design only: no provider call, provisioning, ingestion, paid query or live schedule was run; no fixture was created or executed.
Use [research](RAG-RESEARCH.md) for primary-source practices; [provider history](RAG-CONTRACT.md) is not live readiness.

## Evidence and boundaries

- mdhouse source inspected at `f6cf6e0` (2.3.3): [plan](../../src/lib/rag-sync-plan.ts),
  [runtime/decoder](../../src/lib/rag-sync-runtime.ts), [transport](../../src/lib/rag-sync-bus.ts),
  [CLI/inventory](../../src/rag-sync-cli.ts), [bin guide](../../doc/rag-sync.md).
- Delivered local provider checkout `/usr/local/src/ai-agent-bus` at `36777189`: `src/agents/rag/agent.json`
  declares 0.4.2; `docs/agents/rag.md`, `docs/agents/filescan.md`, `src/agents/filescan/filescan.py` and `scan.py`.
  Static code/docs delivery is established. Dedicated runtime/version/key/collection readiness is unverified here.
- Historical record/config/deployment receipts remain in RAG-CONTRACT. They do not establish first sync, current
  collection health, code coverage, live deletion or whole-file completion. No readiness probe was made.
- End users get a Docs-only corpus. Devs/AI agents get an independent Code+Docs knowledge corpus.
  Shared machinery is allowed; implicit shared data/access/lifecycle/search fallback is not.
  A shared instance shares one active embedding model/dimension and the namespace/table limits; differing corpus
  models would require separate instances. No model choice or instance setup is made by this design.

## Delivered capability-gap matrix

| Area | Delivered static capability | mdhouse integration / gap |
| --- | --- | --- |
| Retrieval | RAG 0.4.2 keyword, semantic, hybrid/RRF; effective mode; optional paid rerank. Keyword/get/check/list/count/similar/complete are free. Evidence only, generation separate. | Bin searches one namespace/table, limit 1–16; semantic/hybrid require explicit paid intent. No answer-generation or corpus picker UI. No production model/top-K/quality claim. |
| Data scope / authority | RAG namespace required, tableName/key1/key2 filters; admitted callers can name any namespace. No general data read/write roles; namespace inventory/drop/keyword-index need Owner/Maintainer. | Namespace is not authentication. Current OS-owner bin is not a multi-user ACL broker. Future web queries must derive corpus/repo scope server-side and recheck citation access; never trust caller namespace/grant declarations. |
| Independent corpora | Separate agent instances can have independent Allow/Owner/Maintainer and storage config. | Safer proposed boundary for direct/untrusted callers: separate corpus instances. A shared trusted-app-only service needs comprehensive server mediation; storage topology is a later design/owner choice, not a new requirement or provisioning action. No existing ACL silently changed. |
| File coverage | FileScan handles small UTF-8 text without NUL; source/code can be text/plain. One folder per instance; no symlink following. | Bin includes exactly lowercase `*.md`; citation decoder rejects non-.md. Code+Docs end-to-end pilot is blocked on explicit future adapter/mask/citation support, even though provider can take small code text. |
| Large files | Inline ≤32 KiB / 8 chunks. Markdown .md/.markdown references support >32 KiB to 1 MiB, ≤256 heading-aware chunks and long deadline. Other >32 KiB files/binaries unsupported. | Bin runtime accepts Markdown ≤1 MiB and requires 0.4.2 capabilities and the exact collection-health status string; local plan conservatively marks >32 KiB oversize/partial. That flag is not a whole-file provider ceiling or completion proof. Large code files remain an explicit gap. |
| Selection / manifest | FileScan include/exclude plus tracked/skipped/confirmed state; finite demand sync. Bin walk bounded 10,000 files/5,000 dirs/depth 32; incomplete inventory sends nothing. | Metadata plan digest is not content/atomic-snapshot proof. No corpus manifest of extraction/chunk version or last complete generation. Runtime accepts exactly the 4 required plan exclusions and 8 provider Configuration patterns; no custom narrowing currently passes sync preflight. Do not silently widen selection. |
| Completion / recovery | Demand sync confirmed/incomplete/unknown/failed, capped never complete; free get/check compares complete+namespace/table/id/source/hash. No automatic ambiguous paid resend. | Bin has plan/sync/search, no standalone get/check/list/delete command; sync preflight uses status/capabilities, not a get/check probe. Check recovery is provider-delivered but no new CLI surface is assumed. Request-id dedup is absent; repeat can spend again. |
| Revision / freshness | Current record replace/delete only; no public commit identity, history/generation/rollback. FileScan reads working tree, not Git. | A pinned immutable checkout can materialize a pilot revision; external manifest binds it to repo/commit. Mutable working tree cannot be labelled indexed HEAD. Multi-repo id/path collisions and 128-namespace / 256-table bounds need explicit mapping/lifecycle design. |
| Citation location | namespace/table/id/source/hash/excerpt/chunk/indexed_at; heading_path+lines for large Markdown. Bin accepts the optional paired location. | Small files may lack lines; unique excerpt match may locate one, duplicate/no match stays unresolved. No guessed line/symbol. Reopen source at indexed commit where available; current workspace differs/removed/denied must be labelled. |
| Deletes / renames | FileScan deletes removed records; rename=delete+upsert, mass-delete guard pauses. RAG list is paged ≤16, cursor 10 min and not snapshot. | Live deletion/rename/revoked-access behavior unproven. ACL denial must be immediate before cleanup; complete revision publishing needs a future manifest, not list counts alone. |
| Lifecycle / cost | One FileScan folder/instance; demand sync is finite, no poll/watch/subscription; no durable scan/job/event history. Large refusal may remain uncertain until deadline/check. | No broad setup automation or lifecycle UI. Historical key/runtime gaps remain pending. Manual approval and explicit budget first; no paid resend on timeout. Future Cron/At can invoke the same bounded operation, never a new mdhouse scheduler. |

## Common proposed pilot rules

Proposals, not runnable acceptance or provisioning requests. Names below are logical labels, not created bus records.
Use separate corpus manifests and authorization mappings; never fall back across them. Query server chooses allowed
sources before retrieval/reranking/logs/cache and rechecks on source-open. Retrieved text is evidence, not instructions.
Existing records/credentials/Allow remain unchanged. Operator runtime/readiness and bounded paid budget require later approval.

Each proposed manifest binds corpus, canonical root, source IDs/relative paths, raw content hashes, repo+commit when
applicable, extraction/chunk/embedding identifiers, intended namespace/table and per-file confirmed status.
A complete result requires every selected supported source confirmed with matching identity/hash; partial/unknown/failed
remains explicit. The current provider has no complete-generation abstraction: do not claim one until a client contract exists.

Start lexical-only after separately approved ingestion. Compare hybrid/semantic only with explicit query-embedding budget;
rerank/classification/generation remain off for the baseline. Report quality/latency/provider-use rather than invent a production SLO.
No-answer means no evidence supporting an answer, not a promise that similarity search returns an empty candidate list.

## Pilot D — end-user Docs

- Proposed one fixture folder with synthetic/approved Markdown: policy, older/current decisions, how-to list/table,
  Russian FAQ, two cross-linked knowledge files, change/delete cases, large Markdown 32 KiB–1 MiB, and `.private/salary.md`/`.env`
  excluded by existing dot rules. Keep unsupported/over 1 MiB negative fixtures in a separate folder AND expected-refusal manifest: a bad/skipped file in the positive root refuses the whole sync, not just that file.
- One logical Docs namespace/table, no developer sources. Existing bin transport is closest to this pilot, but runtime,
  source manifest/authorization and completion/recovery approvals are still prerequisites, not present-day readiness.
- Twelve labelled query/case rows: exact policy term; paraphrase; multi-file answer; superseded decision; Russian query;
  English→Russian; absent topic; excluded private term; deleted source; changed hash; whole large-file confirmation;
  developer-only term/corpus denial. Each row declares expected source/section or unsupported/no-answer.
- Source-open checks project Reader grant, jailed stored root mapping and indexed raw hash. Equal=as indexed;
  changed=changed since indexed; missing=removed; revoked=denied. Delivered heading/lines used when present;
  ambiguous excerpt location is unresolved. No document body is disclosed in denied errors/logs.

## Pilot C — shared Dev/AI Code+Docs

- Proposed immutable detached checkout of one approved repository commit, with explicit repo/commit manifest.
  Begin with small source/tests such as `src/lib/source.ts`, `src/ui/edit-source.ts`, `src/lib/authz.ts`,
  `test/edit-source.test.ts`, plus technical Markdown/README. No .git, credentials, build/dependency/vendor trees.
  Small code is generic text retrieval, not a symbol engine. Large source files are listed as uncovered.
- Separate Dev/AI corpus from Docs. Code sources cannot pass the current Markdown-only adapter/decoder:
  pilot remains blocked until a separately authorized bounded extension; a Markdown-only subset is documentation
  retrieval, not a completed Code+Docs pilot. No renaming code to .md to bypass the contract.
- Twelve labelled rows: exact SOURCE_MAX; another identifier; implementation paraphrase; contract/test pair;
  UI/server boundary; technical-doc→code; absent OAuth implementation; large-file coverage gap; indexed commit vs modified
  workspace; denied repository; deleted path/new snapshot; docs-only corpus isolation. Compare useful context with direct rg/file reading.
- One-repo first avoids same-relative-path collisions. Future shared multi-repo search needs repo/revision-keyed IDs/scopes,
  bounded fan-out or provider filtering; existing key filters are not a general path/ACL filter. Never mix revisions in context.
  A pinned source may open at its commit; current source requires explicit differs label and fresh grant check.
  Optional SCIP/language-aware chunks are later improvements, not pilot prerequisites.

## Evaluation and decision boundary

Proposed result sheet: corpus × snapshot × query × mode → expected sources, retrieved IDs/ranks, supported/unsupported
answer, citation/hash/location correctness, authorized-source exposure, latency, upsert/query counts and unknown outcomes.
Record recall@5 and relevance vs lexical baseline; no embedding model or threshold chosen without measured data.
Require zero tested unauthorized/excluded/cross-corpus exposures, exact identity for confirmed files, honest no-answer/stale/
removed status, and no success for capped/incomplete/unknown work. Test revocation before cleanup and partial failure.

Before any future run: confirm dedicated runtime/version/collection/key via separately approved operator work; approve
corpus mapping/access and fixture manifest; bound embedding budget; select a supported transport and recovery procedure.
Docs may proceed first once those prerequisites are approved. Code+Docs additionally needs adapter support and explicit
large-code coverage decision. Provider requests/provisioning and paid execution are not authorized by this design.
Full [№MW.2a](workspaces/TODO.md#MW.2a), RAG lifecycle acceptance and live scheduling remain open.
