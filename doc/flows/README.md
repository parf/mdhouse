# Flow authoring packages — schema v1

These shipped templates are not runnable. They provide a shared data contract and readable
Feature/delivery instructions before the shared runner exists. Loading or validating a package
does not execute it or grant filesystem, administrator, project or action permission.

## Layout and discovery

`catalog.json` explicitly lists package IDs, families, manifest paths and examples. A package has
`flow.json`, one or more ordinary Markdown instruction documents, and a small `example.md`.
The four initial packages cover feature implementation, project/subsystem review, delivery and
next-feature continuity. Each example is explicitly synthetic, never verified repository evidence.

`loadFlowCatalog(directory)` loads the catalog completely or throws; it never returns a partial
library. `loadFlowPackage(packageDir)` reads only the manifest and declared documents/example.
`validateFlowPackage(unknown)` returns fresh typed declarations or throws with field/node context.
The loader neither scans arbitrary trees nor substitutes a missing package/source/target.

## Manifest fields

| Field | Contract |
| --- | --- |
| `schemaVersion` | Exactly `1`; unknown versions and fields fail |
| `id`, `family`, `entry` | Lowercase hyphen-separated slugs, starting with a letter, max 80 characters; entry names a node |
| `title` | Trimmed nonempty label; no control characters; max 1024 characters |
| `defaults.scope` | `selected-project`, `selected-subsystem` or `selected-document` |
| `defaults.range` | `explicit-baseline` or `since-last-run` |
| `defaults.audience` | Trimmed nonempty audience label, including a custom reader |
| `defaults.output` | Nonempty lowercase slug (max 80 characters), e.g. `findings`, `decision-memo` or `obligation-register`; adding an output needs no loader change |
| `defaults.destination` | Local relative `.md` path declaration; not resolved or authorized by validation |
| `evidence.required` | 1–128 distinct nonempty source labels |
| `evidence.missing` | Explicit `block` or `report`; mandatory missing evidence holds dependent work |
| `example` | Relative path to a nonempty UTF-8 Markdown example |
| `steps` | 1–128 nodes with unique IDs; all reachable from entry |

Every node has `id`, `document`, `effect`, `approval` and `on`. Multiple nodes may refer to the
same instruction document; its full text describes the named steps. No template language or second
Markdown-anchor parser is involved. Labels share the title's length/control-character rules.
Scope/range choices are the initial shared-control vocabulary; unsupported values fail explicitly.
Their declarations do not implement those controls or claim a live runtime capability.

## Routing and approvals

An `analysis` node has `approval: "none"` and exactly `complete`, `blocked`, `failed` outcomes.
An `edit`, `commit`, `ticket`, `merge` or `deploy` node has `approval: "explicit"` and exactly
`succeeded`, `denied`, `failed`, `partial` outcomes. Each node declares one effect, so each action
requires its own preview and explicit approval. Approval is not a successful execution outcome.

Each outcome target is exactly one of:

- `{ "kind": "step", "id": "next-node" }` — a declared local node;
- `{ "kind": "end", "status": "complete" }` — terminal `complete`, `blocked`, `failed`, `cancelled` or `partial`;
- `{ "kind": "handoff", "to": "person", "target": "project-owner" }` — `person`, `team`, `agent` or `external`.

`blocked`/`failed`/`partial` outcomes must end in their matching recoverable status; `denied` ends
in `cancelled`. They cannot silently retry, hand off or imply success. Success may continue to a node,
terminal or declared handoff. Local self-loops, multi-node cycles, missing targets and unreachable
nodes fail validation. A deliberate rework/redirect can become a new explicit run later.

External targets are adapter/config binding slugs, never arbitrary URLs or credentials. Other
handoff targets are labels. All are inert declarations. The future runner must resolve live agents,
people/teams and adapter allowlists, enforce permissions, detect cross-package loops and record
actual routing/provider results. A handoff declaration is not a sent message.

## Files and limits

JSON manifests/catalogs are limited to 128 KiB each; Markdown documents/examples to 256 KiB each.
Asset reads are bounded and UTF-8 decoding is strict. Declared paths cannot contain absolute paths,
empty/dot/parent components, backslashes, URL/drive syntax, percent escapes, query/fragment syntax,
control characters or `.git` components (case-insensitive). Documents/examples must be nonempty
regular files within the canonical package directory, including after resolving symlinks.
Nested paths and symlinks that stay in the package are allowed. Destinations use the same lexical
`.md` rules but are not opened, created or granted access by this loader.

The caller chooses a trusted local package directory. This is not an HTTP path resolver or a
sandbox against a concurrently modified filesystem. A future request-derived project destination
must still enter `Registry.resolve()` and the existing root/write guards. Catalog ID/family/example
must agree with the referenced package. No package is returned after any error.

## Runtime boundary

Optional schedules belong to future run configuration and will use the same package entry as manual
runs. A package-level `schedule` field is unsupported in v1; this does not prohibit scheduling a
package later. No timers, schedule approval, HTTP/UI integration, code execution, materialization,
Git writes, external sends or run state are implemented by this module.

Run Markdown must eventually retain inputs, owner, plan, evidence, questions, findings, checks,
decisions, approvals, transitions and outcomes. Tests/review bind to the exact target SHA; changes
invalidate readiness. Every generated document requires a full actual `last-commit-id`; a first run
chooses its baseline, a missing/unreachable marker requires a new explicit baseline, and uncommitted
files remain separate. Markers advance only after all writes and routed outputs succeed, including
no-content-change success, and none advance after failed/partial runs. These are runtime obligations,
not implemented by loading templates. Template placeholders carry no verified SHA or approval.

Manual/scheduled execution, permission enforcement and full Feature/delivery acceptance remain open.
Adding other flow families should extend packages and routing rather than create domain screens.

The design and limits of the pure analysis-run core (checkpoint A) are in `Plans/R3/FLOW-RUNTIME-CORE.md` of the mdhouse repository; they are not part of the installed reference.
