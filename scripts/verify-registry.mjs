import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, parseArgs, readChangeManifest, readRegistry, REPO_SENTINELS } from './lib.mjs';

const TERMINAL_UNIT_STATES = new Set(['merged', 'complete', 'completed', 'aborted', 'abandoned']);

function gitmodules() {
  const path = join(process.cwd(), '.gitmodules');
  if (!existsSync(path)) return [];
  const entries = [];
  let current;
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[submodule')) { current = {}; entries.push(current); continue; }
    if (!current) continue;
    const match = line.match(/^(path|url)\s*=\s*(.+)$/);
    if (match) current[match[1]] = match[2].trim();
  }
  return entries.filter((entry) => entry.path);
}

function changeIds() {
  const directory = join(process.cwd(), 'changes');
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort();
}

// `app/**` covers `app/`; an exact path covers only itself.
function normalize(pattern) {
  return String(pattern).replace(/\/\*\*$/, '/').replace(/\*\*$/, '');
}

function overlaps(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (left === right) return true;
  if (left.endsWith('/') && right.startsWith(left)) return true;
  if (right.endsWith('/') && left.startsWith(right)) return true;
  return false;
}

// Units connected by depends_on run in sequence, so sharing a path is safe.
function orderedPairs(units) {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const reachable = new Map();
  const walk = (id, seen = new Set()) => {
    if (reachable.has(id)) return reachable.get(id);
    const out = new Set();
    for (const dependency of byId.get(id)?.depends_on ?? []) {
      if (seen.has(dependency)) continue;
      out.add(dependency);
      for (const nested of walk(dependency, new Set([...seen, dependency]))) out.add(nested);
    }
    reachable.set(id, out);
    return out;
  };
  for (const unit of units) walk(unit.id);
  return (a, b) => reachable.get(a.id)?.has(b.id) || reachable.get(b.id)?.has(a.id);
}

try {
  const options = parseArgs(process.argv.slice(2));
  const problems = [];
  const warnings = [];

  const registry = readRegistry();
  const byId = new Map(registry.services.map((service) => [service.id, service]));
  if (byId.size !== registry.services.length) problems.push('registry has duplicate service ids');

  const submodules = gitmodules();
  const byPath = new Map(submodules.map((entry) => [entry.path, entry]));

  for (const service of registry.services) {
    const submodule = byPath.get(service.path);
    if (!submodule) {
      problems.push(`service ${service.id}: path ${service.path} has no entry in .gitmodules`);
    } else if (service.repo && submodule.url && service.repo !== submodule.url) {
      problems.push(`service ${service.id}: registry url ${service.repo} != .gitmodules url ${submodule.url}`);
    }
    const directory = join(process.cwd(), service.path);
    if (!existsSync(directory)) problems.push(`service ${service.id}: ${service.path} does not exist`);
    else if (!existsSync(join(directory, '.git'))) problems.push(`service ${service.id}: ${service.path} is not an initialized submodule`);
  }

  for (const submodule of submodules) {
    if (!registry.services.some((service) => service.path === submodule.path)) {
      problems.push(`submodule ${submodule.path} is not registered in services/registry.yaml`);
    }
  }

  const targets = options.change ? [options.change] : changeIds();
  for (const change of targets) {
    let manifest;
    try {
      manifest = readChangeManifest(change);
    } catch (error) {
      problems.push(`${change}: ${error.message}`);
      continue;
    }
    const units = manifest.work_units;

    for (const unit of units) {
      const repo = String(unit.repo ?? '');
      if (!repo) problems.push(`${change}/${unit.id}: missing repo`);
      else if (!REPO_SENTINELS.has(repo) && !byId.has(repo)) {
        problems.push(`${change}/${unit.id}: repo "${repo}" is not a registry id or ${[...REPO_SENTINELS].join('/')}`);
      }
    }

    const active = units.filter((unit) => !TERMINAL_UNIT_STATES.has(String(unit.state ?? '').toLowerCase()));
    const isOrdered = orderedPairs(units);
    for (let i = 0; i < active.length; i += 1) {
      for (let j = i + 1; j < active.length; j += 1) {
        const [a, b] = [active[i], active[j]];
        if (String(a.repo) !== String(b.repo)) continue;
        if (isOrdered(a, b)) continue;
        const shared = a.write_paths.filter((path) => b.write_paths.some((other) => overlaps(path, other)));
        if (shared.length) {
          warnings.push(`${change}: concurrent units ${a.id} and ${b.id} both write ${shared.join(', ')} in repo ${a.repo}`);
        }
      }
    }
  }

  if (registry.services.length === 0) {
    process.stdout.write('NOTE: no services registered yet. Add one with: npm run service:add -- --id <id> --repo <url> --apply\n');
  }

  for (const warning of warnings) process.stdout.write(`WARNING: ${warning}\n`);
  if (options.strict && warnings.length) problems.push(`${warnings.length} write-path overlap(s) between concurrent work units`);
  if (problems.length) throw new Error(problems.join('\n       '));

  process.stdout.write(`Registry PASS: ${registry.services.length} service(s) [${[...byId.keys()].join(', ')}]; ${targets.length} change(s) validated; ${warnings.length} warning(s).\n`);
} catch (error) {
  fail(error.message);
}
