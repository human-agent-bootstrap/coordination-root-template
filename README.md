# <PROJECT-NAME>

Coordination root for agent-assisted work across multiple repositories. This repo owns
plans, contracts, ownership, and release candidates. It owns **no product code** — that
lives in the service repositories pinned under `services/`.

Use it when several people (and their agents) change several repos toward one goal and
you need the result to be verifiable rather than merely merged.

## Start here

```bash
git clone --recurse-submodules https://github.com/<ORG>/<PROJECT-NAME>.git
cd <PROJECT-NAME>
npm ci
npm test
npm run verify:registry
```

A fresh repo is green with zero services and zero changes. Then:

```bash
# 1. Register the repositories this project coordinates.
npm run service:add -- --id <service-id> --repo https://github.com/<ORG>/<repo>.git --apply

# 2. Open a change (one user-facing goal, any number of services).
npm run change:create -- --change CHG-<NAME>-001 --apply

# 3. Hand one work unit to one writer, human or agent.
npm run bootstrap -- --change CHG-<NAME>-001 --unit <work-unit> --writer <name> --run run-001 --apply
```

## Read next

| File | Purpose |
|---|---|
| [AGENTS.md](./AGENTS.md) | The contract every agent and writer follows. Start here. |
| [USAGE.md](./USAGE.md) | 한 스프린트를 이 레포로 굴리는 전체 순서 (한글) |
| [WORKFLOW.md](./WORKFLOW.md) | The process: change → work units → review → candidate |
| [QUICKSTART.md](./QUICKSTART.md) | Local validation commands |
<!-- example:start -->
| [examples/todo](./examples/todo) | A complete worked run of the whole cycle |
<!-- example:end -->

`CLAUDE.md` exists only so Claude Code discovers `AGENTS.md`; it holds no rules.

## Layout

```text
services/registry.yaml       which repos exist: path, stack, owners, verify commands
changes/<CHANGE-ID>/         plan, work units, contract, PR/SHA records, candidates
changes/_TEMPLATE/           skeleton for a new change
scripts/                     dry-run-by-default coordination tooling
<!-- example:start -->
examples/todo/               worked example; remove it once you have your own
<!-- example:end -->
```

## What the tooling guarantees

- A work unit's `repo` must resolve to a registered service.
- Two concurrent work units may not claim the same paths in the same repo.
- A release candidate pins **exact merge SHAs** for any subset of services, and is
  verified against the checked-out submodule snapshot.
- Agents never merge, approve, deploy, or touch secrets. People do that.

No Docker required.
