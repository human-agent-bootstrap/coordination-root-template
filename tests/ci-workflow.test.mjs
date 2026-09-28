import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const workflow = readFileSync(resolve(import.meta.dirname, '../.github/workflows/ci.yml'), 'utf8');

test('main pushes skip work-unit branch validation but still verify the candidate', () => {
  assert.match(
    workflow,
    /if:\s*github\.event_name\s*==\s*['"]pull_request['"][\s\S]*node scripts\/ci-workflow-check\.mjs/,
    'PR workflow must derive its Change and work unit from the observed branch',
  );
  assert.match(workflow, /npm run verify:candidate/);
});