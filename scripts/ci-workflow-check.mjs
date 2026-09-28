import { spawnSync } from 'node:child_process';
import { findUnit, parseArgs, required } from './lib.mjs';

function fail(message) {
  process.stderr.write(`ERROR: ${message}\n`);
  process.exitCode = 1;
}

try {
  const options = parseArgs(process.argv.slice(2));
  required(options, 'branch');
  const match = options.branch.match(/^(?:change|feat|fix)\/(CHG-[A-Za-z0-9-]+)\/([A-Za-z0-9_-]+)$/);
  if (!match) throw new Error(`branch does not identify a Change and work unit: ${options.branch}`);

  const [, change, branchUnit] = match;
  const units = branchUnit === 'coordination'
    ? ['contract-and-plan', 'coordination']
    : [branchUnit];
  const unit = units.find((candidate) => {
    try {
      return findUnit(change, candidate).branch === options.branch;
    } catch {
      return false;
    }
  });
  if (!unit) throw new Error(`no work unit in ${change} declares branch ${options.branch}`);

  const result = spawnSync(process.execPath, [
    new URL('./workflow-check.mjs', import.meta.url).pathname,
    '--change', change,
    '--unit', unit,
    '--expected-branch', options.branch,
    '--allow-descendant',
  ], { cwd: process.cwd(), encoding: 'utf8', stdio: 'inherit' });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} catch (error) {
  fail(error.message);
}
