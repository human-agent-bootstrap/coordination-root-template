# Orchestration UI contract

## Canonical state

- The Git working tree remains the source of truth. The UI does not introduce a database.
- A planning save creates a new `changes/{CHANGE-ID}/` directory containing `PLAN.md`,
  `WORK_UNITS.yaml`, `STATUS.md`, `PRS.yaml`, `contracts/`, and
  `releases/candidate-001.yaml`.
- Existing CLI commands remain supported and must accept UI-produced artifacts.

## Local API boundary

The server binds to `127.0.0.1` and accepts JSON only for these operations:

- read Root status, registered services, and existing Changes;
- validate and preview one structured Change draft;
- atomically save one new validated Change;
- inspect dispatch eligibility for an existing approved Change;
- create one task packet through the existing bootstrap rules.

The API does not accept a command string, arbitrary executable, arbitrary filesystem path,
GitHub credential, or remote repository mutation. Identifiers use the repository's existing
allowlist and all generated paths must remain under `changes/` or `.task-packets/`.

## Planning draft

A draft contains:

- a Change ID, title, coordinator, goal, non-goals, and observable acceptance criteria;
- selected registered service IDs;
- either an explicit no-shared-contract decision or named UTF-8 contract snapshots;
- implementation Work Units with goal, service, one writer, requested path scope,
  dependencies, and verification commands.

The server derives Work Unit IDs and branches when omitted, resolves service base SHAs from
the Root gitlinks, and inherits registry verification commands when no override is supplied.
Generated values remain visible in preview and are never represented as observed approval or
runtime evidence.

## State and approval boundary

- A meeting save produces a draft planning artifact set; it does not approve the plan.
- Human Git review and merge remain outside the server.
- Task-packet creation requires the same plan SHA reachability, Change state, Work Unit state,
  writer, and dependency checks as `scripts/bootstrap.mjs`.
- A packet is an execution input, not proof that a branch, workspace, Agent run, review, CI,
  merge, Candidate, or deployment exists.

## Failure behavior

- Preview and validation do not mutate the repository.
- Saving refuses an existing Change ID and stale preview revision.
- A failed save leaves no partial target directory.
- Validation returns field-addressable errors and the underlying check exit code/output.
- Any change to plan inputs invalidates the displayed validation result and requires a new
  preview before save.