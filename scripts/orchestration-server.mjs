#!/usr/bin/env node
import { createOrchestrationServer } from './orchestration/server.mjs';

const host = '127.0.0.1';
const rawPort = process.env.PORT ?? '4173';
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  process.stderr.write(`ERROR: invalid PORT ${rawPort}\n`);
  process.exitCode = 1;
} else {
  const server = createOrchestrationServer({ root: process.cwd() });
  server.listen(port, host, () => {
    const address = server.address();
    process.stdout.write(`Coordination meeting UI: http://${host}:${address.port}\n`);
    process.stdout.write(`Root: ${process.cwd()}\n`);
  });
}
