# Quick Start

## Requirements

- Git with submodule support
- Node.js 22+ (CI uses Node 26)
- npm

## Validate the coordination state

```bash
npm ci
npm test                                    # framework tests
npm run verify:registry                     # registry <-> .gitmodules <-> manifests
npm run verify:candidate -- --detect        # verify whichever candidate is checked in
git submodule status
```

All four pass on a fresh repo with no services and no changes.

## Register a service

```bash
npm run service:add -- --id billing --repo https://github.com/<ORG>/billing.git \
  --stack python-fastapi --owners @payments-team          # dry run
npm run service:add -- --id billing --repo https://github.com/<ORG>/billing.git \
  --stack python-fastapi --owners @payments-team --apply
```

`verify:registry` then confirms the registry and `.gitmodules` agree.

## Open a change

```bash
npm run change:create -- --change CHG-BILLING-001            # dry run
npm run change:create -- --change CHG-BILLING-001 --apply
```

Fill in the `<...>` placeholders in `changes/CHG-BILLING-001/`, then have a human approve
the plan and contract before any implementation starts.

## Dispatch one work unit

```bash
npm run bootstrap -- --change CHG-BILLING-001 --unit billing-api \
  --writer alice --run run-001                              # dry run
npm run bootstrap -- --change CHG-BILLING-001 --unit billing-api \
  --writer alice --run run-001 --apply
```

The task packet lands in `.task-packets/` (gitignored). It is an execution input, not
evidence: verification results come from actually running the declared commands.

Writing a packet never creates a branch or a worktree. Isolating a writer's workspace
stays a deliberate, human-approved step:

```bash
git -C <service-repo> worktree add -b <type>/<CHANGE-ID>/<work-unit> <path> <base-sha>
```

## Check scope before you push

```bash
npm run workflow:check
```

It derives the change and work unit from the current branch name and fails if the diff
leaves the unit's declared `write_paths`.

Read `WORKFLOW.md` before acting on a packet, and `AGENTS.md` before letting an agent act.
