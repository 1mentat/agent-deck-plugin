import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyThread,
  enrichAgentRelationships,
  rankSnapshots,
  summarizeSnapshots,
} from '../io.github.1mentat.agentdeck.ulanziPlugin/plugin/classifier.js';

const BASE = Date.parse('2026-07-23T18:00:00Z');

function event(seconds, type, payload) {
  return { timestamp: new Date(BASE + seconds * 1000).toISOString(), type, payload };
}

const metadata = {
  id: 'thread-1',
  cwd: '/work/agent-deck',
  model: 'gpt-test',
  effort: 'high',
  preview: 'Build the dashboard',
};

test('classifies a recent open task as working', () => {
  const snapshot = classifyThread({
    metadata,
    events: [
      event(0, 'event_msg', { type: 'user_message', message: 'Build the dashboard' }),
      event(1, 'event_msg', { type: 'task_started', started_at: (BASE + 1000) / 1000 }),
      event(50, 'response_item', { type: 'reasoning' }),
    ],
    now: BASE + 60_000,
  });
  assert.equal(snapshot.status, 'working');
  assert.equal(snapshot.project, 'agent-deck');
  assert.equal(snapshot.effort, 'high');
});

test('latches an unmatched request_user_input call', () => {
  const snapshot = classifyThread({
    metadata,
    events: [
      event(1, 'event_msg', { type: 'task_started' }),
      event(10, 'response_item', {
        type: 'function_call',
        name: 'request_user_input',
        call_id: 'ask-1',
        arguments: '{}',
      }),
    ],
    now: BASE + 30 * 60_000,
  });
  assert.equal(snapshot.status, 'waiting_user');
});

test('a matching tool output clears a waiting state', () => {
  const snapshot = classifyThread({
    metadata,
    events: [
      event(1, 'event_msg', { type: 'task_started' }),
      event(10, 'response_item', {
        type: 'function_call',
        name: 'request_user_input',
        call_id: 'ask-1',
      }),
      event(20, 'response_item', { type: 'function_call_output', call_id: 'ask-1', output: '{}' }),
      event(21, 'response_item', { type: 'reasoning' }),
    ],
    now: BASE + 30_000,
  });
  assert.equal(snapshot.status, 'working');
});

test('recognizes a pending elevated exec as waiting for approval', () => {
  const snapshot = classifyThread({
    metadata,
    events: [
      event(1, 'event_msg', { type: 'task_started' }),
      event(10, 'response_item', {
        type: 'custom_tool_call',
        name: 'exec',
        call_id: 'exec-1',
        input: 'tools.exec_command({sandbox_permissions:"require_escalated"})',
      }),
    ],
    now: BASE + 12_000,
  });
  assert.equal(snapshot.status, 'waiting_approval');
});

test('does not claim stale open work is blocked', () => {
  const snapshot = classifyThread({
    metadata,
    events: [
      event(1, 'event_msg', { type: 'task_started' }),
      event(20, 'response_item', { type: 'reasoning' }),
    ],
    now: BASE + 20 * 60_000,
  });
  assert.equal(snapshot.status, 'quiet');
});

test('expires abandoned quiet work from the dashboard', () => {
  const snapshot = classifyThread({
    metadata,
    events: [
      event(1, 'event_msg', { type: 'task_started' }),
      event(20, 'response_item', { type: 'reasoning' }),
    ],
    now: BASE + 3 * 60 * 60_000,
  });
  assert.equal(snapshot.status, 'inactive');
});

test('shows a recent completed task and expires old completions', () => {
  const recent = classifyThread({
    metadata,
    events: [
      event(1, 'event_msg', { type: 'task_started' }),
      event(30, 'event_msg', { type: 'task_complete', completed_at: (BASE + 30_000) / 1000 }),
    ],
    now: BASE + 10 * 60_000,
  });
  assert.equal(recent.status, 'completed_recent');

  const old = classifyThread({
    metadata,
    events: [
      event(1, 'event_msg', { type: 'task_started' }),
      event(30, 'event_msg', { type: 'task_complete' }),
    ],
    now: BASE + 60 * 60_000,
  });
  assert.equal(old.status, 'inactive');
});

test('extracts subagent identity from session source', () => {
  const snapshot = classifyThread({
    metadata: {
      ...metadata,
      source: {
        subagent: {
          thread_spawn: {
            parent_thread_id: 'parent-1',
            agent_path: '/root/review_tests',
            agent_nickname: 'Lovelace',
          },
        },
      },
    },
    events: [event(1, 'event_msg', { type: 'task_started' })],
    now: BASE + 2_000,
  });
  assert.equal(snapshot.isSubagent, true);
  assert.equal(snapshot.parentId, 'local:parent-1');
  assert.equal(snapshot.parentThreadId, 'parent-1');
  assert.equal(snapshot.sourceLabel, 'LOCAL');
  assert.equal(snapshot.name, 'Lovelace');
});

test('ranks needs-you work first and summarizes visible states', () => {
  const agents = rankSnapshots([
    { id: 'done', status: 'completed_recent', lastActivityAt: 3 },
    { id: 'work', status: 'working', lastActivityAt: 2 },
    { id: 'wait', status: 'waiting_user', lastActivityAt: 1 },
  ]);
  assert.deepEqual(
    agents.map((agent) => agent.id),
    ['wait', 'work', 'done'],
  );
  assert.deepEqual(summarizeSnapshots(agents), {
    total: 3,
    active: 2,
    working: 1,
    needsYou: 1,
    quiet: 0,
    failed: 0,
    recent: 1,
    roots: 3,
    subagents: 0,
    terminals: 0,
    contextRisk: 0,
  });
});

test('extracts context, plan, permissions, activity, and inferred terminals', () => {
  const snapshot = classifyThread({
    metadata: { ...metadata, tokensUsed: 9000, gitBranch: 'feature/dashboard' },
    events: [
      event(1, 'turn_context', {
        model: 'gpt-test',
        effort: 'high',
        approval_policy: 'on-request',
        permission_profile: { type: 'workspace-write' },
      }),
      event(2, 'event_msg', { type: 'task_started' }),
      event(3, 'event_msg', {
        type: 'token_count',
        info: {
          last_token_usage: { input_tokens: 600, total_tokens: 650 },
          total_token_usage: { total_tokens: 4200 },
          model_context_window: 1000,
        },
      }),
      event(4, 'event_msg', { type: 'context_compacted' }),
      event(5, 'response_item', {
        type: 'function_call',
        name: 'update_plan',
        call_id: 'plan-1',
        arguments: JSON.stringify({
          plan: [
            { step: 'Parse sessions', status: 'completed' },
            { step: 'Render tiles', status: 'in_progress' },
          ],
        }),
      }),
      event(6, 'response_item', {
        type: 'function_call',
        name: 'exec_command',
        call_id: 'exec-1',
        arguments: JSON.stringify({ cmd: 'npm test' }),
      }),
      event(7, 'response_item', {
        type: 'function_call_output',
        call_id: 'exec-1',
        output: JSON.stringify({ session_id: 42 }),
      }),
    ],
    now: BASE + 10_000,
  });
  assert.deepEqual(snapshot.context, {
    usedTokens: 600,
    windowTokens: 1000,
    percent: 60,
    cumulativeTokens: 4200,
    compactions: 1,
  });
  assert.deepEqual(snapshot.plan, { completed: 1, total: 2, current: 'Render tiles' });
  assert.equal(snapshot.terminals.running, 1);
  assert.equal(snapshot.terminals.fidelity, 'inferred');
  assert.equal(snapshot.terminals.entries[0].label, 'NPM');
  assert.equal(snapshot.activity.label, 'RUNNING COMMAND');
  assert.equal(snapshot.permissions.profile, 'workspace-write');
  assert.equal(snapshot.git.branch, 'feature/dashboard');
});

test('enriches a parent with bounded child-agent status summaries', () => {
  const parent = classifyThread({
    metadata,
    events: [event(1, 'event_msg', { type: 'task_started' })],
    now: BASE + 2000,
  });
  const child = classifyThread({
    metadata: {
      ...metadata,
      id: 'child-1',
      source: {
        subagent: { thread_spawn: { parent_thread_id: 'thread-1', agent_nickname: 'Ada' } },
      },
    },
    events: [
      event(1, 'event_msg', { type: 'task_started' }),
      event(2, 'response_item', {
        type: 'function_call',
        name: 'request_user_input',
        call_id: 'ask-child',
      }),
    ],
    now: BASE + 3000,
  });
  const enriched = enrichAgentRelationships([parent, child]);
  assert.equal(enriched[0].subagents.total, 1);
  assert.equal(enriched[0].subagents.waiting, 1);
  assert.equal(enriched[0].subagents.children[0].name, 'Ada');
});
