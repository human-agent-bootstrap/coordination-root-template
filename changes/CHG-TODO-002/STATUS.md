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
| `contract-and-plan` | Root | merged | Approved plan SHA `2ccb7dda6732cd71d3b87b2a89024a008a3ea8f0` |
| `todo-create-api` | Back | review passed | PR #1 at `accb1cef2bc3358d5c7865541b1abc3a7ac9db3f`; awaiting human merge decision |
| `todo-create-ui` | Front | review passed | PR #1 at `27ec065d46ddead00b4c98468ff658d9751f0252`; awaiting human merge decision |
| `independent-review` | Read-only | passed | Final verdict: SHIP for both current heads |
| `candidate-integration` | Root | not started | Implementation PRs reviewed and human-merged |

## Evidence boundary

- Root base SHA: `960fabbd498b0bb09bad69267439f7291b34426f`
- Approved plan SHA: `2ccb7dda6732cd71d3b87b2a89024a008a3ea8f0`
- Front base SHA: `e9f0fb31c9f72fdf1c3a30923c3d7b62a69d3166`
- Back base SHA: `75c54550c79d5a86ab6685c3de428ff3fd261586`
- Front implementation head: `27ec065d46ddead00b4c98468ff658d9751f0252`; local checks, remote CI, and final independent review passed.
- Back implementation head: `accb1cef2bc3358d5c7865541b1abc3a7ac9db3f`; local checks, remote CI, full served OpenAPI parity, and final independent review passed.
- No implementation PR has been human-merged yet.
- No candidate, release, or deployment claim exists yet.

## Next gate

Merge this Root scope-amendment PR, then humans review and decide whether to merge the Front and Back implementation PRs. Candidate integration starts only after both implementation merges.
