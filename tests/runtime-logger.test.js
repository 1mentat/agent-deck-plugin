import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRuntimeLogger } from '../io.github.1mentat.agentdeck.ulanziPlugin/plugin/runtime-logger.js';

test('runtime logger writes bounded allowlisted diagnostics without source identifiers', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-deck-log-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const logPath = path.join(directory, 'runtime.jsonl');
  const logger = createRuntimeLogger({ logPath, now: () => Date.parse('2026-07-30T12:00:00Z') });

  logger.log('source_offline', {
    sourceKind: 'ssh',
    errorCode: 'SSH_TIMEOUT',
    durationMs: 8001,
    sshHost: 'private-host',
    message: '/private/path and command output',
  });
  await logger.flush();

  const document = await fs.readFile(logPath, 'utf8');
  const record = JSON.parse(document.trim());
  assert.deepEqual(record, {
    at: '2026-07-30T12:00:00.000Z',
    event: 'source_offline',
    sourceKind: 'ssh',
    errorCode: 'SSH_TIMEOUT',
    durationMs: 8001,
  });
  assert.doesNotMatch(document, /private-host|private\/path|command output/);
});

test('runtime logger rotates before exceeding its configured size', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-deck-log-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const logPath = path.join(directory, 'runtime.jsonl');
  const logger = createRuntimeLogger({ logPath, maxBytes: 100, now: () => 1 });

  await logger.log('plugin_started');
  await logger.log('plugin_connected');

  await fs.access(`${logPath}.1`);
  const current = await fs.readFile(logPath, 'utf8');
  assert.match(current, /plugin_connected/);
});
