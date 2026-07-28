import { execFile as nodeExecFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  classifyThread,
  enrichAgentRelationships,
  rankSnapshots,
  summarizeSnapshots,
} from './classifier.js';

const execFilePromise = promisify(nodeExecFile);
const DAY_MS = 24 * 60 * 60 * 1000;

async function walkJsonl(root) {
  const files = [];
  async function visit(dir, depth) {
    if (depth > 5) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) await visit(fullPath, depth + 1);
        else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(fullPath);
      }),
    );
  }
  await visit(root, 0);
  return files;
}

function parseLines(text, seen = new Set()) {
  const parsed = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    try {
      const value = JSON.parse(trimmed);
      seen.add(trimmed);
      parsed.push(value);
    } catch {
      // A concurrently written final line or a chunk boundary is expected.
    }
  }
  return parsed;
}

async function readHeadAndTail(filePath, headBytes, tailBytes) {
  const handle = await fs.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    if (stat.size <= headBytes + tailBytes) {
      return { events: parseLines(await handle.readFile({ encoding: 'utf8' })), stat };
    }

    const head = Buffer.alloc(headBytes);
    const tail = Buffer.alloc(tailBytes);
    const headRead = await handle.read(head, 0, headBytes, 0);
    const tailStart = Math.max(0, stat.size - tailBytes);
    const tailRead = await handle.read(tail, 0, tailBytes, tailStart);
    const seen = new Set();
    const headEvents = parseLines(head.subarray(0, headRead.bytesRead).toString('utf8'), seen);
    let tailText = tail.subarray(0, tailRead.bytesRead).toString('utf8');
    const firstNewline = tailText.indexOf('\n');
    if (tailStart > 0 && firstNewline >= 0) tailText = tailText.slice(firstNewline + 1);
    return { events: [...headEvents, ...parseLines(tailText, seen)], stat };
  } finally {
    await handle.close();
  }
}

function threadIdFromPath(filePath) {
  return path.basename(filePath).match(/([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/i)?.[1] || '';
}

function firstSessionMetadata(events, expectedId) {
  const candidates = events
    .filter((event) => event?.type === 'session_meta' && event.payload)
    .map((event) => event.payload);
  return candidates.find((payload) => payload.id === expectedId) || candidates[0] || {};
}

function latestTurnContext(events) {
  return [...events].reverse().find((event) => event?.type === 'turn_context')?.payload || {};
}

function normalizeDbSource(source) {
  if (typeof source !== 'string') return source;
  try {
    return JSON.parse(source);
  } catch {
    return source;
  }
}

async function loadSqliteMetadata({ codexHome, cutoffSeconds, execFile }) {
  const dbPath = path.join(codexHome, 'state_5.sqlite');
  try {
    await fs.access(dbPath);
  } catch {
    return new Map();
  }

  const sql = [
    'SELECT id, cwd, model, reasoning_effort, agent_nickname, agent_role,',
    'source, updated_at, preview, rollout_path, tokens_used, git_branch, sandbox_policy, approval_mode',
    'FROM threads',
    `WHERE archived = 0 AND updated_at >= ${Math.floor(cutoffSeconds)}`,
    'ORDER BY updated_at DESC LIMIT 200;',
  ].join(' ');
  const { stdout } = await execFile('sqlite3', ['-json', dbPath, sql], {
    maxBuffer: 4 * 1024 * 1024,
  });
  const rows = stdout.trim() ? JSON.parse(stdout) : [];
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        cwd: row.cwd,
        model: row.model,
        effort: row.reasoning_effort,
        agentNickname: row.agent_nickname,
        agentRole: row.agent_role,
        source: normalizeDbSource(row.source),
        updatedAt: row.updated_at,
        preview: row.preview,
        sourcePath: row.rollout_path,
        tokensUsed: row.tokens_used,
        gitBranch: row.git_branch,
        sandboxPolicy: row.sandbox_policy,
        approvalMode: row.approval_mode,
      },
    ]),
  );
}

function metadataFor({ filePath, events, dbMetadata }) {
  const id = threadIdFromPath(filePath);
  const session = firstSessionMetadata(events, id);
  const turn = latestTurnContext(events);
  return {
    ...(dbMetadata.get(id) || {}),
    id: id || session.id,
    cwd: session.cwd || dbMetadata.get(id)?.cwd,
    source: session.source ?? dbMetadata.get(id)?.source,
    modelProvider: session.model_provider,
    model: turn.model || dbMetadata.get(id)?.model,
    effort: turn.effort || dbMetadata.get(id)?.effort,
    preview: dbMetadata.get(id)?.preview,
    sourcePath: filePath,
  };
}

export function createCodexObserver({
  codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
  now = () => Date.now(),
  execFile = execFilePromise,
  lookbackDays = 3,
  maxFiles = 120,
  headBytes = 256 * 1024,
  tailBytes = 768 * 1024,
  classifierOptions = {},
  source = {},
} = {}) {
  return {
    async scan() {
      const scannedAt = now();
      const warnings = [];
      const sessionsRoot = path.join(codexHome, 'sessions');
      const cutoffMs = scannedAt - lookbackDays * DAY_MS;
      let dbMetadata = new Map();
      try {
        dbMetadata = await loadSqliteMetadata({
          codexHome,
          cutoffSeconds: cutoffMs / 1000,
          execFile,
        });
      } catch (error) {
        warnings.push(`SQLite metadata unavailable: ${error.message}`);
      }

      const candidates = [];
      for (const filePath of await walkJsonl(sessionsRoot)) {
        try {
          const stat = await fs.stat(filePath);
          if (stat.mtimeMs >= cutoffMs) candidates.push({ filePath, mtimeMs: stat.mtimeMs });
        } catch {
          // The file may have rotated between discovery and stat.
        }
      }
      candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

      const snapshots = [];
      for (const candidate of candidates.slice(0, maxFiles)) {
        try {
          const { events } = await readHeadAndTail(candidate.filePath, headBytes, tailBytes);
          const metadata = metadataFor({ filePath: candidate.filePath, events, dbMetadata });
          if (!metadata.id) continue;
          snapshots.push(
            classifyThread({
              metadata,
              events,
              now: scannedAt,
              options: classifierOptions,
              source,
            }),
          );
        } catch (error) {
          warnings.push(`${path.basename(candidate.filePath)}: ${error.message}`);
        }
      }

      const agents = rankSnapshots(enrichAgentRelationships(snapshots));
      return { agents, counts: summarizeSnapshots(agents), scannedAt, warnings };
    },
  };
}
