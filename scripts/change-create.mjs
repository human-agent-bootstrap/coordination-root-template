import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fail, parseArgs, required, safeIdentifier, writeText } from './lib.mjs';

const TEMPLATE = '_TEMPLATE';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

// A fresh coordinator repo may have no commits yet, and a submodule may be uninitialized.
// Neither is a reason to fail: record `pending` and let a human fill it in.
function revParse(directory, missing = 'pending-submodule-not-initialized') {
  if (!existsSync(join(directory, '.git'))) return missing;
  try {
    return git(['rev-parse', 'HEAD'], directory);
  } catch {
    return missing;
  }
}

function templateFiles(root) {
  const found = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) found.push(...templateFiles(path));
    else found.push(path);
  }
  return found;
}

try {
  const options = parseArgs(process.argv.slice(2));
  required(options, 'change');
  const changeId = safeIdentifier('change ID', options.change);
  if (changeId === TEMPLATE) throw new Error(`refusing to overwrite the ${TEMPLATE} skeleton`);

  const changesDirectory = resolve(process.cwd(), 'changes');
  const templateDirectory = join(changesDirectory, TEMPLATE);
  if (!existsSync(templateDirectory)) throw new Error(`missing template: ${templateDirectory}`);

  const targetDirectory = resolve(changesDirectory, changeId);
  if (relative(changesDirectory, targetDirectory).startsWith('..')) {
    throw new Error('invalid change ID: target escapes changes/');
  }
  if (existsSync(targetDirectory)) throw new Error(`change already exists: changes/${changeId}`);

  const substitutions = new Map([
    ['<CHANGE-ID>', changeId],
    ['<ROOT_BASE_SHA>', revParse(process.cwd(), 'pending-no-root-commit')],
    ['<FRONT_BASE_SHA>', revParse(join(process.cwd(), 'services', 'front'))],
    ['<BACK_BASE_SHA>', revParse(join(process.cwd(), 'services', 'back'))],
  ]);

  const planned = templateFiles(templateDirectory).map((source) => {
    let text = readFileSync(source, 'utf8');
    for (const [token, value] of substitutions) text = text.split(token).join(value);
    return { target: join(targetDirectory, relative(templateDirectory, source)), text };
  });

  for (const [token, value] of substitutions) {
    process.stdout.write(`${token} -> ${value}\n`);
  }

  if (!options.apply) {
    process.stdout.write(`DRY RUN: would create changes/${changeId} with ${planned.length} file(s):\n`);
    for (const file of planned) process.stdout.write(`  ${relative(process.cwd(), file.target)}\n`);
    process.stdout.write('No file, branch, or worktree is created without --apply.\n');
  } else {
    for (const file of planned) writeText(file.target, file.text);
    process.stdout.write(`APPLIED: wrote ${planned.length} file(s) under changes/${changeId}\n`);
    process.stdout.write(`Next: fill the placeholders, then open a planning PR on change/${changeId}/coordination.\n`);
    process.stdout.write('Remaining <...> placeholders are intentional and must be resolved by a human before approval.\n');
  }
} catch (error) {
  fail(error.message);
}
