# Status — CHG-TMPL-001

**State:** COMPLETE

## Scope

Separate the reusable coordination framework from the TODO instance. The framework is
domain-free and green on an empty repository; the TODO case moves to `examples/todo/` and
is reinstallable via `init --with-example`.

## Work units

| Work unit | Repository | State | Gate |
|---|---|---|---|
| `template-extraction` | Root | merged | Root PR #9 |

## Evidence

- Plan base SHA: `62bf5ea32b0f3ab6427bfbf099f3d6bafd37701e`
- Root merge SHA: `b62bc0516e72f972d3c42490933ff426e8c1b146`
- Framework tests: 25 passing at the historical merge
- Example suite: 4 passing
- Empty-project state: `verify:registry` and `verify:candidate --detect` both pass with
  zero services and zero candidates
- Three-service rehearsal (`ingest`/`retrieval`/`evaluator`): registry `--strict` passes, a
  2-of-3 candidate verifies, packets inherit registry verify commands, and an overlapping
  `write_paths` pair fails under `--strict`
- TODO candidate via `init --with-example`: verifies at `front@c33b5990`, `back@4530e5d5`

## Deferred at this historical point

Epic layer and `contract:lint` remained intentionally out of scope. PR/API verification,
acceptance-criteria evidence, and remote-reachability checks were added later.

## Next gate

No further gate. This Root-only change shipped through PR #9 and produced no service
Candidate.
