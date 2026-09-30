# Status — CHG-ORCH-001

**State:** DRAFT

## Scope

Add a local meeting-oriented UI that creates and validates Coordination Root Change artifacts
and, only after human plan approval, creates task packets through the existing bootstrap
rules. GitHub automation, service registration, workspace creation, Agent execution,
Candidate assembly, deployment, external connectors, and multi-user hosting remain out of
scope.

## Work units

| Work unit | Repository | State | Gate |
|---|---|---|---|
| `contract-and-plan` | Root | in_progress | Human plan and contract approval |
| `planning-ui-mvp` | Root | ready | Approved planning merge SHA and generated task packet |
| `candidate-integration` | Root | draft | Implementation PR independently reviewed and human-merged |

## Evidence boundary

- Root base SHA: `d6998c8d30f38cb35d4b0c22e7ba3f459e989248`
- Implementation base SHA: see `WORK_UNITS.yaml`
- No implementation has started.
- No implementation agent has been dispatched.
- No candidate, release, or deployment claim exists yet.

Verify recorded PR and SHA rows against GitHub:

```bash
npm run verify:prs -- --change CHG-ORCH-001
```

## Next gate

A human reviews and approves the Root planning PR. Its merge SHA becomes the immutable plan
version used to generate the `planning-ui-mvp` task packet for writer `jpyoon`.
