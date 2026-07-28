import { createCodexObserver } from './codex-observer.js';
import {
  renderAgent,
  renderLoading,
  renderNeedsYou,
  renderOverview,
  renderRecent,
} from './renderer.js';
import { normalizeSourceSettings } from './source-config.js';
import { createSourceCoordinator } from './source-coordinator.js';
import { createSshCodexSource } from './ssh-codex-source.js';
import UlanziApi from './ulanzi-api.js';

const PLUGIN_UUID = 'io.github.1mentat.agentdeck.ulanzi';
const ACTIONS = Object.freeze({
  overview: 'io.github.1mentat.agentdeck.ulanzi.overview',
  needs: 'io.github.1mentat.agentdeck.ulanzi.needsyou',
  agent: 'io.github.1mentat.agentdeck.ulanzi.agentslot',
  recent: 'io.github.1mentat.agentdeck.ulanzi.recent',
});
const POLL_MS = 2500;

const api = new UlanziApi();
const coordinator = createSourceCoordinator({
  localSource: createCodexObserver(),
  sshSourceFactory: (hostAlias) => createSshCodexSource({ hostAlias }),
});
const instances = new Map();
let timer = null;

function actionFor(context) {
  return api.decodeContext(context).uuid;
}

function settingsFor(message, existing = {}) {
  const incoming = message?.settings || message?.param;
  if (!incoming || typeof incoming !== 'object') return normalizeSourceSettings(existing);
  const recognized = ['slot', 'projectFilter', 'sourceMode', 'sshHost'];
  if (!recognized.some((key) => key in incoming)) return normalizeSourceSettings(existing);
  return normalizeSourceSettings({ ...existing, ...incoming });
}

function visibleAgents(dashboard, settings = {}) {
  const filter = String(settings.projectFilter || '')
    .trim()
    .toLowerCase();
  return dashboard.agents.filter((agent) => {
    if (agent.status === 'inactive') return false;
    if (!filter) return true;
    return `${agent.project} ${agent.cwd}`.toLowerCase().includes(filter);
  });
}

function renderInstance(instance) {
  const action = actionFor(instance.context);
  const dashboard = coordinator.dashboardFor(instance.settings);
  let icon;
  if (action === ACTIONS.overview) icon = renderOverview(dashboard);
  else if (action === ACTIONS.needs) icon = renderNeedsYou(dashboard);
  else if (action === ACTIONS.recent) icon = renderRecent(dashboard);
  else {
    const rank = Math.max(1, Math.min(12, Number(instance.settings.slot) || 1));
    icon = renderAgent(visibleAgents(dashboard, instance.settings)[rank - 1], {
      rank,
      now: dashboard.scannedAt,
      dashboard,
    });
  }
  api.setBaseDataIcon(instance.context, icon);
}

function renderAll() {
  for (const instance of instances.values()) {
    if (instance.active) renderInstance(instance);
  }
}

async function refresh() {
  return coordinator
    .refresh()
    .then(renderAll)
    .catch((error) => {
      console.error('[agent-deck] scan failed', error);
    });
}

function updatePolling() {
  const hasActive = [...instances.values()].some((instance) => instance.active);
  if (hasActive && !timer) {
    timer = setInterval(refresh, POLL_MS);
    refresh();
  } else if (!hasActive && timer) {
    clearInterval(timer);
    timer = null;
  }
}

function ensureInstance(message) {
  const context = message.context;
  let instance = instances.get(context);
  if (!instance) {
    instance = {
      context,
      active: true,
      settings: settingsFor(message, {
        slot: 1,
        projectFilter: '',
        sourceMode: 'local',
        sshHost: '',
      }),
    };
    instances.set(context, instance);
    api.setBaseDataIcon(context, renderLoading());
    api.getSettings(context);
  } else {
    instance.settings = settingsFor(message, instance.settings);
  }
  coordinator.setAction(context, instance.settings, instance.active);
  updatePolling();
  return instance;
}

api.connect(PLUGIN_UUID);
api.onConnected(() => console.log('[agent-deck] connected'));
api.onAdd((message) => ensureInstance(message));
api.onParamFromApp((message) => {
  renderInstance(ensureInstance(message));
});
api.onParamFromPlugin((message) => {
  renderInstance(ensureInstance(message));
});
api.onDidReceiveSettings((message) => {
  const instance = ensureInstance(message);
  renderInstance(instance);
  refresh();
});
api.onRun((message) => {
  ensureInstance(message);
  refresh();
});
api.onSetActive((message) => {
  const instance = ensureInstance(message);
  instance.active = Boolean(message.active);
  coordinator.setAction(instance.context, instance.settings, instance.active);
  if (instance.active) renderInstance(instance);
  updatePolling();
});
api.onClear((message) => {
  for (const item of message.param || []) {
    instances.delete(item.context);
    coordinator.clearAction(item.context);
  }
  updatePolling();
});
api.on('error', (error) => console.error('[agent-deck] socket error', error));
api.on('close', () => console.log('[agent-deck] socket closed'));
