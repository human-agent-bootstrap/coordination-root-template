# Workflow Contract

This repository is a vendor-neutral coordination repository. `WORKFLOW.md` is the canonical instruction file; do not add tool-specific instruction files as a substitute.

## Start

1. Read `changes/<CHANGE-ID>/PLAN.md`, `WORK_UNITS.yaml`, and the approved contract under `contracts/`.
2. Select exactly one declared work unit.
3. Confirm its repository, branch, base SHA, allowed paths, dependencies, and verification commands.
4. Use an isolated branch and worktree. One work unit has one writer.

Use this prompt format with any coding agent:

```text
Read WORKFLOW.md and execute work unit <WORK-UNIT-ID> for change <CHANGE-ID>.
Do not exceed its declared write scope.
```

## Boundaries

- Root coordination files and submodule pointers are Coordinator-only.
- Front and Back writers modify only their assigned child repository and declared paths.
- Never directly commit or push to `main`; never force-push, merge, approve PRs, alter settings, access secrets, deploy, or publish packages.
- Do not infer an API shape: use the approved snapshot in `changes/<CHANGE-ID>/contracts/`.
- A branch name must be `<type>/<CHANGE-ID>/<work-unit>` and start at the manifest `base_sha`.

## Bootstrap and verification

`npm run bootstrap -- --change <CHANGE-ID> --unit <work-unit> --writer <name> --run <id>` is dry-run by default. Add `--apply` only to write a task packet; it never creates a worktree automatically.

Run each work unit's manifest commands and report their actual exit codes. The Coordinator runs:

```bash
npm test
npm run workflow:check
npm run verify:candidate
```

## Required handoff

Use the handoff block in [`AGENTS.md`](./AGENTS.md) §7. Do not keep a second copy of that schema here.

## Stop and ask a human

Stop if scope expansion, a contract conflict, a changed dependency/base SHA, secrets or production access, destructive work, or an unavailable required validation is encountered. Do not fabricate passing evidence.
