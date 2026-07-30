import { rankSnapshots, summarizeSnapshots } from './classifier.js';
import {
  isValidSshHost,
  normalizeSourceSettings,
  selectedSourceIds,
  sourceConfigurationError,
  sourceIdForHost,
  SOURCE_MODES,
} from './source-config.js';

const EMPTY_COUNTS = Object.freeze(summarizeSnapshots([]));

function sourceRecord({ id, kind, label, adapter }) {
  return {
    id,
    kind,
    label,
    adapter,
    dashboard: null,
    health: {
      id,
      kind,
      label,
      status: 'pending',
      errorCode: null,
      scannedAt: 0,
      lastSuccessAt: 0,
    },
    lastAttemptAt: 0,
    inFlight: null,
  };
}

function errorCode(error) {
  return typeof error?.code === 'string' ? error.code : 'SSH_UNAVAILABLE';
}

export function createSourceCoordinator({
  localSource,
  sshSourceFactory,
  onSourceEvent = () => {},
  now = () => Date.now(),
  localPollMs = 2500,
  sshPollMs = 15_000,
} = {}) {
  if (!localSource?.scan) throw new TypeError('localSource.scan is required');
  const actions = new Map();
  const sources = new Map([
    ['local', sourceRecord({ id: 'local', kind: 'local', label: 'LOCAL', adapter: localSource })],
  ]);

  function emitSourceEvent(event, record, details = {}) {
    if (record.kind !== 'ssh') return;
    try {
      onSourceEvent(event, { sourceKind: record.kind, ...details });
    } catch {
      // Diagnostics must never interrupt observation.
    }
  }

  function setAction(context, settings = {}, active = true) {
    actions.set(context, { settings: normalizeSourceSettings(settings), active: Boolean(active) });
  }

  function clearAction(context) {
    actions.delete(context);
  }

  function requiredSourceIds() {
    const required = new Set();
    for (const action of actions.values()) {
      if (!action.active) continue;
      for (const sourceId of selectedSourceIds(action.settings)) required.add(sourceId);
    }
    return required;
  }

  function ensureSshSource(host) {
    const id = sourceIdForHost(host);
    if (!sources.has(id)) {
      const adapter = sshSourceFactory?.(host);
      if (!adapter?.scan) throw new TypeError('sshSourceFactory must return an object with scan()');
      sources.set(id, sourceRecord({ id, kind: 'ssh', label: host, adapter }));
    }
    return sources.get(id);
  }

  function ensureConfiguredSources() {
    for (const action of actions.values()) {
      const { sourceMode, sshHost } = action.settings;
      if (action.active && sourceMode !== SOURCE_MODES.local && isValidSshHost(sshHost)) {
        ensureSshSource(sshHost);
      }
    }
  }

  async function scanRecord(record, interval) {
    if (record.inFlight) return record.inFlight;
    const attemptAt = now();
    if (record.lastAttemptAt && attemptAt - record.lastAttemptAt < interval)
      return record.dashboard;
    const previousStatus = record.health.status;
    const previousErrorCode = record.health.errorCode;
    record.lastAttemptAt = attemptAt;
    if (previousStatus === 'offline') {
      emitSourceEvent('source_retry', record, { previousErrorCode });
    }
    record.inFlight = Promise.resolve()
      .then(() => record.adapter.scan())
      .then((dashboard) => {
        record.dashboard = dashboard;
        record.health = {
          id: record.id,
          kind: record.kind,
          label: record.label,
          status: 'online',
          errorCode: null,
          scannedAt: dashboard.scannedAt || now(),
          lastSuccessAt: dashboard.scannedAt || now(),
        };
        if (previousStatus !== 'online') {
          emitSourceEvent('source_online', record, {
            durationMs: now() - attemptAt,
            agentCount: dashboard.agents?.length || 0,
            warningCount: dashboard.warnings?.length || 0,
            recovered: previousStatus === 'offline',
          });
        }
        return dashboard;
      })
      .catch((error) => {
        const nextErrorCode = errorCode(error);
        record.dashboard = null;
        record.health = {
          id: record.id,
          kind: record.kind,
          label: record.label,
          status: 'offline',
          errorCode: nextErrorCode,
          scannedAt: now(),
          lastSuccessAt: record.health.lastSuccessAt || 0,
        };
        if (previousStatus !== 'offline' || previousErrorCode !== nextErrorCode) {
          emitSourceEvent('source_offline', record, {
            errorCode: nextErrorCode,
            durationMs: now() - attemptAt,
          });
        }
        return null;
      })
      .finally(() => {
        record.inFlight = null;
      });
    return record.inFlight;
  }

  async function refresh() {
    ensureConfiguredSources();
    const required = requiredSourceIds();
    await Promise.all(
      [...required].map((id) => {
        const record = sources.get(id);
        if (!record) return null;
        return scanRecord(record, record.kind === 'local' ? localPollMs : sshPollMs);
      }),
    );
  }

  function dashboardFor(settings = {}) {
    const normalized = normalizeSourceSettings(settings);
    const ids = selectedSourceIds(normalized);
    const selected = ids.map((id) => sources.get(id)).filter(Boolean);
    const online = selected.filter((source) => source.health.status === 'online');
    const agents = rankSnapshots(online.flatMap((source) => source.dashboard?.agents || []));
    const sourceHealth = selected.map((source) => ({ ...source.health }));
    return {
      agents,
      counts: agents.length ? summarizeSnapshots(agents) : { ...EMPTY_COUNTS },
      scannedAt: Math.max(now(), ...online.map((source) => source.dashboard?.scannedAt || 0)),
      warnings: online.flatMap((source) => source.dashboard?.warnings || []),
      sources: sourceHealth,
      offlineSources: sourceHealth.filter((source) => source.status === 'offline'),
      pendingSources: sourceHealth.filter((source) => source.status === 'pending'),
      configurationError: sourceConfigurationError(normalized),
    };
  }

  return {
    setAction,
    clearAction,
    refresh,
    dashboardFor,
    requiredSourceIds,
  };
}
