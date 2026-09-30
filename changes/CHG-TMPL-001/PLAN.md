# CHG-TMPL-001 — Extract a reusable coordination template

## State

- Status: APPROVED
- Coordinator: whdvlf94
- Plan base: 62bf5ea32b0f3ab6427bfbf099f3d6bafd37701e

## Goal

Turn this repository from "the TODO demo" into a coordination root any team can clone for
any project, with the TODO case preserved as an installable worked example.

## Non-goals

- Epic-level grouping (`epics/`, roll-up status)
- Automated GitHub PR reconciliation was out of scope for this historical change.
- Acceptance-criteria IDs and `verify-acceptance.mjs`
- `npm run contract:lint`
- Remote-reachability enforcement in `verify-candidate.mjs`
- Renaming the GitHub repository or setting its "Template repository" flag (web UI)

## Acceptance criteria

- A fresh project with zero services and zero changes is green: `npm test`,
  `verify:registry`, and `verify:candidate --detect` all pass.
- `verify-candidate.mjs` supports N services and any subset of the registry, with no
  `front`/`back` assumption.
- `verify-registry.mjs` fails when a work unit names an unregistered repo, and reports
  concurrent work units that claim overlapping `write_paths` in one repo.
- Task packets derive contract paths from the change and inherit verify commands from the
  service registry.
- Root CI assumes no service stack; cross-repo E2E and the example suite are opt-in.
- `init-project.mjs` leaves no TODO reference and no unresolved placeholder, and removes
  the example and this repository's own change records unless `--with-example` is given.
- The existing TODO candidate still verifies at `front@c33b5990`, `back@4530e5d5` when the
  example is installed.

## Risks

- The submodule deregistration is destructive: the root no longer pins a live candidate.
  Recovered by `init --with-example`, which reinstalls both services and their changes.
- The `yaml` dependency is the repository's first runtime dependency. Accepted because
  three hand-rolled indent parsers were the larger risk.

## Stop conditions

- A framework change would make a fresh, empty project fail any check.
- `AGENTS.md` would name a command or path that does not resolve.
