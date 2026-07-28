import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDashboardPress,
  createDashboardState,
  effectiveDashboardSettings,
  roleForKey,
  selectedDashboardAgent,
  visibleDashboardAgents,
} from '../io.github.1mentat.agentdeck.ulanziPlugin/plugin/dashboard-state.js';

const dashboard = {
  agents: [
    { id: 'local:one', status: 'working', context: { percent: 30 }, terminals: { running: 0 } },
    {
      id: 'local:two',
      status: 'waiting_user',
      context: { percent: 85 },
      terminals: { running: 1 },
    },
    { id: 'local:old', status: 'inactive', context: { percent: 95 }, terminals: { running: 1 } },
  ],
};

test('maps the thirteen usable positions in fleet and detail modes', () => {
  assert.deepEqual(roleForKey('0_0', 'fleet'), { kind: 'fleet', rank: null, index: 0 });
  assert.equal(roleForKey('4_0', 'fleet').kind, 'scope');
  assert.deepEqual(roleForKey('2_2', 'fleet'), { kind: 'agent', rank: 8, index: 12 });
  assert.equal(roleForKey('0_0', 'detail').kind, 'back');
  assert.equal(roleForKey('4_0', 'detail').kind, 'subagents');
  assert.equal(roleForKey('2_2', 'detail').kind, 'next');
});

test('selects an exact agent, navigates, toggles follow, and returns to fleet', () => {
  let state = createDashboardState();
  state = applyDashboardPress(state, { kind: 'agent', rank: 2 }, dashboard, {});
  assert.equal(state.mode, 'detail');
  assert.equal(state.selectedAgentId, 'local:two');
  assert.equal(selectedDashboardAgent(dashboard, state).id, 'local:two');

  state = applyDashboardPress(state, { kind: 'previous' }, dashboard, {});
  assert.equal(state.selectedAgentId, 'local:one');
  state = applyDashboardPress(state, { kind: 'pin' }, dashboard, {});
  assert.equal(state.pinned, false);
  state = applyDashboardPress(state, { kind: 'back' }, dashboard, {});
  assert.equal(state.mode, 'fleet');
});

test('metric filters and scope cycling remain read-only display state', () => {
  let state = applyDashboardPress(createDashboardState(), { kind: 'needs' }, dashboard, {});
  assert.deepEqual(
    visibleDashboardAgents(dashboard, state).map((agent) => agent.id),
    ['local:two'],
  );
  state = applyDashboardPress(state, { kind: 'needs' }, dashboard, {});
  assert.equal(state.filter, 'all');
  state = applyDashboardPress(state, { kind: 'scope' }, dashboard, {
    sourceMode: 'local',
    sshHost: 'fixture-host',
  });
  assert.equal(state.sourceModeOverride, 'ssh');
  assert.equal(effectiveDashboardSettings({ sourceMode: 'local' }, state).sourceMode, 'ssh');
});

test('a pinned selection becomes visibly stale instead of silently changing identity', () => {
  const state = {
    ...createDashboardState(),
    mode: 'detail',
    pinned: true,
    selectedAgentId: 'local:missing',
  };
  assert.equal(selectedDashboardAgent(dashboard, state), null);
});
