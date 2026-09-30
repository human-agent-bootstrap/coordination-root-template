# CHG-ORCH-001 — Local orchestration UI MVP

## State

- Status: DRAFT
- Coordinator: jpyoon
- Required approvers: product owner and an independent reviewer
- Plan base: d6998c8d30f38cb35d4b0c22e7ba3f459e989248
- Tracking: none

## Goal

Let a coordinator turn a structured planning meeting into validated Coordination Root
artifacts and, after human plan approval, issue ready-to-use task packets without editing
Markdown or YAML by hand.

## Non-goals

- Registering services or changing submodule pointers.
- Creating commits, pushes, pull requests, reviews, merges, candidates, or deployments.
- Creating worker branches or workspaces, starting AI agents, or tracking their runtime.
- Connecting to Jira, Notion, GitHub, or a shared database.
- Multi-user editing, authentication, and remote hosting.

## User flow

1. The coordinator starts the local server and sees the current Root path, branch, HEAD,
   dirty state, registered services, and existing Changes.
2. During a planning meeting, the coordinator records the outcome, non-goals, user flow,
   acceptance criteria, contracts, Work Units, writers, paths, dependencies, and checks in
   a guided Korean-first workflow.
3. The coordinator reviews the human-readable plan, generated file previews, repository
   diff, unresolved decisions, and validation results before explicitly saving.
4. The service atomically writes a new `changes/{CHANGE-ID}/` artifact set compatible with
   the existing CLI and leaves planning approval to the existing Git/PR process.
5. After the planning merge SHA is locally available and reachable from `main` or
   `origin/main`, the coordinator selects an eligible Work Unit and creates its task packet.

## Acceptance criteria

- [AC-001] A first-time coordinator can create a complete Change draft without directly
  editing Markdown, YAML, glob syntax, branch names, or base SHAs.
- [AC-002] The meeting flow captures a goal, at least one non-goal, at least one observable
  acceptance criterion, participating services, contracts or an explicit no-contract
  decision, and one or more implementation Work Units.
- [AC-003] Branch names, Work Unit IDs, service base SHAs, standard artifact paths, inherited
  verification commands, and initial PR/Candidate skeletons are derived by the service and
  remain visible in an advanced review.
- [AC-004] Unknown services, duplicate identifiers, unassigned writers, empty write scopes,
  missing checks, dependency cycles, unmet dependencies, and concurrent path overlaps block
  approval readiness with a plain-language explanation and a link to the relevant input.
- [AC-005] Before saving, the UI shows every generated file, the proposed diff, unresolved
  decisions, and the result and exit code of the existing strict registry validation.
- [AC-006] Saving a new Change is atomic, refuses to overwrite an existing Change, and yields
  artifacts accepted by `npm run verify:registry -- --change {CHANGE-ID} --strict`.
- [AC-007] Task packet generation is blocked unless the full plan SHA is locally available
  and reachable from `main` or `origin/main`, the Change is approved or active, the Work Unit
  is ready or in progress, its writer matches, and every non-planning dependency is merged.
- [AC-008] A successful task-packet operation uses the existing bootstrap rules and displays
  the output path, manifest digest, contract digests, and packet SHA-256.
- [AC-009] The server binds to `127.0.0.1` by default, accepts only structured operations for
  the current Root, and does not expose a generic command or filesystem API.
- [AC-010] Unit and integration tests, strict registry validation, and a real-browser flow for
  planning preview/save and pre-approval packet blocking pass after the final implementation.

## Contracts

- Shared snapshots: `contracts/orchestration-ui.md`
- Compatibility/migration: the existing CLI and repository artifacts remain canonical; the
  UI is an additional adapter and introduces no data migration.

## Order

- Merge order: merge this planning PR before beginning `planning-ui-mvp`; merge the verified
  implementation PR after independent review.
- Deploy order: not applicable; this is a local development tool.
- Activation: explicit `npm run ui`; no feature flag.

## Risks

- A UI-only validation path could drift from CLI behavior; detect this with shared domain
  functions and parity tests that exercise both adapters.
- Direct writes could leave partial or stale files; detect revision drift before save and use
  staging plus atomic rename with failure-path tests.
- A browser endpoint could become an arbitrary command or file-write surface; keep operations
  allowlisted and rooted under the current repository, and test traversal and unsupported
  operation rejection.
- Progressive disclosure could hide governance rather than simplify it; test that novice
  users can complete the meeting flow while advanced review exposes exact SHAs, paths,
  dependencies, commands, and generated files.

## Rollback

| Item | Plan |
|---|---|
| Trigger | Existing CLI incompatibility, partial writes, unsafe path access, or failed required checks |
| Owner | Coordinator |
| Kill switch | Stop the local server and remove the unmerged implementation branch |
| Code recovery | Revert the implementation PR or continue using the existing CLI |
| Data recovery | Restore the affected uncommitted Change directory from the pre-save preview/diff |
| Verification | Run the existing CLI tests and strict registry validation without starting the UI |

## Stop conditions

- A contract change is required.
- A `base_sha` or dependency SHA changed.
- Authentication, remote persistence, external connectors, Agent execution, or deployment
  enters scope.
- A required verification cannot be run.
- Implementation requires writing outside the approved Work Unit paths.
