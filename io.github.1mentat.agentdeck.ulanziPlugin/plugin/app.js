import { createCodexObserver } from './codex-observer.js';
import { summarizeSnapshots } from './classifier.js';
import {
  renderAgent,
  renderLoading,
  renderNeedsYou,
  renderOverview,
  renderRecent,
  renderDashboardTile,
} from './renderer.js';
import {
  applyDashboardPress,
  createDashboardState,
  effectiveDashboardSettings,
  roleForKey,
} from './dashboard-state.js';
import { normalizeSourceSettings } from './source-config.js';
import { createSourceCoordinator } from './source-coordinator.js';
import { createSshCodexSource } from './ssh-codex-source.js';
import { createRuntimeLogger } from './runtime-logger.js';
import UlanziApi from './ulanzi-api.js';

const PLUGIN_UUID = 'io.github.1mentat.agentdeck.ulanzi';
const ACTIONS = Object.freeze({
  overview: 'io.github.1mentat.agentdeck.ulanzi.overview',
  needs: 'io.github.1mentat.agentdeck.ulanzi.needsyou',
  agent: 'io.github.1mentat.agentdeck.ulanzi.agentslot',
  recent: 'io.github.1mentat.agentdeck.ulanzi.recent',
  dashboard: 'io.github.1mentat.agentdeck.ulanzi.dashboard',
});
const POLL_MS = 2500;

const api = new UlanziApi();
const runtimeLogger = createRuntimeLogger();
const coordinator = createSourceCoordinator({
  localSource: createCodexObserver(),
  sshSourceFactory: (hostAlias) => createSshCodexSource({ hostAlias }),
  onSourceEvent: (event, details) => runtimeLogger.log(event, details),
});
const instances = new Map();
const dashboardStates = new Map();
const dashboardSettings = new Map();
let timer = null;

function actionFor(context) {
  return api.decodeContext(context).uuid;
}

function settingsFor(message, existing = {}) {
  const incoming = message?.settings || message?.param;
  if (!incoming || typeof incoming !== 'object') return normalizeSourceSettings(existing);
  const recognized = [
    'slot',
    'projectFilter',
    'sourceMode',
    'sshHost',
    'dashboardGroup',
    'dashboardRevision',
    'contextWarningPercent',
    'showTask',
  ];
  if (!recognized.some((key) => key in incoming)) return normalizeSourceSettings(existing);
  return normalizeSourceSettings({ ...existing, ...incoming });
}

function dashboardGroup(settings = {}) {
  return (
    String(settings.dashboardGroup || 'main')
      .trim()
      .slice(0, 32) || 'main'
  );
}

function stateForGroup(group) {
  if (!dashboardStates.has(group)) dashboardStates.set(group, createDashboardState());
  return dashboardStates.get(group);
}

function settingsForGroup(group, fallback = {}) {
  return dashboardSettings.get(group) || fallback;
}

function dashboardRevision(settings = {}) {
  const revision = Number(settings.dashboardRevision);
  return Number.isFinite(revision) && revision > 0 ? Math.floor(revision) : 0;
}

function dashboardInstances(group) {
  return [...instances.values()]
    .filter(
      (instance) =>
        actionFor(instance.context) === ACTIONS.dashboard &&
        dashboardGroup(instance.settings) === group,
    )
    .sort((a, b) => {
      return api
        .decodeContext(a.context)
        .key.localeCompare(api.decodeContext(b.context).key, 'en', {
          numeric: true,
        });
    });
}

function roleForInstance(instance, state) {
  const group = dashboardGroup(instance.settings);
  const fallbackIndex = Math.max(0, dashboardInstances(group).indexOf(instance));
  return roleForKey(api.decodeContext(instance.context).key, state.mode, fallbackIndex);
}

function syncDashboardGroup(group) {
  const state = stateForGroup(group);
  const settings = effectiveDashboardSettings(settingsForGroup(group), state);
  for (const instance of dashboardInstances(group)) {
    coordinator.setAction(instance.context, settings, instance.active);
  }
}

function propagateDashboardSettings(
  settings,
  sourceContext,
  memberGroup = dashboardGroup(settings),
) {
  const serialized = JSON.stringify(settings);
  for (const instance of instances.values()) {
    if (actionFor(instance.context) !== ACTIONS.dashboard || !instance.active) continue;
    if (instance.context !== sourceContext && dashboardGroup(instance.settings) !== memberGroup) {
      continue;
    }
    const changed = JSON.stringify(instance.settings) !== serialized;
    instance.settings = { ...settings };
    if (changed && instance.context !== sourceContext) {
      api.setSettings(instance.settings, instance.context);
    }
  }
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

function filteredDashboard(dashboard, settings = {}) {
  const agents = visibleAgents(dashboard, settings);
  return { ...dashboard, agents, counts: summarizeSnapshots(agents) };
}

function renderInstance(instance) {
  const action = actionFor(instance.context);
  const group = dashboardGroup(instance.settings);
  const state = stateForGroup(group);
  const sharedSettings =
    action === ACTIONS.dashboard ? settingsForGroup(group, instance.settings) : instance.settings;
  const effectiveSettings = effectiveDashboardSettings(sharedSettings, state);
  const sourceDashboard = coordinator.dashboardFor(effectiveSettings);
  const dashboard =
    action === ACTIONS.dashboard
      ? filteredDashboard(sourceDashboard, sharedSettings)
      : sourceDashboard;
  let icon;
  if (action === ACTIONS.overview) icon = renderOverview(dashboard);
  else if (action === ACTIONS.needs) icon = renderNeedsYou(dashboard);
  else if (action === ACTIONS.recent) icon = renderRecent(dashboard);
  else if (action === ACTIONS.dashboard) {
    icon = renderDashboardTile({
      role: roleForInstance(instance, state),
      dashboard,
      state,
      settings: sharedSettings,
      now: dashboard.scannedAt,
    });
  } else {
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
      runtimeLogger.log('refresh_failed', { errorCode: error?.code || error?.name });
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
        dashboardGroup: 'main',
        dashboardRevision: 0,
        contextWarningPercent: 80,
        showTask: true,
      }),
    };
    instances.set(context, instance);
    api.setBaseDataIcon(context, renderLoading());
    api.getSettings(context);
  } else {
    instance.settings = settingsFor(message, instance.settings);
  }
  if (actionFor(context) === ACTIONS.dashboard) {
    const group = dashboardGroup(instance.settings);
    if (!dashboardSettings.has(group)) dashboardSettings.set(group, instance.settings);
    syncDashboardGroup(group);
  } else {
    coordinator.setAction(context, instance.settings, instance.active);
  }
  updatePolling();
  return instance;
}

runtimeLogger.log('plugin_started');
api.connect(PLUGIN_UUID);
api.onConnected(() => {
  runtimeLogger.log('plugin_connected');
  console.log('[agent-deck] connected');
});
api.onAdd((message) => ensureInstance(message));
api.onParamFromApp((message) => {
  renderInstance(ensureInstance(message));
});
api.onParamFromPlugin((message) => {
  renderInstance(ensureInstance(message));
});
api.onDidReceiveSettings((message) => {
  const instance = instances.get(message.context) || ensureInstance({ context: message.context });
  if (actionFor(instance.context) === ACTIONS.dashboard) {
    const previousSettings = instance.settings;
    const previousGroup = dashboardGroup(previousSettings);
    const candidate = settingsFor(message, previousSettings);
    const group = dashboardGroup(candidate);
    const current = settingsForGroup(group, {});
    const newestRevision = Math.max(
      dashboardRevision(previousSettings),
      dashboardRevision(current),
    );
    if (dashboardRevision(candidate) < newestRevision) {
      api.setSettings(previousSettings, instance.context);
      syncDashboardGroup(previousGroup);
      renderInstance(instance);
      return;
    }

    const changed = JSON.stringify(current) !== JSON.stringify(candidate);
    instance.settings = candidate;
    dashboardSettings.set(group, candidate);
    if (changed) {
      dashboardStates.set(group, {
        ...stateForGroup(group),
        sourceModeOverride: null,
      });
    }
    propagateDashboardSettings(candidate, instance.context, previousGroup);
    if (previousGroup !== group) syncDashboardGroup(previousGroup);
    syncDashboardGroup(group);
    renderAll();
  } else {
    instance.settings = settingsFor(message, instance.settings);
    coordinator.setAction(instance.context, instance.settings, instance.active);
  }
  renderInstance(instance);
  refresh();
});
api.onRun((message) => {
  const instance = ensureInstance(message);
  if (actionFor(instance.context) === ACTIONS.dashboard) {
    const group = dashboardGroup(instance.settings);
    const state = stateForGroup(group);
    const settings = settingsForGroup(group, instance.settings);
    const dashboard = filteredDashboard(
      coordinator.dashboardFor(effectiveDashboardSettings(settings, state)),
      settings,
    );
    dashboardStates.set(
      group,
      applyDashboardPress(state, roleForInstance(instance, state), dashboard, settings),
    );
    syncDashboardGroup(group);
    renderAll();
  }
  refresh();
});
api.onSetActive((message) => {
  const instance = ensureInstance(message);
  instance.active = Boolean(message.active);
  if (actionFor(instance.context) === ACTIONS.dashboard) {
    syncDashboardGroup(dashboardGroup(instance.settings));
  } else {
    coordinator.setAction(instance.context, instance.settings, instance.active);
  }
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
api.on('error', (error) => {
  runtimeLogger.log('plugin_socket_error', { errorCode: error?.code || error?.name });
  console.error('[agent-deck] socket error', error);
});
api.on('close', () => {
  runtimeLogger.log('plugin_socket_closed');
  console.log('[agent-deck] socket closed');
});
