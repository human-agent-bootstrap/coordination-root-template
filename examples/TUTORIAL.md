# 튜토리얼: 실제 서브모듈로 전체 흐름 따라 해보기

> 이 문서는 선택형 실습이며 운영 규칙의 기준은 [`../RUNBOOK.md`](../RUNBOOK.md)와
> [`../AGENTS.md`](../AGENTS.md)입니다. 이해를 돕기 위해 worktree를 사용하지만 필수는 아닙니다.

이 문서는 명령어를 직접 입력하면서 처음부터 끝까지 따라가는 실습입니다. GitHub에 있는 두 개의
서비스 저장소를 서브모듈로 연결하고, 하나의 Change를 계획해 병렬로 구현합니다. 이후 PR을 병합하고
정확한 SHA로 Candidate를 검증하는 과정까지 한 번에 진행합니다.

실습 중에는 세 번의 의도된 실패를 경험하게 됩니다. 이 단계들은 건너뛰지 마세요. 어떤 실수를
도구가 미리 막아주는지 직접 확인하는 과정이 이 실습의 핵심입니다.

| 준비물 | 확인 |
|---|---|
| Node.js 22 이상 | `node --version` |
| Git(서브모듈 지원) | `git --version` |
| 사내 Wi-Fi에서 GitHub CLI 인증 | `gh auth status --hostname github.com` |
| **서비스 저장소 두 개** | 아래 0단계에서 직접 생성 |

이 튜토리얼도 실제 운영처럼 두 구간으로 나눕니다. 저장소 생성·clone·fetch·push·PR·merge는
사내 Wi-Fi에서 사람이 실행합니다. 외부망의 Agent는 준비된 로컬 clone에서 구현·검증·commit
까지만 수행하고, PAT를 받거나 GitHub에 접속하지 않습니다.

> SHA 값은 실행할 때마다 달라집니다. 예시의 값 자체가 아니라 출력 형태와 성공·실패 여부를
> 비교하세요. 나머지 문구는 실제 실행 결과와 같습니다.

완성된 사례를 먼저 살펴보고 싶다면 [`todo/`](./todo/)를 참고하세요. 이 문서는 직접 명령을 실행하며 따라가는 실습용 안내서입니다.

---

## 0단계 — 서비스 저장소 두 개 준비

실제 프로젝트라면 팀이 이미 가진 저장소를 씁니다. 실습에서는 두 개를 새로 만듭니다.
**`OWNER`는 접근 가능한 계정 또는 조직 이름으로 바꾸세요.** 현재 팀 조직은
`DSPACE-OG087301-AAA`입니다.

```bash
export OWNER=DSPACE-OG087301-AAA
export COORDINATOR_OWNER='@DSPACE-OG087301-AAA/your-team'
export TUT=~/tutorial-notes
mkdir -p "$TUT/worktrees"
```

저장소 두 개를 만들고 각각 초기 커밋을 푸시합니다.

```bash
for s in tutorial-notes-api tutorial-notes-cli; do
  gh repo create "$OWNER/$s" --private --description "Tutorial service for the coordination template"
  seed=$(mktemp -d)
  git -C "$seed" init -q
  printf '# %s\n\nTutorial service. Implementation arrives via a coordinated change.\n' "$s" > "$seed/README.md"
  git -C "$seed" add .
  git -C "$seed" commit -qm "chore: seed"
  git -C "$seed" branch -M main
  git -C "$seed" remote add origin "https://github.com/$OWNER/$s.git"
  git -C "$seed" push -qu origin main
done
gh repo list "$OWNER" --limit 100 | grep tutorial-notes
```

두 저장소가 목록에 표시되면 준비가 끝난 것입니다. 실습이 끝난 뒤에는 12단계의 명령으로 직접 삭제하세요.

이제 조율 저장소를 준비합니다.

```bash
git clone --depth 1 https://github.com/human-agent-bootstrap/coordination-root-template.git "$TUT/root"
cd "$TUT/root"
rm -rf .git && git init -q .
git config user.email you@example.com
git config user.name "Your Name"
npm ci
git add -A && git commit -qm "chore: coordination baseline"

npm run init -- --name notes-coord --org "$OWNER" \
  --github-host github.com --coordinator-owner "$COORDINATOR_OWNER" --apply
```

```text
APPLIED: initialized notes-coord
Next: npm run service:add -- --id <id> --repo <url> --apply, then npm run change:create.
```

`init`을 실행하면 플레이스홀더를 실제 값으로 바꾸고 `examples/` 디렉터리를 삭제합니다. 지금 읽고 있는
파일도 함께 삭제되므로, 이 문서는 브라우저나 다른 창에 열어 두세요.

초기 상태가 정상인지 확인합니다. 서비스와 Change가 하나도 없는 상태에서도 검증이 통과해야 합니다.

```bash
npm test
npm run verify:registry
npm run verify:candidate -- --detect
```

```text
ℹ pass <current test count>
NOTE: no services registered yet. Add one with: npm run service:add -- --id <id> --repo <url> --apply
Registry PASS: 0 service(s) []; 0 change(s) validated; 0 warning(s).
NOTE: no release candidate is declared yet; nothing to verify.
```

---

## 1단계 — 서비스를 서브모듈로 등록하기

`service:add`는 `git submodule add`와 레지스트리 등록을 한 번에 처리한 뒤 곧바로 다시 검증합니다.
따라서 관련 파일을 일일이 수정하고 서로 일치하는지 따로 확인할 필요가 없습니다.

```bash
npm run service:add -- --id notes-api \
  --repo "https://github.com/$OWNER/tutorial-notes-api.git" \
  --stack node --owners "$COORDINATOR_OWNER" \
  --verify "node --test tests/" --apply

npm run service:add -- --id notes-cli \
  --repo "https://github.com/$OWNER/tutorial-notes-cli.git" \
  --stack node --owners "$COORDINATOR_OWNER" \
  --verify "node --test tests/" --apply
```

두 번째 명령을 실행하면 다음과 같이 출력됩니다.

```text
Registry PASS: 2 service(s) [notes-api, notes-cli]; 0 change(s) validated; 0 warning(s).
Next: record notes-cli in a change's work units, and add it to CODEOWNERS.
```

생성된 내용을 확인합니다.

```bash
git submodule status
cat services/registry.yaml
cat .gitmodules
```

```text
 <sha> services/notes-api (heads/main)
 <sha> services/notes-cli (heads/main)
```

`--verify`로 전달한 명령이 레지스트리에 저장됐는지 확인하세요. 이후 작업 단위에서 별도의 검증 명령을
선언하지 않으면 이 명령을 그대로 상속합니다. 서비스마다 같은 테스트 명령을 반복해서 적지 않아도 되는
이유입니다. `verify:registry`는 레지스트리와 `.gitmodules`가 양쪽에서 일치하는지 검사하므로,
둘 중 하나만 수정하면 검증에 실패합니다.

서브모듈 포인터를 커밋합니다. 이 포인터가 현재 조율 대상으로 삼는 정확한 코드를 가리킵니다.

```bash
git add .gitmodules services
git commit -qm "chore: register notes-api and notes-cli as submodules"
```

---

## 2단계 — Change를 만들고 계약 확정하기

사용자에게 보이는 결과 하나를 하나의 Change로 정의합니다.

```bash
npm run change:create -- --change CHG-NOTES-001 \
  --services notes-api,notes-cli --apply
ls changes/CHG-NOTES-001
```

```text
APPLIED: wrote 6 file(s) under changes/CHG-NOTES-001
contracts	PLAN.md		PRS.yaml	releases	STATUS.md	WORK_UNITS.yaml
```

스켈레톤에는 계약 작성 안내인 `contracts/README.md`가 들어 있습니다. 이번 실습은 JSON 레코드
계약을 사용하므로 안내 파일을 삭제하고 실제 계약 파일을 추가합니다.

```bash
rm changes/CHG-NOTES-001/contracts/README.md
cat > changes/CHG-NOTES-001/contracts/note.schema.json <<'EOF'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Note",
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "title", "done"],
  "properties": {
    "id": { "type": "string", "minLength": 1 },
    "title": { "type": "string", "minLength": 1, "maxLength": 100 },
    "done": { "type": "boolean" }
  }
}
EOF
```

이 계약은 두 서비스가 서로의 소스 코드를 확인하지 않고도 병렬로 작업할 수 있게 해주는 공통 기준입니다.
`PLAN.md`의 수용 기준도 계약에 맞춰 확인 가능한 결과로 작성하세요. 예를 들어 "title은 trim 후
1~100자", "done의 초기값은 false"처럼 적습니다. "잘 동작한다"처럼 판단 기준이 모호한 문장은
수용 기준으로 사용할 수 없습니다.

이 실습에서는 기존 `AC-001`~`AC-004` 항목을 각각 API 생성 테스트, CLI 렌더링 테스트,
두 서비스의 merge SHA별 테스트, 아래 10단계의 cross-repository smoke command로
구체화합니다.

---

## 3단계 — 작업 단위로 나누기

각 작업 단위의 `base_sha`에는 서브모듈이 현재 가리키는 정확한 SHA를 기록합니다. `main`처럼
계속 바뀌는 참조를 적으면 안 됩니다.

```bash
export API_BASE=$(git -C services/notes-api rev-parse HEAD)
export CLI_BASE=$(git -C services/notes-cli rev-parse HEAD)
export ROOT_BASE=$(git rev-parse HEAD)
printf 'api=%s\ncli=%s\n' "$API_BASE" "$CLI_BASE"
```

작업자 한 명에게 작업 단위 하나를 배정합니다. 두 서비스는 서로 다른 저장소에 있으므로 병렬로 진행할 수 있습니다.

```bash
cat > changes/CHG-NOTES-001/WORK_UNITS.yaml <<EOF
schema_version: 1
change_id: CHG-NOTES-001
state: approved
plan_base_sha: $ROOT_BASE
plan_merge_sha: pending
work_units:
  - id: contract
    repo: root
    state: in_progress
    goal: Approve the note contract.
    branch: change/CHG-NOTES-001/coordination
    base_sha: $ROOT_BASE
    writer: coordinator
    write_paths: [changes/CHG-NOTES-001/**]
    depends_on: []
    verify: [npm test]

  - id: note-create
    repo: notes-api
    state: ready
    goal: Create a note that satisfies the contract.
    branch: feat/CHG-NOTES-001/note-create
    base_sha: $API_BASE
    writer: alice
    write_paths: [src/**, tests/**]
    depends_on: [contract]
    verify: []

  - id: note-render
    repo: notes-cli
    state: ready
    goal: Render a note received from the API.
    branch: feat/CHG-NOTES-001/note-render
    base_sha: $CLI_BASE
    writer: bob
    write_paths: [src/**, tests/**]
    depends_on: [contract]
    verify: []
EOF
npm run verify:registry -- --change CHG-NOTES-001 --strict
```

```text
Registry PASS: 2 service(s) [notes-api, notes-cli]; 1 change(s) validated; 0 warning(s).
```

두 구현 작업 단위의 `verify`를 빈 배열로 두었으므로, 1단계에서 레지스트리에 등록한
`node --test tests/` 명령을 상속합니다.

---

## 4단계 — 의도된 실패 ①: 같은 저장소를 두 작업자가 맡은 경우

팀에서 자주 발생하는 실수를 재현해 보겠습니다. `note-render`의 `repo`를 실수로 `notes-api`라고
적으면, 두 작업 단위가 같은 저장소의 같은 경로를 동시에 수정하겠다고 선언하게 됩니다.

```bash
sed -i.bak 's|^    repo: notes-cli$|    repo: notes-api|' changes/CHG-NOTES-001/WORK_UNITS.yaml
npm run verify:registry -- --change CHG-NOTES-001 --strict
```

```text
WARNING: CHG-NOTES-001: concurrent units note-create and note-render both write src/**, tests/** in repo notes-api
ERROR: 1 write-path overlap(s) between concurrent work units
```

명령은 종료 코드 1로 실패합니다. 구현을 시작하기도 전에, 두 작업자가 같은 파일을 덮어쓸 수 있는
상황을 찾아낸 것입니다.

되돌립니다.

```bash
mv changes/CHG-NOTES-001/WORK_UNITS.yaml.bak changes/CHG-NOTES-001/WORK_UNITS.yaml
npm run verify:registry -- --change CHG-NOTES-001 --strict
```

> 두 작업이 꼭 같은 파일을 수정해야 한다면 두 가지 방법 중 하나를 선택해야 합니다. 한 작업자에게
> 모두 맡기거나 `depends_on`으로 실행 순서를 지정하세요. `depends_on`으로 연결된 작업 단위는
> 순서대로 실행되므로 경고가 발생하지 않습니다. 같은 경로를 병렬로 수정해서는 안 됩니다.

계획을 커밋합니다. 실제 팀에서는 이 시점에 기획 PR을 올리고 사람의 승인을 받습니다. 이 PR의
병합 SHA가 모든 작업자가 기준으로 삼는 변경되지 않는 계획 버전이 됩니다.

```bash
git add changes/CHG-NOTES-001
git commit -qm "plan(CHG-NOTES-001): define the note contract and work units"
export PLAN_SHA=$(git rev-parse HEAD)
```

실제 팀에서는 위 커밋을 사람이 사내 Wi-Fi에서 planning PR로 push·review·merge하고,
`PLAN_SHA`에는 그 merge SHA를 사용합니다. 튜토리얼은 로컬 흐름을 재현하기 위해 현재 커밋을
승인된 snapshot으로 사용합니다. Agent 작업 전에 사람은 이 SHA와 두 서비스 `base_sha`가
로컬에 존재하는지 확인하고 사내 Wi-Fi를 끊습니다.

---

## 5단계 — 작업 패킷 발급하기

작업 패킷에는 작업자에게 필요한 정보가 모두 들어 있습니다. 사람이 직접 구현하든 에이전트에게
맡기든 같은 작업 패킷을 사용합니다.

```bash
npm run bootstrap -- --plan-sha "$PLAN_SHA" \
  --change CHG-NOTES-001 --unit note-create --writer alice --run run-api-001 --apply
npm run bootstrap -- --plan-sha "$PLAN_SHA" \
  --change CHG-NOTES-001 --unit note-render --writer bob --run run-cli-001 --apply
cat .task-packets/run-api-001.md
```

`# SCOPE`, `# CONTRACT`, `# VERIFY` 절을 확인하세요.

```text
# SCOPE
- Repository: notes-api
- Required branch: feat/CHG-NOTES-001/note-create
- Base SHA: <API_BASE>
- Allowed paths:
  - src/**
  - tests/**

# CONTRACT
- Read AGENTS.md in the Root repository before implementation.
- Approved contract snapshots (do not modify):
  - changes/CHG-NOTES-001/contracts/note.schema.json
- Do not modify the Root coordination files or another repository.

# VERIFY (service registry)
- node --test tests/ (expect exit 0)
```

계약 경로는 Change에서 자동으로 찾아낸 값이며 하드코딩된 값이 아닙니다. 검증 명령에는
`(service registry)`라는 출처도 함께 표시됩니다.

작업 패킷을 만들어도 브랜치나 workspace는 생성되지 않습니다. 기존 checkout, worktree,
별도 clone 또는 Agent 하네스의 격리 workspace 중 하나를 사용자나 하네스가 선택합니다.

에이전트에게 맡길 때는 다음과 같이 요청합니다. 어떤 도구를 사용하더라도 요청 형식은 같습니다.

```text
Read AGENTS.md and the task packet at .task-packets/run-api-001.md.
Execute work unit note-create for change CHG-NOTES-001 in the assigned workspace.
Do not modify anything outside the declared write_paths.
Run every declared verification command and report the actual exit codes.
```

---

## 6단계 — 격리된 workspace에서 병렬로 구현하기

이 실습에서는 격리 방법으로 worktree를 선택합니다. 실제 작업에서는 clean한 기존 checkout,
별도 clone 또는 Agent 하네스가 만든 workspace를 사용해도 됩니다.

```bash
git -C services/notes-api worktree add -b feat/CHG-NOTES-001/note-create "$TUT/worktrees/note-create" "$API_BASE"
git -C services/notes-cli worktree add -b feat/CHG-NOTES-001/note-render "$TUT/worktrees/note-render" "$CLI_BASE"
export A="$TUT/worktrees/note-create" C="$TUT/worktrees/note-render"
git -C services/notes-api worktree list
```

브랜치는 `main`이 아니라 작업 목록에 기록된 `base_sha`에서 시작해야 합니다.

먼저 `notes-api`를 구현합니다. 승인된 계약만 보고 코드를 작성합니다.

```bash
mkdir -p "$A/src" "$A/tests"
cat > "$A/src/note.mjs" <<'EOF'
// Shape follows changes/CHG-NOTES-001/contracts/note.schema.json in the coordination root.
let counter = 0;
export function createNote(title) {
  const trimmed = String(title ?? '').trim();
  if (trimmed.length < 1 || trimmed.length > 100) throw new Error('title must be 1-100 characters after trimming');
  counter += 1;
  return { id: `note-${counter}`, title: trimmed, done: false };
}
EOF
cat > "$A/tests/note.test.mjs" <<'EOF'
import assert from 'node:assert/strict';
import test from 'node:test';
import { createNote } from '../src/note.mjs';

test('createNote satisfies the approved contract', () => {
  const note = createNote('  Buy milk  ');
  assert.deepEqual(Object.keys(note).sort(), ['done', 'id', 'title']);
  assert.equal(note.title, 'Buy milk');
  assert.equal(note.done, false);
  assert.ok(note.id.length > 0);
});

test('createNote rejects a blank title', () => {
  assert.throws(() => createNote('   '), /1-100 characters/);
});
EOF
```

다음은 `notes-cli` 구현입니다. 다른 서비스의 소스 코드는 읽지 않습니다. 두 서비스가 공유하는 기준은 계약뿐입니다.

```bash
mkdir -p "$C/src" "$C/tests"
cat > "$C/src/render.mjs" <<'EOF'
// Consumes the contract shape; never reads the API service's source.
export function renderNote(note) {
  if (typeof note?.id !== 'string' || typeof note?.title !== 'string' || typeof note?.done !== 'boolean') {
    throw new Error('note does not match the approved contract');
  }
  return `${note.done ? '[x]' : '[ ]'} ${note.title} (${note.id})`;
}
EOF
cat > "$C/tests/render.test.mjs" <<'EOF'
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderNote } from '../src/render.mjs';

test('renderNote formats a contract-shaped note', () => {
  assert.equal(renderNote({ id: 'note-1', title: 'Buy milk', done: false }), '[ ] Buy milk (note-1)');
});

test('renderNote rejects a payload off the contract', () => {
  assert.throws(() => renderNote({ id: 'note-1', title: 'x' }), /approved contract/);
});
EOF
```

작업 목록에 선언된 검증 명령을 작업 패킷에 적힌 그대로 실행합니다.

```bash
(cd "$A" && node --test tests/)
(cd "$C" && node --test tests/)
```

두 명령 모두 `pass 2`, `fail 0`으로 끝나야 합니다. "통과할 것 같다"는 설명은 증거가
아닙니다. 실제로 실행한 명령과 종료 코드를 남겨야 합니다.

---

## 7단계 — 의도된 실패 ②: 허용 경로를 벗어난 수정

허용 범위 밖의 파일을 일부러 수정해 봅니다.

```bash
cd "$TUT/root"
echo "oops" > "$A/README.md"
node scripts/workflow-check.mjs --plan-sha "$PLAN_SHA" \
  --change CHG-NOTES-001 --unit note-create --repo-path "$A"
```

```text
ERROR: scope violation: README.md
```

명령은 종료 코드 1로 실패합니다. `README.md`가 `write_paths`에 없기 때문에 로컬 commit 전에
범위 위반을 발견한 것입니다. 변경을 되돌립니다.

```bash
git -C "$A" checkout -- README.md
node scripts/workflow-check.mjs --plan-sha "$PLAN_SHA" \
  --change CHG-NOTES-001 --unit note-create --repo-path "$A"
```

```text
Workflow check PASS: CHG-NOTES-001/note-create; base <API_BASE>; 2 changed file(s).
```

> 실제 작업에서도 Root clone을 현재 디렉터리로 두고 `scripts/workflow-check.mjs`에
> `--plan-sha`, `--change`, `--unit`, `--repo-path`를 명시합니다.

---

## 8단계 — 로컬 commit 후 사람이 PR을 만들고 squash merge하기

외부망의 Agent는 자신이 맡은 서비스 브랜치에 로컬 commit을 만들고 handoff를 작성한 뒤
멈춥니다.

```bash
for d in "$A" "$C"; do
  git -C "$d" add src tests
  git -C "$d" commit -qm "feat(CHG-NOTES-001): implement against the approved note contract"
done
export API_HEAD=$(git -C "$A" rev-parse HEAD)
export CLI_HEAD=$(git -C "$C" rev-parse HEAD)
```

이제 사람이 사내 Wi-Fi에 연결합니다. handoff의 branch와 head SHA가 위 로컬 상태와
일치하는지 확인한 뒤 push합니다.

```bash
git -C "$A" push -qu origin feat/CHG-NOTES-001/note-create
git -C "$C" push -qu origin feat/CHG-NOTES-001/note-render
```

PR을 만들고 본문에 Change ID, 작업 단위, base SHA, 실제로 실행한 검증 명령을 기록합니다.

```bash
gh pr create --repo "$OWNER/tutorial-notes-api" \
  --base main --head feat/CHG-NOTES-001/note-create \
  --title "feat(CHG-NOTES-001): implement note creation" \
  --body "Change: CHG-NOTES-001 / work unit: note-create
Base SHA: $API_BASE
Contract: changes/CHG-NOTES-001/contracts/note.schema.json (coordination root)
Verification: node --test tests/ -> exit 0
Scope: src/**, tests/** only"

gh pr create --repo "$OWNER/tutorial-notes-cli" \
  --base main --head feat/CHG-NOTES-001/note-render \
  --title "feat(CHG-NOTES-001): implement note rendering" \
  --body "Change: CHG-NOTES-001 / work unit: note-render
Base SHA: $CLI_BASE
Contract: changes/CHG-NOTES-001/contracts/note.schema.json (coordination root)
Verification: node --test tests/ -> exit 0
Scope: src/**, tests/** only"
```

실제 팀에서는 구현자가 아닌 사람이 독립적으로 리뷰하고 CI 결과를 확인해야 합니다. 모든 검토가
끝나면 사람이 병합합니다. 이 실습에서는 본인이 직접 병합합니다.

```bash
gh pr merge --repo "$OWNER/tutorial-notes-api" --squash --delete-branch feat/CHG-NOTES-001/note-create
gh pr merge --repo "$OWNER/tutorial-notes-cli" --squash --delete-branch feat/CHG-NOTES-001/note-render
```

이 실습에서 꼭 확인해야 할 부분입니다. squash merge는 새로운 커밋을 만들기 때문에 PR의 헤드 SHA와
병합 SHA가 서로 다릅니다. Candidate에는 병합 SHA를 기록해야 합니다.

```bash
export API_MERGE=$(gh pr view 1 --repo "$OWNER/tutorial-notes-api" --json mergeCommit --jq .mergeCommit.oid)
export CLI_MERGE=$(gh pr view 1 --repo "$OWNER/tutorial-notes-cli" --json mergeCommit --jq .mergeCommit.oid)
printf 'PR head SHA : %s\nmerge SHA   : %s\n' "$API_HEAD" "$API_MERGE"
```

두 값이 실제로 다른지 확인하세요. Candidate에 PR 헤드 SHA를 넣으면 잘못된 조합을 기록하게 됩니다.

---

## 9단계 — 서브모듈 포인터를 병합 SHA로 변경하기

```bash
git -C services/notes-api fetch -q origin
git -C services/notes-cli fetch -q origin
git -C services/notes-api checkout -q "$API_MERGE"
git -C services/notes-cli checkout -q "$CLI_MERGE"
git submodule status
```

`+` 접두사는 조율 저장소에 기록된 포인터와 현재 체크아웃된 SHA가 다르다는 뜻입니다. 다음 단계에서 이 변경을 커밋합니다.

해당 SHA가 원격 저장소에서 조회되는지 확인하세요. Candidate 검증도 `--target-ref`를 사용하면
같은 원격 도달성을 검사합니다.

```bash
git -C services/notes-api branch -r --contains "$API_MERGE"
git -C services/notes-cli branch -r --contains "$CLI_MERGE"
```

```text
  origin/HEAD -> origin/main
  origin/main
```

출력이 비어 있다면 해당 SHA는 원격 저장소에 없습니다. 이 상태로는 다른 환경에서 클론했을 때 같은 구성을 재현할 수 없습니다.

---

## 10단계 — Candidate 확정 및 검증

```bash
mkdir -p e2e
cat > e2e/notes.test.mjs <<'EOF'
import assert from 'node:assert/strict';
import test from 'node:test';
import { createNote } from '../services/notes-api/src/note.mjs';
import { renderNote } from '../services/notes-cli/src/render.mjs';

test('API output renders in the CLI', () => {
  assert.equal(renderNote(createNote(' Buy milk ')), '[ ] Buy milk (note-1)');
});
EOF
npm run test:e2e

cat > changes/CHG-NOTES-001/PRS.yaml <<EOF
schema_version: 1
change_id: CHG-NOTES-001
state: merged
plan_merge_sha: $PLAN_SHA
prs:
  - key: root-planning
    repo: root
    work_unit: contract
    state: merged
    merge_sha: $PLAN_SHA
  - key: notes-api-implementation
    repo: notes-api
    work_unit: note-create
    number: 1
    state: merged
    base_sha: $API_BASE
    head_sha: $API_HEAD
    merge_sha: $API_MERGE
  - key: notes-cli-implementation
    repo: notes-cli
    work_unit: note-render
    number: 1
    state: merged
    base_sha: $CLI_BASE
    head_sha: $CLI_HEAD
    merge_sha: $CLI_MERGE
EOF

cat > changes/CHG-NOTES-001/releases/candidate-001.yaml <<EOF
schema_version: 1
change_id: CHG-NOTES-001
candidate: 1
state: validating
plan_sha: $PLAN_SHA
services:
  - repo: notes-api
    path: services/notes-api
    base_sha: $API_BASE
    sha: $API_MERGE
    source_prs: [notes-api-implementation]
  - repo: notes-cli
    path: services/notes-cli
    base_sha: $CLI_BASE
    sha: $CLI_MERGE
    source_prs: [notes-cli-implementation]
evidence:
  - criterion: AC-001
    kind: command
    command: node --test tests/
    target_sha: $API_MERGE
    exit_code: 0
  - criterion: AC-002
    kind: command
    command: node --test tests/
    target_sha: $CLI_MERGE
    exit_code: 0
  - criterion: AC-003
    kind: command
    command: node --test tests/
    target_sha: $API_MERGE
    exit_code: 0
  - criterion: AC-003
    kind: command
    command: node --test tests/
    target_sha: $CLI_MERGE
    exit_code: 0
  - criterion: AC-004
    kind: command
    command: npm run test:e2e
    target_sha: $API_MERGE
    exit_code: 0
EOF
npm run verify:candidate -- --change CHG-NOTES-001 --target-ref "$PLAN_SHA"
```

```text
Candidate CHG-NOTES-001: PASS (2 service(s): notes-api@<12자>, notes-cli@<12자>)
```

실제 팀에서는 `COORDINATION_GITHUB_TOKEN`이 설정된 사내 Wi-Fi 환경에서
`npm run verify:prs -- --change CHG-NOTES-001`도 실행합니다. 이 단독 실습은 작성자가 직접
merge하므로 독립 승인 검사는 의도적으로 생략합니다.
운영 Candidate PR은 merge 전에 `verify:registry`, `verify:prs`, `verify:candidate`를
통과시켜야 합니다. 이 예제처럼 검증 가능한 통합 시나리오가 있으면 `test:e2e`도 실행하며,
merge 후 `main` CI가 필수 게이트와 존재하는 E2E suite를 다시 확인합니다.

---

## 11단계 — 의도된 실패 ③: 잘못된 헤드 SHA 기록

8단계에서 확인한 PR 헤드 SHA를 Candidate에 일부러 넣어 봅니다. 실제 작업에서도 자주 발생하는 실수입니다.

```bash
sed -i.bak "s|sha: $API_MERGE|sha: $API_HEAD|" changes/CHG-NOTES-001/releases/candidate-001.yaml
npm run verify:candidate -- --change CHG-NOTES-001 --target-ref "$PLAN_SHA"
```

```text
ERROR: notes-api SHA mismatch: expected <API_HEAD>, found <API_MERGE>
```

`--detect` 옵션을 사용하면 오류 메시지가 달라집니다.

```bash
npm run verify:candidate -- --detect
```

```text
ERROR: candidates exist but none matches the checked-out submodule snapshot; pin one or pass --change explicitly
```

두 오류는 서로 다른 상태를 뜻합니다. Candidate가 하나도 없는 새 프로젝트는 정상일 수 있지만,
Candidate가 있는데 현재 서브모듈 상태와 하나도 맞지 않는다면 누군가 잘못된 SHA를 기록한 것입니다.

원래 상태로 되돌립니다.

```bash
mv changes/CHG-NOTES-001/releases/candidate-001.yaml.bak changes/CHG-NOTES-001/releases/candidate-001.yaml
npm run verify:candidate -- --change CHG-NOTES-001 --target-ref "$PLAN_SHA"
```

---

## 12단계 — 마무리 및 정리

`STATUS.md`에는 어떤 작업이 어느 SHA에서 끝났는지 기록합니다. 이 파일은 GitHub와 자동으로
동기화되지 않으므로 직접 갱신해야 합니다. 또한 파일 내용 자체를 증거로 보지 말고, GitHub의 실제
상태와 다시 대조해야 합니다.

```bash
cat > changes/CHG-NOTES-001/STATUS.md <<EOF
# Status — CHG-NOTES-001

**State:** CANDIDATE

## Verified candidate

- notes-api: \`$API_MERGE\` (PR #1, squash merge)
- notes-cli: \`$CLI_MERGE\` (PR #1, squash merge)
- 각 서비스 \`node --test tests/\`: 통과
- candidate SHA 검증: 통과
- 원격 도달성: 양쪽 모두 origin/main에서 도달 가능

## Next gate

사람이 candidate를 승인하고 root candidate PR을 merge한다.
EOF

git add changes/CHG-NOTES-001 services
git commit -qm "chore(CHG-NOTES-001): assemble candidate 001"
npm run verify:registry -- --change CHG-NOTES-001 --strict
npm test
```

실제 팀에서는 이 커밋으로 루트 Candidate PR을 만듭니다. 사람이 이 PR을 승인하고 병합해야
Change가 완료됩니다. 각 서비스 저장소의 PR을 병합한 시점이 Change 완료 시점은 아닙니다.

이 실습에서 만든 worktree를 정리합니다.

```bash
git -C services/notes-api worktree remove "$A"
git -C services/notes-cli worktree remove "$C"
```

실습용 저장소를 삭제합니다. `delete_repo` 토큰 범위가 없다면
`gh auth refresh -s delete_repo`를 먼저 실행하거나 GitHub 웹에서 직접 삭제하세요.

```bash
gh repo delete "$OWNER/tutorial-notes-api" --yes
gh repo delete "$OWNER/tutorial-notes-cli" --yes
rm -rf "$TUT"
```

---

## 이번 실습에서 확인한 내용

| 의도된 실패 | 확인한 보호 장치 |
|---|---|
| ① 중복 `write_paths` | 두 작업자가 같은 파일을 덮어쓰는 상황을 코드 작성 전에 차단 |
| ② 범위 밖 수정 | 작업자가 선언된 범위를 벗어난 변경을 로컬 commit 전에 차단 |
| ③ 헤드 SHA를 Candidate에 기록 | 검증하지 않은 조합을 Candidate로 확정하는 실수를 차단 |

계약을 먼저 승인했기 때문에 두 서비스는 서로의 구현을 기다리지 않고 병렬로 작업할 수 있었습니다.
이 구조의 목적도 바로 여기에 있습니다.

## 도구가 자동으로 검사하지 않는 항목

- **계획 부합성:** 결과를 `PLAN.md`와 자동으로 비교하는 기능은 없습니다. 수용 기준에 맞는지는
  사람이 직접 확인해야 합니다. SHA 검사는 어떤 코드가 선택됐는지는 보여주지만, 그 코드가 합의한
  방식대로 동작하는지까지 증명하지는 않습니다.
- **사람이 기록한 설명의 의미:** `verify:prs`는 PR/SHA/독립 승인을 대조하지만, `STATUS.md`의
  설명과 Candidate evidence의 의미가 충분한지는 사람이 검토해야 합니다.

## 실습과 실제 팀 작업의 차이

- 8단계에서는 본인이 직접 병합했지만, 실제 팀에서는 구현자가 아닌 사람의 독립 리뷰와 CI 통과가
  먼저 이루어져야 합니다. 계획 작성자가 자신의 계획을 혼자 승인해서도 안 됩니다.
- 실제 Agent는 외부망에서 로컬 commit과 handoff까지만 수행합니다. 사내 Wi-Fi의 사람이
  동일한 branch와 SHA를 확인한 뒤 push와 GitHub 작업을 이어받습니다.
- 서비스 저장소 PR은 리뷰를 통과하면 바로 병합합니다. 스프린트가 끝날 때까지 열어두면 병합 SHA가
  생성되지 않아 Candidate를 확정할 수 없습니다.
- 저장소 간 E2E 검증은 루트 저장소가 Candidate 조합을 대상으로 실행합니다. 작업자는 형제 서비스의
  병합 SHA가 아직 없으므로 자신의 저장소에서 계약 기반 테스트만 수행합니다.
- 각 서비스 저장소에는 CI와 `CODEOWNERS`를 설정하고, 조율 저장소에는 브랜치 보호 규칙을 적용합니다.

## 다음에 읽을 것

- [`../RUNBOOK.md`](../RUNBOOK.md) — 팀이 Change를 운영하는 전체 순서와 역할 분담
- [`../AGENTS.md`](../AGENTS.md) — 에이전트와 작업자가 지켜야 하는 규칙 전문
- [`todo/`](./todo/) — 실제 PR과 병합 SHA가 남아 있는 완성된 사례
