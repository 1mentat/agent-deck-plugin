import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';
import {
  createSshCodexSource,
  validateSshAlias,
} from '../io.github.1mentat.agentdeck.ulanziPlugin/plugin/ssh-codex-source.js';

async function probeFixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-deck-probe-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const probePath = path.join(directory, 'probe.mjs');
  await fs.writeFile(probePath, 'probe bytes');
  return probePath;
}

function fakeSpawn(response) {
  const calls = [];
  const spawn = (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.input = Buffer.alloc(0);
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        child.input = Buffer.concat([child.input, chunk]);
        callback();
      },
      final(callback) {
        callback();
        response?.(child);
      },
    });
    child.kill = (signal) => {
      child.killedWith = signal;
      return true;
    };
    calls.push({ command, args, options, child });
    return child;
  };
  spawn.calls = calls;
  return spawn;
}

function envelope(overrides = {}) {
  return {
    schemaVersion: 2,
    provider: 'codex',
    scannedAt: 1000,
    agents: [
      {
        threadId: 'thread-1',
        parentThreadId: null,
        name: 'Worker',
        project: 'fixture',
        cwd: '/tmp/fixture',
        task: 'Test transport',
        model: 'gpt-test',
        effort: 'high',
        status: 'working',
        statusSince: 900,
        lastActivityAt: 950,
        isSubagent: false,
        context: {
          usedTokens: 50,
          windowTokens: 100,
          percent: 50,
          cumulativeTokens: 80,
          compactions: 0,
        },
        terminals: {
          running: 1,
          fidelity: 'inferred',
          entries: [{ label: 'TEST', startedAt: 925 }],
        },
        subagents: { total: 0, active: 0, waiting: 0, done: 0, children: [] },
        activity: { kind: 'terminal', label: 'RUNNING COMMAND', since: 940 },
        plan: { completed: 1, total: 2, current: 'Verify' },
        permissions: {
          approval: 'on-request',
          reviewer: '',
          profile: 'workspace-write',
          sandbox: '',
        },
        git: { branch: 'feature/test' },
      },
    ],
    warnings: [],
    ...overrides,
  };
}

test('validates aliases as opaque SSH config names', () => {
  assert.deepEqual(validateSshAlias('fixture-host'), { ok: true, value: 'fixture-host' });
  for (const unsafe of ['-option', 'user@host', 'two hosts', 'host;command', '']) {
    assert.equal(validateSshAlias(unsafe).ok, false);
  }
});

test('passes a validated alias as one SSH argument and streams the probe', async (t) => {
  const probePath = await probeFixture(t);
  const spawn = fakeSpawn((child) => {
    setImmediate(() => {
      child.stdout.end(JSON.stringify(envelope()));
      child.emit('close', 0);
    });
  });
  const times = [900, 1100];
  const source = createSshCodexSource({
    hostAlias: 'fixture-host',
    probePath,
    spawn,
    now: () => times.shift(),
  });
  const result = await source.scan();

  assert.equal(spawn.calls[0].command, '/usr/bin/ssh');
  assert.deepEqual(spawn.calls[0].args, [
    '-T',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=5',
    '-o',
    'ClearAllForwardings=yes',
    '-o',
    'ForwardAgent=no',
    '-o',
    'ForwardX11=no',
    '-o',
    'PermitLocalCommand=no',
    'fixture-host',
    'node',
    '--input-type=module',
    '-',
  ]);
  assert.equal(spawn.calls[0].child.input.toString(), 'probe bytes');
  assert.equal(result.agents[0].id, 'ssh:fixture-host:thread-1');
  assert.equal(result.agents[0].sourceLabel, 'fixture-host');
  assert.equal(result.agents[0].statusSince, 900);
  assert.equal(result.agents[0].terminals.entries[0].startedAt, 925);
});

test('rejects an invalid alias before reading or spawning', async () => {
  const spawn = fakeSpawn();
  const source = createSshCodexSource({ hostAlias: '-unsafe', probePath: '/missing', spawn });
  await assert.rejects(source.scan(), { code: 'INVALID_SSH_HOST' });
  assert.equal(spawn.calls.length, 0);
});

test('maps malformed, incompatible, and missing-Node responses', async (t) => {
  const probePath = await probeFixture(t);
  for (const [response, expected] of [
    [{ stdout: '{broken', code: 0 }, 'PROBE_PROTOCOL'],
    [{ stdout: JSON.stringify(envelope({ schemaVersion: 3 })), code: 0 }, 'PROBE_PROTOCOL'],
    [{ stderr: 'sh: node: command not found', code: 127 }, 'NODE_UNAVAILABLE'],
    [{ stderr: 'Host key verification failed.', code: 255 }, 'HOST_KEY_REQUIRED'],
  ]) {
    const spawn = fakeSpawn((child) => {
      setImmediate(() => {
        if (response.stdout) child.stdout.end(response.stdout);
        if (response.stderr) child.stderr.end(response.stderr);
        child.emit('close', response.code);
      });
    });
    const source = createSshCodexSource({ hostAlias: 'fixture-host', probePath, spawn });
    await assert.rejects(source.scan(), { code: expected });
  }
});

test('bounds time and output', async (t) => {
  const probePath = await probeFixture(t);
  const hangingSpawn = fakeSpawn();
  const timeoutSource = createSshCodexSource({
    hostAlias: 'fixture-host',
    probePath,
    spawn: hangingSpawn,
    timeoutMs: 5,
  });
  await assert.rejects(timeoutSource.scan(), { code: 'SSH_TIMEOUT' });
  assert.equal(hangingSpawn.calls[0].child.killedWith, 'SIGKILL');

  const noisySpawn = fakeSpawn((child) => {
    setImmediate(() => child.stdout.write('too much output'));
  });
  const limitedSource = createSshCodexSource({
    hostAlias: 'fixture-host',
    probePath,
    spawn: noisySpawn,
    maxStdoutBytes: 4,
  });
  await assert.rejects(limitedSource.scan(), { code: 'OUTPUT_LIMIT' });
});

test('corrects remote clock skew using the request midpoint', async (t) => {
  const probePath = await probeFixture(t);
  const spawn = fakeSpawn((child) => {
    setImmediate(() => {
      child.stdout.end(JSON.stringify(envelope({ scannedAt: 5000 })));
      child.emit('close', 0);
    });
  });
  const times = [1000, 1200];
  const source = createSshCodexSource({
    hostAlias: 'fixture-host',
    probePath,
    spawn,
    now: () => times.shift(),
  });
  const result = await source.scan();
  assert.equal(result.agents[0].statusSince, -3000);
  assert.equal(result.agents[0].lastActivityAt, -2950);
  assert.equal(result.agents[0].activity.since, -2960);
  assert.equal(result.agents[0].terminals.entries[0].startedAt, -2975);
});
