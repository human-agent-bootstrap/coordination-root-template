# Example — a two-service TODO feature

A complete worked run of this coordination workflow: a plan-first change, an approved
API contract, two services implemented in parallel by different agents, independent
review, and an exact-SHA release candidate. Read it to see what the framework expects;
it is not part of the framework itself.

## What actually happened

| Stage | Evidence |
|---|---|
| Baseline change | `changes/CHG-TODO-001` — contract and work units, never implemented |
| Delivered change | `changes/CHG-TODO-002` — the create-only vertical slice |
| Parallel work | Back `POST /todos` (FastAPI) and Front create form (React + TS), separate repos and worktrees |
| Independent review | `SHIP` verdict recorded for both implementation heads |
| Candidate | `front@c33b5990dbca3379597deb02aa2bbb746de01dd3`, `back@4530e5d500557d46dfcdcc6c101f6163af0017db` |
| Cross-repo proof | `e2e/candidate.test.mjs` boots both services and drives a real browser |

`changes/CHG-TODO-002/STATUS.md` records the full PR and merge-SHA trail.

## Install it so you can run it

```bash
node scripts/init-project.mjs --name <repo> --org <org> --with-example --apply
```

That copies this example's `changes/` and `e2e/` into the live tree, registers the two
services from `registry.yaml`, and adds the submodules from `gitmodules.example`. Then:

```bash
npm run verify:registry
npm run verify:candidate -- --detect
npm run test:example
```

For the browser E2E, copy the steps in `ci-snippet.yml` into your CI and run
`npm run test:e2e -- --change CHG-TODO-002` locally with both services installed.

## Read it without installing

- `changes/CHG-TODO-002/PLAN.md` — goal, non-goals, acceptance criteria, stop conditions
- `changes/CHG-TODO-002/WORK_UNITS.yaml` — how one change splits into owned, non-overlapping work units
- `changes/CHG-TODO-002/contracts/todo-api.openapi.yaml` — the contract that let Front and Back proceed in parallel
- `changes/CHG-TODO-002/releases/candidate-001.yaml` — the exact SHA combination that was verified

The narrative write-ups live one directory above this repository:
`collaboration-workflow.md`, `feature-planning-workflow.md`, and `todo-multirepo-demo-plan.md`.
