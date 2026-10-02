import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import YAML from 'yaml';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const CONTRACT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\.(?:json|md|ya?ml)$/i;
const MAX_WORK_UNITS = 50;
const MAX_PATHS_PER_UNIT = 100;
const MAX_CONTRACTS = 25;
const MAX_TEXT_LENGTH = 20_000;

function text(value) {
  return String(value ?? '').trim();
}

function list(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function slug(value, fallback = 'work') {
  const result = text(value)
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 128);
  return result || fallback;
}

function pathIsSafe(value) {
  const path = text(value);
  return Boolean(path)
    && !path.startsWith('/')
    && !path.startsWith('\\')
    && !path.includes('\0')
    && !path.split(/[\\/]/).includes('..');
}

function normalizeScope(value) {
  return String(value).replace(/\/\*\*$/, '/').replace(/\*\*$/, '');
}

function scopesOverlap(leftValue, rightValue) {
  if (leftValue === '**' || rightValue === '**') return true;
  const left = normalizeScope(leftValue);
  const right = normalizeScope(rightValue);
  return left === right
    || (left.endsWith('/') && right.startsWith(left))
    || (right.endsWith('/') && left.startsWith(right));
}

function ordered(units, leftId, rightId) {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const reaches = (from, target, seen = new Set()) => {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return (byId.get(from)?.dependsOn ?? []).some((next) => reaches(next, target, seen));
  };
  return reaches(leftId, rightId) || reaches(rightId, leftId);
}

function add(errors, field, code, message) {
  errors.push({ field, code, message });
}

export function normalizeDraft(input = {}) {
  const userFlow = list(input.userFlow);
  const goals = Array.isArray(input.goals) ? input.goals.map((raw, index) => ({
    id: ID_PATTERN.test(text(raw?.id)) ? text(raw.id) : `GOAL-${String(index + 1).padStart(3, '0')}`,
    title: text(raw?.title),
    outcome: text(raw?.outcome),
  })) : (text(input.goal) ? [{
    id: 'GOAL-001',
    title: text(input.title) || 'Primary goal',
    outcome: text(input.goal),
  }] : []);
  const workUnits = Array.isArray(input.workUnits) ? input.workUnits.map((raw, index) => {
    const baseId = text(raw.id) || slug(raw.service || raw.goal || `work-${index + 1}`);
    const priorGeneratedIds = input.workUnits.slice(0, index)
      .filter((candidate) => !text(candidate.id))
      .map((candidate) => slug(candidate.service || candidate.goal || 'work'));
    const occurrence = priorGeneratedIds.filter((id) => id === baseId).length + 1;
    const suffix = occurrence > 1 ? `-${occurrence}` : '';
    const id = text(raw.id) || `${baseId.slice(0, 128 - suffix.length)}${suffix}`;
    return {
      id,
      goalId: text(raw.goalId) || goals[0]?.id || '',
      service: text(raw.service),
      goal: text(raw.goal),
      writer: text(raw.writer),
      writePaths: list(raw.writePaths),
      dependsOn: list(raw.dependsOn),
      verify: list(raw.verify),
    };
  }) : [];
  return {
    changeId: text(input.changeId).toUpperCase(),
    title: text(input.title),
    coordinator: text(input.coordinator),
    goals,
    noNonGoals: Boolean(input.noNonGoals),
    nonGoals: list(input.nonGoals),
    hasUserFlow: input.hasUserFlow === undefined ? userFlow.length > 0 : Boolean(input.hasUserFlow),
    userFlow,
    acceptanceCriteria: list(input.acceptanceCriteria),
    services: list(input.services),
    noSharedContract: Boolean(input.noSharedContract),
    contracts: Array.isArray(input.contracts) ? input.contracts.map((contract) => ({
      name: text(contract?.name),
      content: String(contract?.content ?? ''),
      serviceIds: list(contract?.serviceIds),
    })) : [],
    workUnits,
  };
}

export function validateDraft(input, context = {}) {
  const draft = normalizeDraft(input);
  const services = new Map((context.services ?? []).map((service) => [service.id, service]));
  const errors = [];

  if (!ID_PATTERN.test(draft.changeId) || !draft.changeId.startsWith('CHG-')) {
    add(errors, 'changeId', 'INVALID_ID', 'Change ID는 CHG-로 시작하는 영문·숫자 식별자여야 합니다.');
  }
  if (!draft.title) add(errors, 'title', 'REQUIRED', '변경 제목을 입력하세요.');
  if (!draft.coordinator) add(errors, 'coordinator', 'REQUIRED', '회의 진행자를 입력하세요.');
  else if (!ID_PATTERN.test(draft.coordinator)) add(errors, 'coordinator', 'INVALID_ID', '회의 진행자는 영문·숫자 식별자로 입력하세요.');
  if (!draft.goals.length) add(errors, 'goals', 'REQUIRED', '달성할 목표를 하나 이상 정하세요.');
  const seenGoalIds = new Set();
  for (const [index, goal] of draft.goals.entries()) {
    if (!goal.title) add(errors, `goals.${index}.title`, 'REQUIRED', '목표 제목을 입력하세요.');
    if (!goal.outcome) add(errors, `goals.${index}.outcome`, 'REQUIRED', '목표를 달성했을 때 달라지는 점을 입력하세요.');
    if (seenGoalIds.has(goal.id)) add(errors, `goals.${index}.id`, 'DUPLICATE_ID', `목표 ID ${goal.id}가 중복됩니다.`);
    seenGoalIds.add(goal.id);
  }
  if (!draft.noNonGoals && !draft.nonGoals.length) add(errors, 'nonGoals', 'REQUIRED', '제외 범위를 입력하거나 제외 범위 없음을 선택하세요.');
  if (draft.hasUserFlow && !draft.userFlow.length) add(errors, 'userFlow', 'REQUIRED', '사용자 흐름을 사용하려면 한 단계 이상 입력하세요.');
  if (!draft.acceptanceCriteria.length) {
    add(errors, 'acceptanceCriteria', 'REQUIRED', '관찰 가능한 성공 기준을 하나 이상 정하세요.');
  }
  if (!draft.workUnits.length) add(errors, 'workUnits', 'REQUIRED', '담당자에게 배정할 작업을 하나 이상 만드세요.');
  if (draft.workUnits.length > MAX_WORK_UNITS) add(errors, 'workUnits', 'LIMIT_EXCEEDED', `작업은 최대 ${MAX_WORK_UNITS}개까지 만들 수 있습니다.`);
  if (draft.contracts.length > MAX_CONTRACTS) add(errors, 'contracts', 'LIMIT_EXCEEDED', `계약은 최대 ${MAX_CONTRACTS}개까지 만들 수 있습니다.`);
  for (const [field, values] of Object.entries({ nonGoals: draft.nonGoals, userFlow: draft.userFlow, acceptanceCriteria: draft.acceptanceCriteria })) {
    if (values.some((value) => value.length > MAX_TEXT_LENGTH)) add(errors, field, 'LIMIT_EXCEEDED', '각 항목은 20,000자를 넘을 수 없습니다.');
  }
  if (draft.workUnits.length > MAX_WORK_UNITS || draft.contracts.length > MAX_CONTRACTS) {
    return { valid: false, errors, draft };
  }

  for (const [index, serviceId] of draft.services.entries()) {
    if (!services.has(serviceId)) add(errors, `services.${index}`, 'UNKNOWN_SERVICE', `등록되지 않은 서비스 ${serviceId}입니다.`);
  }
  if (!draft.noSharedContract && !draft.contracts.length) {
    add(errors, 'contracts', 'REQUIRED', '서비스 간 약속을 추가하거나 공유 계약 없음을 선택하세요.');
  }
  for (const [index, contract] of draft.contracts.entries()) {
    if (!CONTRACT_PATTERN.test(contract.name) || basename(contract.name) !== contract.name) {
      add(errors, `contracts.${index}.name`, 'UNSAFE_PATH', '계약 파일명은 경로 없이 안전한 md, json, yaml 파일명이어야 합니다.');
    }
    if (!contract.content.trim()) add(errors, `contracts.${index}.content`, 'REQUIRED', '계약 내용을 입력하세요.');
    if (contract.name.toLowerCase().endsWith('.json') && contract.content.trim()) {
      try {
        JSON.parse(contract.content);
      } catch {
        add(errors, `contracts.${index}.content`, 'INVALID_JSON', 'JSON 계약 파일의 문법이 올바르지 않습니다.');
      }
    }
    const uniqueContractServices = new Set(contract.serviceIds);
    if (uniqueContractServices.size < 2) add(errors, `contracts.${index}.serviceIds`, 'REQUIRED', '서로 다른 참여 서비스를 두 개 이상 선택하세요.');
    for (const serviceId of uniqueContractServices) {
      if (!draft.services.includes(serviceId)) add(errors, `contracts.${index}.serviceIds`, 'UNKNOWN_SERVICE', `계약 참여 서비스 ${serviceId}가 영향받는 서비스에 없습니다.`);
    }
  }
  const contractNames = new Set();
  for (const [index, contract] of draft.contracts.entries()) {
    const key = contract.name.toLowerCase();
    if (contractNames.has(key)) add(errors, `contracts.${index}.name`, 'DUPLICATE_CONTRACT', `계약 파일명 ${contract.name}이 중복됩니다.`);
    contractNames.add(key);
  }

  const serviceUnitCounts = new Map();
  const ids = new Set();
  const goalIds = new Set(draft.goals.map(({ id }) => id));
  const workUnitById = new Map(draft.workUnits.map((unit) => [unit.id, unit]));
  const hasSameServicePredecessor = (unit, id, seen = new Set()) => {
    if (seen.has(id)) return false;
    seen.add(id);
    const dependency = workUnitById.get(id);
    if (!dependency) return false;
    if (dependency.service === unit.service) return true;
    return dependency.dependsOn.some((dependencyId) => hasSameServicePredecessor(unit, dependencyId, seen));
  };
  for (const [index, unit] of draft.workUnits.entries()) {
    const prefix = `workUnits.${index}`;
    if (!ID_PATTERN.test(unit.id)) add(errors, `${prefix}.id`, 'INVALID_ID', '작업 ID 형식이 올바르지 않습니다.');
    if (ids.has(unit.id)) add(errors, `${prefix}.id`, 'DUPLICATE_ID', `작업 ID ${unit.id}가 중복됩니다.`);
    ids.add(unit.id);
    if (!goalIds.has(unit.goalId)) add(errors, `${prefix}.goalId`, 'UNKNOWN_GOAL', '작업이 속할 목표를 선택하세요.');
    if (!services.has(unit.service)) add(errors, `${prefix}.service`, 'UNKNOWN_SERVICE', '등록된 대상 서비스를 선택하세요.');
    else if (!draft.services.includes(unit.service)) add(errors, `${prefix}.service`, 'SERVICE_NOT_SELECTED', `${unit.service}를 영향받는 서비스로 먼저 선택하세요.`);
    if (!unit.goal) add(errors, `${prefix}.goal`, 'REQUIRED', '작업 결과를 한 문장으로 입력하세요.');
    if (!unit.writer || unit.writer === 'unassigned') add(errors, `${prefix}.writer`, 'REQUIRED', '작업 담당자를 한 명 지정하세요.');
    else if (!ID_PATTERN.test(unit.writer)) add(errors, `${prefix}.writer`, 'INVALID_ID', '작업 담당자는 영문·숫자 식별자로 입력하세요.');
    if (!unit.writePaths.length) add(errors, `${prefix}.writePaths`, 'REQUIRED', '수정할 폴더나 파일을 하나 이상 지정하세요.');
    if (unit.writePaths.length > MAX_PATHS_PER_UNIT) add(errors, `${prefix}.writePaths`, 'LIMIT_EXCEEDED', `수정 범위는 작업당 최대 ${MAX_PATHS_PER_UNIT}개입니다.`);
    const serviceUnitCount = (serviceUnitCounts.get(unit.service) ?? 0) + 1;
    serviceUnitCounts.set(unit.service, serviceUnitCount);
    for (const [pathIndex, path] of unit.writePaths.entries()) {
      if (!pathIsSafe(path)) add(errors, `${prefix}.writePaths.${pathIndex}`, 'UNSAFE_PATH', '수정 범위는 저장소 내부의 상대 경로여야 합니다.');
      const unsupportedGlob = ['?', '[', ']', '{', '}'].some((character) => path.includes(character))
        || (path !== '**' && (path.match(/\*/g)?.length ?? 0) !== (path.endsWith('/**') ? 2 : 0));
      if (pathIsSafe(path) && unsupportedGlob) {
        add(errors, `${prefix}.writePaths.${pathIndex}`, 'UNSUPPORTED_SCOPE', '수정 범위는 정확한 파일 경로나 폴더/** 형식으로 입력하세요.');
      }
      const followsSameServiceWork = unit.dependsOn.some((id) => hasSameServicePredecessor(unit, id));
      if (path === '**' && (!services.get(unit.service)?.bootstrapEligible || serviceUnitCount > 1 || followsSameServiceWork)) {
        add(errors, `${prefix}.writePaths.${pathIndex}`, 'FULL_SCOPE_NOT_ALLOWED', '전체 경로(**)는 신규 서비스의 첫 구현 작업에서만 사용할 수 있습니다. 구체적인 파일 또는 폴더를 지정하세요.');
      }
    }
  }
  for (const serviceId of draft.workUnits.length ? draft.services : []) {
    if (!draft.workUnits.some((unit) => unit.service === serviceId)) {
      add(errors, 'workUnits', 'SERVICE_WITHOUT_WORK', `${serviceId}에 배정된 작업이 없습니다. 서비스를 제외하거나 작업을 추가하세요.`);
    }
  }

  for (const [index, unit] of draft.workUnits.entries()) {
    for (const dependency of unit.dependsOn) {
      if (!ids.has(dependency)) add(errors, `workUnits.${index}.dependsOn`, 'UNKNOWN_DEPENDENCY', `선행 작업 ${dependency}를 찾을 수 없습니다.`);
      if (dependency === unit.id) add(errors, `workUnits.${index}.dependsOn`, 'DEPENDENCY_CYCLE', '작업이 자기 자신을 기다릴 수 없습니다.');
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const byId = workUnitById;
  const visit = (id) => {
    if (visiting.has(id)) {
      add(errors, 'workUnits', 'DEPENDENCY_CYCLE', `작업 의존 관계가 ${id}에서 순환합니다.`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) if (byId.has(dependency)) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const unit of draft.workUnits) visit(unit.id);

  for (let leftIndex = 0; leftIndex < draft.workUnits.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < draft.workUnits.length; rightIndex += 1) {
      const left = draft.workUnits[leftIndex];
      const right = draft.workUnits[rightIndex];
      if (left.service !== right.service || ordered(draft.workUnits, left.id, right.id)) continue;
      const overlap = left.writePaths.find((leftPath) => right.writePaths.some((rightPath) => scopesOverlap(leftPath, rightPath)));
      if (overlap) add(errors, 'workUnits', 'PATH_OVERLAP', `${left.id}와 ${right.id}가 같은 경로(${overlap})를 병렬로 수정합니다. 작업을 합치거나 선행 작업을 지정하세요.`);
    }
  }

  return { valid: errors.length === 0, errors, draft };
}

function yaml(value) {
  return YAML.stringify(value, { lineWidth: 0 });
}

function planMarkdown(draft, rootHead) {
  const goalLines = draft.goals.map((goal) => `### ${goal.id} — ${goal.title}\n\n${goal.outcome}`).join('\n\n');
  const nonGoals = draft.noNonGoals ? '- None declared for this Change.' : draft.nonGoals.map((item) => `- ${item}`).join('\n');
  const userFlow = draft.hasUserFlow ? `\n\n## User flow\n\n${draft.userFlow.map((item, index) => `${index + 1}. ${item}`).join('\n')}` : '';
  const contractSummary = draft.noSharedContract ? 'none' : draft.contracts.map(({ name, serviceIds }) => `\`contracts/${name}\` (${serviceIds.join(' ↔ ')})`).join(', ');
  return `# ${draft.changeId} — ${draft.title}\n\n## State\n\n- Status: DRAFT\n- Coordinator: ${draft.coordinator}\n- Required approvers: product owner, service owner, independent reviewer\n- Plan base: ${rootHead}\n- Tracking: none\n\n## Goals\n\n${goalLines}\n\n## Non-goals\n\n${nonGoals}${userFlow}\n\n## Acceptance criteria\n\n${draft.acceptanceCriteria.map((item, index) => `- [AC-${String(index + 1).padStart(3, '0')}] ${item}`).join('\n')}\n\n## Contracts\n\n- Shared snapshots: ${contractSummary}\n- Compatibility/migration: none unless explicitly stated in a contract snapshot\n\n## Order\n\n- Merge order: dependency order recorded in WORK_UNITS.yaml\n- Deploy order: decided during Candidate integration\n- Activation: none unless added by an approved plan amendment\n\n## Risks\n\n- Concurrent path ownership or contract ambiguity blocks approval readiness.\n\n## Rollback\n\n| Item | Plan |\n|---|---|\n| Trigger | An acceptance criterion or approved contract cannot be satisfied |\n| Owner | Coordinator and affected service owner |\n| Kill switch | Defined before deployment when applicable |\n| Code recovery | Revert or roll forward from exact merge SHAs |\n| Data recovery | Not applicable unless added by an approved plan amendment |\n| Verification | Re-run all declared checks and Candidate verification |\n\n## Stop conditions\n\n- A contract, scope, base SHA, dependency, or required verification must change.\n- Secret, production, destructive, or undeclared repository access is required.\n`;
}

export function buildChangeFiles(input, context) {
  const { valid, errors, draft } = validateDraft(input, context);
  if (!valid) throw new Error(errors.map(({ message }) => message).join('\n'));
  const rootHead = context.rootHead;
  const serviceById = new Map(context.services.map((service) => [service.id, service]));
  const implementationUnits = draft.workUnits.map((unit) => {
    const service = serviceById.get(unit.service);
    const verification = unit.verify.length ? unit.verify : list(service.verify);
    return {
      id: unit.id,
      goal_id: unit.goalId,
      repo: unit.service,
      state: 'draft',
      goal: unit.goal,
      branch: `feat/${draft.changeId}/${unit.id}`,
      base_sha: service.baseSha,
      writer: unit.writer,
      write_paths: unit.writePaths,
      depends_on: ['contract-and-plan', ...unit.dependsOn.filter((id) => id !== 'contract-and-plan')],
      verify: verification,
    };
  });
  const serviceIds = [...new Set(draft.workUnits.map((unit) => unit.service))];
  const files = new Map();
  files.set('PLAN.md', planMarkdown(draft, rootHead));
  files.set('WORK_UNITS.yaml', yaml({
    schema_version: 1,
    change_id: draft.changeId,
    state: 'draft',
    plan_base_sha: rootHead,
    plan_merge_sha: 'pending',
    work_units: [
      {
        id: 'contract-and-plan', repo: 'root', state: 'in_progress',
        goal: 'Approve the scope, contracts, work boundaries, and verification gates.',
        branch: `change/${draft.changeId}/coordination`, base_sha: rootHead, writer: draft.coordinator,
        write_paths: [`changes/${draft.changeId}/**`], depends_on: [],
        verify: ['npm test', `npm run verify:registry -- --change ${draft.changeId} --strict`],
      },
      ...implementationUnits.map((unit) => ({
        ...unit,
        state: unit.verify.length && unit.depends_on.every((id) => id === 'contract-and-plan') ? 'ready' : 'draft',
      })),
      {
        id: 'candidate-integration', repo: 'root', state: 'draft',
        goal: 'Pin reviewed service merge SHAs and verify the exact candidate.',
        branch: `change/${draft.changeId}/candidate-integration`, base_sha: 'pending-plan-merge', writer: draft.coordinator,
        write_paths: [
          `changes/${draft.changeId}/WORK_UNITS.yaml`, `changes/${draft.changeId}/PRS.yaml`,
          `changes/${draft.changeId}/STATUS.md`, `changes/${draft.changeId}/releases/**`, 'e2e/**',
          ...serviceIds.map((id) => serviceById.get(id).path),
        ],
        depends_on: implementationUnits.map(({ id }) => id),
        verify: ['npm test', `npm run verify:prs -- --change ${draft.changeId}`, `npm run verify:candidate -- --change ${draft.changeId} --target-ref origin/main`],
      },
    ],
  }));
  files.set('PRS.yaml', yaml({
    schema_version: 1, change_id: draft.changeId, state: 'draft', plan_merge_sha: 'pending',
    prs: [
      { key: 'root-planning', repo: 'root', work_unit: 'contract-and-plan', number: null, state: 'not-started', base_sha: rootHead, head_sha: null, merge_sha: null },
      ...implementationUnits.map((unit) => ({ key: unit.id, repo: unit.repo, work_unit: unit.id, number: null, state: 'not-started', base_sha: unit.base_sha, head_sha: null, merge_sha: null, merge_method: 'squash' })),
      { key: 'root-candidate', repo: 'root', work_unit: 'candidate-integration', number: null, state: 'not-started', base_sha: 'pending-plan-merge', head_sha: null, merge_sha: null },
    ],
  }));
  const unitRows = implementationUnits.map((unit) => `| \`${unit.id}\` | \`${unit.goal_id}\` | \`${unit.repo}\` | draft | Approved planning merge SHA |`).join('\n');
  const scopeSummary = draft.goals.map(({ id, title, outcome }) => `${id} ${title}: ${outcome}`).join(' ');
  files.set('STATUS.md', `# Status — ${draft.changeId}\n\n**State:** DRAFT\n\n## Scope\n\n${scopeSummary} Non-goals: ${draft.noNonGoals ? 'none' : draft.nonGoals.join(' ')}\n\n## Work units\n\n| Work unit | Goal | Repository | State | Gate |\n|---|---|---|---|---|\n| \`contract-and-plan\` | all | Root | draft | Human plan and contract approval |\n${unitRows}\n| \`candidate-integration\` | all | Root | draft | Service PRs reviewed and human-merged |\n\n## Evidence boundary\n\n- Root base SHA: \`${rootHead}\`\n- Service base SHAs: see \`WORK_UNITS.yaml\`\n- No implementation has started.\n- No implementation agent has been dispatched.\n- No candidate, release, or deployment claim exists yet.\n\n## Next gate\n\nA human reviews and approves the Root planning PR. Its merge SHA becomes the immutable plan version supplied to participating Writers.\n`);
  files.set('releases/candidate-001.yaml', yaml({
    schema_version: 1, change_id: draft.changeId, candidate: 1, state: 'draft', plan_sha: 'pending-planning-merge',
    services: serviceIds.map((id) => {
      const service = serviceById.get(id);
      return { repo: id, path: service.path, base_sha: service.baseSha, sha: 'pending-human-approved-merge', source_prs: implementationUnits.filter((unit) => unit.repo === id).map(({ id: unitId }) => unitId) };
    }),
    evidence: [],
  }));
  if (draft.noSharedContract) {
    files.set('contracts/README.md', '# Contracts\n\nThis Change declares no shared cross-repository contract. Add one only through a reviewed plan amendment.\n');
  } else {
    for (const contract of draft.contracts) files.set(`contracts/${contract.name}`, contract.content.endsWith('\n') ? contract.content : `${contract.content}\n`);
  }
  return files;
}

export function saveChange(root, changeId, files) {
  if (!ID_PATTERN.test(changeId)) throw new Error('유효하지 않은 Change ID입니다.');
  const changesRoot = resolve(root, 'changes');
  const target = resolve(changesRoot, changeId);
  if (dirname(target) !== changesRoot) throw new Error('Change 경로가 changes/ 밖을 벗어납니다.');
  if (existsSync(target)) throw new Error(`Change ${changeId}가 이미 존재합니다.`);
  const staging = resolve(changesRoot, `_ui-${changeId}-${process.pid}-${Date.now()}`);
  if (!staging.startsWith(`${changesRoot}${sep}`)) throw new Error('임시 저장 경로가 안전하지 않습니다.');
  try {
    for (const [relativePath, content] of files) {
      if (!pathIsSafe(relativePath)) throw new Error(`안전하지 않은 산출물 경로: ${relativePath}`);
      const output = resolve(staging, relativePath);
      if (!output.startsWith(`${staging}${sep}`)) throw new Error(`산출물 경로가 Change 밖을 벗어납니다: ${relativePath}`);
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, content, 'utf8');
    }
    renameSync(staging, target);
    return { directory: target, files: [...files.keys()] };
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
