import { spawn as nodeSpawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rankSnapshots, summarizeSnapshots } from './classifier.js';
import { isValidSshHost, sourceIdForHost } from './source-config.js';

const PROBE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'generated',
  'codex-remote-probe.mjs',
);
const SSH_PATH = '/usr/bin/ssh';
const SCHEMA_VERSION = 2;

export function validateSshAlias(value) {
  const host = String(value || '').trim();
  return isValidSshHost(host)
    ? { ok: true, value: host }
    : { ok: false, error: 'Use one SSH config alias (letters, numbers, dot, dash, underscore).' };
}

function sourceError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function classifyExit(stderr) {
  if (/AGENT_DECK_NODE_UNSUPPORTED|node(?:\.js)? 20 or later/i.test(stderr)) {
    return 'NODE_UNAVAILABLE';
  }
  if (/node: (?:command not found|not found)|node: not found|No such file.*node/i.test(stderr)) {
    return 'NODE_UNAVAILABLE';
  }
  if (
    /host key verification failed|authenticity of host|remote host identification has changed/i.test(
      stderr,
    )
  ) {
    return 'HOST_KEY_REQUIRED';
  }
  return 'SSH_UNAVAILABLE';
}

function adjustedTimestamp(value, offset) {
  return Number.isFinite(value) && value > 0 ? value + offset : value;
}

function normalizeEnvelope(envelope, host, receivedAt, startedAt) {
  if (!envelope || envelope.schemaVersion !== SCHEMA_VERSION || envelope.provider !== 'codex') {
    throw sourceError('PROBE_PROTOCOL', 'Unsupported remote probe response');
  }
  if (!Number.isFinite(envelope.scannedAt) || !Array.isArray(envelope.agents)) {
    throw sourceError('PROBE_PROTOCOL', 'Malformed remote probe response');
  }
  const sourceId = sourceIdForHost(host);
  const offset = (startedAt + receivedAt) / 2 - envelope.scannedAt;
  const agents = rankSnapshots(
    envelope.agents.map((agent) => {
      if (!agent || typeof agent.threadId !== 'string' || !agent.threadId) {
        throw sourceError('PROBE_PROTOCOL', 'Remote agent is missing a thread ID');
      }
      return {
        threadId: agent.threadId,
        parentThreadId: agent.parentThreadId || null,
        id: `${sourceId}:${agent.threadId}`,
        parentId: agent.parentThreadId ? `${sourceId}:${agent.parentThreadId}` : null,
        provider: 'codex',
        sourceId,
        sourceKind: 'ssh',
        sourceLabel: host,
        name: String(agent.name || 'Codex'),
        project: String(agent.project || 'Codex'),
        cwd: String(agent.cwd || ''),
        task: String(agent.task || 'Codex task'),
        model: String(agent.model || ''),
        effort: String(agent.effort || ''),
        status: String(agent.status || 'inactive'),
        statusSince: adjustedTimestamp(agent.statusSince, offset),
        lastActivityAt: adjustedTimestamp(agent.lastActivityAt, offset),
        isSubagent: Boolean(agent.isSubagent),
        context: agent.context || {
          usedTokens: 0,
          windowTokens: 0,
          percent: 0,
          cumulativeTokens: 0,
          compactions: 0,
        },
        terminals: {
          running: Number(agent.terminals?.running) || 0,
          fidelity: 'inferred',
          entries: (agent.terminals?.entries || []).slice(0, 4).map((entry) => ({
            label: String(entry.label || 'COMMAND').slice(0, 18),
            startedAt: adjustedTimestamp(entry.startedAt, offset),
          })),
        },
        subagents: {
          total: Number(agent.subagents?.total) || 0,
          active: Number(agent.subagents?.active) || 0,
          waiting: Number(agent.subagents?.waiting) || 0,
          done: Number(agent.subagents?.done) || 0,
          children: (agent.subagents?.children || []).slice(0, 8).map((child) => ({
            name: String(child.name || 'Subagent').slice(0, 24),
            status: String(child.status || 'inactive'),
            task: String(child.task || '').slice(0, 48),
          })),
        },
        activity: {
          kind: String(agent.activity?.kind || 'idle').slice(0, 24),
          label: String(agent.activity?.label || 'NO RECENT TOOL').slice(0, 32),
          since: adjustedTimestamp(agent.activity?.since, offset),
        },
        plan: agent.plan || { completed: 0, total: 0, current: '' },
        permissions: agent.permissions || { approval: '', reviewer: '', profile: '', sandbox: '' },
        git: agent.git || { branch: '' },
      };
    }),
  );
  return {
    agents,
    counts: summarizeSnapshots(agents),
    scannedAt: receivedAt,
    warnings: Array.isArray(envelope.warnings)
      ? envelope.warnings.slice(0, 20).map((warning) => String(warning).slice(0, 300))
      : [],
  };
}

export function createSshCodexSource({
  hostAlias,
  probePath = PROBE_PATH,
  spawn = nodeSpawn,
  now = () => Date.now(),
  timeoutMs = 8000,
  maxStdoutBytes = 8 * 1024 * 1024,
  maxStderrBytes = 64 * 1024,
} = {}) {
  const validation = validateSshAlias(hostAlias);
  const host = validation.ok ? validation.value : String(hostAlias || '').trim();
  let probePromise;

  async function probe() {
    probePromise ||= fs.readFile(probePath);
    return probePromise;
  }

  return {
    id: validation.ok ? sourceIdForHost(host) : null,
    kind: 'ssh',
    label: host,
    async scan() {
      if (!validation.ok) throw sourceError('INVALID_SSH_HOST', validation.error);
      const probeBytes = await probe();
      const startedAt = now();
      return new Promise((resolve, reject) => {
        let child;
        try {
          child = spawn(
            SSH_PATH,
            [
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
              host,
              'node',
              '--input-type=module',
              '-',
            ],
            { stdio: ['pipe', 'pipe', 'pipe'] },
          );
        } catch (error) {
          reject(sourceError('SSH_UNAVAILABLE', error.message));
          return;
        }

        const stdout = [];
        const stderr = [];
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let settled = false;
        let timer;

        function finish(fn, value) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn(value);
        }

        function exceedLimit() {
          child.kill('SIGKILL');
          finish(reject, sourceError('OUTPUT_LIMIT', 'Remote probe output exceeded its limit'));
        }

        child.stdout.on('data', (chunk) => {
          stdoutBytes += chunk.length;
          if (stdoutBytes > maxStdoutBytes) return exceedLimit();
          stdout.push(chunk);
        });
        child.stderr.on('data', (chunk) => {
          stderrBytes += chunk.length;
          if (stderrBytes > maxStderrBytes) return exceedLimit();
          stderr.push(chunk);
        });
        child.on('error', (error) => {
          finish(reject, sourceError('SSH_UNAVAILABLE', error.message));
        });
        child.on('close', (code) => {
          if (settled) return;
          const stderrText = Buffer.concat(stderr).toString('utf8');
          if (code !== 0) {
            const codeName = classifyExit(stderrText);
            finish(reject, sourceError(codeName, codeName));
            return;
          }
          let envelope;
          try {
            envelope = JSON.parse(Buffer.concat(stdout).toString('utf8'));
            finish(resolve, normalizeEnvelope(envelope, host, now(), startedAt));
          } catch (error) {
            finish(
              reject,
              error?.code
                ? error
                : sourceError('PROBE_PROTOCOL', 'Remote probe returned malformed JSON'),
            );
          }
        });

        timer = setTimeout(() => {
          child.kill('SIGKILL');
          finish(reject, sourceError('SSH_TIMEOUT', 'Remote probe timed out'));
        }, timeoutMs);
        child.stdin.on('error', () => {});
        child.stdin.end(probeBytes);
      });
    },
  };
}
