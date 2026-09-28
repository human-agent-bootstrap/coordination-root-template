import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const workflow = readFileSync(resolve(import.meta.dirname, '../.github/workflows/ci.yml'), 'utf8');

test('main pushes detect and verify the checked-in candidate snapshot', () => {
  assert.match(workflow, /Detect CHG-TODO-002 candidate snapshot/);
  assert.match(workflow, /steps\.todo002\.outputs\.active == 'true'[\s\S]*verify-candidate\.mjs --change CHG-TODO-002/);
  assert.match(workflow, /steps\.todo002\.outputs\.active != 'true'[\s\S]*npm run verify:candidate/);
});