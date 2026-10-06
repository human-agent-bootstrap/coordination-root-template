# <PROJECT-NAME>

GitHub coordination root for agent-assisted work across private service repositories.
This repo owns plans, contracts, ownership, PR evidence, and release candidates. It owns
**no product code** — that lives in repositories pinned under `services/`.

Use it when several people (and their agents) change several repos toward one goal and
you need the result to be verifiable rather than merely merged.

## Local planning UI

After registering service repositories, a coordinator can run the planning meeting without
editing Markdown or YAML directly:

```bash
npm ci
npm run ui
```

Open the address the command prints — it carries a per-session access token in the URL
fragment, required for the planning-PR step. The guided meeting creates a new Change preview,
runs the existing strict registry validation, shows every generated artifact, and writes the
complete `changes/<CHANGE-ID>/` directory only after explicit confirmation.

If exactly one `changes/<CHANGE-ID>/WORK_UNITS.yaml` has `state: draft`, the UI treats it as
the active Change and restores its plan, scope, Work Units, and contracts for continued editing.
New UI drafts include `DRAFT.json` as their lossless editing source; legacy drafts are reconstructed
from `PLAN.md`, `WORK_UNITS.yaml`, and contract snapshots. The Change ID stays fixed, and saving
updates the generated artifacts while preserving unmodeled files. More than one draft Change is
invalid and must be resolved before the UI can open a planning session.

Once the draft is saved, the review step offers three steps that end at the planning PR:

1. **승인 요청으로 확정** rewrites the saved artifacts with `state: approved` and promotes every
   implementation Work Unit that declares verification commands to `state: ready`. These values
   must be inside the planning PR, because dispatch reads the manifest at the plan SHA. A Work
   Unit without verification commands blocks the transition instead of shipping an undispatchable
   plan.
2. **계획 PR 올리기** creates `change/<CHANGE-ID>/coordination` from `origin/main`, commits only
   `changes/<CHANGE-ID>/`, pushes, and opens the pull request with `gh`. It records the PR number
   in `PRS.yaml` on the same branch.
3. **병합 상태 확인** reads the PR after a human merges it and fills in the merge SHA.

The UI never merges a pull request, force-pushes, pushes to `main`, moves submodule pointers,
creates a workspace, or starts an Agent. Review and merge stay on GitHub, and `AGENTS.md` still
governs what implementation agents may do inside each service repository.

With the merge SHA in hand, open **작업 지시서 만들기** and create the eligible Work Unit packets.
The same approval and dependency rules as `npm run bootstrap` apply. Packets stay local under
`.task-packets/`; each Writer regenerates them from the same plan SHA and compares hashes.

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
#    Omit --apply first to inspect the dry run; the repository name becomes the service ID.
npm run service:add -- \
  --repo https://<GITHUB-HOST>/<ORG>/<repo>.git \
  --stack <detected-stack> --apply
git add .gitmodules services/registry.yaml services/<service-id>
git commit -m "chore: register <service-id>"

# 2. Open a change (one user-facing goal, any number of services).
npm run change:create -- --change CHG-<NAME>-001 \
  --services <service-a>,<service-b> --apply

# 3. Hand one work unit to one writer, human or agent.
npm run bootstrap -- --plan-sha <approved-root-merge-sha> \
  --change CHG-<NAME>-001 --unit <work-unit> --writer <name> --run run-001 --apply

# 4. The writer drives that packet to a pull request.
npm run writer -- start --packet run-001 --apply
npm run writer -- check --packet run-001
npm run writer -- pr --packet run-001 --apply
```

## Read next

| File | Purpose |
|---|---|
| [RUNBOOK.md](./RUNBOOK.md) | 사람을 위한 전체 운영 절차와 명령 레퍼런스 |
| [AGENTS.md](./AGENTS.md) | 모든 Agent와 Writer가 지키는 실행 계약 |
| [WRITER.md](./WRITER.md) | 작업 지시서를 받은 Writer의 실행 안내 |
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
- `service:add` derives the service ID from the repository name and records the URL owner as
  a low-detail default. Omitting `--verify` is allowed; every active Work Unit must then declare
  its own verification commands.
- A new service starts from a minimal anchor commit. Its first implementation Work Unit
  may use `write_paths: ["**"]`; later units must use specific paths.
- On the corporate Wi-Fi, people push those commits, create and merge PRs, and assemble
  the Root Candidate. Agents never merge, approve, deploy, or touch secrets.

The Root is the enforcement point. Service repositories keep their own CI and owners;
their workflow files are not modified by this template. No Docker required.
