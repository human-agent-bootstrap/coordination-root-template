# Status — <CHANGE-ID>

**State:** DRAFT

## Scope

<One paragraph: what this change adds, and the explicit non-goals.>

## Work units

| Work unit | Repository | State | Gate |
|---|---|---|---|
| `contract-and-plan` | Root | draft | Human plan and contract approval |
| `<back-work-unit>` | Back | not started | Approved plan merge SHA |
| `<front-work-unit>` | Front | not started | Approved plan merge SHA |
| `independent-review` | Read-only | not started | Both implementation PRs available |
| `candidate-integration` | Root | not started | Implementation PRs reviewed and human-merged |

## Evidence boundary

- Root base SHA: `<ROOT_BASE_SHA>`
- Front base SHA: `<FRONT_BASE_SHA>`
- Back base SHA: `<BACK_BASE_SHA>`
- No implementation has started.
- No implementation agent has been dispatched.
- No candidate, release, or deployment claim exists yet.

Regenerate the PR and SHA rows from GitHub rather than editing them by hand:

```bash
node scripts/reconcile-prs.mjs --change <CHANGE-ID>
```

## Next gate

A human reviews and approves the Root planning PR. Its merge SHA becomes the immutable plan version supplied to the parallel Front and Back agents.
