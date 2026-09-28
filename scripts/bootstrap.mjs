import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fail, findUnit, parseArgs, readRegistry, required, safeIdentifier, writeText } from './lib.mjs';

function contractPaths(changeId) {
  const directory = join(process.cwd(), 'changes', changeId, 'contracts');
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => !name.startsWith('.'))
    .sort()
    .map((name) => `changes/${changeId}/contracts/${name}`);
}

function verifyCommands(unit) {
  if (unit.verify.length) return { commands: unit.verify, source: 'work unit' };
  try {
    const service = readRegistry().services.find((entry) => entry.id === String(unit.repo));
    if (service?.verify?.length) return { commands: service.verify, source: 'service registry' };
  } catch {
    // A missing or invalid registry is reported by verify-registry.mjs, not here.
  }
  return { commands: [], source: 'none declared' };
}

try {
  const options = parseArgs(process.argv.slice(2));
  required(options, 'change', 'unit', 'writer', 'run');
  const changeId = safeIdentifier('change ID', options.change);
  const unitId = safeIdentifier('work unit ID', options.unit);
  const writer = safeIdentifier('writer', options.writer);
  const runId = safeIdentifier('run ID', options.run);
  const unit = findUnit(changeId, unitId);
  const packetDirectory = resolve(process.cwd(), '.task-packets');
  const packetPath = resolve(packetDirectory, `${runId}.md`);
  if (dirname(packetPath) !== packetDirectory) throw new Error('invalid run ID: task packet path escapes .task-packets');

  const contracts = contractPaths(changeId);
  const { commands, source } = verifyCommands(unit);

  const packet = [
    '# TASK',
    `- Change ID: ${changeId}`,
    `- Work Unit ID: ${unit.id}`,
    `- Writer: ${writer}`,
    `- Run ID: ${runId}`,
    `- Goal: ${unit.goal}`,
    '',
    '# SCOPE',
    `- Repository: ${unit.repo}`,
    `- Required branch: ${unit.branch}`,
    `- Base SHA: ${unit.base_sha}`,
    '- Allowed paths:',
    ...unit.write_paths.map((path) => `  - ${path}`),
    '',
    '# CONTRACT',
    '- Read AGENTS.md and WORKFLOW.md in the Root repository before implementation.',
    ...(contracts.length
      ? ['- Approved contract snapshots (do not modify):', ...contracts.map((path) => `  - ${path}`)]
      : ['- This change declares no contract snapshot. Stop and ask before assuming any cross-service interface.']),
    '- Do not modify the Root coordination files or another repository.',
    '',
    `# VERIFY (${source})`,
    ...(commands.length
      ? commands.map((command) => `- ${command} (expect exit 0)`)
      : ['- No verification is declared. Stop and ask the Coordinator; do not invent commands.']),
    '',
    '# HANDOFF',
    'Report changed files, head SHA, commands and exit codes, unrun checks, and next action.',
    '',
    '# STOP WHEN',
    'Scope expansion, contract conflict, secret/production access, or an unavailable required check needs human coordination.',
    '',
  ].join('\n');

  if (!options.apply) {
    process.stdout.write(`DRY RUN: task packet would be written to ${packetPath}\n`);
    process.stdout.write(`Contracts: ${contracts.length ? contracts.join(', ') : 'none'}\n`);
    process.stdout.write(`Verify commands (${source}): ${commands.length}\n`);
    process.stdout.write(`No worktree or branch is created without --apply. Required branch: ${unit.branch}\n`);
  } else {
    writeText(packetPath, packet);
    process.stdout.write(`APPLIED: wrote ${packetPath}\n`);
    process.stdout.write('Worktree creation is intentionally a separate human-approved step.\n');
  }
} catch (error) {
  fail(error.message);
}
