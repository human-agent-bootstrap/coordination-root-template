import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import {
  buildChangeFiles,
  saveChange,
  validateDraft,
} from '../scripts/orchestration/change-service.mjs';
import { createOrchestrationServer, repositoryContext } from '../scripts/orchestration/server.mjs';

function rootFixture() {
  const root = mkdtempSync(join(tmpdir(), 'orchestration-ui-'));
  mkdirSync(join(root, 'changes'), { recursive: true });
  mkdirSync(join(root, 'services/api/.git'), { recursive: true });
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
  return root;
}

function serverFixture() {
  const root = rootFixture();
  const service = join(root, 'services/api');
  rmSync(join(service, '.git'), { recursive: true, force: true });
  execFileSync('git', ['init', '-qb', 'main'], { cwd: service });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: service });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: service });
  writeFileSync(join(service, 'README.md'), 'api\n');
  execFileSync('git', ['add', '.'], { cwd: service });
  execFileSync('git', ['commit', '-qm', 'service base'], { cwd: service });
  execFileSync('git', ['init', '-qb', 'main'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  execFileSync('git', ['config', 'advice.addEmbeddedRepo', 'false'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'root base'], { cwd: root });
  return root;
}

async function withServer(root, callback) {
  const server = createOrchestrationServer({ root });
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  }
}

function requestWithHost(origin, path, host) {
  const target = new URL(path, origin);
  return new Promise((resolvePromise, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      headers: { host },
    }, (response) => {
      response.resume();
      response.on('end', () => resolvePromise(response.statusCode));
    });
    request.on('error', reject);
    request.end();
  });
}

const baseSha = 'a'.repeat(40);
const validDraft = {
  changeId: 'CHG-TEST-001',
  title: '계획 회의 산출물',
  coordinator: 'jpyoon',
  goal: '회의 내용을 검증 가능한 작업 계획으로 만든다.',
  nonGoals: ['GitHub 작업은 자동화하지 않는다.'],
  userFlow: ['회의 내용을 작성한다.', '산출물을 검토하고 저장한다.'],
  acceptanceCriteria: ['계획 파일이 생성된다.', '승인 전 패킷 발급이 차단된다.'],
  services: ['api'],
  noSharedContract: true,
  contracts: [],
  workUnits: [{
    id: 'api-change',
    service: 'api',
    goal: 'API 변경을 구현한다.',
    writer: 'alice',
    writePaths: ['src/api/**', 'tests/**'],
    dependsOn: [],
    verify: [],
  }],
};

test('validation reports plain field-addressable errors', () => {
  const result = validateDraft({ ...validDraft, goal: '', acceptanceCriteria: [], workUnits: [] }, {
    services: [{ id: 'api', verify: ['npm test'] }],
  });
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map(({ field }) => field), ['goal', 'acceptanceCriteria', 'workUnits']);
  assert.match(result.errors[0].message, /목표/);
});

test('validation blocks parallel work units with overlapping paths', () => {
  const result = validateDraft({
    ...validDraft,
    workUnits: [
      validDraft.workUnits[0],
      { ...validDraft.workUnits[0], id: 'api-auth', writer: 'bob', writePaths: ['src/api/auth/**'] },
    ],
  }, { services: [{ id: 'api', verify: ['npm test'] }] });
  assert.equal(result.valid, false);
  assert.equal(result.errors.at(-1).code, 'PATH_OVERLAP');
  assert.match(result.errors.at(-1).message, /같은 경로/);
});

test('build derives branches, base SHAs, inherited checks, and canonical files', () => {
  const files = buildChangeFiles(validDraft, {
    rootHead: 'b'.repeat(40),
    services: [{ id: 'api', path: 'services/api', verify: ['npm test'], baseSha }],
  });
  assert.deepEqual([...files.keys()].sort(), [
    'PLAN.md',
    'PRS.yaml',
    'STATUS.md',
    'WORK_UNITS.yaml',
    'contracts/README.md',
    'releases/candidate-001.yaml',
  ]);
  const manifest = YAML.parse(files.get('WORK_UNITS.yaml'));
  const unit = manifest.work_units.find(({ id }) => id === 'api-change');
  assert.equal(unit.branch, 'feat/CHG-TEST-001/api-change');
  assert.equal(unit.base_sha, baseSha);
  assert.deepEqual(unit.verify, ['npm test']);
  assert.match(files.get('PLAN.md'), /\[AC-001\] 계획 파일이 생성된다/);
});

test('generated manifest is approval-ready while dispatch remains SHA-gated', () => {
  const files = buildChangeFiles(validDraft, {
    rootHead: 'b'.repeat(40),
    services: [{ id: 'api', path: 'services/api', verify: ['npm test'], baseSha }],
  });
  const manifest = YAML.parse(files.get('WORK_UNITS.yaml'));
  assert.equal(manifest.state, 'approved');
  assert.equal(manifest.work_units.find(({ id }) => id === 'contract-and-plan').state, 'in_progress');
  assert.equal(manifest.work_units.find(({ id }) => id === 'api-change').state, 'ready');
});

test('save writes a complete artifact set and refuses overwrite', () => {
  const root = rootFixture();
  try {
    const files = buildChangeFiles(validDraft, {
      rootHead: 'b'.repeat(40),
      services: [{ id: 'api', path: 'services/api', verify: ['npm test'], baseSha }],
    });
    const saved = saveChange(root, validDraft.changeId, files);
    assert.equal(saved.files.length, 6);
    assert.match(readFileSync(join(root, 'changes/CHG-TEST-001/PLAN.md'), 'utf8'), /계획 회의 산출물/);
    assert.throws(() => saveChange(root, validDraft.changeId, files), /이미 존재/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validation rejects unsafe identifiers and contract paths', () => {
  const unsafeId = validateDraft({ ...validDraft, changeId: '../escape' }, {
    services: [{ id: 'api', verify: ['npm test'] }],
  });
  assert.equal(unsafeId.valid, false);
  assert.ok(unsafeId.errors.some(({ field }) => field === 'changeId'));

  const unsafeContract = validateDraft({
    ...validDraft,
    noSharedContract: false,
    contracts: [{ name: '../secret.md', content: 'x' }],
  }, { services: [{ id: 'api', verify: ['npm test'] }] });
  assert.equal(unsafeContract.valid, false);
  assert.ok(unsafeContract.errors.some(({ field }) => field === 'contracts.0.name'));
});

test('validation rejects duplicate contract file names', () => {
  const result = validateDraft({
    ...validDraft,
    noSharedContract: false,
    contracts: [
      { name: 'api.md', content: 'first' },
      { name: 'api.md', content: 'second' },
    ],
  }, { services: [{ id: 'api', verify: ['npm test'] }] });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(({ code }) => code === 'DUPLICATE_CONTRACT'));
});

test('validation requires every work unit service to participate in the Change', () => {
  const result = validateDraft({ ...validDraft, services: [] }, {
    services: [{ id: 'api', verify: ['npm test'] }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(({ code }) => code === 'SERVICE_NOT_SELECTED'));
});

test('validation requires every selected service to own a work unit', () => {
  const result = validateDraft({ ...validDraft, services: ['api', 'web'] }, {
    services: [
      { id: 'api', verify: ['npm test'] },
      { id: 'web', verify: ['npm test'] },
    ],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(({ code }) => code === 'SERVICE_WITHOUT_WORK'));
});

test('validation requires safe coordinator and writer identifiers', () => {
  const result = validateDraft({
    ...validDraft,
    coordinator: 'team lead',
    workUnits: [{ ...validDraft.workUnits[0], writer: 'alice\nadmin' }],
  }, { services: [{ id: 'api', verify: ['npm test'] }] });
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.filter(({ code }) => code === 'INVALID_ID').map(({ field }) => field), [
    'coordinator', 'workUnits.0.writer',
  ]);
});

test('server reports repository state and registered service bases', async () => {
  const root = serverFixture();
  try {
    await withServer(root, async (origin) => {
      const response = await fetch(`${origin}/api/status`);
      assert.equal(response.status, 200);
      const status = await response.json();
      assert.equal(status.branch, 'main');
      assert.match(status.head, /^[0-9a-f]{40}$/);
      assert.equal(status.services[0].id, 'api');
      assert.match(status.services[0].baseSha, /^[0-9a-f]{40}$/);
      assert.deepEqual(status.changes, []);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('registry v2 requires every service base to come from a committed gitlink', () => {
  const root = rootFixture();
  try {
    rmSync(join(root, 'services/api/.git'), { recursive: true, force: true });
    execFileSync('git', ['init', '-qb', 'main'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
    execFileSync('git', ['add', 'services/registry.yaml', '.gitmodules'], { cwd: root });
    execFileSync('git', ['commit', '-qm', 'root without service gitlink'], { cwd: root });
    assert.throws(() => repositoryContext(root), /등록 커밋/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('preview is non-mutating and save requires its current revision', async () => {
  const root = serverFixture();
  try {
    await withServer(root, async (origin) => {
      const headers = { 'content-type': 'application/json' };
      const previewResponse = await fetch(`${origin}/api/changes/preview`, {
        method: 'POST', headers, body: JSON.stringify(validDraft),
      });
      assert.equal(previewResponse.status, 200);
      const preview = await previewResponse.json();
      assert.equal(preview.valid, true);
      assert.equal(preview.validation.exitCode, 0);
      assert.ok(preview.files.some(({ path }) => path === 'WORK_UNITS.yaml'));
      assert.equal(existsSync(join(root, 'changes/CHG-TEST-001')), false);

      const staleResponse = await fetch(`${origin}/api/changes`, {
        method: 'POST', headers, body: JSON.stringify({ draft: validDraft, revision: 'stale' }),
      });
      assert.equal(staleResponse.status, 409);

      const saveResponse = await fetch(`${origin}/api/changes`, {
        method: 'POST', headers, body: JSON.stringify({ draft: validDraft, revision: preview.revision }),
      });
      assert.equal(saveResponse.status, 201);
      assert.equal(existsSync(join(root, 'changes/CHG-TEST-001/PLAN.md')), true);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('server rejects non-JSON writes and unknown operations', async () => {
  const root = serverFixture();
  try {
    await withServer(root, async (origin) => {
      const unsupported = await fetch(`${origin}/api/run-command`, { method: 'POST' });
      assert.equal(unsupported.status, 404);
      const wrongType = await fetch(`${origin}/api/changes/preview`, { method: 'POST', body: '{}' });
      assert.equal(wrongType.status, 415);
      assert.equal(await requestWithHost(origin, '/api/status', 'attacker.example'), 403);
      const crossOrigin = await fetch(`${origin}/api/changes/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
        body: JSON.stringify(validDraft),
      });
      assert.equal(crossOrigin.status, 403);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dispatch stays locked for an unapproved working-tree draft', async () => {
  const root = serverFixture();
  try {
    await withServer(root, async (origin) => {
      const response = await fetch(`${origin}/api/dispatch?change=CHG-MISSING-001&planSha=${'a'.repeat(40)}`);
      assert.equal(response.status, 422);
      const result = await response.json();
      assert.match(result.error, /승인된 계획/);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('approved plan creates a task packet through bootstrap rules', async () => {
  const root = serverFixture();
  try {
    mkdirSync(join(root, 'changes/CHG-APPROVED-001/contracts'), { recursive: true });
    writeFileSync(join(root, 'changes/CHG-APPROVED-001/contracts/api.md'), '# API\n');
    const serviceSha = execFileSync('git', ['-C', join(root, 'services/api'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    writeFileSync(join(root, 'changes/CHG-APPROVED-001/WORK_UNITS.yaml'), `schema_version: 1
change_id: CHG-APPROVED-001
state: approved
work_units:
  - id: contract-and-plan
    repo: root
    state: in_progress
    goal: approve
    branch: change/CHG-APPROVED-001/coordination
    base_sha: ${execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()}
    writer: coordinator
    write_paths: [changes/CHG-APPROVED-001/**]
    depends_on: []
    verify: [npm test]
  - id: api-change
    repo: api
    state: ready
    goal: implement
    branch: feat/CHG-APPROVED-001/api-change
    base_sha: ${serviceSha}
    writer: alice
    write_paths: [src/**]
    depends_on: [contract-and-plan]
    verify: [npm test]
`);
    execFileSync('git', ['add', 'changes/CHG-APPROVED-001'], { cwd: root });
    execFileSync('git', ['commit', '-qm', 'approved plan'], { cwd: root });
    const planSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

    await withServer(root, async (origin) => {
      const eligibleResponse = await fetch(`${origin}/api/dispatch?change=CHG-APPROVED-001&planSha=${planSha}`);
      assert.equal(eligibleResponse.status, 200);
      const eligible = await eligibleResponse.json();
      assert.deepEqual(eligible.units.map(({ id }) => id), ['api-change']);

      const forbiddenResponse = await fetch(`${origin}/api/packets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          change: 'CHG-APPROVED-001', unit: 'contract-and-plan', writer: 'coordinator',
          run: 'run-forbidden-001', planSha,
        }),
      });
      assert.equal(forbiddenResponse.status, 422);

      const wrongWriterResponse = await fetch(`${origin}/api/packets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          change: 'CHG-APPROVED-001', unit: 'api-change', writer: 'mallory',
          run: 'run-wrong-writer-001', planSha,
        }),
      });
      assert.equal(wrongWriterResponse.status, 422);

      const packetResponse = await fetch(`${origin}/api/packets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          change: 'CHG-APPROVED-001', unit: 'api-change', writer: 'alice',
          run: 'run-api-001', planSha,
        }),
      });
      assert.equal(packetResponse.status, 201);
      const packet = await packetResponse.json();
      assert.equal(packet.path, '.task-packets/run-api-001.md');
      assert.match(packet.digest, /^[0-9a-f]{64}$/);
      assert.match(readFileSync(join(root, packet.path), 'utf8'), new RegExp(`Plan SHA: ${planSha}`));
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dispatch rendering treats approved manifest text as text, not HTML', () => {
  const source = readFileSync(join(import.meta.dirname, '../ui/app.js'), 'utf8');
  const packetFunction = source.slice(source.indexOf('function packetForm'), source.indexOf('async function checkDispatch'));
  assert.doesNotMatch(packetFunction, /innerHTML/);
  assert.match(packetFunction, /textContent = unit\.goal/);
});
