import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { buildChangeFiles, normalizeDraft, saveChange, validateDraft } from './change-service.mjs';

const moduleRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const BODY_LIMIT = 1024 * 1024;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function registryAt(root) {
  const path = join(root, 'services/registry.yaml');
  if (!existsSync(path)) throw new Error('services/registry.yaml을 찾을 수 없습니다. Coordination Root에서 실행하세요.');
  const registry = YAML.parse(readFileSync(path, 'utf8')) ?? {};
  const services = Array.isArray(registry.services) ? registry.services : [];
  return { ...registry, services };
}

function serviceBase(root, service, registryVersion) {
  try {
    const row = git(root, ['ls-tree', 'HEAD', '--', service.path]);
    const gitlink = row.match(/^160000 commit ([0-9a-f]{40})\t/)?.[1];
    if (gitlink) return gitlink;
  } catch {
    // Fall back to the initialized service checkout for registry-v1 fixtures.
  }
  if (registryVersion >= 2) {
    throw new Error(`서비스 ${service.id}의 등록 커밋을 Root gitlink에서 찾을 수 없습니다.`);
  }
  try {
    return git(join(root, service.path), ['rev-parse', 'HEAD']);
  } catch {
    return null;
  }
}

export function repositoryContext(root) {
  const registry = registryAt(root);
  let head;
  let branch;
  let dirty;
  try {
    head = git(root, ['rev-parse', 'HEAD']);
    branch = git(root, ['branch', '--show-current']) || '(detached)';
    dirty = Boolean(git(root, ['status', '--porcelain']));
  } catch {
    throw new Error('현재 폴더가 커밋이 있는 Git Coordination Root가 아닙니다.');
  }
  const changesPath = join(root, 'changes');
  const changes = existsSync(changesPath)
    ? readdirSync(changesPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .map((entry) => entry.name)
      .sort()
    : [];
  return {
    root,
    head,
    branch,
    dirty,
    changes,
    services: registry.services.map((service) => ({
      ...service,
      baseSha: serviceBase(root, service, registry.version ?? 1),
    })),
  };
}

function revisionFor(root, draft, files, context) {
  const hash = createHash('sha256');
  hash.update(context.head);
  hash.update(git(root, ['status', '--porcelain=v1']));
  hash.update(git(root, ['diff', '--binary', 'HEAD', '--', 'services/registry.yaml', '.gitmodules', 'changes']));
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '--', 'services/registry.yaml', '.gitmodules', 'changes'])
    .split('\n').filter(Boolean).sort();
  for (const path of untracked) hash.update(path).update('\0').update(readFileSync(join(root, path))).update('\0');
  hash.update(JSON.stringify(normalizeDraft(draft)));
  for (const [path, content] of files) hash.update(path).update('\0').update(content).update('\0');
  return hash.digest('hex');
}

function strictValidation(root, draft, files) {
  const fixture = mkdtempSync(join(tmpdir(), 'orchestration-preview-'));
  try {
    mkdirSync(join(fixture, 'services'), { recursive: true });
    cpSync(join(root, 'services/registry.yaml'), join(fixture, 'services/registry.yaml'));
    if (existsSync(join(root, '.gitmodules'))) cpSync(join(root, '.gitmodules'), join(fixture, '.gitmodules'));
    if (existsSync(join(root, 'changes'))) cpSync(join(root, 'changes'), join(fixture, 'changes'), { recursive: true });
    for (const service of repositoryContext(root).services) {
      mkdirSync(join(fixture, service.path, '.git'), { recursive: true });
    }
    saveChange(fixture, draft.changeId, files);
    const result = spawnSync(process.execPath, [join(moduleRoot, 'scripts/verify-registry.mjs'), '--change', draft.changeId, '--strict'], {
      cwd: fixture,
      encoding: 'utf8',
    });
    return {
      exitCode: result.status ?? 1,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
    };
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

export function previewChange(root, input) {
  const context = repositoryContext(root);
  const checked = validateDraft(input, context);
  if (!checked.valid) return { valid: false, errors: checked.errors, unresolved: checked.errors };
  if (context.changes.includes(checked.draft.changeId)) {
    const errors = [{ field: 'changeId', code: 'EXISTS', message: `Change ${checked.draft.changeId}가 이미 존재합니다.` }];
    return { valid: false, errors, unresolved: errors };
  }
  if (checked.draft.services.some((id) => !context.services.find((service) => service.id === id)?.baseSha)) {
    const errors = [{ field: 'services', code: 'MISSING_BASE', message: '선택한 서비스의 작업 시작 기준 SHA를 확인할 수 없습니다.' }];
    return { valid: false, errors, unresolved: errors };
  }
  const files = buildChangeFiles(checked.draft, { rootHead: context.head, services: context.services });
  const validation = strictValidation(root, checked.draft, files);
  const revision = revisionFor(root, checked.draft, files, context);
  return {
    valid: validation.exitCode === 0,
    errors: validation.exitCode === 0 ? [] : [{ field: 'review', code: 'STRICT_VALIDATION', message: validation.output }],
    unresolved: validation.exitCode === 0 ? [] : [{ field: 'review', code: 'STRICT_VALIDATION', message: validation.output }],
    revision,
    validation,
    files: [...files].map(([path, content]) => ({
      path,
      content,
      diff: `--- /dev/null\n+++ b/changes/${checked.draft.changeId}/${path}\n${content.split('\n').map((line) => `+${line}`).join('\n')}`,
    })),
    draft: checked.draft,
  };
}

function approvedRef(root) {
  return spawnSync('git', ['rev-parse', '--verify', 'origin/main'], { cwd: root }).status === 0
    ? 'origin/main'
    : 'main';
}

function approvedManifest(root, change, planSha) {
  if (!IDENTIFIER.test(change) || !FULL_SHA.test(planSha)) {
    throw new Error('승인된 계획을 확인하려면 올바른 Change ID와 40자리 Plan SHA가 필요합니다.');
  }
  const commit = spawnSync('git', ['cat-file', '-e', `${planSha}^{commit}`], { cwd: root });
  const reachable = spawnSync('git', ['merge-base', '--is-ancestor', planSha, approvedRef(root)], { cwd: root });
  if (commit.status !== 0 || reachable.status !== 0) {
    throw new Error('승인된 계획 SHA가 현재 main에서 확인되지 않습니다.');
  }
  let raw;
  try {
    raw = git(root, ['show', `${planSha}:changes/${change}/WORK_UNITS.yaml`]);
  } catch {
    throw new Error('승인된 계획에서 Change를 찾을 수 없습니다.');
  }
  const manifest = YAML.parse(raw) ?? {};
  if (!['approved', 'active'].includes(String(manifest.state))) {
    throw new Error('승인된 계획의 Change 상태가 approved 또는 active가 아닙니다.');
  }
  return manifest;
}

export function dispatchEligibility(root, change, planSha) {
  const manifest = approvedManifest(root, change, planSha);
  const byId = new Map((manifest.work_units ?? []).map((unit) => [unit.id, unit]));
  const units = (manifest.work_units ?? [])
    .filter((unit) => {
      const planning = unit.repo === 'root' && unit.branch === `change/${change}/coordination`;
      return !planning && ['ready', 'in_progress'].includes(String(unit.state));
    })
    .map((unit) => {
      const blockers = (unit.depends_on ?? [])
        .filter((id) => {
          const dependency = byId.get(id);
          const planning = dependency?.repo === 'root' && dependency?.branch === `change/${change}/coordination`;
          return !planning && dependency?.state !== 'merged';
        })
        .map((id) => `선행 작업 ${id}가 아직 병합되지 않았습니다.`);
      return {
        id: unit.id,
        repo: unit.repo,
        writer: unit.writer,
        goal: unit.goal,
        branch: unit.branch,
        baseSha: unit.base_sha,
        blockers,
        eligible: blockers.length === 0,
      };
    });
  return { change, planSha, units };
}

function createPacket(root, request) {
  for (const key of ['change', 'unit', 'writer', 'run']) {
    if (!IDENTIFIER.test(String(request[key] ?? ''))) throw new Error(`${key} 값이 올바르지 않습니다.`);
  }
  const dispatch = dispatchEligibility(root, request.change, request.planSha);
  const eligible = dispatch.units.find((unit) => (
    unit.id === request.unit && unit.eligible && unit.writer === request.writer
  ));
  if (!eligible) throw new Error('이 작업은 현재 작업 패킷을 발급할 수 없습니다.');
  const result = spawnSync(process.execPath, [
    join(moduleRoot, 'scripts/bootstrap.mjs'),
    '--plan-sha', request.planSha,
    '--change', request.change,
    '--unit', request.unit,
    '--writer', request.writer,
    '--run', request.run,
    '--apply',
  ], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || '작업 패킷 생성에 실패했습니다.').trim());
  const relativePath = `.task-packets/${request.run}.md`;
  const content = readFileSync(join(root, relativePath), 'utf8');
  const marker = '\nPacket SHA-256: ';
  const markerIndex = content.lastIndexOf(marker);
  const declaredDigest = markerIndex >= 0
    ? content.slice(markerIndex + marker.length).trim()
    : '';
  const computedDigest = markerIndex >= 0
    ? createHash('sha256').update(content.slice(0, markerIndex + 1)).digest('hex')
    : '';
  if (!SHA256.test(declaredDigest) || declaredDigest !== computedDigest) {
    throw new Error('생성된 작업 패킷의 무결성 검증에 실패했습니다.');
  }
  return {
    path: relativePath,
    digest: declaredDigest,
    content,
  };
}

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

function securityHeaders(contentType) {
  return {
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-type': contentType,
  };
}

function allowedRequestOrigin(request) {
  const host = String(request.headers.host ?? '').toLowerCase();
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
      && parsed.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

async function readJson(request) {
  if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    const error = new Error('JSON 요청만 지원합니다.');
    error.statusCode = 415;
    throw error;
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > BODY_LIMIT) {
      const error = new Error('요청 본문은 1MB를 넘을 수 없습니다.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('올바른 JSON 요청이 아닙니다.');
    error.statusCode = 400;
    throw error;
  }
}

const STATIC_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

function staticFile(pathname) {
  if (pathname === '/') return 'index.html';
  const allowed = new Map([
    ['/app.js', 'app.js'],
    ['/styles.css', 'styles.css'],
  ]);
  return allowed.get(pathname);
}

export function createOrchestrationServer({ root = process.cwd(), uiRoot = join(moduleRoot, 'ui') } = {}) {
  const resolvedRoot = resolve(root);
  return createServer(async (request, response) => {
    try {
      if (!allowedRequestOrigin(request)) {
        return json(response, 403, { error: '로컬 요청만 허용합니다.' });
      }
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/api/status') {
        return json(response, 200, repositoryContext(resolvedRoot));
      }
      if (request.method === 'POST' && url.pathname === '/api/changes/preview') {
        const draft = await readJson(request);
        const result = previewChange(resolvedRoot, draft);
        return json(response, result.valid ? 200 : 422, result);
      }
      if (request.method === 'POST' && url.pathname === '/api/changes') {
        const body = await readJson(request);
        const preview = previewChange(resolvedRoot, body.draft);
        if (!preview.valid) return json(response, 422, preview);
        if (body.revision !== preview.revision) return json(response, 409, { error: '미리보기 이후 저장소나 입력이 변경되었습니다. 다시 검토하세요.' });
        const files = new Map(preview.files.map(({ path, content }) => [path, content]));
        const saved = saveChange(resolvedRoot, preview.draft.changeId, files);
        return json(response, 201, { ...saved, validation: preview.validation });
      }
      if (request.method === 'GET' && url.pathname === '/api/dispatch') {
        try {
          return json(response, 200, dispatchEligibility(resolvedRoot, url.searchParams.get('change'), url.searchParams.get('planSha')));
        } catch (error) {
          return json(response, 422, { error: error.message });
        }
      }
      if (request.method === 'POST' && url.pathname === '/api/packets') {
        try {
          return json(response, 201, createPacket(resolvedRoot, await readJson(request)));
        } catch (error) {
          return json(response, 422, { error: error.message });
        }
      }
      const file = request.method === 'GET' ? staticFile(url.pathname) : null;
      if (file) {
        const path = join(uiRoot, file);
        if (!existsSync(path)) return json(response, 404, { error: 'UI 파일을 찾을 수 없습니다.' });
        const content = readFileSync(path);
        response.writeHead(200, securityHeaders(STATIC_TYPES.get(extname(path)) ?? 'application/octet-stream'));
        return response.end(content);
      }
      return json(response, 404, { error: '지원하지 않는 작업입니다.' });
    } catch (error) {
      return json(response, error.statusCode ?? 500, { error: error.message });
    }
  });
}
