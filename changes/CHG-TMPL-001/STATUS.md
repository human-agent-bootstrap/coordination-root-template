# Status — CHG-TMPL-001

**State:** IN_PROGRESS

## Scope

Separate the reusable coordination framework from the TODO instance. The framework is
domain-free and green on an empty repository; the TODO case moves to `examples/todo/` and
is reinstallable via `init --with-example`.

## Work units

| Work unit | Repository | State | Gate |
|---|---|---|---|
| `template-extraction` | Root | in progress | Human review of the restructuring |

## Evidence

- Plan base SHA: `62bf5ea32b0f3ab6427bfbf099f3d6bafd37701e`
- Framework tests: 25 passing
- Example suite: 4 passing
- Empty-project state: `verify:registry` and `verify:candidate --detect` both pass with
  zero services and zero candidates
- Three-service rehearsal (`ingest`/`retrieval`/`evaluator`): registry `--strict` passes, a
  2-of-3 candidate verifies, packets inherit registry verify commands, and an overlapping
  `write_paths` pair fails under `--strict`
- TODO candidate via `init --with-example`: verifies at `front@c33b5990`, `back@4530e5d5`

## Not done in this change

Epic layer, `reconcile-prs.mjs`, acceptance-criteria IDs, `contract:lint`, and
remote-reachability enforcement. Each needs its own change.

## Next gate

A human reviews the restructuring. No candidate is produced: this change ships no service
code and pins no submodule.
