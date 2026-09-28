import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fail, parseArgs, readRegistry, readYaml, required } from './lib.mjs';

function candidateFile(value) {
  const candidate = String(value ?? '001');
  if (!/^\d{1,3}$/.test(candidate)) throw new Error(`invalid candidate: use 1-3 digits, got ${candidate}`);
  return `candidate-${candidate.padStart(3, '0')}.yaml`;
}


function headOf(path) {
  const directory = join(process.cwd(), path);
  if (!existsSync(join(directory, '.git'))) return null;
  return execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

// Find the candidate whose pinned SHAs equal the checked-out submodule snapshot.
function detectActive() {
  const changesDirectory = join(process.cwd(), 'changes');
  const found = [];
  let candidatesExist = false;
  for (const entry of readdirSync(changesDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const releases = join(changesDirectory, entry.name, 'releases');
    if (!existsSync(releases)) continue;
    for (const file of readdirSync(releases)) {
      const match = file.match(/^candidate-(\d{3})\.yaml$/);
      if (!match) continue;
      const services = readYaml(join(releases, file)).services ?? [];
      if (!services.length) continue;
      const matches = services.every((service) => service.path && headOf(service.path) === String(service.sha));
      candidatesExist = true;
      if (matches) found.push({ change: entry.name, candidate: match[1] });
    }
  }
  return { found, candidatesExist };
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.detect) {
    const { found: active, candidatesExist } = detectActive();
    if (!candidatesExist) {
      process.stdout.write('NOTE: no release candidate is declared yet; nothing to verify.\n');
      process.exit(0);
    }
    if (active.length === 0) {
      throw new Error('candidates exist but none matches the checked-out submodule snapshot; pin one or pass --change explicitly');
    }
    if (active.length > 1) {
      process.stdout.write(`NOTE: ${active.length} candidates match this snapshot; verifying ${active[0].change}/candidate-${active[0].candidate}.\n`);
    }
    options.change ??= active[0].change;
    options.candidate ??= active[0].candidate;
  }
  required(options, 'change');
  const path = join(process.cwd(), 'changes', options.change, 'releases', candidateFile(options.candidate));
  if (!existsSync(path)) throw new Error(`missing candidate: ${path}`);

  const services = readYaml(path).services ?? [];
  if (!Array.isArray(services) || services.length === 0) {
    throw new Error('candidate declares no services');
  }

  // A candidate pins any subset of the registry — one service or twenty.
  const registry = new Map(readRegistry().services.map((service) => [service.id, service]));
  const seen = new Set();

  for (const service of services) {
    const id = String(service?.repo ?? '');
    if (!id) throw new Error('every candidate service needs a repo id');
    if (seen.has(id)) throw new Error(`candidate lists ${id} more than once`);
    seen.add(id);

    const registered = registry.get(id);
    if (!registered) {
      throw new Error(`candidate service ${id} is not in services/registry.yaml (known: ${[...registry.keys()].join(', ')})`);
    }
    if (!service.path || !service.sha) throw new Error(`candidate service ${id} needs path and sha`);
    if (service.path !== registered.path) {
      throw new Error(`candidate service ${id} must use path ${registered.path}, got ${service.path}`);
    }

    const directory = join(process.cwd(), service.path);
    if (!existsSync(join(directory, '.git'))) throw new Error(`submodule is not initialized: ${service.path}`);
    const actual = execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (actual !== String(service.sha)) {
      throw new Error(`${id} SHA mismatch: expected ${service.sha}, found ${actual}`);
    }
  }

  const summary = services.map((service) => `${service.repo}@${String(service.sha).slice(0, 12)}`).join(', ');
  process.stdout.write(`Candidate ${options.change}: PASS (${services.length} service(s): ${summary})\n`);
} catch (error) {
  fail(error.message);
}
