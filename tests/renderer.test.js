import assert from 'node:assert/strict';
import test from 'node:test';
import {
  renderAgent,
  renderNeedsYou,
  renderOverview,
  renderRecent,
  renderDashboardTile,
} from '../io.github.1mentat.agentdeck.ulanziPlugin/plugin/renderer.js';

function decode(value) {
  assert.match(value, /^data:image\/svg\+xml;base64,/);
  return Buffer.from(value.split(',')[1], 'base64').toString('utf8');
}

const agent = {
  id: '1',
  name: 'Lovelace <script>',
  project: 'agent-deck',
  task: 'Review & verify renderer escaping',
  effort: 'high',
  status: 'waiting_user',
  statusSince: Date.now() - 30_000,
  lastActivityAt: Date.now() - 30_000,
  isSubagent: true,
  sourceLabel: 'LOCAL',
  context: {
    usedTokens: 80,
    windowTokens: 100,
    percent: 80,
    cumulativeTokens: 200,
    compactions: 1,
  },
  terminals: {
    running: 1,
    fidelity: 'inferred',
    entries: [{ label: 'NPM', startedAt: Date.now() - 5000 }],
  },
  subagents: {
    total: 2,
    active: 1,
    waiting: 1,
    done: 0,
    children: [{ name: 'Ada', status: 'working', task: 'Tests' }],
  },
  activity: { kind: 'terminal', label: 'RUNNING COMMAND', since: Date.now() - 5000 },
  plan: { completed: 2, total: 4, current: 'Render details' },
  permissions: { profile: 'workspace-write', approval: 'on-request' },
  git: { branch: 'feature/dashboard' },
};

const dashboard = {
  agents: [agent, { ...agent, id: '2', status: 'completed_recent', name: 'Done' }],
  counts: { active: 1, working: 0, needsYou: 1, recent: 1 },
  scannedAt: Date.now(),
};

test('all renderers return decodable SVG documents', () => {
  for (const output of [
    renderOverview(dashboard),
    renderNeedsYou(dashboard),
    renderAgent(agent, { rank: 1 }),
    renderAgent(null, { rank: 4 }),
    renderRecent(dashboard),
  ]) {
    assert.match(decode(output), /^<svg[\s\S]*<\/svg>$/);
  }
});

test('renderer escapes session-derived text', () => {
  const document = decode(renderAgent(agent));
  assert.doesNotMatch(document, /<script>/);
  assert.match(document, /Lovelace &lt;scrip/);
  assert.match(document, /Review &amp; verify/);
});

test('overview uses the Agent Deck product name', () => {
  const document = decode(renderOverview(dashboard));
  assert.match(document, /AGENT DECK/);
  assert.doesNotMatch(document, /CODEX RADAR/);
});

test('source labels are escaped on Agent Slots', () => {
  const document = decode(renderAgent({ ...agent, sourceLabel: '<h&>' }));
  assert.doesNotMatch(document, /<h&>/);
  assert.match(document, /&lt;H&amp;&gt;/);
});

test('an offline combined source cannot render as all clear', () => {
  const document = decode(
    renderOverview({
      agents: [],
      counts: {},
      sources: [
        { status: 'online', kind: 'local' },
        { status: 'offline', kind: 'ssh', errorCode: 'SSH_UNAVAILABLE' },
      ],
      offlineSources: [{ status: 'offline', kind: 'ssh', errorCode: 'SSH_UNAVAILABLE' }],
    }),
  );
  assert.match(document, /SSH OFFLINE/);
  assert.doesNotMatch(document, /ALL CLEAR/);
});

test('dashboard fleet and detail roles render context, inferred terminals, and child agents', () => {
  const fleetState = { mode: 'fleet', filter: 'all', pinned: true };
  const detailState = {
    mode: 'detail',
    filter: 'all',
    pinned: true,
    selectedAgentId: agent.id,
    terminalCursor: 0,
    subagentCursor: 0,
  };
  const context = decode(
    renderDashboardTile({ role: { kind: 'context' }, dashboard, state: detailState }),
  );
  const terminals = decode(
    renderDashboardTile({ role: { kind: 'terminals' }, dashboard, state: detailState }),
  );
  const subagents = decode(
    renderDashboardTile({ role: { kind: 'subagents' }, dashboard, state: detailState }),
  );
  const slot = decode(
    renderDashboardTile({ role: { kind: 'agent', rank: 1 }, dashboard, state: fleetState }),
  );
  assert.match(context, /80%/);
  assert.match(context, /1 COMPACTIONS/);
  assert.match(terminals, /1~/);
  assert.match(terminals, /NPM/);
  assert.match(subagents, /Ada/);
  assert.match(slot, /Lovelace/);
});

test('dashboard privacy setting hides task text', () => {
  const document = decode(
    renderDashboardTile({
      role: { kind: 'task' },
      dashboard,
      state: { mode: 'detail', filter: 'all', pinned: true, selectedAgentId: agent.id },
      settings: { showTask: false },
    }),
  );
  assert.match(document, /TASK HIDDEN/);
  assert.doesNotMatch(document, /Review &amp; verify/);
});

test('scope tile shows SSH sync age and offline health without exposing the host', () => {
  const now = Date.now();
  const state = { mode: 'fleet', filter: 'all', sourceModeOverride: null };
  const settings = { sourceMode: 'local_and_ssh', sshHost: 'private-host' };
  const online = decode(
    renderDashboardTile({
      role: { kind: 'scope' },
      dashboard: {
        ...dashboard,
        scannedAt: now,
        sources: [{ kind: 'ssh', status: 'online', lastSuccessAt: now - 5000 }],
      },
      state,
      settings,
      now,
    }),
  );
  assert.match(online, /SYNC 5s AGO/);
  assert.doesNotMatch(online, /private-host/);

  const offline = decode(
    renderDashboardTile({
      role: { kind: 'scope' },
      dashboard: {
        ...dashboard,
        scannedAt: now,
        sources: [{ kind: 'ssh', status: 'offline', errorCode: 'SSH_TIMEOUT' }],
      },
      state,
      settings,
      now,
    }),
  );
  assert.match(offline, /SSH TIMEOUT/);
});
