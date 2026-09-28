import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fail, findUnit, parseArgs, required } from './lib.mjs';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function lines(value) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

try {
  const options = parseArgs(process.argv.slice(2));
  required(options, 'change', 'unit');
  const unit = findUnit(options.change, options.unit);
  const repoPath = resolve(process.cwd(), options['repo-path'] || '.');
  const branch = git(['branch', '--show-current'], repoPath);
  const expectedBranch = options['expected-branch'] || unit.branch;
  if (branch !== expectedBranch) throw new Error(`branch mismatch: expected ${expectedBranch}, found ${branch || '(detached HEAD)'}`);
  const head = git(['rev-parse', 'HEAD'], repoPath);
  if (unit.base_sha && head !== unit.base_sha && !options['allow-descendant']) {
    const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', unit.base_sha, head], { cwd: repoPath });
    if (ancestry.status !== 0) {
      throw new Error(`base mismatch: HEAD ${head} does not descend from base_sha ${unit.base_sha}`);
    }
  }
  const changed = [...new Set([
    ...lines(git(['diff', '--name-only', `${unit.base_sha}...HEAD`], repoPath)),
    ...lines(git(['diff', '--cached', '--name-only'], repoPath)),
    ...lines(git(['diff', '--name-only'], repoPath)),
    ...lines(git(['ls-files', '--others', '--exclude-standard'], repoPath)),
  ])];
  const outside = changed.filter((path) => !unit.write_paths.some((allowed) => {
    const prefix = allowed.replace('/**', '/');
    return path === allowed || path.startsWith(prefix);
  }));
  if (outside.length) throw new Error(`scope violation: ${outside.join(', ')}`);
  process.stdout.write(`Workflow check PASS: ${options.change}/${unit.id}; base ${unit.base_sha}; ${changed.length} changed file(s).\n`);
} catch (error) {
  fail(error.message);
}
