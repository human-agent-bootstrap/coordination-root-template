import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { createOrchestrationServer } from '../scripts/orchestration/server.mjs';

let root;
let server;
let origin;

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'orchestration-browser-'));
  mkdirSync(join(root, 'changes'), { recursive: true });
  mkdirSync(join(root, 'changes/CHG-EXISTING-001'), { recursive: true });
  writeFileSync(join(root, 'changes/CHG-EXISTING-001/WORK_UNITS.yaml'), `schema_version: 1
change_id: CHG-EXISTING-001
state: draft
work_units: []
`);
  mkdirSync(join(root, 'services/api'), { recursive: true });
  writeFileSync(join(root, 'services/registry.yaml'), `version: 2
github:
  host: github.com
services:
  - id: api
    path: services/api
    repo: https://github.com/acme/api.git
    owners: [acme/api]
    verify: [npm test]
`);
  writeFileSync(join(root, '.gitmodules'), `[submodule "services/api"]
  path = services/api
  url = https://github.com/acme/api.git
`);
  for (const directory of [join(root, 'services/api'), root]) {
    execFileSync('git', ['init', '-qb', 'main'], { cwd: directory });
    execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: directory });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: directory });
    execFileSync('git', ['config', 'advice.addEmbeddedRepo', 'false'], { cwd: directory });
    if (directory !== root) writeFileSync(join(directory, 'README.md'), 'api\n');
    execFileSync('git', ['add', '.'], { cwd: directory });
    execFileSync('git', ['commit', '-qm', 'base'], { cwd: directory });
  }
  server = createOrchestrationServer({ root });
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolvePromise) => server.close(resolvePromise));
  if (root) rmSync(root, { recursive: true, force: true });
});

test('meeting flow previews and saves a Change, then keeps dispatch approval-gated', async ({ page }) => {
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: '협업 계획 세우기' })).toBeVisible();
  await expect(page.getByText('main', { exact: true })).toBeVisible();
  await expect(page.getByText('CHG-EXISTING-001', { exact: true })).toBeVisible();

  await page.getByLabel('계획 ID').first().fill('CHG-BROWSER-001');
  await page.getByLabel('계획 제목').fill('브라우저 계획');
  await page.getByLabel('진행자').fill('jpyoon');
  await page.getByLabel('완료했을 때 달라지는 점').fill('회의 결과를 작업 문서로 저장한다.');
  await page.getByRole('button', { name: '다음: 범위와 완료 기준' }).click();

  await page.getByLabel('이번에 하지 않을 일').fill('GitHub 작업은 자동화하지 않는다.');
  await page.getByLabel('사용자 흐름').fill('회의를 진행한다.\n계획을 검토한다.');
  await page.getByLabel('완료 기준').fill('계획 파일이 생성된다.\n승인 전 작업 패킷은 차단된다.');
  await page.getByLabel('api').check();
  await page.getByRole('button', { name: '다음: 작업 나누기' }).click();

  await page.getByRole('button', { name: '작업 추가' }).click();
  await page.getByLabel('작업 ID').fill('api-change');
  await page.getByLabel('이 작업의 목표').fill('API 변경을 구현한다.');
  await page.getByLabel('담당자').fill('alice');
  await page.getByLabel('수정할 파일 또는 폴더').fill('src/api/**\ntests/**');
  await page.getByRole('button', { name: '다음: 서비스 간 계약' }).click();
  await expect(page.getByLabel('공유 계약을 사용하지 않음')).toBeChecked();
  await page.getByRole('button', { name: '다음: 검토하고 저장하기' }).click();

  await page.getByRole('button', { name: '계획 검토하기' }).click();
  await expect(page.locator('#validation-summary')).toContainText('검사 통과');
  await expect(page.getByRole('tab', { name: 'WORK_UNITS.yaml' })).toBeVisible();
  await page.getByRole('button', { name: '새 계획 저장' }).click();
  await expect(page.getByText('계획을 저장했습니다.')).toBeVisible();
  assert.equal(existsSync(join(root, 'changes/CHG-BROWSER-001/WORK_UNITS.yaml')), true);

  await page.getByRole('button', { name: '승인된 계획으로 작업 시작' }).click();
  await page.getByLabel('계획 커밋 SHA').fill('a'.repeat(40));
  await page.getByLabel('계획 ID').last().fill('CHG-BROWSER-001');
  await page.getByRole('button', { name: '시작할 수 있는 작업 확인' }).click();
  await expect(page.locator('#dispatch-result')).toContainText('승인된 계획');
});
