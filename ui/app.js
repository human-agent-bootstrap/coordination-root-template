const state = {
  status: null,
  step: 0,
  revision: null,
  files: [],
  activeFile: null,
};

const form = document.querySelector('#meeting-form');
const message = document.querySelector('#message');
const workUnits = document.querySelector('#work-units');
const unitTemplate = document.querySelector('#unit-template');

function lines(value) {
  return String(value ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
}

function showMessage(text, kind = 'error') {
  message.textContent = text;
  message.className = `message ${kind}`;
  message.hidden = false;
  message.focus();
}

function clearMessage() {
  message.hidden = true;
  message.textContent = '';
}

function showStep(index) {
  state.step = Number(index);
  document.querySelectorAll('.step-panel').forEach((panel) => {
    panel.hidden = Number(panel.dataset.step) !== state.step;
  });
  document.querySelectorAll('[data-step-target]').forEach((button) => {
    const target = Number(button.dataset.stepTarget);
    if (target === state.step) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
    button.classList.toggle('complete', target < state.step);
  });
  clearMessage();
  document.querySelector(`[data-step="${state.step}"] h2`)?.focus?.();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function request(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || body.errors?.map(({ message: item }) => item).join('\n') || '요청을 완료하지 못했습니다.');
    error.body = body;
    throw error;
  }
  return body;
}

async function loadStatus() {
  state.status = await request('/api/status');
  const dirtyText = state.status.dirty ? ' · Git 변경 있음' : ' · Git 상태 깨끗함';
  const statusNode = document.querySelector('#repo-status');
  const branch = document.createElement('span');
  branch.textContent = state.status.branch;
  statusNode.replaceChildren(branch, document.createTextNode(` · ${state.status.head.slice(0, 8)}${dirtyText}`));
  const changeList = document.querySelector('#change-list');
  changeList.replaceChildren(...(state.status.changes.length
    ? state.status.changes.map((id) => {
      const item = document.createElement('span');
      item.textContent = id;
      return item;
    })
    : [document.createTextNode('아직 만든 계획이 없습니다.')]
  ));
  const serviceList = document.querySelector('#service-list');
  if (!state.status.services.length) {
    serviceList.innerHTML = '<span class="help">등록된 서비스가 없습니다. 먼저 기존 CLI에서 서비스를 등록해 주세요.</span>';
    return;
  }
  serviceList.replaceChildren(...state.status.services.map((service) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'services';
    input.value = service.id;
    input.setAttribute('aria-label', service.id);
    label.append(input, document.createTextNode(`${service.id} · ${service.stack || '기술 스택 미지정'}`));
    return label;
  }));
}

function selectedServices() {
  return [...form.querySelectorAll('[name="services"]:checked')].map(({ value }) => value);
}

function refreshUnitServices(card) {
  const select = card.querySelector('[data-unit="service"]');
  const current = select.value;
  select.replaceChildren(...selectedServices().map((id) => new Option(id, id)));
  if ([...select.options].some(({ value }) => value === current)) select.value = current;
}

function addUnit() {
  const card = unitTemplate.content.firstElementChild.cloneNode(true);
  refreshUnitServices(card);
  card.querySelector('.remove').addEventListener('click', () => {
    card.remove();
    if (!workUnits.querySelector('.unit-card')) workUnits.innerHTML = '<div class="empty-state">아직 추가한 작업이 없습니다. 회의에서 합의한 첫 작업을 추가해 주세요.</div>';
    state.revision = null;
  });
  workUnits.querySelector('.empty-state')?.remove();
  workUnits.append(card);
  card.querySelector('[data-unit="id"]').focus();
  state.revision = null;
}

function collectDraft() {
  const data = new FormData(form);
  return {
    changeId: data.get('changeId'),
    title: data.get('title'),
    coordinator: data.get('coordinator'),
    goal: data.get('goal'),
    nonGoals: lines(data.get('nonGoals')),
    userFlow: lines(data.get('userFlow')),
    acceptanceCriteria: lines(data.get('acceptanceCriteria')),
    services: selectedServices(),
    noSharedContract: Boolean(data.get('noSharedContract')),
    contracts: data.get('noSharedContract') ? [] : [{ name: data.get('contractName'), content: data.get('contractContent') }],
    workUnits: [...workUnits.querySelectorAll('.unit-card')].map((card) => ({
      id: card.querySelector('[data-unit="id"]').value,
      service: card.querySelector('[data-unit="service"]').value,
      goal: card.querySelector('[data-unit="goal"]').value,
      writer: card.querySelector('[data-unit="writer"]').value,
      writePaths: lines(card.querySelector('[data-unit="writePaths"]').value),
      dependsOn: lines(card.querySelector('[data-unit="dependsOn"]').value),
      verify: lines(card.querySelector('[data-unit="verify"]').value),
    })),
  };
}

function renderFiles(files) {
  state.files = files;
  state.activeFile = files[0]?.path;
  const tabs = document.querySelector('#file-tabs');
  const preview = document.querySelector('#file-preview');
  const select = (path) => {
    state.activeFile = path;
    tabs.querySelectorAll('button').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.path === path)));
    preview.textContent = files.find((file) => file.path === path)?.diff ?? '';
  };
  tabs.replaceChildren(...files.map(({ path }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.role = 'tab';
    button.dataset.path = path;
    button.textContent = path;
    button.addEventListener('click', () => select(path));
    return button;
  }));
  if (state.activeFile) select(state.activeFile);
}

function renderErrors(errors) {
  const summary = document.querySelector('#validation-summary');
  summary.className = 'validation-summary error';
  const list = document.createElement('ul');
  for (const error of errors) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'error-link';
    button.textContent = error.message;
    button.addEventListener('click', () => focusError(error.field));
    item.append(button);
    list.append(item);
  }
  summary.replaceChildren(document.createTextNode('저장 전 확인이 필요합니다.'), list);
}

function focusError(field) {
  const topLevel = field.split('.')[0];
  const stepByField = {
    changeId: 0, title: 0, coordinator: 0, goal: 0,
    nonGoals: 1, userFlow: 1, acceptanceCriteria: 1, services: 1,
    workUnits: 2, contracts: 3, review: 4,
  };
  showStep(stepByField[topLevel] ?? 4);
  let target = form.elements[topLevel];
  if (topLevel === 'workUnits') target = workUnits.querySelector('[data-unit]');
  if (topLevel === 'services') target = form.querySelector('[name="services"]');
  if (topLevel === 'contracts') target = form.elements.noSharedContract;
  target?.focus();
}

function invalidatePreview() {
  state.revision = null;
  document.querySelector('#save').disabled = true;
  const summary = document.querySelector('#validation-summary');
  if (!document.querySelector('#review').hidden) {
    summary.className = 'validation-summary';
    summary.textContent = '입력 내용이 변경되었습니다. 저장 전에 계획 검토를 다시 실행하세요.';
  }
}

async function preview() {
  clearMessage();
  state.revision = null;
  document.querySelector('#save').disabled = true;
  document.querySelector('#review-empty').hidden = true;
  document.querySelector('#review').hidden = false;
  try {
    const result = await request('/api/changes/preview', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(collectDraft()),
    });
    state.revision = result.revision;
    const summary = document.querySelector('#validation-summary');
    summary.className = 'validation-summary success';
    summary.textContent = `검사 통과 · strict 검사 종료 코드 ${result.validation.exitCode}. 계획 승인은 별도로 받아야 합니다.`;
    renderFiles(result.files);
    document.querySelector('#save').disabled = false;
  } catch (error) {
    renderErrors(error.body?.errors ?? [{ message: error.message }]);
    document.querySelector('#file-tabs').replaceChildren();
    document.querySelector('#file-preview').textContent = '';
  }
}

async function save() {
  try {
    const result = await request('/api/changes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draft: collectDraft(), revision: state.revision }),
    });
    document.querySelector('#save').disabled = true;
    showMessage(`계획을 저장했습니다. 파일 ${result.files.length}개를 만들었습니다. 다음 단계는 계획 PR 검토입니다.`, 'success');
    await loadStatus();
  } catch (error) {
    state.revision = null;
    document.querySelector('#save').disabled = true;
    showMessage(error.message);
  }
}

function packetForm(unit, change, planSha) {
  const wrapper = document.createElement('div');
  wrapper.className = 'dispatch-unit';
  const title = document.createElement('strong');
  title.textContent = unit.id;
  const goal = document.createElement('p');
  goal.textContent = unit.goal;
  const metadata = document.createElement('p');
  metadata.className = 'help';
  metadata.textContent = `담당자 ${unit.writer} · ${unit.repo}`;
  wrapper.append(title, goal, metadata);
  const runLabel = document.createElement('label');
  runLabel.textContent = 'Run ID';
  const run = document.createElement('input');
  run.value = `run-${change}-${unit.id}-001`;
  runLabel.append(run);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'primary';
  button.textContent = '작업 패킷 만들기';
  button.disabled = !unit.eligible;
  button.addEventListener('click', async () => {
    try {
      const result = await request('/api/packets', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ change, planSha, unit: unit.id, writer: unit.writer, run: run.value }),
      });
      const receipt = document.createElement('p');
      receipt.className = 'help';
      receipt.textContent = `생성 완료: ${result.path} · sha256:${result.digest}`;
      const packet = document.createElement('pre');
      packet.setAttribute('aria-label', `${unit.id} 작업 패킷 내용`);
      packet.textContent = result.content;
      wrapper.append(receipt, packet);
      button.disabled = true;
    } catch (error) {
      showMessage(error.message);
    }
  });
  wrapper.append(runLabel, button);
  return wrapper;
}

async function checkDispatch() {
  const data = new FormData(document.querySelector('#dispatch-form'));
  const change = String(data.get('dispatchChange') ?? '').trim();
  const planSha = String(data.get('planSha') ?? '').trim();
  const resultNode = document.querySelector('#dispatch-result');
  resultNode.textContent = '확인 중…';
  try {
    const result = await request(`/api/dispatch?change=${encodeURIComponent(change)}&planSha=${encodeURIComponent(planSha)}`);
    resultNode.replaceChildren(...result.units.map((unit) => packetForm(unit, change, planSha)));
    if (!result.units.length) resultNode.textContent = '시작할 수 있는 작업이 없습니다.';
  } catch (error) {
    resultNode.textContent = error.message;
  }
}

document.querySelectorAll('[data-next]').forEach((button) => button.addEventListener('click', () => showStep(button.dataset.next)));
document.querySelectorAll('[data-back]').forEach((button) => button.addEventListener('click', () => showStep(button.dataset.back)));
document.querySelectorAll('[data-step-target]').forEach((button) => button.addEventListener('click', () => showStep(button.dataset.stepTarget)));
document.querySelector('#add-unit').addEventListener('click', addUnit);
document.querySelector('#preview').addEventListener('click', preview);
document.querySelector('#save').addEventListener('click', save);
document.querySelector('#dispatch-open').addEventListener('click', () => document.querySelector('#dispatch-dialog').showModal());
document.querySelector('#check-dispatch').addEventListener('click', checkDispatch);
form.elements.noSharedContract.addEventListener('change', ({ target }) => {
  document.querySelector('#contract-fields').hidden = target.checked;
  invalidatePreview();
});
form.addEventListener('input', invalidatePreview);
form.addEventListener('change', () => {
  document.querySelectorAll('.unit-card').forEach(refreshUnitServices);
  invalidatePreview();
});

loadStatus().catch((error) => showMessage(error.message));
