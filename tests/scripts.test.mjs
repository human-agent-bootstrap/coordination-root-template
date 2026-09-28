import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const scripts = join(root, 'scripts');
const frontSha = 'e9f0fb31c9f72fdf1c3a30923c3d7b62a69d3166';
const backSha = '75c54550c79d5a86ab6685c3de428ff3fd261586';

function run(script, args, cwd = root) {
  return spawnSync(process.execPath, [join(scripts, script), ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'todo-collab-root-'));
  mkdirSync(join(dir, 'changes/CHG-TODO-001/releases'), { recursive: true });
  mkdirSync(join(dir, 'services/front'), { recursive: true });
  mkdirSync(join(dir, 'services/back'), { recursive: true });
  writeFileSync(join(dir, 'changes/CHG-TODO-001/WORK_UNITS.yaml'), `change_id: CHG-TODO-001\nwork_units:\n  - id: todo-ui\n    repo: front\n    branch: feat/CHG-TODO-001/todo-ui\n    base_sha: ${frontSha}\n    write_paths:\n      - src/**\n      - tests/**\n    depends_on:\n      - contract\n    verify:\n      - npm test\n`);
  writeFileSync(join(dir, 'changes/CHG-TODO-001/releases/candidate-001.yaml'), `change_id: CHG-TODO-001\ncandidate: 1\nservices:\n  - repo: front\n    path: services/front\n    sha: ${frontSha}\n  - repo: back\n    path: services/back\n    sha: ${backSha}\n`);
  return dir;
}

function workflowFixture() {
  const dir = fixture();
  const worktree = join(dir, 'child-worktree');
  mkdirSync(join(worktree, 'src'), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: worktree });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: worktree });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: worktree });
  writeFileSync(join(worktree, 'README.md'), 'baseline\n');
  writeFileSync(join(worktree, 'src/app.js'), 'export const baseline = true;\n');
  execFileSync('git', ['add', '.'], { cwd: worktree });
  execFileSync('git', ['commit', '-qm', 'baseline'], { cwd: worktree });
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: worktree, encoding: 'utf8' }).trim();
  execFileSync('git', ['checkout', '-qb', 'feat/CHG-TODO-001/todo-ui'], { cwd: worktree });
  writeFileSync(join(dir, 'changes/CHG-TODO-001/WORK_UNITS.yaml'), `change_id: CHG-TODO-001\nwork_units:\n  - id: todo-ui\n    repo: front\n    branch: feat/CHG-TODO-001/todo-ui\n    base_sha: ${base}\n    write_paths:\n      - src/**\n    depends_on: []\n    verify:\n      - npm test\n`);
  return { dir, worktree };
}

test('bootstrap defaults to dry-run and writes no task packet', () => {
  const dir = fixture();
  try {
    const result = run('bootstrap.mjs', ['--change', 'CHG-TODO-001', '--unit', 'todo-ui', '--writer', 'alice', '--run', 'run-1'], dir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DRY RUN/);
    assert.match(result.stdout, /feat\/CHG-TODO-001\/todo-ui/);
    assert.throws(() => readFileSync(join(dir, '.task-packets/run-1.md')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bootstrap apply writes a packet and refuses unknown unit', () => {
  const dir = fixture();
  try {
    const applied = run('bootstrap.mjs', ['--change', 'CHG-TODO-001', '--unit', 'todo-ui', '--writer', 'alice', '--run', 'run-2', '--apply'], dir);
    assert.equal(applied.status, 0, applied.stderr);
    const packet = readFileSync(join(dir, '.task-packets/run-2.md'), 'utf8');
    assert.match(packet, /# TASK/);
    assert.match(packet, /# HANDOFF/);
    const missing = run('bootstrap.mjs', ['--change', 'CHG-TODO-001', '--unit', 'missing', '--writer', 'alice', '--run', 'run-3'], dir);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /unknown work unit/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bootstrap apply refuses identifiers that could escape or corrupt a task packet', () => {
  const dir = fixture();
  try {
    const readme = join(dir, 'README.md');
    writeFileSync(readme, 'do not overwrite\n');
    const cases = [
      ['--run', '../README'],
      ['--change', '../CHG-TODO-001'],
      ['--unit', '../todo-ui'],
      ['--writer', 'alice\n# injected'],
    ];
    for (const [flag, value] of cases) {
      const args = ['--change', 'CHG-TODO-001', '--unit', 'todo-ui', '--writer', 'alice', '--run', 'run-escape', '--apply'];
      args[args.indexOf(flag) + 1] = value;
      const result = run('bootstrap.mjs', args, dir);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /invalid (run ID|change ID|work unit ID|writer)/);
    }
    assert.equal(readFileSync(readme, 'utf8'), 'do not overwrite\n');
    assert.equal(existsSync(join(dir, '.task-packets', '..', 'README.md.md')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('workflow check rejects an incorrect branch before validation', () => {
  const dir = fixture();
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
    writeFileSync(join(dir, 'README.md'), 'fixture');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: dir });
    const result = run('workflow-check.mjs', ['--change', 'CHG-TODO-001', '--unit', 'todo-ui'], dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /branch mismatch/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('workflow check accepts an explicit branch expected by a follow-up PR', () => {
  const { dir, worktree } = workflowFixture();
  try {
    execFileSync('git', ['branch', '-m', 'fix/CHG-TODO-001/main-ci-validation'], { cwd: worktree });
    const result = run('workflow-check.mjs', [
      '--change', 'CHG-TODO-001',
      '--unit', 'todo-ui',
      '--repo-path', worktree,
      '--expected-branch', 'fix/CHG-TODO-001/main-ci-validation',
    ], dir);
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

for (const state of ['untracked', 'unstaged', 'staged']) {
  test(`workflow check rejects an out-of-scope ${state} change`, () => {
    const { dir, worktree } = workflowFixture();
    try {
      if (state === 'untracked') writeFileSync(join(worktree, 'outside.txt'), 'outside\n');
      else writeFileSync(join(worktree, 'README.md'), `${state}\n`);
      if (state === 'staged') execFileSync('git', ['add', 'README.md'], { cwd: worktree });
      const result = run('workflow-check.mjs', ['--change', 'CHG-TODO-001', '--unit', 'todo-ui', '--repo-path', worktree], dir);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /scope violation/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('candidate verification accepts matching submodule SHAs', () => {
  const dir = fixture();
  try {
    const actualShas = new Map();
    for (const service of ['front', 'back']) {
      const serviceDir = join(dir, 'services', service);
      execFileSync('git', ['init', '-q'], { cwd: serviceDir });
      execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: serviceDir });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: serviceDir });
      writeFileSync(join(serviceDir, 'README.md'), service);
      execFileSync('git', ['add', '.'], { cwd: serviceDir });
      execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: serviceDir });
      actualShas.set(service, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: serviceDir, encoding: 'utf8' }).trim());
    }
    writeFileSync(join(dir, 'changes/CHG-TODO-001/releases/candidate-001.yaml'), `change_id: CHG-TODO-001\ncandidate: 1\nservices:\n  - repo: front\n    path: services/front\n    sha: ${actualShas.get('front')}\n  - repo: back\n    path: services/back\n    sha: ${actualShas.get('back')}\n`);
    const result = run('verify-candidate.mjs', ['--change', 'CHG-TODO-001'], dir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Candidate CHG-TODO-001: PASS/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('candidate verification rejects duplicate service identities', () => {
  const dir = fixture();
  try {
    const actualShas = new Map();
    for (const service of ['front', 'back']) {
      const serviceDir = join(dir, 'services', service);
      execFileSync('git', ['init', '-q'], { cwd: serviceDir });
      execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: serviceDir });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: serviceDir });
      writeFileSync(join(serviceDir, 'README.md'), service);
      execFileSync('git', ['add', '.'], { cwd: serviceDir });
      execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: serviceDir });
      actualShas.set(service, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: serviceDir, encoding: 'utf8' }).trim());
    }
    writeFileSync(join(dir, 'changes/CHG-TODO-001/releases/candidate-001.yaml'), `change_id: CHG-TODO-001\ncandidate: 1\nservices:\n  - repo: front\n    path: services/front\n    sha: ${actualShas.get('front')}\n  - repo: front\n    path: services/back\n    sha: ${actualShas.get('back')}\n`);
    const result = run('verify-candidate.mjs', ['--change', 'CHG-TODO-001'], dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exactly one front and one back/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('OpenAPI contract rejects blank titles and empty PATCH bodies', () => {
  const contract = readFileSync(join(root, 'changes/CHG-TODO-001/contracts/todo-api.openapi.yaml'), 'utf8');
  assert.match(contract, /pattern:\s*['"].*\\S.*['"]/);
  assert.match(contract, /minProperties:\s*1/);
});

test('work units declare FastAPI Back and React TypeScript Front verification', () => {
  const workUnits = readFileSync(join(root, 'changes/CHG-TODO-001/WORK_UNITS.yaml'), 'utf8');
  assert.match(workUnits, /repo: back\n\s+stack: python-fastapi/);
  assert.match(workUnits, /python -m pytest/);
  assert.match(workUnits, /python -m ruff check \./);
  assert.match(workUnits, /python -m mypy app/);
  assert.match(workUnits, /repo: front\n\s+stack: react-typescript/);
  assert.match(workUnits, /npm test -- --run/);
  assert.match(workUnits, /npm run typecheck/);
  assert.match(workUnits, /npm run build/);
});

test('CHG-TODO-002 planning package declares the accepted vertical slice', () => {
  const changeDir = join(root, 'changes/CHG-TODO-002');
  const plan = readFileSync(join(changeDir, 'PLAN.md'), 'utf8');
  const workUnits = readFileSync(join(changeDir, 'WORK_UNITS.yaml'), 'utf8');
  const contract = readFileSync(join(changeDir, 'contracts/todo-api.openapi.yaml'), 'utf8');
  const status = readFileSync(join(changeDir, 'STATUS.md'), 'utf8');
  const prs = readFileSync(join(changeDir, 'PRS.yaml'), 'utf8');

  assert.match(plan, /Status:\s*APPROVED/);
  assert.match(plan, /in-memory/i);
  assert.match(plan, /browser-session/i);
  assert.match(plan, /independent Agent review/i);
  assert.match(workUnits, /id: todo-create-api[\s\S]*stack: python-fastapi/);
  assert.match(workUnits, /id: todo-create-ui[\s\S]*stack: react-typescript/);
  assert.match(workUnits, /id: independent-review/);
  assert.match(workUnits, /id: candidate-integration/);
  assert.match(contract, /\/todos:/);
  assert.match(contract, /post:/);
  assert.match(contract, /'201':/);
  assert.match(contract, /'400':/);
  assert.match(contract, /pattern:\s*['"].*\\S.*['"]/);
  assert.match(status, /State:\*\* IN_PROGRESS/);
  assert.match(workUnits, /repo: back[\s\S]*write_paths:[\s\S]*- \.gitignore/);
  assert.match(workUnits, /repo: front[\s\S]*write_paths:[\s\S]*- \.gitignore/);
  assert.match(prs, /role: todo-create-api/);
  assert.match(prs, /role: todo-create-ui/);
  assert.match(prs, /role: candidate-integration/);
  const candidate = readFileSync(join(changeDir, 'releases/candidate-001.yaml'), 'utf8');
  assert.match(candidate, /state: not-created/);
  assert.doesNotMatch(candidate, /\n\s+sha:\s*[0-9a-f]{40}\s*$/m);
});

test('CI workflow check derives CHG-TODO-002 coordination scope from the branch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'todo-collab-ci-check-'));
  try {
    execFileSync('git', ['clone', '-q', '--no-hardlinks', root, dir]);
    execFileSync('git', ['checkout', '-q', '-B', 'change/CHG-TODO-002/coordination', 'HEAD'], { cwd: dir });
    const result = spawnSync(process.execPath, [
      join(dir, 'scripts', 'ci-workflow-check.mjs'),
      '--branch', 'change/CHG-TODO-002/coordination',
    ], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /CHG-TODO-002\/contract-and-plan/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
