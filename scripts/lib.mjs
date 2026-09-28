import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import YAML from 'yaml';

export function fail(message) {
  process.stderr.write(`ERROR: ${message}\n`);
  process.exitCode = 1;
}

const BOOLEAN_FLAGS = new Set(['apply', 'allow-descendant', 'strict', 'detect', 'branch-from-git', 'with-example']);

export function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (BOOLEAN_FLAGS.has(key)) { options[key] = true; continue; }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

export function required(options, ...names) {
  for (const name of names) {
    if (!options[name]) throw new Error(`--${name} is required`);
  }
}

export function safeIdentifier(label, value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw new Error(`invalid ${label}: use 1-128 letters, numbers, underscores, or hyphens`);
  }
  return value;
}

export function manifestPath(change) {
  return join(process.cwd(), 'changes', change, 'WORK_UNITS.yaml');
}

export function readYaml(path) {
  if (!existsSync(path)) throw new Error(`missing file: ${path}`);
  try {
    return YAML.parse(readFileSync(path, 'utf8')) ?? {};
  } catch (error) {
    throw new Error(`invalid YAML in ${path}: ${error.message}`);
  }
}

export function registryPath() {
  return join(process.cwd(), 'services', 'registry.yaml');
}

export const REPO_SENTINELS = new Set(['root', 'cross-repository']);

export function readRegistry() {
  const registry = readYaml(registryPath());
  const services = registry.services ?? [];
  if (!Array.isArray(services)) throw new Error('registry services must be a list');
  for (const service of services) {
    if (!service?.id || !service?.path) throw new Error('every registry service needs id and path');
  }
  return { version: registry.version ?? 1, services };
}

export function readChangeManifest(change) {
  const manifest = readYaml(manifestPath(change));
  const units = manifest.work_units ?? [];
  if (!Array.isArray(units)) throw new Error(`work_units must be a list in ${manifestPath(change)}`);
  for (const unit of units) {
    unit.write_paths ??= [];
    unit.depends_on ??= [];
    unit.verify ??= [];
  }
  return { ...manifest, work_units: units };
}

export function readWorkUnits(change) {
  return readChangeManifest(change).work_units;
}

export function findUnit(change, id) {
  const unit = readWorkUnits(change).find((item) => item.id === id);
  if (!unit) throw new Error(`unknown work unit: ${id}`);
  return unit;
}

export function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
