import { isValidSshHost, SOURCE_MODES } from './source-config.js';

const FLEET_ROLES = Object.freeze([
  'fleet',
  'needs',
  'context',
  'terminals',
  'scope',
  'agent:1',
  'agent:2',
  'agent:3',
  'agent:4',
  'agent:5',
  'agent:6',
  'agent:7',
  'agent:8',
]);

const DETAIL_ROLES = Object.freeze([
  'back',
  'identity',
  'context',
  'terminals',
  'subagents',
  'task',
  'activity',
  'plan',
  'source',
  'status',
  'previous',
  'pin',
  'next',
]);

const KEY_INDEX = new Map([
  ['0_0', 0],
  ['1_0', 1],
  ['2_0', 2],
  ['3_0', 3],
  ['4_0', 4],
  ['0_1', 5],
  ['1_1', 6],
  ['2_1', 7],
  ['3_1', 8],
  ['4_1', 9],
  ['0_2', 10],
  ['1_2', 11],
  ['2_2', 12],
]);

export function createDashboardState() {
  return {
    mode: 'fleet',
    selectedAgentId: null,
    selectedRank: 0,
    pinned: true,
    filter: 'all',
    sourceModeOverride: null,
    terminalCursor: 0,
    subagentCursor: 0,
  };
}

export function roleForKey(key, mode = 'fleet', fallbackIndex = 0) {
  const numericKey = /^\d+$/.test(String(key || '')) ? Number(key) : null;
  const index = KEY_INDEX.get(String(key || '')) ?? numericKey ?? fallbackIndex;
  const roles = mode === 'detail' ? DETAIL_ROLES : FLEET_ROLES;
  const role = roles[Math.max(0, Math.min(roles.length - 1, index))] || roles[0];
  const [kind, value] = role.split(':');
  return { kind, rank: value ? Number(value) : null, index };
}

export function visibleDashboardAgents(dashboard, state = {}) {
  const agents = (dashboard?.agents || []).filter((agent) => agent.status !== 'inactive');
  if (state.filter === 'needs') {
    return agents.filter((agent) => ['waiting_user', 'waiting_approval'].includes(agent.status));
  }
  if (state.filter === 'context') {
    return agents
      .filter((agent) => (agent.context?.percent || 0) > 0)
      .sort((a, b) => {
        return (b.context?.percent || 0) - (a.context?.percent || 0);
      });
  }
  if (state.filter === 'terminals') {
    return agents.filter((agent) => (agent.terminals?.running || 0) > 0);
  }
  return agents;
}

export function selectedDashboardAgent(dashboard, state = {}) {
  const agents = visibleDashboardAgents(dashboard, state);
  if (!agents.length) return null;
  if (state.pinned && state.selectedAgentId) {
    return agents.find((agent) => agent.id === state.selectedAgentId) || null;
  }
  return agents[Math.max(0, Math.min(agents.length - 1, state.selectedRank || 0))] || null;
}

function cycleSourceMode(settings, current) {
  const modes = isValidSshHost(settings?.sshHost)
    ? [SOURCE_MODES.all, SOURCE_MODES.local, SOURCE_MODES.ssh]
    : [SOURCE_MODES.local];
  const active = current || settings?.sourceMode || SOURCE_MODES.local;
  return modes[(modes.indexOf(active) + 1) % modes.length];
}

function moveSelection(next, dashboard, delta) {
  const agents = visibleDashboardAgents(dashboard, next);
  if (!agents.length) return next;
  const current = selectedDashboardAgent(dashboard, next);
  const currentIndex = Math.max(
    0,
    agents.findIndex((agent) => agent.id === current?.id),
  );
  const selectedRank = (currentIndex + delta + agents.length) % agents.length;
  return {
    ...next,
    selectedRank,
    selectedAgentId: agents[selectedRank].id,
    terminalCursor: 0,
    subagentCursor: 0,
  };
}

export function applyDashboardPress(state, role, dashboard, settings = {}) {
  let next = { ...createDashboardState(), ...state };
  if (next.mode === 'fleet') {
    if (role.kind === 'fleet') next.filter = 'all';
    else if (role.kind === 'needs') next.filter = next.filter === 'needs' ? 'all' : 'needs';
    else if (role.kind === 'context') {
      next.filter = next.filter === 'context' ? 'all' : 'context';
    } else if (role.kind === 'terminals') {
      next.filter = next.filter === 'terminals' ? 'all' : 'terminals';
    } else if (role.kind === 'scope') {
      next.sourceModeOverride = cycleSourceMode(settings, next.sourceModeOverride);
      next.filter = 'all';
    } else if (role.kind === 'agent') {
      const agents = visibleDashboardAgents(dashboard, next);
      const selectedRank = Math.max(0, (role.rank || 1) - 1);
      const agent = agents[selectedRank];
      if (agent) {
        next = {
          ...next,
          mode: 'detail',
          selectedAgentId: agent.id,
          selectedRank,
          pinned: true,
          terminalCursor: 0,
          subagentCursor: 0,
        };
      }
    }
    return next;
  }

  if (role.kind === 'back') return { ...next, mode: 'fleet', selectedAgentId: null };
  if (role.kind === 'previous') return moveSelection(next, dashboard, -1);
  if (role.kind === 'next') return moveSelection(next, dashboard, 1);
  if (role.kind === 'pin') {
    const agent = selectedDashboardAgent(dashboard, next);
    return { ...next, pinned: !next.pinned, selectedAgentId: agent?.id || next.selectedAgentId };
  }
  if (role.kind === 'terminals') return { ...next, terminalCursor: next.terminalCursor + 1 };
  if (role.kind === 'subagents') return { ...next, subagentCursor: next.subagentCursor + 1 };
  return next;
}

export function effectiveDashboardSettings(settings = {}, state = {}) {
  return state.sourceModeOverride
    ? { ...settings, sourceMode: state.sourceModeOverride }
    : { ...settings };
}
