import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export const DEFAULT_RUNTIME_LOG_PATH = path.join(
  os.homedir(),
  'Library',
  'Logs',
  'Agent Deck',
  'runtime.jsonl',
);

const EVENT_FIELDS = Object.freeze({
  plugin_started: [],
  plugin_connected: [],
  plugin_socket_error: ['errorCode'],
  plugin_socket_closed: [],
  refresh_failed: ['errorCode'],
  source_retry: ['sourceKind', 'previousErrorCode'],
  source_offline: ['sourceKind', 'errorCode', 'durationMs'],
  source_online: ['sourceKind', 'durationMs', 'agentCount', 'warningCount', 'recovered'],
});

function safeCode(value) {
  return String(value || 'UNKNOWN')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '_')
    .slice(0, 40);
}

function safeKind(value) {
  return value === 'ssh' ? 'ssh' : 'local';
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function publicDetails(event, details) {
  const fields = EVENT_FIELDS[event] || [];
  const output = {};
  for (const field of fields) {
    if (field === 'sourceKind') output[field] = safeKind(details[field]);
    else if (field === 'errorCode' || field === 'previousErrorCode') {
      output[field] = safeCode(details[field]);
    } else if (field === 'recovered') output[field] = Boolean(details[field]);
    else output[field] = safeNumber(details[field]);
  }
  return output;
}

export function createRuntimeLogger({
  logPath = process.env.AGENT_DECK_LOG_PATH || DEFAULT_RUNTIME_LOG_PATH,
  maxBytes = 256 * 1024,
  now = () => Date.now(),
} = {}) {
  let queue = Promise.resolve();

  async function append(record) {
    const directory = path.dirname(logPath);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const line = `${JSON.stringify(record)}\n`;
    const size = await fs.stat(logPath).then(
      (stat) => stat.size,
      () => 0,
    );
    if (size + Buffer.byteLength(line) > maxBytes) {
      await fs.rm(`${logPath}.1`, { force: true });
      await fs.rename(logPath, `${logPath}.1`).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    await fs.appendFile(logPath, line, { encoding: 'utf8', mode: 0o600 });
  }

  function log(event, details = {}) {
    if (!(event in EVENT_FIELDS)) return queue;
    const record = {
      at: new Date(now()).toISOString(),
      event,
      ...publicDetails(event, details),
    };
    queue = queue.then(() => append(record)).catch(() => {});
    return queue;
  }

  return {
    log,
    flush: () => queue,
    logPath,
  };
}
