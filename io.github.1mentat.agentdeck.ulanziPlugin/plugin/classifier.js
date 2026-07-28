import path from 'node:path';

export const DEFAULT_CLASSIFIER_OPTIONS = Object.freeze({
  workingFreshMs: 3 * 60 * 1000,
  quietVisibleMs: 90 * 60 * 1000,
  recentCompletionMs: 20 * 60 * 1000,
  recentFailureMs: 60 * 60 * 1000,
  approvalGraceMs: 750,
});

const STATUS_PRIORITY = Object.freeze({
  waiting_user: 600,
  waiting_approval: 550,
  failed: 450,
  working: 350,
  quiet: 200,
  completed_recent: 100,
  inactive: 0,
});

function toMillis(value) {
  if (typeof value === 'number') return value > 10_000_000_000 ? value : value * 1000;
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function eventTime(event) {
  return toMillis(event?.timestamp) || toMillis(event?.payload?.occurred_at_ms);
}

function cleanText(value) {
  return String(value || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[`*_>#\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTextContent(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((item) => item && (item.type === 'input_text' || item.type === 'text'))
    .map((item) => item.text || '')
    .join(' ');
}

function latestTaskText(events, fallback) {
  let text = '';
  for (const event of events) {
    const payload = event?.payload || {};
    if (event.type === 'event_msg' && payload.type === 'user_message') {
      text = payload.message || payload.text || text;
    }
    if (event.type === 'response_item' && payload.type === 'message' && payload.role === 'user') {
      text = extractTextContent(payload.content) || text;
    }
  }
  const cleaned = cleanText(text) || cleanText(fallback);
  return cleaned || 'Codex task';
}

function pendingCalls(events) {
  const pending = new Map();
  for (const event of events) {
    if (event?.type !== 'response_item') continue;
    const payload = event.payload || {};
    const callId = payload.call_id || payload.id;
    if (!callId) continue;
    if (payload.type === 'function_call' || payload.type === 'custom_tool_call') {
      pending.set(callId, {
        id: callId,
        name: payload.name || '',
        input: payload.arguments ?? payload.input ?? '',
        at: eventTime(event),
      });
    } else if (
      payload.type === 'function_call_output' ||
      payload.type === 'custom_tool_call_output'
    ) {
      pending.delete(callId);
    }
  }
  return [...pending.values()];
}

function inputAsText(input) {
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input);
  } catch {
    return '';
  }
}

function isUserInputCall(call) {
  return /request[_-]?user[_-]?input/i.test(call.name);
}

function isApprovalCall(call) {
  if (!/exec|command|shell/i.test(call.name)) return false;
  const input = inputAsText(call.input);
  return /require_escalated|requestApproval|sandbox_permissions[^\n]{0,80}(escalat|outside)|ask_for_approval/i.test(
    input,
  );
}

function lifecycle(events) {
  let startedAt = 0;
  let completedAt = 0;
  let failedAt = 0;

  for (const event of events) {
    const payload = event?.payload || {};
    const at = eventTime(event);
    if (event.type === 'event_msg' && payload.type === 'task_started') {
      startedAt = Math.max(startedAt, toMillis(payload.started_at) || at);
    }
    if (event.type === 'event_msg' && payload.type === 'task_complete') {
      completedAt = Math.max(completedAt, toMillis(payload.completed_at) || at);
    }
    if (
      (event.type === 'event_msg' && payload.type === 'turn_aborted') ||
      (event.type === 'event_msg' && payload.type === 'task_failed') ||
      (event.type === 'event_msg' && payload.type === 'error')
    ) {
      failedAt = Math.max(failedAt, at);
    }
  }

  return { startedAt, completedAt, failedAt };
}

function sourceDetails(metadata) {
  let source = metadata?.source;
  if (typeof source === 'string' && source.trim().startsWith('{')) {
    try {
      source = JSON.parse(source);
    } catch {
      /* retain the string */
    }
  }
  const spawned = source?.subagent?.thread_spawn || source?.subagent?.threadSpawn || null;
  return {
    parentId: metadata?.parentId || spawned?.parent_thread_id || null,
    agentPath: metadata?.agentPath || spawned?.agent_path || null,
    nickname: metadata?.agentNickname || spawned?.agent_nickname || null,
    role: metadata?.agentRole || spawned?.agent_role || null,
  };
}

function statusFor({ events, nowMs, options }) {
  const pending = pendingCalls(events);
  const waitingUser = pending.filter(isUserInputCall).sort((a, b) => b.at - a.at)[0];
  if (waitingUser) return { status: 'waiting_user', statusSince: waitingUser.at };

  const waitingApproval = pending
    .filter(isApprovalCall)
    .filter((call) => nowMs - call.at >= options.approvalGraceMs)
    .sort((a, b) => b.at - a.at)[0];
  if (waitingApproval) return { status: 'waiting_approval', statusSince: waitingApproval.at };

  const life = lifecycle(events);
  const terminalAt = Math.max(life.completedAt, life.failedAt);
  if (life.failedAt >= life.completedAt && life.failedAt > life.startedAt) {
    return nowMs - life.failedAt <= options.recentFailureMs
      ? { status: 'failed', statusSince: life.failedAt }
      : { status: 'inactive', statusSince: life.failedAt };
  }
  if (life.startedAt > terminalAt) {
    const lastActivityAt = events.reduce((max, event) => Math.max(max, eventTime(event)), 0);
    const age = nowMs - lastActivityAt;
    if (age <= options.workingFreshMs) return { status: 'working', statusSince: life.startedAt };
    if (age <= options.quietVisibleMs)
      return { status: 'quiet', statusSince: lastActivityAt || life.startedAt };
    return { status: 'inactive', statusSince: lastActivityAt || life.startedAt };
  }
  if (life.completedAt && nowMs - life.completedAt <= options.recentCompletionMs) {
    return { status: 'completed_recent', statusSince: life.completedAt };
  }
  return { status: 'inactive', statusSince: terminalAt || life.startedAt || 0 };
}

/**
 * Convert one Codex thread's metadata and recent JSONL events into the stable,
 * read-only shape consumed by every D200X action.
 */
export function classifyThread({
  metadata = {},
  events = [],
  now = Date.now(),
  options = {},
  source = {},
}) {
  const nowMs = toMillis(now) || Date.now();
  const classifierOptions = { ...DEFAULT_CLASSIFIER_OPTIONS, ...options };
  const ordered = [...events].sort((a, b) => eventTime(a) - eventTime(b));
  const lastActivityAt =
    ordered.reduce((max, event) => Math.max(max, eventTime(event)), 0) ||
    toMillis(metadata.updatedAt);
  const details = sourceDetails(metadata);
  const cwd = metadata.cwd || '';
  const project = cwd ? path.basename(cwd) : 'Codex';
  const fallbackName = details.agentPath ? path.basename(details.agentPath) : project;
  const state = statusFor({ events: ordered, nowMs, options: classifierOptions });
  const provider = source.provider || 'codex';
  const sourceId = source.sourceId || 'local';
  const sourceKind = source.sourceKind || 'local';
  const sourceLabel = source.sourceLabel || 'LOCAL';
  const threadId = metadata.id || '';
  const parentThreadId = details.parentId;

  return {
    id: `${sourceId}:${threadId}`,
    threadId,
    parentId: parentThreadId ? `${sourceId}:${parentThreadId}` : null,
    parentThreadId,
    provider,
    sourceId,
    sourceKind,
    sourceLabel,
    name: details.nickname || details.role || fallbackName || 'Codex',
    project,
    cwd,
    task: latestTaskText(ordered, metadata.preview || metadata.title),
    model: metadata.model || metadata.modelProvider || '',
    effort: metadata.effort || metadata.reasoningEffort || '',
    status: state.status,
    statusSince: state.statusSince,
    lastActivityAt,
    isSubagent: Boolean(details.parentId || details.agentPath),
    agentPath: details.agentPath,
    sourcePath: metadata.sourcePath || null,
  };
}

export function rankSnapshots(snapshots) {
  return [...snapshots].sort((a, b) => {
    const priority = (STATUS_PRIORITY[b.status] || 0) - (STATUS_PRIORITY[a.status] || 0);
    if (priority) return priority;
    const recency = (b.lastActivityAt || 0) - (a.lastActivityAt || 0);
    if (recency) return recency;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function summarizeSnapshots(snapshots) {
  const counts = {
    total: 0,
    active: 0,
    working: 0,
    needsYou: 0,
    quiet: 0,
    failed: 0,
    recent: 0,
  };
  for (const snapshot of snapshots) {
    if (snapshot.status === 'inactive') continue;
    counts.total += 1;
    if (['working', 'waiting_user', 'waiting_approval', 'quiet'].includes(snapshot.status))
      counts.active += 1;
    if (snapshot.status === 'working') counts.working += 1;
    if (snapshot.status === 'waiting_user' || snapshot.status === 'waiting_approval')
      counts.needsYou += 1;
    if (snapshot.status === 'quiet') counts.quiet += 1;
    if (snapshot.status === 'failed') counts.failed += 1;
    if (snapshot.status === 'completed_recent') counts.recent += 1;
  }
  return counts;
}
