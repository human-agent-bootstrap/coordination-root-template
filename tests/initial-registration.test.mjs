import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const gate = resolve(import.meta.dirname, '../scripts/ci-candidate-check.mjs');
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;

function registrationRoot() {
  const root = mkdtempSync(join(tmpdir(), 'initial-registration-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const commit = (message) => { git('add', 'services/registry.yaml'); git('commit', '-qm', message); return git('rev-parse', 'HEAD'); };
  git('init', '-qb', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  mkdirSync(join(root, 'services'));
  mkdirSync(join(root, 'changes'));
  writeFileSync(join(root, 'services/registry.yaml'), 'version: 2\ngithub:\n  host: github.com\nservices: []\n');
  const before = commit('empty root');
  writeFileSync(join(root, 'services/registry.yaml'), 'version: 2\ngithub:\n  host: github.com\nservices:\n  - id: api\n    path: services/api\n    repo: https://github.com/example/api.git\n');
  git('update-index', '--add', '--cacheinfo', `160000,${before},services/api`);
  const anchor = commit('register initial service');
  return { root, git, commit, before, anchor };
}

const run = (root, before, after, ...extra) => spawnSync(
  process.execPath,
  [gate, '--event', 'push', '--before', before, '--after', after, ...extra],
  { cwd: root, env, encoding: 'utf8' },
);

test('the first service registration passes the push gate when it is allowed', () => {
  const { root, git, commit, before, anchor } = registrationRoot();
  try {
    const initial = run(root, before, anchor, '--allow-initial-registration', 'true');
    assert.equal(initial.status, 0, initial.stdout + initial.stderr);
    assert.match(initial.stdout, /initial service registration/);
    git('update-index', '--cacheinfo', `160000,${anchor},services/api`);
    const later = commit('move service without candidate');
    const rejected = run(root, anchor, later, '--allow-initial-registration', 'true');
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /submodule pointer changed without a matching candidate/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('without the flag even the first registration needs a candidate', () => {
  const { root, before, anchor } = registrationRoot();
  try {
    const rejected = run(root, before, anchor);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /submodule pointer changed without a matching candidate/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
