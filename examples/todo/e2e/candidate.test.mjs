import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';
import { chromium } from '@playwright/test';

const root = new URL('..', import.meta.url).pathname;
const back = join(root, 'services/back');
const front = join(root, 'services/front');
const apiOrigin = 'http://127.0.0.1:8765';
const frontOrigin = 'http://127.0.0.1:5173';

async function waitFor(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError ?? new Error(`timed out waiting for ${url}`);
}

function start(command, args, cwd, env = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  return { child, output: () => output };
}

async function stop(processHandle) {
  if (processHandle.child.exitCode !== null) return;
  const signal = (name) => {
    try {
      if (process.platform === 'win32') processHandle.child.kill(name);
      else process.kill(-processHandle.child.pid, name);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  signal('SIGTERM');
  await Promise.race([
    new Promise((resolve) => processHandle.child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (processHandle.child.exitCode === null) signal('SIGKILL');
}

async function unusedPortCheck(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

test('candidate exact-SHA Front and Back create a TODO in a browser', { timeout: 60_000 }, async () => {
  const api = start('uv', ['run', '--offline', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8765'], back);
  const ui = start('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'], front, {
    VITE_API_BASE_URL: apiOrigin,
  });
  let browser;

  try {
    await Promise.all([waitFor(`${apiOrigin}/openapi.json`), waitFor(frontOrigin)]);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto(frontOrigin);
    const input = page.getByLabel('TODO title');
    const createButton = page.getByRole('button', { name: 'Create TODO' });
    await assert.doesNotReject(() => input.waitFor());
    await input.fill('   ');
    await createButton.click();
    assert.equal(await page.getByRole('alert').textContent(), 'Enter a TODO title before creating it.');

    await input.fill('  Candidate TODO  ');
    const responsePromise = page.waitForResponse((response) => response.url() === `${apiOrigin}/todos` && response.request().method() === 'POST');
    await createButton.click();
    const response = await responsePromise;
    assert.equal(response.status(), 201);
    await page.getByRole('listitem', { name: 'Candidate TODO' }).waitFor();
    assert.equal(await input.inputValue(), '');
    assert.equal(await page.getByRole('status').textContent(), 'Created TODO: Candidate TODO');
    assert.deepEqual(consoleErrors, []);
  } finally {
    await browser?.close();
    await Promise.all([stop(api), stop(ui)]);
    await unusedPortCheck(8765);
    await unusedPortCheck(5173);
  }
});
