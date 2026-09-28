import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, parseArgs, readRegistry, registryPath, required, safeIdentifier } from './lib.mjs';

try {
  const options = parseArgs(process.argv.slice(2));
  required(options, 'id', 'repo');
  const id = safeIdentifier('service id', options.id);
  const url = options.repo;
  if (!/^(https:\/\/|git@|ssh:\/\/|file:\/\/)/.test(url)) {
    throw new Error(`invalid --repo: expected an https, ssh, or file git URL, got ${url}`);
  }
  const path = options.path ?? `services/${id}`;
  if (!path.startsWith('services/')) throw new Error(`invalid --path: must live under services/, got ${path}`);

  const existing = readRegistry().services;
  if (existing.some((service) => service.id === id)) throw new Error(`service ${id} is already registered`);
  if (existing.some((service) => service.path === path)) throw new Error(`path ${path} is already registered`);
  if (existsSync(join(process.cwd(), path))) throw new Error(`${path} already exists on disk`);

  const stack = options.stack ?? 'unspecified';
  const owners = (options.owners ?? '').split(',').map((owner) => owner.trim()).filter(Boolean);
  const verify = (options.verify ?? '').split(',').map((command) => command.trim()).filter(Boolean);

  const entry = [
    '',
    `  - id: ${id}`,
    `    path: ${path}`,
    `    repo: ${url}`,
    `    stack: ${stack}`,
    ...(owners.length ? ['    owners:', ...owners.map((owner) => `      - "${owner}"`)] : []),
    ...(verify.length
      ? ['    verify:', ...verify.map((command) => `      - ${command}`)]
      : ['    # Declare this service\'s verification commands before dispatching work.', '    verify: []']),
    '',
  ].join('\n');

  if (!options.apply) {
    process.stdout.write(`DRY RUN: would add submodule ${path} -> ${url}\n`);
    process.stdout.write(`DRY RUN: would append to services/registry.yaml:\n${entry}`);
    if (!verify.length) process.stdout.write('NOTE: no --verify given; work units for this service must declare their own commands.\n');
    process.stdout.write('Nothing is written without --apply.\n');
  } else {
    const added = spawnSync('git', ['submodule', 'add', url, path], { encoding: 'utf8', stdio: 'inherit' });
    if (added.status !== 0) throw new Error(`git submodule add failed for ${url}`);

    // An empty registry serializes as `services: []`; turn it into a block before appending.
    const file = registryPath();
    const text = readFileSync(file, 'utf8');
    const emptyList = /^services:[ \t]*\[\][ \t]*\r?\n?/m;
    if (emptyList.test(text)) {
      writeFileSync(file, `${text.replace(emptyList, 'services:\n')}${entry.replace(/^\n/, '')}`);
    } else {
      appendFileSync(file, text.endsWith('\n') ? entry.replace(/^\n/, '') : entry);
    }

    process.stdout.write(`APPLIED: registered ${id} at ${path}\n`);
    const check = spawnSync(process.execPath, [join(import.meta.dirname, 'verify-registry.mjs')], { encoding: 'utf8', stdio: 'inherit' });
    if (check.status !== 0) throw new Error('registry validation failed after adding the service');
    process.stdout.write(`Next: record ${id} in a change's work units, and add it to CODEOWNERS.\n`);
  }
} catch (error) {
  fail(error.message);
}
