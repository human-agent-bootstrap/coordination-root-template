import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const workflow = readFileSync(resolve(import.meta.dirname, '../.github/workflows/ci.yml'), 'utf8');

test('CI validates the registry before trusting any manifest', () => {
  assert.match(workflow, /npm run verify:registry/);
});

test('both pushes and PRs verify whichever candidate is checked in', () => {
  // --detect replaces the old per-change bash grep, so no Change ID is pinned here.
  assert.match(workflow, /npm run verify:candidate -- --detect/);
  assert.doesNotMatch(workflow, /steps\.todo002/);
  assert.doesNotMatch(workflow, /verify-candidate\.mjs --change/);
});

test('work-unit scope validation stays scoped to pull requests', () => {
  assert.match(workflow, /if: github\.event_name == 'pull_request'\n\s+run: node scripts\/ci-workflow-check\.mjs --branch "\$\{\{ github\.head_ref \}\}"/);
});

test('root CI assumes no service stack', () => {
  // Per-stack setup belongs to the service repos, or to examples/todo/ci-snippet.yml.
  assert.doesNotMatch(workflow, /uv sync|setup-uv|--prefix services\//);
});

test('cross-repo E2E and the example suite are opt-in', () => {
  assert.match(workflow, /hashFiles\('e2e\/\*\.test\.mjs'\) != ''/);
  assert.match(workflow, /hashFiles\('examples\/todo\/tests\/\*\.test\.mjs'\) != ''/);
});
