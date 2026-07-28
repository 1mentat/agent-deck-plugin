import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createCodexObserver } from '../io.github.1mentat.agentdeck.ulanziPlugin/plugin/codex-observer.js';

test('scans a synthetic Codex home and ignores a partial final line', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-deck-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sessionDir = path.join(root, 'sessions', '2026', '07', '23');
  await fs.mkdir(sessionDir, { recursive: true });
  const id = '019f9079-6912-7033-997f-32b8146e9107';
  const file = path.join(sessionDir, `rollout-test-${id}.jsonl`);
  const now = Date.now();
  const lines = [
    {
      timestamp: new Date(now - 10_000).toISOString(),
      type: 'session_meta',
      payload: { id, cwd: '/tmp/radar-project', source: 'cli', model_provider: 'openai' },
    },
    {
      timestamp: new Date(now - 9_000).toISOString(),
      type: 'turn_context',
      payload: { model: 'gpt-test', effort: 'high' },
    },
    {
      timestamp: new Date(now - 8_000).toISOString(),
      type: 'event_msg',
      payload: { type: 'user_message', message: 'Inspect the renderer' },
    },
    {
      timestamp: new Date(now - 7_000).toISOString(),
      type: 'event_msg',
      payload: { type: 'task_started' },
    },
  ].map((value) => JSON.stringify(value));
  await fs.writeFile(file, `${lines.join('\n')}\n{"partial":`);

  const observer = createCodexObserver({ codexHome: root, now: () => now });
  const dashboard = await observer.scan();
  assert.equal(dashboard.agents.length, 1);
  assert.equal(dashboard.agents[0].status, 'working');
  assert.equal(dashboard.agents[0].project, 'radar-project');
  assert.equal(dashboard.agents[0].task, 'Inspect the renderer');
  assert.equal(dashboard.agents[0].id, `local:${id}`);
  assert.equal(dashboard.agents[0].sourceKind, 'local');
  assert.equal(dashboard.counts.working, 1);
  assert.deepEqual(dashboard.warnings, []);
});
