# <PROJECT-NAME>

GitHub coordination root for agent-assisted work across private service repositories.
This repo owns plans, contracts, ownership, PR evidence, and release candidates. It owns
**no product code** — that lives in repositories pinned under `services/`.

Use it when several people (and their agents) change several repos toward one goal and
you need the result to be verifiable rather than merely merged.

## Start here

```bash
git clone --recurse-submodules https://<GITHUB-HOST>/<ORG>/<PROJECT-NAME>.git
cd <PROJECT-NAME>
npm ci
npm run init -- --name <repo> --org <org> \
  --github-host github.com \
  --coordinator-owner @<org>/<team> --apply
npm test
npm run verify:registry
```

For this team's organization, use `--org DSPACE-OG087301-AAA --github-host github.com`.
The template remains organization-neutral; `init` writes those values into the new Root.

A fresh repo is green with zero services and zero changes. Then:

```bash
# 1. Register the repositories this project coordinates.
#    A new service must already have one minimal anchor commit.
npm run service:add -- --id <service-id> \
  --repo https://<GITHUB-HOST>/<ORG>/<repo>.git \
  --owners @<org>/<team> --verify "<cmd>,<cmd>" --apply
git add .gitmodules services/registry.yaml services/<service-id>
git commit -m "chore: register <service-id>"

# 2. Open a change (one user-facing goal, any number of services).
npm run change:create -- --change CHG-<NAME>-001 \
  --services <service-a>,<service-b> --apply

# 3. Hand one work unit to one writer, human or agent.
npm run bootstrap -- --plan-sha <approved-root-merge-sha> \
  --change CHG-<NAME>-001 --unit <work-unit> --writer <name> --run run-001 --apply
```

## Read next

| File | Purpose |
|---|---|
| [RUNBOOK.md](./RUNBOOK.md) | 사람을 위한 전체 운영 절차와 명령 레퍼런스 |
| [AGENTS.md](./AGENTS.md) | 모든 Agent와 Writer가 지키는 실행 계약 |
<!-- example:start -->
| [examples/TUTORIAL.md](./examples/TUTORIAL.md) | 실제 submodule로 한 사이클을 실행하는 선택형 실습 |
| [examples/todo](./examples/todo) | A complete worked run of the whole cycle |
<!-- example:end -->

`CLAUDE.md` exists only so Claude Code discovers `AGENTS.md`; it holds no rules.

## Layout

```text
services/registry.yaml       GitHub repos: path, stack, owners, verify commands
changes/<CHANGE-ID>/         plan, work units, contract, PR/SHA records, candidates
changes/_TEMPLATE/           skeleton for a new change
scripts/                     dry-run-by-default coordination tooling
<!-- example:start -->
examples/todo/               worked example; remove it once you have your own
<!-- example:end -->
```

## What the tooling guarantees

- A work unit's `repo` must resolve to a registered service.
- Active work units across all Changes may not claim overlapping paths in one service.
- A release candidate pins **exact merge SHAs** for any subset of services, and is
  verified against the checked-out snapshot and the target branch's current pointers.
- Candidate evidence covers every acceptance-criterion ID in the approved plan.
- Recorded implementation PRs are checked against GitHub before candidate approval.
- Pull-request CI runs the exact PR head on an isolated hosted runner without organization
  secrets or private submodules; trusted `main` CI performs the credentialed re-check.
- Final candidates run root `e2e/*.test.mjs` tests when the project has a testable
  cross-repository scenario; an absent suite is reported as skipped, not as passing evidence.
- Coding agents work without GitHub credentials and stop after verified local commits.
- A Work Unit runs in one exclusive workspace: an existing clean checkout, worktree,
  separate clone, or agent-managed sandbox.
- A new service starts from a minimal anchor commit. Its first implementation Work Unit
  may use `write_paths: ["**"]`; later units must use specific paths.
- On the corporate Wi-Fi, people push those commits, create and merge PRs, and assemble
  the Root Candidate. Agents never merge, approve, deploy, or touch secrets.

The Root is the enforcement point. Service repositories keep their own CI and owners;
their workflow files are not modified by this template. No Docker required.
