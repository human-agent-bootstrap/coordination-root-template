# CHG-TODO-002 — Create a TODO

## State

- Status: DRAFT
- Coordinator: `whdvlf94`
- Required approvers: product owner, Front owner, Back owner
- Root base SHA: `960fabbd498b0bb09bad69267439f7291b34426f`
- Front base SHA: `e9f0fb31c9f72fdf1c3a30923c3d7b62a69d3166`
- Back base SHA: `75c54550c79d5a86ab6685c3de428ff3fd261586`

`DRAFT` is not implementation authority. Front and Back work starts only after this planning change is approved, merged, and its Root merge SHA is recorded as the plan SHA.

## Problem

The collaboration demo has a Root workflow baseline but no product behavior. The first vertical slice must be small enough to compare two parallel Agent implementations while still exercising a real contract and browser-to-API integration.

## User story

As a user, I can enter a TODO title, create the TODO through the React interface, and immediately see the created TODO in the current browser-session list.

## Goal

- Implement `POST /todos` in Python with FastAPI.
- Keep created TODOs in Back in-memory storage; restarting the server resets them.
- Implement a React + TypeScript creation form.
- Append the successful API response to a browser-session list without adding a read endpoint.
- Exercise separate Back and Front Agents in parallel against one approved OpenAPI contract.
- Run one independent Agent review per implementation PR before human approval.
- Build a Root candidate from the final Front and Back merge SHAs and verify the exact combination.

## Non-goals

- `GET /todos` or page reload recovery
- TODO update, completion, or deletion
- Authentication or per-user ownership
- Database or durable persistence
- Pagination, sorting, filtering, or offline support
- Production deployment
- Agent merge, release, repository settings, secrets, or force-push

## User flow

1. The user enters a title in the React form.
2. Blank or whitespace-only input cannot be submitted.
3. The user selects **Create**.
4. Front sends `POST /todos` using the approved request shape.
5. FastAPI trims and validates the title, creates an in-memory TODO, and returns `201`.
6. Front appends the returned TODO to its current browser-session list.
7. On API failure, Front displays an error and lets the user retry.

## Functional requirements

### Back — FastAPI

- Python 3.12+ with FastAPI and Pydantic v2.
- `POST /todos` accepts JSON `{ "title": string }`.
- The server trims surrounding whitespace before validation and storage.
- A valid title contains 1–100 characters after trimming.
- A successful response uses status `201` and returns `id`, `title`, and `completed`.
- `completed` is `false` when created.
- `id` is a non-empty opaque string.
- An invalid title returns status `400` with the approved error body.
- Created records live in process memory only.

### Front — React + TypeScript

- A labeled title input and Create button are available by keyboard.
- Blank or whitespace-only input is not submitted.
- The form prevents duplicate submission while the request is pending.
- On success, the returned TODO is appended to a list held in browser memory.
- The input clears after success.
- On failure, an accessible error message is shown and retry remains possible.
- Front uses the approved OpenAPI shape and does not import Back internals.
- Component tests use contract-aligned HTTP mocks so Front and Back can work in parallel.

## Acceptance criteria

1. `POST /todos` with `{ "title": "  Buy milk  " }` returns `201` with title `Buy milk`, a non-empty `id`, and `completed: false`.
2. Missing, empty, whitespace-only, or over-100-character titles return `400` with `code: INVALID_TITLE`.
3. The React form does not send blank or whitespace-only titles.
4. While the request is pending, duplicate creation is prevented.
5. A `201` response causes the returned TODO to appear in the current browser-session list.
6. An API error is visible to the user and a retry can be made.
7. Back `pytest`, Ruff, and mypy checks pass at the reviewed Back head SHA.
8. Front unit/component tests, ESLint, typecheck, and Vite build pass at the reviewed Front head SHA.
9. Independent Agent review reports no unresolved P0/P1 issue for each implementation PR.
10. Root candidate validation pins the final Front and Back merge SHAs reachable from their remote `main` branches.
11. Browser E2E proves the approved exact-SHA combination can create and display a TODO.
12. PR checks and the subsequent `main` push checks are both observed.

## Dependency graph

```text
contract-and-plan (Root)
├── todo-create-api (Back, FastAPI) ─┐
├── todo-create-ui (Front, React TS) ├── independent-review
│                                    └── human merge approvals
└──────────────────────────────────────── candidate-integration (Root)
```

Front and Back implementation may run in parallel only after the planning PR is approved and merged. Candidate integration waits for both human-approved implementation merges.

## Merge, release, and activation

1. Merge the Root planning PR after product, Front, and Back review.
2. Run Front and Back work units in parallel from the recorded base SHAs.
3. Open independent implementation PRs and run independent Agent reviews.
4. A human decides whether each implementation PR may merge.
5. Record final merge SHAs, not pre-merge PR head SHAs.
6. Create a separate Root candidate PR that updates submodule pointers and candidate records.
7. Run exact-SHA integration and browser E2E.
8. A human approves the candidate. Production release is out of scope for this pilot.

## Verification design

### Back

```bash
python -m pytest
python -m ruff check .
python -m mypy app
```

### Front

```bash
npm ci
npm test -- --run
npm run lint
npm run typecheck
npm run build
```

### Root candidate

```bash
npm test
node scripts/verify-candidate.mjs --change CHG-TODO-002
npm run test:e2e -- --change CHG-TODO-002
```

The Root candidate verifier and E2E command are required before candidate approval. If they do not yet support CHG-TODO-002, the candidate gate is blocked until that automation is implemented and observed; no PASS may be inferred.

## Collaboration experiment

- Back implementation writer: one Agent, one Back worktree, one branch.
- Front implementation writer: a different Agent, one Front worktree, one branch.
- No implementation Agent may edit Root coordination files or the sibling repository.
- A third independent Agent reviews each resulting PR read-only.
- Human reviewers make planning, merge, and candidate decisions.
- The evaluation focuses on scope compliance, contract fidelity, verification evidence, handoff quality, and exact-SHA reproducibility rather than model preference.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| FastAPI defaults to `422` for request validation while the contract requires `400` | Back must add and test contract-aligned validation/error handling. |
| Front and Back interpret title normalization differently | OpenAPI and acceptance examples define server trimming and Front blank prevention. |
| Front mocks drift from the API | Review mock examples against the approved contract; verify with exact-SHA E2E. |
| CORS or API base URL blocks integration | Candidate E2E uses an explicit local API base URL and approved local origins. |
| Squash merge changes commit identity | Candidate records the final merge SHA from GitHub after merge. |
| Agent changes scope or contract | Stop the run and return to Root planning; do not silently widen the PR. |
| Root automation is still CHG-TODO-001-specific | Generalize the needed validation before candidate approval and test the new behavior. |

## Stop conditions

Stop and ask a human if any of these occurs:

- Product scope expands beyond create-only behavior.
- The approved OpenAPI contract must change.
- A declared base SHA is no longer the intended starting point.
- Front or Back needs to modify files outside its declared paths.
- A required command cannot run or produces ambiguous evidence.
- Secrets, production access, deployment, repository settings, force-push, or destructive actions are required.
- The implementation cannot preserve compatibility between independent Front and Back work.

## Rejected options

| Option | Decision | Reason |
|---|---|---|
| Add `GET /todos` in this Change | Rejected | It expands the first pilot and is unnecessary for proving create integration. |
| Add SQLite persistence | Rejected | In-memory storage isolates the collaboration workflow from migration and persistence concerns. |
| Run Back then Front sequentially | Rejected | The pilot is intended to test parallel Agents against an approved contract. |
| Let implementation Agents merge | Rejected | Human approval and exact evidence are explicit governance requirements. |
| Use one Agent for implementation and review | Rejected | Independent read-only Agent review provides a clearer quality and handoff test. |

## Open decisions

- Named human reviewers must be assigned before changing the state to `APPROVED`.
- Candidate E2E automation ownership must be assigned before implementation PRs merge.
