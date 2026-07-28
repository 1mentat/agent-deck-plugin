import assert from 'node:assert/strict';
import test from 'node:test';
import {
  renderAgent,
  renderNeedsYou,
  renderOverview,
  renderRecent,
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
