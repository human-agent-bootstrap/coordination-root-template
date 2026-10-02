import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, parseArgs, readYaml, required } from './lib.mjs';

const PLACEHOLDER_FILES = [
  'README.md',
  'package.json',
  '.github/CODEOWNERS',
  'services/registry.yaml',
];
const EXAMPLE_REF_FILES = ['README.md', 'AGENTS.md'];
const EXAMPLE_BLOCK = /[^\n]*<!-- example:start -->\n[\s\S]*?<!-- example:end -->[^\n]*\n?/g;
const EXAMPLE_DIR = 'examples/todo';

function substitutionTargets() {
  return PLACEHOLDER_FILES.filter((file) => existsSync(join(process.cwd(), file)));
}

function installExample(apply) {
  const example = join(process.cwd(), EXAMPLE_DIR);
  if (!existsSync(example)) throw new Error(`--with-example given but ${EXAMPLE_DIR} is missing`);
  const registry = readYaml(join(example, 'registry.yaml')).services ?? [];
  const changes = existsSync(join(example, 'changes')) ? readdirSync(join(example, 'changes')) : [];
  if (!apply) {
    process.stdout.write(`DRY RUN: would install ${changes.length} change(s) into changes/ and ${registry.length} service(s) into the registry\n`);
    process.stdout.write(`DRY RUN: would add submodules: ${registry.map((service) => service.path).join(', ')}\n`);
    if (existsSync(join(example, 'e2e'))) process.stdout.write('DRY RUN: would install e2e/ at the repository root\n');
    return;
  }
  for (const change of changes) {
    cpSync(join(example, 'changes', change), join(process.cwd(), 'changes', change), { recursive: true });
  }
  if (existsSync(join(example, 'e2e'))) cpSync(join(example, 'e2e'), join(process.cwd(), 'e2e'), { recursive: true });
  cpSync(join(example, 'registry.yaml'), join(process.cwd(), 'services/registry.yaml'));
  for (const service of registry) {
    const added = spawnSync('git', ['submodule', 'add', service.repo, service.path], { encoding: 'utf8', stdio: 'inherit' });
    if (added.status !== 0) throw new Error(`git submodule add failed for ${service.repo}`);
  }
  process.stdout.write(`APPLIED: installed the example (${changes.length} change(s), ${registry.length} service(s))\n`);
}

try {
  const options = parseArgs(process.argv.slice(2));
  required(options, 'name', 'org', 'coordinator-owner');
  const name = options.name;
  const org = options.org;
  const coordinatorOwner = options['coordinator-owner'];
  const githubHost = options['github-host'] ?? 'github.com';
  const githubApiBase = options['github-api-base']
    ?? (githubHost === 'github.com' ? 'https://api.github.com' : `https://${githubHost}/api/v3`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name)) throw new Error(`invalid --name: ${name}`);
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(org)) throw new Error(`invalid --org: ${org}`);
  if (!/^@[A-Za-z0-9-]+(?:\/[A-Za-z0-9_.-]+)?$/.test(coordinatorOwner)) {
    throw new Error(`invalid --coordinator-owner: ${coordinatorOwner}`);
  }
  if (!/^[A-Za-z0-9.-]+$/.test(githubHost)) throw new Error(`invalid --github-host: ${githubHost}`);
  try {
    new URL(githubApiBase);
  } catch {
    throw new Error(`invalid --github-api-base: ${githubApiBase}`);
  }

  const targets = substitutionTargets();
  const pending = targets.filter((file) => /<PROJECT-NAME>|<ORG>|<COORDINATOR-OWNER>|<GITHUB-HOST>|<GITHUB-API-BASE>/.test(readFileSync(join(process.cwd(), file), 'utf8')));
  if (pending.length === 0) {
    throw new Error('this repository is already initialized: no <PROJECT-NAME> or <ORG> placeholder remains');
  }

  process.stdout.write(`<PROJECT-NAME> -> ${name}\n<ORG> -> ${org}\n<COORDINATOR-OWNER> -> ${coordinatorOwner}\n`);
  process.stdout.write(`<GITHUB-HOST> -> ${githubHost}\n<GITHUB-API-BASE> -> ${githubApiBase}\n`);
  process.stdout.write(`Files to rewrite: ${pending.join(', ')}\n`);

  if (options['with-example']) installExample(Boolean(options.apply));
  else process.stdout.write(`${options.apply ? 'Removing' : 'DRY RUN: would remove'} ${EXAMPLE_DIR} and its suite\n`);

  if (!options.apply) {
    process.stdout.write('Nothing is written without --apply.\n');
  } else {
    for (const file of pending) {
      const path = join(process.cwd(), file);
      writeFileSync(path, readFileSync(path, 'utf8')
        .split('<PROJECT-NAME>').join(name)
        .split('<ORG>').join(org)
        .split('<COORDINATOR-OWNER>').join(coordinatorOwner)
        .split('<GITHUB-HOST>').join(githubHost)
        .split('<GITHUB-API-BASE>').join(githubApiBase));
    }
    if (!options['with-example']) {
      rmSync(join(process.cwd(), 'examples'), { recursive: true, force: true });
      // A new project must not inherit this template's own change history.
      const changesDir = join(process.cwd(), 'changes');
      if (existsSync(changesDir)) {
        for (const entry of readdirSync(changesDir)) {
          if (entry !== '_TEMPLATE') rmSync(join(changesDir, entry), { recursive: true, force: true });
        }
      }
      // Leave no reference to example content that init removes.
      for (const file of EXAMPLE_REF_FILES) {
        const path = join(process.cwd(), file);
        if (!existsSync(path)) continue;
        const text = readFileSync(path, 'utf8');
        const stripped = text.replace(EXAMPLE_BLOCK, '');
        if (stripped !== text) writeFileSync(path, stripped);
      }
      const pkgPath = join(process.cwd(), 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      delete pkg.scripts['test:example'];
      writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    }
    process.stdout.write(`APPLIED: initialized ${name}\n`);
    process.stdout.write('Next: npm run service:add -- --repo <https-url> --apply, then npm run change:create.\n');
  }
} catch (error) {
  fail(error.message);
}
