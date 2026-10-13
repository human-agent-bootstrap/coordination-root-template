import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const workflowDir = resolve(import.meta.dirname, '../.github/workflows');
const workflow = readFileSync(resolve(workflowDir, 'ci.yml'), 'utf8');
const uiWorkflow = readFileSync(resolve(workflowDir, 'ui-regression.yml'), 'utf8');
const candidateGate = readFileSync(resolve(import.meta.dirname, '../scripts/ci-candidate-check.mjs'), 'utf8');
const e2eRunner = readFileSync(resolve(import.meta.dirname, '../scripts/test-e2e.mjs'), 'utf8');
const gitignore = readFileSync(resolve(import.meta.dirname, '../.gitignore'), 'utf8');
const pullRequestJob = workflow.slice(
  workflow.indexOf('  pull-request:'),
  workflow.indexOf('\n  main:'),
);
const mainJob = workflow.slice(workflow.indexOf('  main:'));

test('CI validates the registry before trusting any manifest', () => {
  assert.match(workflow, /npm run verify:registry/);
});

test('pull requests run untrusted code without private credentials', () => {
  assert.match(pullRequestJob, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(pullRequestJob, /npm ci --ignore-scripts/);
  assert.match(pullRequestJob, /verify:registry -- --strict --allow-uninitialized/);
  // The boundary is what the job may hold, not which machine runs it: a fleet without
  // GitHub-hosted runners has to run this on a self-hosted runner.
  assert.doesNotMatch(pullRequestJob, /submodules:|COORDINATION_GITHUB_TOKEN/);
});

test('trusted main pushes run remote candidate verification', () => {
  assert.match(mainJob, /runs-on: (?:ubuntu-latest|\[self-hosted, linux\])/);
  assert.match(mainJob, /submodules: recursive/);
  assert.match(mainJob, /verify:candidate:ci -- --event push/);
  assert.match(mainJob, /COORDINATION_GITHUB_TOKEN/);
  // The setup commit that registers the first service moves a pointer no Candidate can
  // declare yet; the gate exempts it only for paths that did not exist before.
  assert.match(mainJob, /--allow-initial-registration true/);
});

test('every action is pinned to a commit SHA', () => {
  for (const file of readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name))) {
    const content = readFileSync(resolve(workflowDir, file), 'utf8');
    for (const [, ref] of content.matchAll(/uses: \S+@(\S+)/g)) {
      assert.match(ref, /^[0-9a-f]{40}$/, `${file} pins an action to a mutable ref: ${ref}`);
    }
  }
});

test('an uninitialized template ships on hosted runners', () => {
  // A fresh Root must be able to run its own CI before anyone registers a runner. An
  // initialized Root is exempt: `init --ci-runner` rewrites these on purpose.
  const readme = readFileSync(resolve(import.meta.dirname, '../README.md'), 'utf8');
  if (!readme.includes('<PROJECT-NAME>')) return;
  for (const file of readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name))) {
    for (const [, labels] of readFileSync(resolve(workflowDir, file), 'utf8').matchAll(/^\s*runs-on: (.+)$/gm)) {
      assert.equal(labels.trim(), 'ubuntu-latest', `${file} ships a runner a fresh Root may not have`);
    }
  }
});

test('the browser suite runs only when the tool itself changes', () => {
  // It validates screens this template ships, so a pull request that only adds a plan has
  // nothing here to regress and should not install Chromium.
  const paths = uiWorkflow.slice(uiWorkflow.indexOf('paths:'), uiWorkflow.indexOf('permissions:'));
  for (const owned of ['ui/**', 'tests-ui/**', 'scripts/orchestration/**']) {
    assert.match(paths, new RegExp(`'${owned.replace(/[*/]/g, '\\$&')}'`), `UI workflow ignores ${owned}`);
  }
  assert.doesNotMatch(paths, /'changes\//, 'a plan-only pull request would install Chromium');
  assert.match(uiWorkflow, /npm run test:ui/);
  // Untrusted like the pull-request job: pull request code runs here.
  assert.doesNotMatch(uiWorkflow, /submodules:|COORDINATION_GITHUB_TOKEN/);
  // ci.yml must not keep a second copy of the suite.
  assert.doesNotMatch(workflow, /test:ui|playwright/);
});

test('work-unit scope validation stays scoped to pull requests', () => {
  assert.match(pullRequestJob, /node scripts\/ci-workflow-check\.mjs --branch "\$\{\{ github\.head_ref \}\}"/);
  assert.doesNotMatch(mainJob, /ci-workflow-check/);
});

test('root CI assumes no service stack', () => {
  // Per-stack setup belongs to each service repository's own CI.
  assert.doesNotMatch(workflow, /uv sync|setup-uv|--prefix services\//);
});

test('private submodule credentials are not persisted', () => {
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /secrets\.COORDINATION_GITHUB_TOKEN \|\| github\.token/);
});

test('final candidates run E2E when a suite is present', () => {
  assert.match(candidateGate, /test-e2e\.mjs'?\),?\s*'--if-present'/);
  assert.match(e2eRunner, /no e2e\/\*\.test\.mjs files found/);
  assert.match(e2eRunner, /optional E2E skipped/);
  assert.doesNotMatch(workflow, /hashFiles\('e2e\/\*\.test\.mjs'\)/);
});

test('local task packets are ignored separately from macOS metadata', () => {
  assert.match(gitignore, /^\.DS_Store$/m);
  assert.match(gitignore, /^\.task-packets\/$/m);
});

test('documented local commands resolve to real scripts', () => {
  const repository = resolve(import.meta.dirname, '..');
  const docs = ['README.md', 'RUNBOOK.md', 'AGENTS.md', 'WRITER.md']
    .filter((path) => existsSync(resolve(repository, path)))
    .map((path) => readFileSync(resolve(repository, path), 'utf8'))
    .join('\n')
    .replace(/```ya?ml[\s\S]*?```/g, '');
  const pkg = JSON.parse(readFileSync(resolve(repository, 'package.json'), 'utf8'));
  for (const [, script] of docs.matchAll(/node scripts\/([A-Za-z0-9.-]+\.mjs)/g)) {
    assert.equal(existsSync(resolve(repository, 'scripts', script)), true, `missing scripts/${script}`);
  }
  for (const [, command] of docs.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) {
    assert.ok(pkg.scripts[command], `missing npm script ${command}`);
  }
});
