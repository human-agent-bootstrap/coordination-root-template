# Coordination Root 실행 Runbook

> 기준일: 2026-09-30
> 목적: 여러 서비스와 여러 AI 도구가 참여하는 Change를 동일한 계획, 계약, 작업 경계와 증거로 완료한다.

## 1. 핵심 원칙

```text
1 Change = 하나의 사용자 결과
1 Work Unit = 1 Writer = 1 Branch = 1 Workspace
```

- Coordination Root는 제품 코드를 소유하지 않는다.
- Root는 계획, 계약, Work Unit, PR/SHA, Candidate와 완료 증거를 관리한다.
- Claude, Codex 등 AI 도구를 통일하지 않고 Task Packet과 결과 증거를 통일한다.
- Agent는 로컬 구현, 검증, commit과 handoff까지만 수행한다.
- 사람 또는 CI가 push, PR, 승인, merge, Candidate와 배포를 담당한다.
- Worktree는 필수가 아니다. 다른 Writer와 공유하지 않는 workspace가 필수다.

## 2. 역할

| 역할 | 책임 |
|---|---|
| Coordinator | 계획·계약·Work Unit·상태·Candidate 관리 |
| Writer | 할당된 서비스와 경로만 구현하고 검증 |
| Reviewer | Writer와 독립적으로 PR 검토 |
| Service Owner | 서비스 PR merge |
| Release Owner | Candidate와 staging 결과 승인 |

## 3. 프로젝트 최초 준비

Coordination Root는 프로젝트마다 한 번 만들고 서비스도 한 번 등록한다.

필수 환경은 Git(submodule 지원), Node.js 22 이상과 npm이다. CI는 Node.js 26을 사용한다.
`init`, `service:add`, `change:create`, `bootstrap`은 기본적으로 dry run이며 `--apply`를
붙였을 때만 파일을 변경한다.

```bash
npm ci
npm run init -- --name <root-name> --org <org> \
  --github-host github.com \
  --coordinator-owner @<org>/<team> --apply

npm run service:add -- \
  --repo https://github.com/<org>/<service-repo>.git \
  --stack <detected-stack> \
  --apply

npm run verify:registry
git add .gitmodules services/registry.yaml services/<service-id>
git commit -m "chore: register <service-id>"
```

서비스와 Change가 없는 새 Root에서도 `npm test`, `npm run verify:registry`,
`npm run verify:candidate -- --detect`, `git submodule status`가 정상 종료되어야 한다.
`change:create`는 현재 checkout이 아니라 이 Root commit의 submodule gitlink를
`base_sha`로 사용하므로, 서비스 등록을 먼저 commit해야 한다.
`service:add`는 저장소 이름을 서비스 ID로 사용하고 URL의 조직 또는 사용자를 기본 owner로
기록한다. `--apply`를 빼고 먼저 dry run으로 확인한다. 서비스 등록 시 `--verify`는 생략할 수
있지만, 실행 상태로 전환할 Work Unit에는 검증 명령을 반드시 선언해야 한다.

### 네트워크와 자격 증명

| 구간 | 주체 | 수행 작업 |
|---|---|---|
| 사내 Wi-Fi | 사람/CI | clone, fetch, push, PR·리뷰·merge, 원격 검증 |
| 외부망 | Writer/Agent | 준비된 commit으로 구현, 로컬 검증·commit·handoff |

- Agent에게 PAT나 `COORDINATION_GITHUB_TOKEN`을 전달하지 않는다.
- 사람의 Git/`gh` 인증에는 회사가 승인한 PAT를 사용한다.
- PR CI는 GitHub-hosted runner에서 secret과 private submodule 없이 PR head를 검사한다.
- `main` push CI만 self-hosted runner에서 private submodule과
  `COORDINATION_GITHUB_TOKEN`을 사용해 원격 PR/Candidate 검증을 다시 수행한다.
- `main`은 직접 push를 금지하고 PR CI와 CODEOWNERS 승인을 요구하는 보호 규칙을 적용한다.
- 토큰은 환경 변수나 Actions Secret으로만 제공하고 파일, Task Packet, 로그, 명령줄,
  commit에 기록하지 않는다.
- GitHub.com 조직은 `GH_HOST=github.com`을 사용한다. 별도 GitHub Enterprise Server를
  사용하는 경우에만 `init`의 host/API 값을 변경한다.

### 신규 서비스

아직 레포가 없다면 Planning 전에 다음만 준비한다.

```text
원격 레포 생성
→ README.md 최소 최초 commit
→ main push
→ Root에 service:add
```

최초 commit은 `base_sha`를 만들기 위한 anchor다. 프로젝트 구조나 CI를 미리 만들 필요는 없다.

신규 서비스의 최초 기능 Work Unit만 전체 경로를 허용한다.

```yaml
write_paths:
  - "**"
```

조건:

- 단일 Writer가 담당한다.
- 프로젝트 최소 구조, CI, 테스트와 첫 기능을 함께 구현한다.
- 최초 PR merge 이후 모든 Work Unit은 구체적인 경로를 사용한다.
- 별도 bootstrap Work Unit은 만들지 않는다.

## 4. Change Planning

Coordinator가 Change를 생성한다.

### 로컬 회의형 UI 사용

CLI와 Markdown 직접 편집 대신 로컬 UI에서 회의를 진행할 수 있다.

```bash
npm run ui
# http://127.0.0.1:4173
```

UI에서 목표, 비목표, 성공 기준, 참여 서비스, 작업 단위, 담당자, 수정 범위, 의존성과
계약을 순서대로 작성한다. 저장 전에는 생성 파일과 strict registry 검증 결과를 확인한다.
저장하면 `changes/<CHANGE-ID>/` 전체 산출물이 생성되지만, 이는 계획 승인을 의미하지 않는다.
기존 절차대로 Planning PR을 독립 검토하고 병합해야 한다.

병합 후 UI의 **작업 시작 문서**에서 Planning merge SHA를 입력한다. SHA가 `main` 또는
`origin/main`에서 확인되고 Work Unit의 상태, 담당자와 의존성이 유효할 때만
`.task-packets/<run-id>.md`를 생성할 수 있다. UI는 commit, push, PR, merge, workspace 생성,
Agent 실행 또는 Candidate 조립을 수행하지 않는다.

```bash
npm run change:create -- \
  --change CHG-<NAME>-001 \
  --services <service-a>,<service-b> \
  --apply
```

다음을 확정한다.

- 사용자 목표와 비목표
- 검증 가능한 Acceptance Criteria
- 서비스 간 API·인증·이벤트 계약
- Work Unit별 Writer, branch와 `write_paths`
- `depends_on`
- 서비스별 검증 명령
- Reviewer와 merge 이후 staging 검증 방법

서비스 Work Unit 예시:

```yaml
- id: chat-service-implementation
  repo: chat-service
  state: ready
  goal: 인증된 사용자의 질문을 받아 응답을 반환한다.
  writer: d
  branch: feat/CHG-CHAT-001/chat-service-implementation
  base_sha: <full-service-commit-sha>
  write_paths:
    - src/chat/**
    - src/llm/**
    - src/auth/**
    - tests/**
  depends_on:
    - contract-and-plan
  verify:
    - npm test
    - npm run lint
```

`base_sha`는 Planning이 생성하는 commit이 아니다. Change 생성 시 Root의 서비스 submodule이
가리키던 기존 서비스 commit이다. 신규 서비스라면 최소 anchor commit이 첫 `base_sha`다.
로컬 submodule checkout이 Root gitlink와 다르면 `change:create`는 실패한다.

승인 전에는 활성 Work Unit의 경로 충돌도 검사한다.

```bash
npm run verify:registry -- --change CHG-<NAME>-001 --strict
```

기본 실행은 겹치는 `write_paths`를 warning으로 보고하고, `--strict`는 이를 실패로 처리한다.
같은 서비스의 경로가 겹치는 작업은 하나로 합치거나 `depends_on`으로 순서를 정한다.
`state: merged` 또는 `state: aborted`인 Work Unit은 활성 경로 예약에서 제외된다.

`ready`/`in_progress` Work Unit의 의존성은 `merged` 상태여야 한다. 유일한 예외는
planning unit(`contract-and-plan`)이다. planning unit은 자기 자신의 PR로 merge되므로
merge 전에 작성되는 manifest가 이를 `merged`로 기록할 수 없고, 대신 bootstrap의
plan SHA 검증(`origin/main` 도달 가능성)이 planning merge를 증명한다. 따라서 구현
Work Unit은 Planning PR 안에서 바로 `state: ready`로 승인할 수 있다.

Planning PR을 독립 리뷰 후 merge하고 merge SHA를 기록한다.

```bash
GH_HOST=github.com gh pr view <planning-pr-number> \
  --json mergeCommit --jq .mergeCommit.oid
```

구현은 Planning PR merge 전에는 시작하지 않는다.

## 5. Writer 사전 준비

### Root가 아직 없는 경우

기존 서비스 clone은 그대로 사용하고 Root만 추가로 clone한다.

```bash
git clone --no-recurse-submodules <root-url> <root-path>
git -C <root-path> fetch origin
git -C <root-path> switch --detach <planning-merge-sha>
npm --prefix <root-path> ci

git -C <existing-service-repo> fetch origin
git -C <existing-service-repo> cat-file -e <base-sha>^{commit}
```

마지막 명령은 `base_sha`가 로컬에 존재하는지 확인한다. 성공 시 출력 없이 exit code `0`을
반환한다.

### Workspace 선택

다음 중 하나를 사용할 수 있다.

1. 기존 clean checkout
2. Git worktree
3. 별도 clone
4. Agent 하네스가 만든 격리 workspace

기존 checkout을 사용하는 경우:

```bash
git -C <service-repo> switch -c \
  feat/CHG-<NAME>-001/<work-unit> \
  <base-sha>
```

기존 작업이 있거나 여러 Change·Agent를 병렬 실행하는 경우:

```bash
git -C <service-repo> worktree add \
  -b feat/CHG-<NAME>-001/<work-unit> \
  <workspace-path> \
  <base-sha>
```

Agent 하네스가 workspace를 자동 생성하면 해당 기능을 사용한다. 어떤 방식을 사용하든 다음을
만족해야 한다.

- Work Unit 전용 branch
- 다른 Writer와 공유하지 않는 workspace와 Git index
- `HEAD`가 `base_sha`와 같거나 그 후손
- 시작 시 관련 없는 로컬 변경 없음
- 실제 작업 경로를 `workflow-check --repo-path`에 전달할 수 있음

Branch에는 Agent, 모델 또는 vendor 이름을 넣지 않는다. 실행 provenance는 Task Packet,
handoff와 commit trailer에 기록한다.

## 6. Task Packet 생성과 AI 지시

Writer의 Root clone에서 Task Packet을 생성한다.

```bash
npm --prefix <root-path> run bootstrap -- \
  --plan-sha <planning-merge-sha> \
  --change CHG-<NAME>-001 \
  --unit <work-unit> \
  --writer <writer> \
  --run <run-id> \
  --apply
```

`bootstrap`은 Task Packet만 생성한다. branch나 workspace는 만들지 않는다.
Packet에는 plan SHA, Work Unit, `base_sha`, `write_paths`, 계약 snapshot과 SHA-256,
검증 명령, manifest SHA-256과 packet SHA-256이 들어간다. 분산된 Writer는 같은 plan SHA에서
Packet을 다시 생성하고 hash가 일치하는지 확인할 수 있다.

AI 도구에는 다음과 같이 지시한다.

```text
Root의 AGENTS.md와 .task-packets/<run-id>.md를 읽으세요.
승인된 plan SHA를 기준으로 지정된 Work Unit만 수행하세요.
write_paths 밖을 수정하거나 계약의 빈 내용을 추측하지 마세요.
범위 확대 또는 계약 결정이 필요하면 멈추고 보고하세요.
모든 검증 명령을 실행하고 실제 exit code를 기록하세요.
push, PR 생성, merge는 하지 마세요.
완료하면 표준 handoff를 작성하세요.
```

## 7. 구현, 검증과 로컬 Handoff

Writer 또는 Agent는 할당된 workspace에서 구현하고 Work Unit의 검증 명령을 실행한다.

Root의 범위 검증도 실행한다.

반드시 Root clone을 현재 디렉터리로 두고 실행한다.

```bash
(cd <root-path> && node scripts/workflow-check.mjs \
  --plan-sha <planning-merge-sha> \
  --change CHG-<NAME>-001 \
  --unit <work-unit> \
  --repo-path <service-workspace>)
```

검증 완료 후 Work Unit branch에 로컬 commit을 만들고 최종 commit에서 검증을 다시 실행한다.

```bash
git -C <service-workspace> add <declared-paths>
git -C <service-workspace> commit
git -C <service-workspace> rev-parse HEAD
```

Commit은 Conventional Commit 형식을 사용하고 다음 trailer를 남긴다.

```text
Change-ID: <CHANGE-ID>
Work-Unit: <work-unit>
Agent-Run-ID: <run-id>
```

Handoff:

```text
Change ID:
Work Unit ID:
Run ID:
Repository:
Branch:
Base SHA:
Head SHA:
Plan SHA:
Changed files:
Commands and exit codes:
Checks not run:
Contract deviations:
Known risks:
Next action:
```

필수 검증을 실행하지 못했거나 계약 이탈이 있으면 완료로 보고하지 않는다.

## 8. Push, PR과 Merge

사내 Wi-Fi에서 사람 Writer 또는 Service Owner가 handoff와 로컬 SHA를 확인한다.
PR 생성 시 `.github/pull_request_template.md`를 작성하고 미실행 검증도 숨기지 않는다.

```bash
git -C <service-workspace> status
git -C <service-workspace> rev-parse HEAD
git -C <service-workspace> push -u origin <work-unit-branch>
```

이후 순서:

```text
PR 생성
→ CI
→ Writer가 아닌 Reviewer 승인
→ Service Owner merge
→ merge SHA 확인
```

Squash merge에서는 PR head SHA와 merge SHA가 다르다. Candidate에는 merge SHA를 사용한다.

```bash
GH_HOST=github.com gh pr view <pr-number> --repo <org>/<repo> \
  --json mergeCommit --jq .mergeCommit.oid
```

Writer가 Coordinator에게 전달할 최종 증거:

```text
PR 번호
Base SHA
PR head SHA
Merge SHA
CI 결과
Reviewer 승인
계약 이탈과 미실행 검증
```

Coordinator는 `PRS.yaml`과 `STATUS.md`에 이 증거를 기록한다. `verify:prs`는 기록된
모든 PR이 merge된 상태를 전제로 하므로 일부 PR만 merge된 시점에는 실행하지 않고,
Candidate 단계(9장)에서 한 번 실행한다.

## 9. Candidate 조립과 통합 검증

모든 서비스 PR이 merge되면 Coordinator가 각 submodule을 정확한 merge SHA로 맞추고
Candidate를 작성한다.

Candidate는 registry 전체가 아니라 이번 Change에 필요한 서비스 부분집합만 포함할 수 있다.

```yaml
services:
  - repo: web-client
    base_sha: <frontend-base-sha>
    sha: <frontend-merge-sha>
    source_prs: [frontend-chat-client]

  - repo: chat-service
    base_sha: <chat-base-sha>
    sha: <chat-merge-sha>
    source_prs: [chat-service-implementation]
```

검증:

```bash
npm run verify:registry
npm run verify:prs -- --change CHG-<NAME>-001
npm run verify:candidate -- \
  --change CHG-<NAME>-001 \
  --target-ref origin/main
# e2e/*.test.mjs가 있는 경우
npm run test:e2e
```

`verify:prs`는 GitHub API 네트워크와 `COORDINATION_GITHUB_TOKEN`이 필요하다. Agent의
외부망 로컬 단계에서는 실행하지 않는다. Root의 `origin`은 HTTPS와
`git@<host>:<org>/<repo>.git` 형식을 모두 지원한다.

Candidate PR은 candidate 파일과 함께 `WORK_UNITS.yaml`도 갱신한다. 자신의
`candidate-integration` unit에 실제 base SHA(planning merge SHA 또는 그 후손)를 기록하고,
merge된 구현 Work Unit을 `state: merged`로 표시한다. 이 경로들은 candidate-integration의
`write_paths`에 선언되어 있다.

통합 환경과 검증 가능한 시나리오가 있는 경우 Candidate PR에서 `e2e/` suite를 추가하고
`npm run test:e2e`를 실행한다. 명시적으로 실행한 `test:e2e`는 테스트가 0개면 실패하지만,
자동 Candidate 게이트는 suite가 없으면 `skipped`로 기록하며 이를 통과 증거로 취급하지 않는다.
`e2e/**`는 선택적으로 추가할 수 있도록 candidate-integration의 `write_paths`에 포함된다.
`verify:candidate --target-ref`는 target pointer, ancestry, 원격 도달성, squash merge
commit 범위와 모든 `AC-*`의 증거를 검사한다. 다만 증거 설명이 실제 Acceptance Criteria를
충분히 만족하는지는 사람이 검토한다.

앞선 Candidate가 같은 서비스의 Root pointer를 먼저 변경했다면 현재 Candidate의
`base_sha`가 stale해질 수 있다. 앞선 Candidate가 Root `main`에 merge된 뒤 현재 Candidate를
rebase하고, 새 target을 기준으로 전체 검증과 필요한 승인을 다시 수행한다.

Candidate PR은 사내 Wi-Fi에서 필수 검증 3종과, 가능한 경우 E2E를 실행한 뒤 구현 Writer와
독립된 사람이 승인한다.
PR CI는 의도적으로 secret을 받지 않으므로 GitHub API 검증을 대신하지 않는다. Candidate PR
merge 후에는 신뢰된 `main` 코드가 self-hosted CI에서 PR/SHA와 Candidate를 다시 검증하고,
E2E suite가 있으면 함께 실행한다. 적용 가능한 staging 검증까지 통과해야 완료다.
`STATUS.md`에는 planning SHA, 서비스별 merge SHA, CI와 실행한 E2E 증거, 다음 gate를 기록한다.
Candidate PR 자신의 merge SHA만 기록하기 위한 별도 Closure PR은 만들지 않는다.

## 10. 변경 중단과 재승인

다음 상황에서는 구현을 멈추고 Coordinator에게 보고한다.

- `write_paths` 밖의 수정 필요
- 승인된 계약으로 구현 불가능
- API·인증·이벤트 형식을 추측해야 함
- `base_sha`, dependency SHA 또는 plan SHA 변경
- secret, 운영 권한 또는 파괴적 작업 필요
- 필수 검증 실행 불가

계약, 범위, base SHA 또는 필수 검증이 바뀌면 영향받는 Work Unit의 기존 승인은 무효다.
Coordinator가 Root 변경을 승인받고 새 plan SHA로 Task Packet을 다시 생성한다.

## 11. 완료 기준

다음 항목이 모두 충족되어야 `STATUS.md`를 COMPLETE로 변경한다.

- Planning PR 독립 승인 및 merge
- 모든 Writer가 승인된 plan SHA와 base SHA를 사용
- 모든 변경이 선언된 `write_paths` 안에 있음
- 모든 서비스 PR이 CI와 독립 리뷰를 통과
- `PRS.yaml`과 실제 GitHub SHA가 일치
- Candidate가 PR head SHA가 아닌 merge SHA를 사용
- 모든 Acceptance Criteria에 실행 또는 리뷰 증거가 있음
- Candidate 검증과 Root Candidate PR 승인 완료
- Root `main` CI와 staging 통합 테스트 통과
- 필수 미실행 검증이나 계약 이탈이 남아 있지 않음

최종 흐름:

```text
서비스 사전 등록과 anchor SHA 준비
→ Change Planning 및 계약 승인
→ Task Packet 발급
→ Writer별 독립 workspace에서 병렬 구현
→ 로컬 검증·commit·handoff
→ 사람이 push·PR·review·merge
→ Coordinator가 merge SHA 기록
→ exact-SHA Candidate 검증
→ Candidate merge와 staging 검증
→ STATUS.md COMPLETE
```

## 12. 명령 레퍼런스

| 명령 | 용도 |
|---|---|
| `npm run init` | 템플릿을 프로젝트 값으로 초기화 |
| `npm run service:add` | 서비스 등록과 submodule 추가 |
| `npm run change:create` | 승인 전 Change skeleton 생성 |
| `npm run bootstrap` | 승인된 Work Unit의 Task Packet 생성 |
| `npm run workflow:check` | Root PR의 Work Unit 범위 검사 |
| `node scripts/workflow-check.mjs ...` | 서비스 workspace의 branch·base·경로 검사 |
| `npm run verify:registry` | registry, submodule, manifest와 경로 예약 검사 |
| `npm run verify:prs` | 기록된 PR, SHA와 독립 승인을 GitHub와 대조 |
| `npm run verify:candidate` | exact-SHA Candidate와 Acceptance Criteria 증거 검사 |
| `npm test` | Root 도구 테스트 |
| `npm run test:e2e` | Root의 cross-repository E2E 실행 |

`verify:candidate -- --detect`는 현재 checkout과 일치하는 Candidate를 찾는 로컬 편의
기능이다. 승인 게이트에서는 Change와 `--target-ref`를 명시한다.
