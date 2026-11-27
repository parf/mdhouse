# Review recent commits — run run-587e600a19db2b39

<!-- last-commit-id: 33fd379e45b7708a64e3578e7ea6f60a08e0e6bf -->

Status: **held** · current step: `scope` · range `33fd379e45b7..4350f12b9ffa` (1 commits)

## Run

```json
{
  "runId": "run-587e600a19db2b39",
  "startedAt": "2026-11-27T23:52:40.235Z",
  "trigger": {
    "kind": "manual",
    "actor": "tester"
  },
  "root": "p",
  "package": "recent-commits-review",
  "base": "33fd379e45b7708a64e3578e7ea6f60a08e0e6bf",
  "target": "4350f12b9ffa3ac06a96dffa783047bb10046471",
  "scope": "selected-project",
  "audience": "development",
  "output": "commit-review",
  "destination": "Plans/flows/recent-commits-review.md",
  "runDocument": "Plans/flows/runs/recent-commits-review/20261127T235240Z-587e600a.md"
}
```

## Plan

1. ▶ `scope` — analysis, instructions: `workflow.md`
2. `summaries` — analysis, instructions: `workflow.md`
3. `risks` — analysis, instructions: `workflow.md`
4. `delivery-sync` — analysis, instructions: `workflow.md`
5. `report` — analysis, instructions: `workflow.md`

## Evidence

- ✅ explicit commit range and selected filters
- ❓ diffs and reproduction evidence
- ❓ linked plans documentation and task state

Holds:

```json
[
  "Missing evidence: diffs and reproduction evidence",
  "Missing evidence: linked plans documentation and task state"
]
```

## Commits in range

```json
[
  "4350f12b9ffa3ac06a96dffa783047bb10046471 c2"
]
```

## Uncommitted (not in range)

None.

## Findings

_The analyst writes findings here, each with its evidence and severity._

## Checks

_Checks run and their results._

## Transitions

```json
[]
```

## Outcome

Open — no outcome yet.

## Run state

Maintained by mdhouse; edits here are rejected by replay.

```json mdhouse-flow-state
{
  "input": {
    "runId": "run-587e600a19db2b39",
    "startedAt": "2026-11-27T23:52:40.235Z",
    "package": {
      "schemaVersion": 1,
      "id": "recent-commits-review",
      "title": "Review recent commits",
      "family": "commit-review",
      "entry": "scope",
      "defaults": {
        "scope": "selected-project",
        "range": "explicit-baseline",
        "audience": "development",
        "output": "commit-review",
        "destination": "Plans/flows/recent-commits-review.md"
      },
      "evidence": {
        "required": [
          "explicit commit range and selected filters",
          "diffs and reproduction evidence",
          "linked plans documentation and task state"
        ],
        "missing": "block"
      },
      "example": "example.md",
      "steps": [
        {
          "id": "scope",
          "document": "workflow.md",
          "effect": "analysis",
          "approval": "none",
          "on": {
            "complete": {
              "kind": "step",
              "id": "summaries"
            },
            "blocked": {
              "kind": "end",
              "status": "blocked"
            },
            "failed": {
              "kind": "end",
              "status": "failed"
            }
          }
        },
        {
          "id": "summaries",
          "document": "workflow.md",
          "effect": "analysis",
          "approval": "none",
          "on": {
            "complete": {
              "kind": "step",
              "id": "risks"
            },
            "blocked": {
              "kind": "end",
              "status": "blocked"
            },
            "failed": {
              "kind": "end",
              "status": "failed"
            }
          }
        },
        {
          "id": "risks",
          "document": "workflow.md",
          "effect": "analysis",
          "approval": "none",
          "on": {
            "complete": {
              "kind": "step",
              "id": "delivery-sync"
            },
            "blocked": {
              "kind": "end",
              "status": "blocked"
            },
            "failed": {
              "kind": "end",
              "status": "failed"
            }
          }
        },
        {
          "id": "delivery-sync",
          "document": "workflow.md",
          "effect": "analysis",
          "approval": "none",
          "on": {
            "complete": {
              "kind": "step",
              "id": "report"
            },
            "blocked": {
              "kind": "end",
              "status": "blocked"
            },
            "failed": {
              "kind": "end",
              "status": "failed"
            }
          }
        },
        {
          "id": "report",
          "document": "workflow.md",
          "effect": "analysis",
          "approval": "none",
          "on": {
            "complete": {
              "kind": "end",
              "status": "complete"
            },
            "blocked": {
              "kind": "end",
              "status": "blocked"
            },
            "failed": {
              "kind": "end",
              "status": "failed"
            }
          }
        }
      ]
    },
    "packageDigest": "f4d8eac17b8679ceb9bbdcfd2fdbbdd2fa6b615c8f8ee7d93e68d2ebeaa0e5aa",
    "selection": {
      "scope": "selected-project",
      "range": "explicit-baseline",
      "audience": "development",
      "output": "commit-review",
      "destination": "Plans/flows/recent-commits-review.md",
      "root": "p",
      "sources": [
        {
          "id": "commit-range",
          "path": "commits/33fd379e45b7-4350f12b9ffa",
          "digest": "b37cc58865a62443aba8f07f18b7be323e2fb7f6685291d417fea49d3f9affe6"
        },
        {
          "id": "run-document",
          "path": "Plans/flows/runs/recent-commits-review/20261127T235240Z-587e600a.md",
          "digest": "d1c30abb444c0384b9404e18561cae45d1bc08b9767ae9a7b9bc95631d8c0159"
        }
      ],
      "base": "33fd379e45b7708a64e3578e7ea6f60a08e0e6bf",
      "target": "4350f12b9ffa3ac06a96dffa783047bb10046471",
      "dirtySourceIds": []
    },
    "evidence": [
      {
        "label": "explicit commit range and selected filters",
        "status": "supplied",
        "sourceIds": [
          "commit-range"
        ],
        "note": "1 commits, read by mdhouse from git"
      },
      {
        "label": "diffs and reproduction evidence",
        "status": "missing",
        "sourceIds": [],
        "note": "Not yet supplied"
      },
      {
        "label": "linked plans documentation and task state",
        "status": "missing",
        "sourceIds": [],
        "note": "Not yet supplied"
      }
    ],
    "questions": []
  },
  "version": 0,
  "nodeId": "scope",
  "status": "held",
  "evidence": [
    {
      "label": "explicit commit range and selected filters",
      "status": "supplied",
      "sourceIds": [
        "commit-range"
      ],
      "note": "1 commits, read by mdhouse from git"
    },
    {
      "label": "diffs and reproduction evidence",
      "status": "missing",
      "sourceIds": [],
      "note": "Not yet supplied"
    },
    {
      "label": "linked plans documentation and task state",
      "status": "missing",
      "sourceIds": [],
      "note": "Not yet supplied"
    }
  ],
  "questions": [],
  "holds": [
    "Missing evidence: diffs and reproduction evidence",
    "Missing evidence: linked plans documentation and task state"
  ],
  "warnings": [],
  "events": [],
  "unsupported": null
}
```

```json mdhouse-flow-meta
{"rootId":"p","runPath":"Plans/flows/runs/recent-commits-review/20261127T235240Z-587e600a.md","trigger":{"kind":"manual","actor":"tester"},"marker":"33fd379e45b7708a64e3578e7ea6f60a08e0e6bf","commits":["4350f12b9ffa3ac06a96dffa783047bb10046471 c2"],"dirty":[],"seal":{"key":"4cdf1b8543776a38","mac":"6192e63fcff3c8273dfad113bd3df179ea2fc5aedd974f3ca14b89faafa4a83f"}}
```
