# USAGE — 이 레포지토리로 스프린트를 진행하는 방법

이 문서는 기획 회의부터 검증된 릴리스 candidate를 만들기까지, 팀이 이 조율 레포지토리를 실제로 사용하는 순서를 설명합니다.
세부 규칙은 [AGENTS.md](./AGENTS.md)에 정리되어 있습니다.

| 역할 | 담당 | 책임 범위 |
|---|---|---|
| **Coordinator** (서기) | 스프린트마다 1명 | 계획, 계약, work unit 경계, candidate 관리 |
| **Writer** | work unit마다 1명 | 배정받은 work unit 1개를 한 레포에서 독립적으로 구현 |
| **Reviewer** | 구현자가 **아닌** 사람 | PR 1개를 독립적으로 리뷰 |
| **Release Owner** | 보통 Coordinator | candidate 승인 |

이 절차에서 가장 중요한 원칙이 하나 있습니다. **Coordinator는 자신이 작성한 계획을 단독으로 승인할 수 없습니다.**
계획을 작성한 사람이 관련 PR까지 모두 승인하면 독립적인 검증이 이루어지지 않기 때문입니다.

---

## 0. 최초 1회 설정

```bash
npm ci
npm run init -- --name <repo> --org <org> --apply     # 플레이스홀더 치환, 예제 제거
npm run service:add -- --id <id> --repo https://github.com/<org>/<repo>.git \
  --stack <stack> --owners @<team> --verify "<cmd>,<cmd>" --apply
npm run verify:registry
```

팀이 조율할 레포지토리는 처음에 한 번만 모두 등록합니다. 이후 각 Change에서는 실제로 변경할
레포지토리만 **부분집합**으로 선언합니다. 스프린트마다 다시 등록할 필요는 없습니다.

이 설정은 **기획 회의 전에** 완료해 두세요. 회의 중에 submodule을 추가하면 Git 작업 때문에
논의 흐름이 끊길 수 있습니다.

<!-- example:start -->
`npm run init -- --with-example --apply`를 사용하면 `examples/todo`를 삭제하지 않고,
실행 가능한 참고 사례로 남겨 둔 채 초기화할 수 있습니다.
<!-- example:end -->

---

## 1. 기획 회의에서 Change 생성하기

팀이 사용자에게 제공할 결과 하나를 합의하면 Coordinator가 해당 Change를 생성합니다.

```bash
npm run change:create -- --change CHG-<NAME>-001            # dry run, 쓸 내용만 출력
npm run change:create -- --change CHG-<NAME>-001 --apply
```

이 명령은 스켈레톤을 바탕으로 `changes/CHG-<NAME>-001/` 아래에 `PLAN.md`,
`WORK_UNITS.yaml`, `PRS.yaml`, `STATUS.md`, `contracts/`, `releases/`를 생성합니다.
남아 있는 `<...>` 플레이스홀더는 의도된 것이므로, 승인 전에 사람이 직접 채워야 합니다.

**하나의 Change는 여러 서비스에 걸쳐 하나의 사용자 가치를 완성하는 단위입니다.** 독립적인
스토리가 3개라면 Change도 3개로 나눕니다. 그래야 하나가 지연되더라도 나머지 작업을 막지
않습니다. 현재는 에픽 단위로 묶는 별도 산출물이 없으므로, 스프린트는 이슈 트래커에서
관리하고 관련 Change ID를 서로 연결해 두세요.

### `PLAN.md` 작성

`PLAN.md`에서 가장 중요한 부분은 수용 기준입니다. 의도가 아니라 **테스트로 관찰할 수 있는
결과**를 작성하세요.

```markdown
- `POST /todos`에 `{"title":"  Buy milk  "}` → 201, title `Buy milk`, `completed: false`
- 공백뿐인 제목은 400과 승인된 오류 body로 거부된다
```

"화면이 잘 동작한다"는 수용 기준이 될 수 없습니다. 비목표와 중지 조건도 함께 작성하세요.
중지 조건은 Writer가 자의적으로 판단하지 않고 사람에게 확인해야 하는 상황을 정하는 기준입니다.

### `contracts/` 작성

두 서비스 사이에 합의가 필요한 내용, 예를 들어 HTTP API 형식, 이벤트 스키마, 테이블 구조,
프롬프트 형식 등이 있다면 **구현을 시작하기 전에** `contracts/`에 작성합니다.
Writer들이 서로를 기다리지 않고 병렬로 작업하려면 이 계약이 반드시 필요합니다. Writer가
필드 이름을 추측해야 하는 상태라면 작업을 시작할 준비가 되지 않은 것입니다.

---

## 2. Change를 work unit으로 나누기

`changes/CHG-<NAME>-001/WORK_UNITS.yaml`을 편집합니다. Writer 한 명당 항목 하나를 작성합니다.

```yaml
  - id: retrieval-api
    repo: retrieval                      # 레지스트리 id여야 한다
    branch: feat/CHG-RAG-001/retrieval-api
    base_sha: <정확한 SHA, main 같은 이동 ref 금지>
    writer: alice
    write_paths:
      - src/api/**
      - tests/api/**
    depends_on: [contract]
    verify: []                           # 비우면 레지스트리 명령을 상속
```

```text
1 Work Unit = 1 Writer = 1 Branch = 1 Worktree
```

브랜치 이름은 `<type>/<CHANGE-ID>/<work-unit>` 형식을 따릅니다. `type`은
`change feat fix refactor test docs chore` 중 하나를 사용합니다. 브랜치 이름에는 도구나
모델 이름을 넣지 마세요.

작업을 시작하기 전에 work unit이 안전하게 분리되었는지 검사합니다.

```bash
npm run verify:registry -- --change CHG-<NAME>-001 --strict
```

이 명령은 `repo:`가 레지스트리에 등록되어 있지 않거나, **동시에 진행되는 두 work unit이
같은 레포에서 서로 겹치는 `write_paths`를 선언한 경우** 실패합니다. 경로 중복은 스프린트
진행을 복잡하게 만드는 가장 흔한 원인입니다. `depends_on`으로 연결된 unit은 순서대로
실행되므로 경로를 공유해도 문제가 없습니다. 두 스토리가 꼭 같은 파일을 수정해야 한다면
한 work unit으로 묶어 한 명에게 맡기거나, `depends_on`으로 실행 순서를 지정하세요.
병렬로 진행해서는 안 됩니다.

unit이 끝나면 `state:`에 `merged`, `complete`, `aborted` 중 하나를 기록합니다. 완료 상태가
기록된 unit은 이후 동시성 검사에서 제외됩니다.

### 사람의 승인 게이트

사람이 `PLAN.md`, 계약, work unit 경계를 검토하고 승인한 뒤 planning PR을 merge합니다.
**이 PR의 merge SHA가 모든 Writer가 기준으로 삼을 변경 불가능한 계획 버전**입니다.
반드시 기록해 두세요.

```bash
gh pr view <n> --json mergeCommit --jq .mergeCommit.oid
```

---

## 3. work unit 배정하기

```bash
npm run bootstrap -- --change CHG-<NAME>-001 --unit retrieval-api \
  --writer alice --run run-001              # dry run
npm run bootstrap -- --change CHG-<NAME>-001 --unit retrieval-api \
  --writer alice --run run-001 --apply
```

이 명령은 `.task-packets/run-001.md`에 task packet을 작성합니다. 이 파일은 gitignore 대상입니다.
task packet에는 목표, 대상 레포, base SHA, 허용된 경로, 승인된 계약 snapshot, 실행해야 할
정확한 검증 명령, 중지 조건이 들어 있습니다.

packet을 생성해도 **브랜치나 worktree가 자동으로 만들어지지는 않습니다.** 작업 공간 분리는
다음과 같이 별도로 수행합니다.

```bash
git -C <service-repo> worktree add -b feat/CHG-<NAME>-001/retrieval-api \
  <worktree-path> <base-sha>
```

두 Writer가 같은 worktree, 브랜치, index를 공유해서는 안 됩니다.

### 에이전트에게 전달할 때

task packet이 작업 브리핑의 전부입니다. Claude Code, Codex 등 어떤 에이전트를 사용하더라도
같은 내용을 전달합니다.

```text
Read AGENTS.md and the task packet at .task-packets/run-001.md.
Execute work unit retrieval-api for change CHG-RAG-001 in the assigned worktree.
Do not modify anything outside the declared write_paths.
Run every declared verification command and report the actual exit codes.
```

직접 구현하는 Writer도 같은 packet을 따릅니다. 사용하는 도구가 달라져도 작업 절차는
달라지지 않습니다.

---

## 4. 작업하고 결과 증명하기

Writer는 선언된 경로 안에서 구현하고, 지정된 검증 명령을 실행합니다. push하기 전에는
다음 명령을 실행하세요.

```bash
npm run workflow:check     # 현재 브랜치에서 Change와 work unit을 도출
```

변경 사항이 `write_paths`를 벗어나거나, 브랜치 이름이 규칙에 맞지 않거나, `HEAD`가
`base_sha`의 후손이 아니면 검사에 실패합니다.

### 무엇을 증거로 인정하는가

증거로 인정되는 것은 **실제로 실행한 명령과 그 명령의 exit code**입니다. "테스트가 통과할
것이다"라는 예상, 실행 결과를 생략한 요약, Writer가 직접 표시한 체크박스, push되지 않은
로컬 SHA는 증거가 아닙니다. 새 commit이 생기면 검증을 다시 실행하세요. 검증 결과는 해당
head SHA에 귀속됩니다.

**개별 서비스 레포에서는 크로스 레포 e2e를 실행할 수 없습니다.** 아직 형제 서비스의 merge
SHA가 존재하지 않기 때문입니다. 검증 수준은 다음과 같이 나눕니다.

| 수준 | 실행 주체 | 사용 대상 |
|---|---|---|
| unit / component / 계약 적합성 | Writer, 자기 레포에서 | 승인된 계약으로 만든 mock |
| 크로스 레포 e2e | root, candidate에서 | exact SHA의 실제 서비스들 |

실행하지 않은 e2e를 완료한 것으로 보고하지 마세요. root에 `e2e/`가 없으면
`npm run test:e2e`는 테스트를 **0개 실행하고도 exit 0**으로 끝납니다. 테스트가 0개라면
통과한 것으로 볼 수 없습니다.

### Handoff

모든 작업은 [AGENTS.md](./AGENTS.md) §7의 블록 형식으로 마무리합니다. Change, work unit,
run, 레포, 브랜치, base·head SHA, 변경 파일, 명령과 exit code, **실행하지 못한** 검증,
계약 이탈, 위험, 다음 행동을 기록하세요. 그래야 다음 사람이나 에이전트가 현재 상태를
다시 파악하는 데 시간을 쓰지 않고 바로 이어서 작업할 수 있습니다.

---

## 5. PR별 리뷰와 merge

`.github/pull_request_template.md`의 모든 항목을 작성합니다. 실행하지 못한 검증도 빠짐없이
기록하세요.

```text
Writer 자체 점검
  → 리뷰 에이전트 1차 검토 (구현자와 다른 세션)
  → CI green
  → 독립적인 사람 리뷰 (Writer가 아닌 사람)
  → 사람이 merge
```

에이전트는 merge, 승인, 배포, 레포 설정 변경을 수행하지 않습니다. 리뷰 에이전트는 결함,
범위, 증거를 1차로 검토할 뿐입니다. 아키텍처, 인증, 결제, 개인정보, migration 관련 판단은
여전히 사람이 담당합니다.

**각 구현 PR은 독립 리뷰와 CI를 통과하는 즉시 merge합니다.** 스프린트가 끝날 때까지
열어 두지 마세요. squash merge를 사용하면 PR head SHA와 merge SHA가 **서로 다릅니다.**
candidate에 필요한 값은 merge SHA이므로 반드시 기록해야 합니다.

```bash
gh pr view <n> --repo <org>/<repo> --json mergeCommit --jq .mergeCommit.oid
```

그다음 `PRS.yaml`을 직접 갱신합니다. 자동 동기화 기능은 없으므로 `PRS.yaml`과 `STATUS.md`에
기록된 내용은 **증거가 아니라 GitHub에서 다시 확인해야 할 정보**로 취급하세요.

계획 또는 계약, PR head SHA, base SHA, 의존 SHA, work unit 범위, 필수 검증 명령 중 하나라도
바뀌면 기존 승인은 무효가 됩니다.

---

## 6. candidate 조립하고 검증하기

각 구현 PR이 merge되면 Coordinator가 정확한 SHA 조합을
`changes/CHG-<NAME>-001/releases/candidate-001.yaml`에 고정합니다.

```yaml
services:
  - repo: retrieval          # 레지스트리 id
    path: services/retrieval
    sha: <merge SHA, head SHA 아님>
    source_pr: 12
```

candidate에는 레지스트리에 등록된 레포 중 필요한 **부분집합**만 고정할 수 있습니다.
1개든 20개든 상관없습니다. submodule을 지정한 SHA에 맞춘 뒤 다음 명령을 실행합니다.

```bash
npm run verify:registry
npm run verify:candidate -- --detect     # 또는 --change CHG-<NAME>-001
npm run test:e2e                         # root에 e2e/가 있는 경우
```

`--detect`는 현재 체크아웃된 submodule snapshot과 일치하는 candidate를 찾아 검증합니다.
candidate가 아직 없으면 별도 메시지 없이 통과하지만, candidate가 있는데 현재 snapshot과
일치하는 항목이 없으면 실패합니다. 후자는 **candidate에 기록한 SHA와 실제 체크아웃된 SHA가
다르다는 뜻**입니다.

도구가 검사하지 **않는** 항목은 사람이 직접 확인해야 합니다.

- **원격 도달성:** `git -C services/<id> branch -r --contains <sha>`를 직접 실행하세요.
  로컬에만 있는 SHA를 기록하면 다른 clone에서는 해당 상태를 재현할 수 없습니다.
- **계획 부합성:** 결과를 `PLAN.md`와 자동으로 비교하는 코드는 없습니다. 수용 기준을 하나씩
  읽고 결과가 일치하는지 확인하세요. 이것이 최종 게이트의 목적입니다. SHA 검사는 *어떤*
  코드가 배포되었는지만 증명하며, 그 코드가 합의한 대로 동작하는지까지 증명하지는 않습니다.

submodule 포인터 갱신과 매니페스트 변경을 포함한 candidate PR을 생성합니다. 사람이 승인하고
merge해야 합니다. **이 merge가 완료되어야 Change가 완료된 것입니다.** 각 구현 PR의 merge만으로는
Change가 완료되지 않습니다.

PR CI가 green인 것과 merge 후 `main` CI가 green인 것은 서로 다른 사실입니다. 둘 다 확인하세요.

---

## 7. 마감하기

`STATUS.md`에 planning merge SHA, 서비스별 merge SHA, candidate root merge SHA, CI·E2E 링크,
완료 승인자를 기록합니다. 기록을 마친 뒤 임시 브랜치와 worktree를 정리합니다.

미뤄 둔 작업이 있다면, 예를 들어 이전 계약 제거 또는 정리용 migration이 필요하다면 별도
Change를 생성하세요. 후속 작업을 기록 없이 남겨 두지 마세요.

---

## 작업을 멈추고 확인해야 하는 경우

다음 상황에서는 임의로 우회하지 말고 작업을 멈춘 뒤 사람에게 확인하세요.

- 허용된 경로 밖의 파일을 수정해야 하는 경우
- 계약과 실제 구현 가능한 내용이 충돌하는 경우
- `base_sha` 또는 의존 SHA가 변경된 경우
- secret이나 운영 환경 접근 권한이 필요한 경우
- 파괴적인 migration이 필요한 경우
- 필수 검증을 실행할 수 없는 경우

이 구조가 막으려는 가장 큰 문제는 **작업자가 스스로 범위를 넓히는 것**입니다.

---

## 명령 레퍼런스

| 명령 | 용도 |
|---|---|
| `npm run init` | 템플릿을 현재 프로젝트에 맞게 초기화 |
| `npm run service:add` | 레포 등록 및 submodule 추가 |
| `npm run change:create` | 스켈레톤을 바탕으로 Change 생성 |
| `npm run bootstrap` | work unit 하나의 task packet 작성 |
| `npm run workflow:check` | 현재 브랜치의 작업 범위와 브랜치 이름 검사 |
| `npm run verify:registry` | 레지스트리 ↔ `.gitmodules` ↔ 매니페스트 일치 여부와 경로 중복 검사 |
| `npm run verify:candidate` | exact SHA로 구성된 candidate 검증 |
| `npm test` | 프레임워크 테스트 |
| `npm run test:e2e` | 크로스 레포 e2e (`e2e/`가 있을 때) |

`init`, `service:add`, `change:create`, `bootstrap`은 기본적으로 **dry run**으로 동작하며,
`--apply`를 붙였을 때만 파일을 변경합니다.

현재 구현되지 않음: 가이드 문서에는 `npm run contract:lint`가 나오지만 실제 명령은 존재하지 않습니다.
통과했다고 간주하지 말고 "실행하지 못한 검증"으로 보고하세요.
