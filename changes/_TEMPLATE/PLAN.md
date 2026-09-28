# <CHANGE-ID> — <short title>

## State

- Status: DRAFT
- Coordinator: <name>
- Required approvers: <product-owner>, <front-owner>, <back-owner>
- Plan base: <ROOT_BASE_SHA>

## Goal

<One sentence of user-visible value. Not an implementation description.>

## Non-goals

- <explicitly out of scope>
- <explicitly out of scope>

## User flow

1. <observable step>
2. <observable step>

## Acceptance criteria

State results a test can observe. "The screen works" is not a criterion.

- <input rule, including boundary values>
- <success response shape and status code>
- <error response shape and status code>
- Front unit/component tests pass.
- Back unit/API tests pass.
- Front + Back end-to-end passes against the candidate SHA combination.

## Contracts

- API: `contracts/<name>.openapi.yaml`
- Events: <none | schema>
- Database: <none | migration plan>

## Order

- Merge order: <which PR first, and why>
- Deploy order: <service order>
- Activation: <feature flag or none>

## Risks

- <risk and its detection signal>

## Rollback

| Item | Plan |
|---|---|
| Trigger | <error rate, latency, data mismatch threshold> |
| Owner | <who decides to stop> |
| Kill switch | <flag, route block, consumer pause, or none> |
| Code recovery | <previous artifact digest or forward fix> |
| Data recovery | <restore, replay, backfill, or not applicable> |
| Verification | <what to check after recovery> |

## Stop conditions

- A contract change is required.
- A `base_sha` or dependency SHA changed.
- Authentication, persistence, or deployment enters scope.
- A required verification cannot be run.
