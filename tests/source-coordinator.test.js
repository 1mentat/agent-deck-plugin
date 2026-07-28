import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceCoordinator } from '../io.github.1mentat.agentdeck.ulanziPlugin/plugin/source-coordinator.js';

function dashboard(agents, scannedAt = 1000) {
  return { agents, scannedAt, warnings: [] };
}

function agent(id, status, sourceId = 'local') {
  return {
    id: `${sourceId}:${id}`,
    status,
    lastActivityAt: 100,
    sourceId,
    sourceKind: sourceId === 'local' ? 'local' : 'ssh',
    sourceLabel: sourceId === 'local' ? 'LOCAL' : 'fixture-host',
  };
}

test('defaults old settings to local and shares one local scan', async () => {
  let scans = 0;
  const coordinator = createSourceCoordinator({
    localSource: {
      async scan() {
        scans += 1;
        return dashboard([agent('one', 'working')]);
      },
    },
    now: () => 1000,
  });
  coordinator.setAction('first', {}, true);
  coordinator.setAction('second', { slot: 2 }, true);
  await coordinator.refresh();

  assert.equal(scans, 1);
  assert.deepEqual([...coordinator.requiredSourceIds()], ['local']);
  assert.equal(coordinator.dashboardFor({}).agents[0].id, 'local:one');
});

test('deduplicates one SSH host and ranks combined agents', async () => {
  let remoteScans = 0;
  const coordinator = createSourceCoordinator({
    localSource: { scan: async () => dashboard([agent('local-work', 'working')]) },
    sshSourceFactory(host) {
      assert.equal(host, 'fixture-host');
      return {
        async scan() {
          remoteScans += 1;
          return dashboard([agent('remote-wait', 'waiting_user', 'ssh:fixture-host')]);
        },
      };
    },
    now: () => 1000,
  });
  const settings = { sourceMode: 'local_and_ssh', sshHost: 'fixture-host' };
  coordinator.setAction('first', settings, true);
  coordinator.setAction('second', settings, true);
  await coordinator.refresh();

  const combined = coordinator.dashboardFor(settings);
  assert.equal(remoteScans, 1);
  assert.deepEqual(
    combined.agents.map((item) => item.id),
    ['ssh:fixture-host:remote-wait', 'local:local-work'],
  );
  assert.equal(combined.counts.needsYou, 1);
  assert.equal(combined.counts.working, 1);
});

test('excludes failed SSH state without turning the combined source healthy', async () => {
  const error = Object.assign(new Error('offline'), { code: 'SSH_TIMEOUT' });
  const coordinator = createSourceCoordinator({
    localSource: { scan: async () => dashboard([agent('local-work', 'working')]) },
    sshSourceFactory: () => ({ scan: async () => Promise.reject(error) }),
    now: () => 1000,
  });
  const settings = { sourceMode: 'local_and_ssh', sshHost: 'fixture-host' };
  coordinator.setAction('combined', settings, true);
  await coordinator.refresh();

  const combined = coordinator.dashboardFor(settings);
  assert.equal(combined.agents.length, 1);
  assert.equal(combined.counts.active, 1);
  assert.equal(combined.offlineSources[0].errorCode, 'SSH_TIMEOUT');

  const sshOnly = coordinator.dashboardFor({ sourceMode: 'ssh', sshHost: 'fixture-host' });
  assert.equal(sshOnly.agents.length, 0);
  assert.equal(sshOnly.counts.active, 0);
  assert.equal(sshOnly.offlineSources.length, 1);
});

test('reports invalid SSH configuration without constructing a source', async () => {
  let constructed = false;
  const coordinator = createSourceCoordinator({
    localSource: { scan: async () => dashboard([]) },
    sshSourceFactory: () => {
      constructed = true;
    },
    now: () => 1000,
  });
  const settings = { sourceMode: 'ssh', sshHost: '-unsafe' };
  coordinator.setAction('invalid', settings, true);
  await coordinator.refresh();
  assert.equal(constructed, false);
  assert.equal(coordinator.dashboardFor(settings).configurationError, 'SET_SSH_HOST');
});

test('continues local scans while an SSH scan is still in flight', async () => {
  let currentTime = 1000;
  let localScans = 0;
  let resolveRemote;
  const remoteScan = new Promise((resolve) => {
    resolveRemote = resolve;
  });
  const coordinator = createSourceCoordinator({
    localSource: {
      async scan() {
        localScans += 1;
        return dashboard([], currentTime);
      },
    },
    sshSourceFactory: () => ({ scan: () => remoteScan }),
    now: () => currentTime,
    localPollMs: 10,
  });
  coordinator.setAction('combined', { sourceMode: 'local_and_ssh', sshHost: 'fixture-host' }, true);
  const firstRefresh = coordinator.refresh();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(localScans, 1);

  currentTime += 11;
  const secondRefresh = coordinator.refresh();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(localScans, 2);

  resolveRemote(dashboard([], currentTime));
  await Promise.all([firstRefresh, secondRefresh]);
});
