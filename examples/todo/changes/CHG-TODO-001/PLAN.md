# CHG-TODO-001 — TODO collaboration demo

## Goal

Prepare the plan-first root baseline for a Front and Back TODO implementation. The feature itself is explicitly out of scope for this change snapshot: both child repositories are empty baseline commits.

## Scope

- Root workflow contract, quick start, change manifests, approved OpenAPI snapshot, safe task-packet bootstrap, local validation, CI, and PR template.
- Pin Front and Back child repositories to their exact empty baseline SHAs.

## Non-goals

- TODO UI, HTTP server, persistence, authentication, Docker, deployment, or child-repository changes.
- Merge, release approval, or repository-policy changes.

## Approved contract and dependency order

`contract` is complete in this root baseline. `todo-api` and `todo-ui` may begin only from the contract and in their own repositories; `candidate-integration` follows both work units.

```text
contract
├── todo-api (Back)
└── todo-ui  (Front)
    └── candidate-integration (Root, after both)
```

The compatibility path is additive provider implementation, consumer implementation, then a separately approved candidate update. No feature is released by this baseline.

## Acceptance criteria

- A recursive clone exposes both child repositories at the candidate SHAs.
- A user can read `WORKFLOW.md`, inspect the work units and OpenAPI snapshot, create a dry-run task packet, and run local tests without Docker.
- Validation rejects a wrong branch and candidate SHA mismatch.

## Risks and stop conditions

Contract changes, base-SHA drift, scope expansion, unavailable verification, secrets, production access, destructive operations, merge, or deployment require human coordination.
