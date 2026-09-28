import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

// These assertions belong to the TODO example, not the framework. They are skipped
// unless the example is installed, so a fresh project stays green.
const exampleRoot = resolve(import.meta.dirname, '..');
const root = resolve(exampleRoot, '../..');
const installed = existsSync(join(exampleRoot, 'changes/CHG-TODO-002/PLAN.md'));
const todoTest = (name, fn) => test(name, { skip: installed ? false : 'TODO example not installed' }, fn);

todoTest('OpenAPI contract rejects blank titles and empty PATCH bodies', () => {
  const contract = readFileSync(join(exampleRoot, 'changes/CHG-TODO-001/contracts/todo-api.openapi.yaml'), 'utf8');
  assert.match(contract, /pattern:\s*['"].*\\S.*['"]/);
  assert.match(contract, /minProperties:\s*1/);
});

todoTest('work units declare FastAPI Back and React TypeScript Front verification', () => {
  const workUnits = readFileSync(join(exampleRoot, 'changes/CHG-TODO-001/WORK_UNITS.yaml'), 'utf8');
  assert.match(workUnits, /repo: back\n\s+stack: python-fastapi/);
  assert.match(workUnits, /python -m pytest/);
  assert.match(workUnits, /python -m ruff check \./);
  assert.match(workUnits, /python -m mypy app/);
  assert.match(workUnits, /repo: front\n\s+stack: react-typescript/);
  assert.match(workUnits, /npm test -- --run/);
  assert.match(workUnits, /npm run typecheck/);
  assert.match(workUnits, /npm run build/);
});

todoTest('CHG-TODO-002 planning package declares the accepted vertical slice', () => {
  const changeDir = join(exampleRoot, 'changes/CHG-TODO-002');
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
  assert.match(status, /State:\*\* (?:IN_PROGRESS|COMPLETE)/);
  assert.match(workUnits, /repo: back[\s\S]*write_paths:[\s\S]*- \.gitignore/);
  assert.match(workUnits, /repo: front[\s\S]*write_paths:[\s\S]*- \.gitignore/);
  assert.match(prs, /role: todo-create-api/);
  assert.match(prs, /role: todo-create-ui/);
  assert.match(prs, /role: candidate-integration/);
  const candidate = readFileSync(join(changeDir, 'releases/candidate-001.yaml'), 'utf8');
  assert.match(candidate, /state: (?:not-created|validating)/);
  if (/state: not-created/.test(candidate)) {
    assert.doesNotMatch(candidate, /\n\s+sha:\s*[0-9a-f]{40}\s*$/m);
  } else {
    assert.match(candidate, /sha: c33b5990dbca3379597deb02aa2bbb746de01dd3/);
    assert.match(candidate, /sha: 4530e5d500557d46dfcdcc6c101f6163af0017db/);
  }
});

todoTest('CI workflow check derives CHG-TODO-002 coordination scope from the branch', () => {
  const manifest = readFileSync(join(exampleRoot, 'changes/CHG-TODO-002/WORK_UNITS.yaml'), 'utf8');
  assert.match(manifest, /id: contract-and-plan[\s\S]*branch: change\/CHG-TODO-002\/coordination/);
  assert.match(manifest, /id: candidate-integration[\s\S]*branch: change\/CHG-TODO-002\/candidate-integration/);
});
