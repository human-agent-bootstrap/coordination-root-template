# Status — CHG-TODO-002

**State:** IN_PROGRESS

## Scope amendment

The human approver explicitly required a project-specific `.gitignore` in both child implementation PRs. Root records that one allowed-path amendment here before implementation approval; all other scope remains unchanged.

## Scope

Create-only vertical slice:

- Back: FastAPI `POST /todos` with in-memory storage
- Front: React + TypeScript form with a browser-session result list
- No read API, database, authentication, update, delete, or production deployment

## Work units

| Work unit | Repository | State | Gate |
|---|---|---|---|
- `contract-and-plan` | Root | merged | Approved plan SHA `2ccb7dda6732cd71d3b87b2a89024a008a3ea8f0` |
| `todo-create-api` | Back | draft review | PR #1; independent review findings under remediation |
| `todo-create-ui` | Front | draft review | PR #1; independent review findings under remediation |
| `independent-review` | Read-only | not started | Both implementation PRs available |
| `candidate-integration` | Root | not started | Implementation PRs reviewed and human-merged |

## Evidence boundary

- Root base SHA: `960fabbd498b0bb09bad69267439f7291b34426f`
- Front base SHA: `e9f0fb31c9f72fdf1c3a30923c3d7b62a69d3166`
- Back base SHA: `75c54550c79d5a86ab6685c3de428ff3fd261586`
- No product implementation has started.
- No implementation Agent has been dispatched.
- No implementation, candidate, release, or deployment claim exists yet.

## Next gate

A human reviews and approves the Root planning PR. After that PR merges, its merge SHA becomes the immutable plan version supplied to the parallel Front and Back Agents.
