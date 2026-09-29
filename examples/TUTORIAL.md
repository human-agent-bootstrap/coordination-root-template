# 튜토리얼 — 실제 submodule로 한 사이클 직접 돌려보기

이 문서는 **처음부터 끝까지 직접 타이핑하며 따라가는** 실습입니다. GitHub에 있는 두 개의
서비스 레포를 submodule로 연동해, 하나의 Change를 계획하고 병렬로 구현하고 PR을 merge한 뒤
exact SHA candidate로 검증하는 전체 흐름을 한 번 완주합니다.

중간에 **의도된 실패가 3번** 있습니다. 건너뛰지 마세요. 도구가 무엇을 막아주는지 직접 보는
것이 이 실습의 핵심입니다.

| 준비물 | 확인 |
|---|---|
| Node.js 22 이상 | `node --version` |
| git (submodule 지원) | `git --version` |
| GitHub CLI 인증 | `gh auth status` |
| **서비스 레포 2개** | 아래 0단계에서 직접 생성 |

> 기대 출력의 **SHA 값은 실행마다 달라집니다.** 값이 아니라 형태와 성공·실패 여부를
> 비교하세요. 그 외 문장은 실제 실행 결과를 옮긴 것입니다.

완성된 실제 사례를 *읽고* 싶다면 [`todo/`](./todo/)를 보세요. 이 문서는 *직접 해보는* 쪽입니다.

---

## 0단계 — 서비스 레포 2개 준비

실제 프로젝트라면 팀이 이미 가진 레포를 씁니다. 실습에서는 두 개를 새로 만듭니다.
**`<OWNER>`는 본인 계정 또는 조직 이름으로 바꾸세요.**

```bash
export OWNER=<your-account-or-org>
export TUT=~/tutorial-notes
mkdir -p "$TUT/worktrees"
```

레포 2개를 만들고 각각 초기 커밋을 올립니다.

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

두 레포가 보이면 준비 완료입니다. 실습이 끝나면 **직접 삭제**하세요 (12단계에 명령이 있습니다).

이제 조율 레포를 준비합니다.

```bash
git clone --depth 1 https://github.com/human-agent-bootstrap/coordination-root-template.git "$TUT/root"
cd "$TUT/root"
rm -rf .git && git init -q .
git config user.email you@example.com
git config user.name "Your Name"
npm ci
git add -A && git commit -qm "chore: coordination baseline"

npm run init -- --name notes-coord --org "$OWNER" --apply
```

```text
APPLIED: initialized notes-coord
Next: npm run service:add -- --id <id> --repo <url> --apply, then npm run change:create.
```

`init`은 플레이스홀더를 치환하고 `examples/`를 지웁니다. 지금 읽는 이 파일도 지워지니 문서는
브라우저나 다른 창에 열어 두세요.

상태가 green인지 확인합니다. **서비스 0개, Change 0개에서도 통과해야 정상입니다.**

```bash
npm test
npm run verify:registry
npm run verify:candidate -- --detect
```

```text
ℹ pass 27
NOTE: no services registered yet. Add one with: npm run service:add -- --id <id> --repo <url> --apply
Registry PASS: 0 service(s) []; 0 change(s) validated; 0 warning(s).
NOTE: no release candidate is declared yet; nothing to verify.
```

---

## 1단계 — 서비스를 submodule로 등록

`service:add`는 `git submodule add`와 레지스트리 등록을 한 번에 하고, 끝나면 바로
재검증합니다. 두 파일을 손으로 맞추며 일치하길 바라는 일이 없어집니다.

```bash
npm run service:add -- --id notes-api \
  --repo "https://github.com/$OWNER/tutorial-notes-api.git" \
  --stack node --verify "node --test tests/" --apply

npm run service:add -- --id notes-cli \
  --repo "https://github.com/$OWNER/tutorial-notes-cli.git" \
  --stack node --verify "node --test tests/" --apply
```

두 번째 명령 뒤:

```text
Registry PASS: 2 service(s) [notes-api, notes-cli]; 0 change(s) validated; 0 warning(s).
Next: record notes-cli in a change's work units, and add it to CODEOWNERS.
```

무엇이 만들어졌는지 확인합니다.

```bash
git submodule status
cat services/registry.yaml
cat .gitmodules
```

```text
 <sha> services/notes-api (heads/main)
 <sha> services/notes-cli (heads/main)
```

`--verify`로 준 명령이 레지스트리에 저장된 것을 보세요. 이후 work unit이 자기 verify를
선언하지 않으면 **이 명령을 상속합니다.** 서비스마다 테스트 명령을 반복 입력하지 않는
이유입니다. `verify:registry`는 레지스트리와 `.gitmodules`가 **양방향으로** 일치하는지
검사하므로, 한쪽만 고치면 실패합니다.

submodule 포인터를 commit합니다. 이 포인터가 "지금 조율 대상인 정확한 코드"입니다.

```bash
git add .gitmodules services
git commit -qm "chore: register notes-api and notes-cli as submodules"
```

---

## 2단계 — Change 열고 계약 확정

사용자에게 드러나는 결과 하나를 Change로 만듭니다.

```bash
npm run change:create -- --change CHG-NOTES-001 --apply
ls changes/CHG-NOTES-001
```

```text
APPLIED: wrote 6 file(s) under changes/CHG-NOTES-001
contracts	PLAN.md		PRS.yaml	releases	STATUS.md	WORK_UNITS.yaml
```

스켈레톤에는 `contracts/api.openapi.yaml` 자리표시자가 있습니다. 우리는 HTTP API가 아니라
JSON 레코드 계약을 쓰므로 **지우고** 우리 계약을 넣습니다. 지우지 않으면 뒤에서 task packet이
쓰지도 않을 계약을 나열합니다.

```bash
rm changes/CHG-NOTES-001/contracts/api.openapi.yaml
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

**이 계약이 실습의 중심입니다.** 두 서비스가 서로의 소스를 보지 않고 병렬로 작업할 수 있는
이유가 이것뿐입니다. `PLAN.md`의 수용 기준도 계약에 맞춰 관찰 가능한 결과로 적으세요 — 예:
"title은 trim 후 1~100자", "done 초기값은 false". "잘 동작한다"는 수용 기준이 아닙니다.

---

## 3단계 — work unit으로 나누기

각 work unit의 `base_sha`는 **submodule의 현재 정확한 SHA**입니다. `main` 같은 이동 ref를
적으면 안 됩니다.

```bash
export API_BASE=$(git -C services/notes-api rev-parse HEAD)
export CLI_BASE=$(git -C services/notes-cli rev-parse HEAD)
export ROOT_BASE=$(git rev-parse HEAD)
printf 'api=%s\ncli=%s\n' "$API_BASE" "$CLI_BASE"
```

Writer 한 명당 항목 하나. 두 서비스가 서로 다른 레포이므로 병렬이 가능합니다.

```bash
cat > changes/CHG-NOTES-001/WORK_UNITS.yaml <<EOF
change_id: CHG-NOTES-001
state: approved
plan_base_sha: $ROOT_BASE
work_units:
  - id: contract
    repo: root
    goal: Approve the note contract.
    branch: change/CHG-NOTES-001/coordination
    base_sha: $ROOT_BASE
    write_paths: [changes/CHG-NOTES-001/**]
    depends_on: []
    verify: [npm test]

  - id: note-create
    repo: notes-api
    goal: Create a note that satisfies the contract.
    branch: feat/CHG-NOTES-001/note-create
    base_sha: $API_BASE
    write_paths: [src/**, tests/**]
    depends_on: [contract]
    verify: []

  - id: note-render
    repo: notes-cli
    goal: Render a note received from the API.
    branch: feat/CHG-NOTES-001/note-render
    base_sha: $CLI_BASE
    write_paths: [src/**, tests/**]
    depends_on: [contract]
    verify: []
EOF
npm run verify:registry -- --change CHG-NOTES-001 --strict
```

```text
Registry PASS: 2 service(s) [notes-api, notes-cli]; 1 change(s) validated; 0 warning(s).
```

`verify: []`로 비워둔 두 구현 unit은 1단계에서 레지스트리에 넣은 `node --test tests/`를
상속합니다.

---

## 4단계 — 의도된 실패 ①: 같은 레포를 두 사람이 주장

팀이 실제로 가장 자주 만드는 사고입니다. `note-render`의 `repo`를 실수로 `notes-api`로
적었다고 해봅시다. 두 unit이 같은 레포의 같은 경로를 동시에 주장하게 됩니다.

```bash
sed -i.bak 's|^    repo: notes-cli$|    repo: notes-api|' changes/CHG-NOTES-001/WORK_UNITS.yaml
npm run verify:registry -- --change CHG-NOTES-001 --strict
```

```text
WARNING: CHG-NOTES-001: concurrent units note-create and note-render both write src/**, tests/** in repo notes-api
ERROR: 1 write-path overlap(s) between concurrent work units
```

**exit code 1.** 구현을 시작하기 전에 막혔습니다. 두 사람이 같은 파일을 서로 덮어쓰는 상황을
코드 한 줄 쓰기 전에 잡아낸 것입니다.

되돌립니다.

```bash
mv changes/CHG-NOTES-001/WORK_UNITS.yaml.bak changes/CHG-NOTES-001/WORK_UNITS.yaml
npm run verify:registry -- --change CHG-NOTES-001 --strict
```

> 두 작업이 **정말로** 같은 파일을 건드려야 한다면 길은 두 가지뿐입니다. 한 사람에게 묶거나,
> `depends_on`으로 순서를 주는 것. `depends_on`으로 연결된 unit은 순차 실행이므로 경고가
> 나지 않습니다. 병렬로 두는 선택지는 없습니다.

계획을 commit합니다. 실제 팀에서는 여기서 planning PR을 올려 **사람의 승인**을 받고, 그 merge
SHA가 모든 Writer가 기준으로 삼는 불변 계획 버전이 됩니다.

```bash
git add changes/CHG-NOTES-001
git commit -qm "plan(CHG-NOTES-001): define the note contract and work units"
```

---

## 5단계 — task packet 발급

packet은 Writer에게 주는 브리핑 전부입니다. 사람이 직접 구현하든 에이전트에게 맡기든 같은
것을 받습니다.

```bash
npm run bootstrap -- --change CHG-NOTES-001 --unit note-create --writer alice --run run-api-001 --apply
npm run bootstrap -- --change CHG-NOTES-001 --unit note-render --writer bob --run run-cli-001 --apply
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
- Read AGENTS.md and WORKFLOW.md in the Root repository before implementation.
- Approved contract snapshots (do not modify):
  - changes/CHG-NOTES-001/contracts/note.schema.json
- Do not modify the Root coordination files or another repository.

# VERIFY (service registry)
- node --test tests/ (expect exit 0)
```

계약 경로가 **Change에서 자동으로 도출**됐고(하드코딩이 아닙니다), verify 명령에
`(service registry)`라고 출처가 붙어 있습니다.

packet 생성은 **브랜치도 worktree도 만들지 않습니다.** 작업 공간 격리는 의도적으로 분리된
단계입니다.

에이전트에게 맡긴다면 이렇게 전달합니다. 도구가 무엇이든 같은 문장입니다.

```text
Read AGENTS.md and the task packet at .task-packets/run-api-001.md.
Execute work unit note-create for change CHG-NOTES-001 in the assigned worktree.
Do not modify anything outside the declared write_paths.
Run every declared verification command and report the actual exit codes.
```

---

## 6단계 — 격리된 worktree에서 병렬 구현

Writer마다 자기 worktree를 갖습니다. **submodule 안에서 worktree를 만듭니다** — 조율 레포가
아니라 서비스 레포의 작업 공간입니다.

```bash
git -C services/notes-api worktree add -b feat/CHG-NOTES-001/note-create "$TUT/worktrees/note-create" "$API_BASE"
git -C services/notes-cli worktree add -b feat/CHG-NOTES-001/note-render "$TUT/worktrees/note-render" "$CLI_BASE"
export A="$TUT/worktrees/note-create" C="$TUT/worktrees/note-render"
git -C services/notes-api worktree list
```

브랜치를 `base_sha`에서 시작한다는 점이 중요합니다. `main`에서 따는 것이 아닙니다.

`notes-api` 쪽 구현입니다. **계약만 보고 씁니다.**

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

`notes-cli` 쪽입니다. **상대 서비스의 소스를 읽지 않습니다.** 공유 기준은 계약뿐입니다.

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

**선언된 verify 명령을 실제로 실행합니다.** packet에 적힌 그대로입니다.

```bash
(cd "$A" && node --test tests/)
(cd "$C" && node --test tests/)
```

둘 다 `pass 2`, `fail 0`이어야 합니다. 증거는 "통과할 것 같다"가 아니라 **실행한 명령과 실제
exit code**입니다.

---

## 7단계 — 의도된 실패 ②: 허용 경로를 벗어나기

허용되지 않은 파일을 건드려 봅니다.

```bash
cd "$TUT/root"
echo "oops" > "$A/README.md"
node scripts/workflow-check.mjs --change CHG-NOTES-001 --unit note-create --repo-path "$A"
```

```text
ERROR: scope violation: README.md
```

**exit code 1.** `write_paths`에 `README.md`가 없으므로 push 전에 막혔습니다. 되돌립니다.

```bash
git -C "$A" checkout -- README.md
node scripts/workflow-check.mjs --change CHG-NOTES-001 --unit note-create --repo-path "$A"
```

```text
Workflow check PASS: CHG-NOTES-001/note-create; base <API_BASE>; 2 changed file(s).
```

> 실제 작업에서는 각 Writer가 자기 worktree에서 `npm run workflow:check`만 실행하면 됩니다.
> 현재 브랜치 이름에서 Change와 work unit을 스스로 도출합니다.

---

## 8단계 — PR 올리고 squash merge

각 Writer가 **자기 서비스 레포에만** push합니다.

```bash
for d in "$A" "$C"; do
  git -C "$d" add src tests
  git -C "$d" commit -qm "feat(CHG-NOTES-001): implement against the approved note contract"
done
git -C "$A" push -qu origin feat/CHG-NOTES-001/note-create
git -C "$C" push -qu origin feat/CHG-NOTES-001/note-render
```

PR을 만듭니다. 본문에 Change ID·work unit·base SHA·실행한 검증을 남깁니다.

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

실제 팀에서는 여기서 **구현자가 아닌 사람**의 독립 리뷰와 CI를 통과해야 합니다. 리뷰가 끝나면
사람이 merge합니다. 실습에서는 본인이 merge합니다.

merge 전에 PR의 head SHA를 기록해 두세요. 곧 비교합니다.

```bash
export API_HEAD=$(git -C "$A" rev-parse HEAD)
gh pr merge --repo "$OWNER/tutorial-notes-api" --squash --delete-branch feat/CHG-NOTES-001/note-create
gh pr merge --repo "$OWNER/tutorial-notes-cli" --squash --delete-branch feat/CHG-NOTES-001/note-render
```

**여기가 이 실습에서 가장 중요한 지점입니다.** squash merge는 새 커밋을 만들므로 PR의 head
SHA와 merge SHA가 **다릅니다.** candidate에 필요한 것은 merge SHA입니다.

```bash
export API_MERGE=$(gh pr view 1 --repo "$OWNER/tutorial-notes-api" --json mergeCommit --jq .mergeCommit.oid)
export CLI_MERGE=$(gh pr view 1 --repo "$OWNER/tutorial-notes-cli" --json mergeCommit --jq .mergeCommit.oid)
printf 'PR head SHA : %s\nmerge SHA   : %s\n' "$API_HEAD" "$API_MERGE"
```

두 값이 다른 것을 직접 확인하세요. **head SHA를 candidate에 넣는 것이 결함입니다.**

---

## 9단계 — submodule 포인터를 merge SHA로 옮기기

```bash
git -C services/notes-api fetch -q origin
git -C services/notes-cli fetch -q origin
git -C services/notes-api checkout -q "$API_MERGE"
git -C services/notes-cli checkout -q "$CLI_MERGE"
git submodule status
```

`+` 접두사는 조율 레포에 기록된 포인터와 현재 체크아웃이 다르다는 뜻입니다. 곧 commit합니다.

**원격 도달성을 직접 확인하세요.** 이것을 검사하는 스크립트는 없습니다.

```bash
git -C services/notes-api branch -r --contains "$API_MERGE"
git -C services/notes-cli branch -r --contains "$CLI_MERGE"
```

```text
  origin/HEAD -> origin/main
  origin/main
```

출력이 비어 있으면 그 SHA는 원격에 없다는 뜻이고, 다른 모든 clone에서 깨집니다.

---

## 10단계 — candidate 고정과 검증

```bash
cat > changes/CHG-NOTES-001/releases/candidate-001.yaml <<EOF
change_id: CHG-NOTES-001
candidate: 1
state: validating
services:
  - repo: notes-api
    path: services/notes-api
    sha: $API_MERGE
    source_pr: 1
  - repo: notes-cli
    path: services/notes-cli
    sha: $CLI_MERGE
    source_pr: 1
EOF
npm run verify:candidate -- --detect
```

```text
Candidate CHG-NOTES-001: PASS (2 service(s): notes-api@<12자>, notes-cli@<12자>)
```

`--detect`는 체크아웃된 submodule 스냅샷과 일치하는 candidate를 **스스로 찾아** 검증합니다.
CI에서 Change ID를 하드코딩하지 않아도 되는 이유입니다.

---

## 11단계 — 의도된 실패 ③: head SHA를 잘못 넣었을 때

8단계에서 본 PR head SHA를 candidate에 넣어 봅니다. 실제로 가장 흔한 실수입니다.

```bash
sed -i.bak "s|sha: $API_MERGE|sha: $API_HEAD|" changes/CHG-NOTES-001/releases/candidate-001.yaml
npm run verify:candidate -- --change CHG-NOTES-001
```

```text
ERROR: notes-api SHA mismatch: expected <API_HEAD>, found <API_MERGE>
```

`--detect`로 하면 다르게 말합니다.

```bash
npm run verify:candidate -- --detect
```

```text
ERROR: candidates exist but none matches the checked-out submodule snapshot; pin one or pass --change explicitly
```

두 메시지의 차이가 중요합니다. **candidate가 하나도 없는 것**(새 프로젝트, 정상)과
**candidate가 있는데 어느 것도 안 맞는 것**(누군가 잘못된 SHA를 기록함, 문제)을 구분합니다.

복구합니다.

```bash
mv changes/CHG-NOTES-001/releases/candidate-001.yaml.bak changes/CHG-NOTES-001/releases/candidate-001.yaml
npm run verify:candidate -- --detect
```

---

## 12단계 — 마감과 정리

`STATUS.md`에 무엇이 어떤 SHA로 끝났는지 남깁니다. 자동 동기화는 없으므로 손으로 기록하고,
이 파일은 **증거가 아니라 GitHub과 재확인할 주장**으로 취급합니다.

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

실제 팀에서는 이 commit이 **root candidate PR**이 되고, 사람이 승인해 merge하는 시점이
"Change 완료"입니다. 자식 PR의 merge가 아닙니다.

worktree를 정리합니다.

```bash
git -C services/notes-api worktree remove "$A"
git -C services/notes-cli worktree remove "$C"
```

실습용 레포를 지웁니다. `delete_repo` 토큰 스코프가 필요하므로, 없으면
`gh auth refresh -s delete_repo`를 먼저 실행하거나 GitHub 웹에서 지우세요.

```bash
gh repo delete "$OWNER/tutorial-notes-api" --yes
gh repo delete "$OWNER/tutorial-notes-cli" --yes
rm -rf "$TUT"
```

---

## 방금 무엇을 확인했는가

| 실패 | 막아준 것 |
|---|---|
| ① 중복 `write_paths` | 두 사람이 같은 파일을 덮어쓰는 사고를 **코드 작성 전에** 차단 |
| ② 범위 밖 수정 | Writer가 자기 범위를 몰래 넓히는 것을 **push 전에** 차단 |
| ③ head SHA를 candidate에 기록 | 검증한 적 없는 조합이 릴리스로 나가는 것을 차단 |

그리고 계약을 먼저 승인했기 때문에 두 서비스가 서로를 기다리지 않고 병렬로 구현됐습니다.
그것이 이 구조가 존재하는 이유입니다.

## 도구가 검사해주지 **않는** 것

- **원격 도달성.** 9단계에서 직접 확인했습니다. 자동 검사는 없습니다.
- **계획 부합성.** 결과를 `PLAN.md`와 비교하는 코드는 없습니다. 수용 기준을 하나씩 읽고
  확인하는 것은 사람의 일입니다. SHA 검사는 *어떤* 코드가 배포됐는지만 증명하고, 합의한
  대로 동작하는지는 증명하지 않습니다.
- **`PRS.yaml`·`STATUS.md`의 정확성.** 손으로 기록하므로 GitHub 상태와 어긋날 수 있습니다.

## 실습과 실제 팀 작업의 차이

- 8단계에서 본인이 merge했지만, 실제로는 **구현자가 아닌 사람**의 독립 리뷰와 CI 통과가
  선행됩니다. 계획을 쓴 사람이 자기 계획을 단독 승인할 수 없습니다.
- 자식 PR은 리뷰를 통과하는 **즉시** merge합니다. 스프린트 끝까지 열어두면 merge SHA가 없어
  candidate를 고정할 수 없습니다.
- 크로스 레포 e2e는 root가 candidate 조합에서 실행합니다. Writer는 자기 레포에서 계약 기반
  테스트만 할 수 있습니다 — 형제 서비스의 merge SHA가 아직 없으니까요.
- 각 서비스 레포에 CI와 `CODEOWNERS`를, 조율 레포에 branch protection을 설정합니다.

## 다음에 읽을 것

- [`../USAGE.md`](../USAGE.md) — 팀이 한 스프린트를 굴리는 전체 순서와 역할 분담
- [`../AGENTS.md`](../AGENTS.md) — 에이전트와 Writer가 지켜야 하는 규칙 전문
- [`todo/`](./todo/) — 실제 PR과 merge SHA가 남아 있는 완성된 사례
