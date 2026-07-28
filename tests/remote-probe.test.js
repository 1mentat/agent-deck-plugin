import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createCodexObserver } from '../io.github.1mentat.agentdeck.ulanziPlugin/plugin/codex-observer.js';

const probePath = path.join(
  process.cwd(),
  'io.github.1mentat.agentdeck.ulanziPlugin',
  'generated',
  'codex-remote-probe.mjs',
);

async function writeSession(root, id, ageMs, events, source = 'cli') {
  const directory = path.join(root, 'sessions', '2026', '07', '27');
  await fs.mkdir(directory, { recursive: true });
  const now = Date.now();
  const values = [
    {
      timestamp: new Date(now - ageMs - 2000).toISOString(),
      type: 'session_meta',
      payload: { id, cwd: `/tmp/project-${id}`, source },
    },
    ...events.map((event, index) => ({
      timestamp: new Date(now - ageMs + index * 10).toISOString(),
      ...event,
    })),
  ];
  await fs.writeFile(
    path.join(directory, `rollout-fixture-${id}.jsonl`),
    `${values.map(JSON.stringify).join('\n')}\n`,
  );
}

function stableAgent(agent) {
  return {
    threadId: agent.threadId,
    parentThreadId: agent.parentThreadId,
    name: agent.name,
    project: agent.project,
    task: agent.task,
    effort: agent.effort,
    status: agent.status,
    statusSince: agent.statusSince,
    lastActivityAt: agent.lastActivityAt,
    isSubagent: agent.isSubagent,
  };
}

test('generated probe matches the direct observer on one synthetic Codex home', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-deck-parity-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await writeSession(root, '11111111-1111-1111-1111-111111111111', 1000, [
    { type: 'event_msg', payload: { type: 'task_started' } },
    { type: 'response_item', payload: { type: 'reasoning' } },
  ]);
  await writeSession(root, '22222222-2222-2222-2222-222222222222', 2000, [
    { type: 'event_msg', payload: { type: 'task_started' } },
    {
      type: 'response_item',
      payload: { type: 'function_call', name: 'request_user_input', call_id: 'ask-1' },
    },
  ]);
  await writeSession(root, '33333333-3333-3333-3333-333333333333', 10 * 60_000, [
    { type: 'event_msg', payload: { type: 'task_started' } },
  ]);
  await writeSession(root, '55555555-5555-5555-5555-555555555555', 2500, [
    { type: 'event_msg', payload: { type: 'task_started' } },
    {
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        name: 'exec',
        call_id: 'exec-1',
        input: 'tools.exec_command({sandbox_permissions:"require_escalated"})',
      },
    },
  ]);
  await writeSession(root, '66666666-6666-6666-6666-666666666666', 60_000, [
    { type: 'event_msg', payload: { type: 'task_started' } },
    { type: 'event_msg', payload: { type: 'task_complete' } },
  ]);
  await writeSession(
    root,
    '44444444-4444-4444-4444-444444444444',
    3000,
    [{ type: 'event_msg', payload: { type: 'task_started' } }],
    {
      subagent: {
        thread_spawn: {
          parent_thread_id: '11111111-1111-1111-1111-111111111111',
          agent_nickname: 'Fixture Agent',
        },
      },
    },
  );

  const direct = await createCodexObserver({ codexHome: root }).scan();
  const probe = await fs.readFile(probePath);
  const execution = spawnSync(process.execPath, ['--input-type=module', '-'], {
    input: probe,
    env: { ...process.env, CODEX_HOME: root },
    encoding: 'utf8',
  });
  assert.equal(execution.status, 0, execution.stderr);
  const remote = JSON.parse(execution.stdout);
  assert.equal(remote.schemaVersion, 1);
  assert.equal(remote.provider, 'codex');
  assert.deepEqual(remote.agents.map(stableAgent), direct.agents.map(stableAgent));
  assert.deepEqual(remote.counts, direct.counts);
});
