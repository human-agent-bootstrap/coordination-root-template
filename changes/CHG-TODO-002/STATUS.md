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
| `todo-create-api` | Back | merged | PR #1 merge SHA `4530e5d500557d46dfcdcc6c101f6163af0017db` |
| `todo-create-ui` | Front | merged | PR #1 merge SHA `c33b5990dbca3379597deb02aa2bbb746de01dd3` |
| `independent-review` | Read-only | passed | Final verdict: SHIP for both reviewed heads |
| `candidate-integration` | Root | verified | Candidate 001 passed exact-SHA Root, child, contract, and API/browser-origin checks; awaiting human approval |

## Evidence boundary

- Root base SHA: `960fabbd498b0bb09bad69267439f7291b34426f`
- Approved plan SHA: `2ccb7dda6732cd71d3b87b2a89024a008a3ea8f0`
- Front base SHA: `e9f0fb31c9f72fdf1c3a30923c3d7b62a69d3166`
- Back base SHA: `75c54550c79d5a86ab6685c3de428ff3fd261586`
- Front implementation head: `27ec065d46ddead00b4c98468ff658d9751f0252`; local checks, remote CI, and final independent review passed.
- Back implementation head: `accb1cef2bc3358d5c7865541b1abc3a7ac9db3f`; local checks, remote CI, full served OpenAPI parity, and final independent review passed.
- Both implementation PRs were human-merged and their `main` push CI runs passed.
- Candidate 001 currently pins Front `c33b5990dbca3379597deb02aa2bbb746de01dd3` and Back `4530e5d500557d46dfcdcc6c101f6163af0017db`.
- No candidate approval, release, or deployment claim exists yet.

## Next gate

Run review of the Root candidate PR and decide whether to approve the exact Front/Back SHA combination. Production release remains out of scope.
