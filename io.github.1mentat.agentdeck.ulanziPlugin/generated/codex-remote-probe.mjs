// io.github.1mentat.agentdeck.ulanziPlugin/plugin/remote-probe-entry.js
import process2 from "node:process";

// io.github.1mentat.agentdeck.ulanziPlugin/plugin/codex-observer.js
import { execFile as nodeExecFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path2 from "node:path";
import { promisify } from "node:util";

// io.github.1mentat.agentdeck.ulanziPlugin/plugin/classifier.js
import path from "node:path";
var DEFAULT_CLASSIFIER_OPTIONS = Object.freeze({
  workingFreshMs: 3 * 60 * 1e3,
  quietVisibleMs: 90 * 60 * 1e3,
  recentCompletionMs: 20 * 60 * 1e3,
  recentFailureMs: 60 * 60 * 1e3,
  approvalGraceMs: 750
});
var STATUS_PRIORITY = Object.freeze({
  waiting_user: 600,
  waiting_approval: 550,
  failed: 450,
  working: 350,
  quiet: 200,
  completed_recent: 100,
  inactive: 0
});
function toMillis(value) {
  if (typeof value === "number") return value > 1e10 ? value : value * 1e3;
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}
function eventTime(event) {
  return toMillis(event?.timestamp) || toMillis(event?.payload?.occurred_at_ms);
}
function cleanText(value) {
  return String(value || "").replace(/https?:\/\/\S+/g, "").replace(/[`*_>#\[\]()]/g, " ").replace(/\s+/g, " ").trim();
}
function boundedText(value, max = 32) {
  return cleanText(value).slice(0, max);
}
function parseObject(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function extractTextContent(content) {
  if (!Array.isArray(content)) return "";
  return content.filter((item) => item && (item.type === "input_text" || item.type === "text")).map((item) => item.text || "").join(" ");
}
function latestTaskText(events, fallback) {
  let text = "";
  for (const event of events) {
    const payload = event?.payload || {};
    if (event.type === "event_msg" && payload.type === "user_message") {
      text = payload.message || payload.text || text;
    }
    if (event.type === "response_item" && payload.type === "message" && payload.role === "user") {
      text = extractTextContent(payload.content) || text;
    }
  }
  const cleaned = cleanText(text) || cleanText(fallback);
  return cleaned || "Codex task";
}
function latestTurnContext(events) {
  return [...events].reverse().find((event) => event?.type === "turn_context")?.payload || {};
}
function pendingCalls(events) {
  const pending = /* @__PURE__ */ new Map();
  for (const event of events) {
    if (event?.type !== "response_item") continue;
    const payload = event.payload || {};
    const callId = payload.call_id || payload.id;
    if (!callId) continue;
    if (payload.type === "function_call" || payload.type === "custom_tool_call") {
      pending.set(callId, {
        id: callId,
        name: payload.name || "",
        input: payload.arguments ?? payload.input ?? "",
        at: eventTime(event)
      });
    } else if (payload.type === "function_call_output" || payload.type === "custom_tool_call_output") {
      pending.delete(callId);
    }
  }
  return [...pending.values()];
}
function contextDetails(events, metadata) {
  let info = null;
  let compactedRecords = 0;
  let compactedMessages = 0;
  for (const event of events) {
    if (event?.type === "event_msg" && event.payload?.type === "token_count") {
      if (event.payload.info && typeof event.payload.info === "object") info = event.payload.info;
    }
    if (event?.type === "compacted") compactedRecords += 1;
    if (event?.type === "event_msg" && event.payload?.type === "context_compacted") {
      compactedMessages += 1;
    }
  }
  const latest = info?.last_token_usage || {};
  const total = info?.total_token_usage || {};
  const usedTokens = Math.max(0, Number(latest.input_tokens) || 0);
  const windowTokens = Math.max(0, Number(info?.model_context_window) || 0);
  const percent = windowTokens ? Math.min(100, Math.round(usedTokens / windowTokens * 100)) : 0;
  return {
    usedTokens,
    windowTokens,
    percent,
    cumulativeTokens: Math.max(0, Number(total.total_tokens) || Number(metadata.tokensUsed) || 0),
    compactions: Math.max(compactedRecords, compactedMessages)
  };
}
function latestPlan(events) {
  let plan = null;
  for (const event of events) {
    const payload = event?.payload || {};
    if (event?.type !== "response_item" || !["function_call", "custom_tool_call"].includes(payload.type) || payload.name !== "update_plan") {
      continue;
    }
    const input = parseObject(payload.arguments ?? payload.input);
    if (Array.isArray(input?.plan)) plan = input.plan;
  }
  if (!plan) return { completed: 0, total: 0, current: "" };
  const completed = plan.filter((item) => item?.status === "completed").length;
  const current = plan.find((item) => item?.status === "in_progress") || plan.find((item) => item?.status === "pending");
  return {
    completed,
    total: plan.length,
    current: boundedText(current?.step, 48)
  };
}
function activityLabel(name) {
  const value = String(name || "").toLowerCase();
  if (/request[_-]?user[_-]?input/.test(value))
    return { kind: "input", label: "WAITING FOR INPUT" };
  if (/apply_patch|file.*change/.test(value)) return { kind: "editing", label: "EDITING FILES" };
  if (/spawn_agent|send_message|wait_agent|collab/.test(value)) {
    return { kind: "subagents", label: "COORDINATING" };
  }
  if (/web|browser|fetch|search/.test(value)) return { kind: "research", label: "RESEARCHING" };
  if (/view_image/.test(value)) return { kind: "inspection", label: "INSPECTING" };
  if (/update_plan/.test(value)) return { kind: "planning", label: "PLANNING" };
  if (/exec|shell|command|wait|write_stdin/.test(value))
    return { kind: "terminal", label: "RUNNING COMMAND" };
  if (value) return { kind: "tool", label: "USING TOOL" };
  return { kind: "thinking", label: "THINKING" };
}
function latestActivity(events, status) {
  let activity = null;
  for (const event of events) {
    const payload = event?.payload || {};
    if (event?.type === "response_item" && ["function_call", "custom_tool_call"].includes(payload.type)) {
      activity = { ...activityLabel(payload.name), since: eventTime(event) };
    } else if (event?.type === "event_msg" && payload.type === "sub_agent_activity") {
      activity = { kind: "subagents", label: "SUBAGENT ACTIVITY", since: eventTime(event) };
    } else if (event?.type === "response_item" && payload.type === "reasoning") {
      activity = { kind: "thinking", label: "THINKING", since: eventTime(event) };
    }
  }
  if (status === "waiting_user")
    return { kind: "input", label: "WAITING FOR INPUT", since: activity?.since || 0 };
  if (status === "waiting_approval") {
    return { kind: "approval", label: "WAITING APPROVAL", since: activity?.since || 0 };
  }
  return activity || { kind: "idle", label: "NO RECENT TOOL", since: 0 };
}
function callHandle(value, field) {
  const object = parseObject(value);
  const direct = object?.[field];
  if (direct !== void 0 && direct !== null) return String(direct);
  const text = typeof value === "string" ? value : JSON.stringify(value || "");
  const pattern = new RegExp(`${field}["']?\\s*[:=]\\s*["']?([A-Za-z0-9._-]+)`, "i");
  return text.match(pattern)?.[1] || "";
}
function outputHandle(value) {
  const object = parseObject(value);
  if (object?.session_id !== void 0) return `session:${object.session_id}`;
  if (object?.cell_id) return `cell:${object.cell_id}`;
  const text = typeof value === "string" ? value : JSON.stringify(value || "");
  const cell = text.match(/Script running with cell ID\s+([A-Za-z0-9._-]+)/i)?.[1];
  if (cell) return `cell:${cell}`;
  const session = text.match(/["']?session_id["']?\s*[:=]\s*["']?([0-9]+)/i)?.[1];
  return session ? `session:${session}` : "";
}
function terminalLabel(call) {
  const input = parseObject(call.input);
  const command = String(input?.cmd || "").trim();
  if (!command) return "COMMAND";
  const executable = command.split(/\s+/)[0].split("/").pop();
  return boundedText(executable || "COMMAND", 18).toUpperCase();
}
function observedTerminals(events) {
  const calls = /* @__PURE__ */ new Map();
  const active = /* @__PURE__ */ new Map();
  for (const event of events) {
    if (event?.type !== "response_item") continue;
    const payload = event.payload || {};
    const callId = payload.call_id || payload.id;
    if (["function_call", "custom_tool_call"].includes(payload.type) && callId) {
      calls.set(callId, {
        name: payload.name || "",
        input: payload.arguments ?? payload.input ?? "",
        at: eventTime(event)
      });
      continue;
    }
    if (!["function_call_output", "custom_tool_call_output"].includes(payload.type) || !callId) {
      continue;
    }
    const call = calls.get(callId);
    if (!call) continue;
    const inputCell = callHandle(call.input, "cell_id");
    const inputSession = callHandle(call.input, "session_id");
    const inputHandle = inputCell ? `cell:${inputCell}` : inputSession ? `session:${inputSession}` : "";
    const nextHandle = outputHandle(payload.output);
    const outputText = typeof payload.output === "string" ? payload.output : JSON.stringify(payload.output || "");
    const completed = /Script completed|exit_code|terminated|completion result/i.test(outputText);
    if (inputHandle && (completed || !nextHandle)) active.delete(inputHandle);
    if (nextHandle && !completed) {
      const existing = active.get(nextHandle);
      active.set(nextHandle, {
        id: nextHandle,
        label: existing?.label || terminalLabel(call),
        startedAt: existing?.startedAt || call.at
      });
    }
  }
  return { running: active.size, entries: [...active.values()].slice(0, 4), fidelity: "inferred" };
}
function permissionDetails(metadata, turn) {
  const profile = turn.permission_profile;
  return {
    approval: boundedText(turn.approval_policy || metadata.approvalMode, 24),
    reviewer: boundedText(turn.approvals_reviewer, 24),
    profile: boundedText(
      typeof profile === "string" ? profile : profile?.type || profile?.name,
      24
    ),
    sandbox: boundedText(
      turn.sandbox_policy?.type || turn.sandbox_policy || metadata.sandboxPolicy,
      24
    )
  };
}
function inputAsText(input) {
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input);
  } catch {
    return "";
  }
}
function isUserInputCall(call) {
  return /request[_-]?user[_-]?input/i.test(call.name);
}
function isApprovalCall(call) {
  if (!/exec|command|shell/i.test(call.name)) return false;
  const input = inputAsText(call.input);
  return /require_escalated|requestApproval|sandbox_permissions[^\n]{0,80}(escalat|outside)|ask_for_approval/i.test(
    input
  );
}
function lifecycle(events) {
  let startedAt = 0;
  let completedAt = 0;
  let failedAt = 0;
  for (const event of events) {
    const payload = event?.payload || {};
    const at = eventTime(event);
    if (event.type === "event_msg" && payload.type === "task_started") {
      startedAt = Math.max(startedAt, toMillis(payload.started_at) || at);
    }
    if (event.type === "event_msg" && payload.type === "task_complete") {
      completedAt = Math.max(completedAt, toMillis(payload.completed_at) || at);
    }
    if (event.type === "event_msg" && payload.type === "turn_aborted" || event.type === "event_msg" && payload.type === "task_failed" || event.type === "event_msg" && payload.type === "error") {
      failedAt = Math.max(failedAt, at);
    }
  }
  return { startedAt, completedAt, failedAt };
}
function sourceDetails(metadata) {
  let source = metadata?.source;
  if (typeof source === "string" && source.trim().startsWith("{")) {
    try {
      source = JSON.parse(source);
    } catch {
    }
  }
  const spawned = source?.subagent?.thread_spawn || source?.subagent?.threadSpawn || null;
  return {
    parentId: metadata?.parentId || spawned?.parent_thread_id || null,
    agentPath: metadata?.agentPath || spawned?.agent_path || null,
    nickname: metadata?.agentNickname || spawned?.agent_nickname || null,
    role: metadata?.agentRole || spawned?.agent_role || null
  };
}
function statusFor({ events, nowMs, options }) {
  const pending = pendingCalls(events);
  const waitingUser = pending.filter(isUserInputCall).sort((a, b) => b.at - a.at)[0];
  if (waitingUser) return { status: "waiting_user", statusSince: waitingUser.at };
  const waitingApproval = pending.filter(isApprovalCall).filter((call) => nowMs - call.at >= options.approvalGraceMs).sort((a, b) => b.at - a.at)[0];
  if (waitingApproval) return { status: "waiting_approval", statusSince: waitingApproval.at };
  const life = lifecycle(events);
  const terminalAt = Math.max(life.completedAt, life.failedAt);
  if (life.failedAt >= life.completedAt && life.failedAt > life.startedAt) {
    return nowMs - life.failedAt <= options.recentFailureMs ? { status: "failed", statusSince: life.failedAt } : { status: "inactive", statusSince: life.failedAt };
  }
  if (life.startedAt > terminalAt) {
    const lastActivityAt = events.reduce((max, event) => Math.max(max, eventTime(event)), 0);
    const age = nowMs - lastActivityAt;
    if (age <= options.workingFreshMs) return { status: "working", statusSince: life.startedAt };
    if (age <= options.quietVisibleMs)
      return { status: "quiet", statusSince: lastActivityAt || life.startedAt };
    return { status: "inactive", statusSince: lastActivityAt || life.startedAt };
  }
  if (life.completedAt && nowMs - life.completedAt <= options.recentCompletionMs) {
    return { status: "completed_recent", statusSince: life.completedAt };
  }
  return { status: "inactive", statusSince: terminalAt || life.startedAt || 0 };
}
function classifyThread({
  metadata = {},
  events = [],
  now = Date.now(),
  options = {},
  source = {}
}) {
  const nowMs = toMillis(now) || Date.now();
  const classifierOptions = { ...DEFAULT_CLASSIFIER_OPTIONS, ...options };
  const ordered = [...events].sort((a, b) => eventTime(a) - eventTime(b));
  const lastActivityAt = ordered.reduce((max, event) => Math.max(max, eventTime(event)), 0) || toMillis(metadata.updatedAt);
  const details = sourceDetails(metadata);
  const cwd = metadata.cwd || "";
  const project = cwd ? path.basename(cwd) : "Codex";
  const fallbackName = details.agentPath ? path.basename(details.agentPath) : project;
  const state = statusFor({ events: ordered, nowMs, options: classifierOptions });
  const turn = latestTurnContext(ordered);
  const provider = source.provider || "codex";
  const sourceId = source.sourceId || "local";
  const sourceKind = source.sourceKind || "local";
  const sourceLabel = source.sourceLabel || "LOCAL";
  const threadId = metadata.id || "";
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
    name: details.nickname || details.role || fallbackName || "Codex",
    project,
    cwd,
    task: latestTaskText(ordered, metadata.preview || metadata.title),
    model: metadata.model || metadata.modelProvider || "",
    effort: metadata.effort || metadata.reasoningEffort || "",
    status: state.status,
    statusSince: state.statusSince,
    lastActivityAt,
    isSubagent: Boolean(details.parentId || details.agentPath),
    agentPath: details.agentPath,
    sourcePath: metadata.sourcePath || null,
    context: contextDetails(ordered, metadata),
    terminals: observedTerminals(ordered),
    subagents: { total: 0, active: 0, waiting: 0, done: 0, children: [] },
    activity: latestActivity(ordered, state.status),
    plan: latestPlan(ordered),
    permissions: permissionDetails(metadata, turn),
    git: { branch: boundedText(metadata.gitBranch, 48) }
  };
}
function enrichAgentRelationships(snapshots) {
  const agents = snapshots.map((agent) => ({
    ...agent,
    subagents: { total: 0, active: 0, waiting: 0, done: 0, children: [] }
  }));
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  for (const child of agents) {
    const parent = child.parentId ? byId.get(child.parentId) : null;
    if (!parent) continue;
    const waiting = ["waiting_user", "waiting_approval"].includes(child.status);
    const active = ["working", "quiet"].includes(child.status);
    parent.subagents.total += 1;
    if (waiting) parent.subagents.waiting += 1;
    else if (active) parent.subagents.active += 1;
    else parent.subagents.done += 1;
    if (parent.subagents.children.length < 8) {
      parent.subagents.children.push({
        id: child.id,
        name: boundedText(child.name, 24),
        status: child.status,
        task: boundedText(child.task, 48)
      });
    }
  }
  return agents;
}
function rankSnapshots(snapshots) {
  return [...snapshots].sort((a, b) => {
    const priority = (STATUS_PRIORITY[b.status] || 0) - (STATUS_PRIORITY[a.status] || 0);
    if (priority) return priority;
    const recency = (b.lastActivityAt || 0) - (a.lastActivityAt || 0);
    if (recency) return recency;
    return String(a.id).localeCompare(String(b.id));
  });
}
function summarizeSnapshots(snapshots) {
  const counts = {
    total: 0,
    active: 0,
    working: 0,
    needsYou: 0,
    quiet: 0,
    failed: 0,
    recent: 0,
    roots: 0,
    subagents: 0,
    terminals: 0,
    contextRisk: 0
  };
  for (const snapshot of snapshots) {
    if (snapshot.status === "inactive") continue;
    counts.total += 1;
    if (["working", "waiting_user", "waiting_approval", "quiet"].includes(snapshot.status))
      counts.active += 1;
    if (snapshot.status === "working") counts.working += 1;
    if (snapshot.status === "waiting_user" || snapshot.status === "waiting_approval")
      counts.needsYou += 1;
    if (snapshot.status === "quiet") counts.quiet += 1;
    if (snapshot.status === "failed") counts.failed += 1;
    if (snapshot.status === "completed_recent") counts.recent += 1;
    if (snapshot.isSubagent) counts.subagents += 1;
    else counts.roots += 1;
    counts.terminals += Number(snapshot.terminals?.running) || 0;
    counts.contextRisk = Math.max(counts.contextRisk, Number(snapshot.context?.percent) || 0);
  }
  return counts;
}

// io.github.1mentat.agentdeck.ulanziPlugin/plugin/codex-observer.js
var execFilePromise = promisify(nodeExecFile);
var DAY_MS = 24 * 60 * 60 * 1e3;
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
        const fullPath = path2.join(dir, entry.name);
        if (entry.isDirectory()) await visit(fullPath, depth + 1);
        else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(fullPath);
      })
    );
  }
  await visit(root, 0);
  return files;
}
function parseLines(text, seen = /* @__PURE__ */ new Set()) {
  const parsed = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    try {
      const value = JSON.parse(trimmed);
      seen.add(trimmed);
      parsed.push(value);
    } catch {
    }
  }
  return parsed;
}
async function readHeadAndTail(filePath, headBytes, tailBytes) {
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    if (stat.size <= headBytes + tailBytes) {
      return { events: parseLines(await handle.readFile({ encoding: "utf8" })), stat };
    }
    const head = Buffer.alloc(headBytes);
    const tail = Buffer.alloc(tailBytes);
    const headRead = await handle.read(head, 0, headBytes, 0);
    const tailStart = Math.max(0, stat.size - tailBytes);
    const tailRead = await handle.read(tail, 0, tailBytes, tailStart);
    const seen = /* @__PURE__ */ new Set();
    const headEvents = parseLines(head.subarray(0, headRead.bytesRead).toString("utf8"), seen);
    let tailText = tail.subarray(0, tailRead.bytesRead).toString("utf8");
    const firstNewline = tailText.indexOf("\n");
    if (tailStart > 0 && firstNewline >= 0) tailText = tailText.slice(firstNewline + 1);
    return { events: [...headEvents, ...parseLines(tailText, seen)], stat };
  } finally {
    await handle.close();
  }
}
function threadIdFromPath(filePath) {
  return path2.basename(filePath).match(/([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/i)?.[1] || "";
}
function firstSessionMetadata(events, expectedId) {
  const candidates = events.filter((event) => event?.type === "session_meta" && event.payload).map((event) => event.payload);
  return candidates.find((payload) => payload.id === expectedId) || candidates[0] || {};
}
function latestTurnContext2(events) {
  return [...events].reverse().find((event) => event?.type === "turn_context")?.payload || {};
}
function normalizeDbSource(source) {
  if (typeof source !== "string") return source;
  try {
    return JSON.parse(source);
  } catch {
    return source;
  }
}
async function loadSqliteMetadata({ codexHome, cutoffSeconds, execFile }) {
  const dbPath = path2.join(codexHome, "state_5.sqlite");
  try {
    await fs.access(dbPath);
  } catch {
    return /* @__PURE__ */ new Map();
  }
  const sql = [
    "SELECT id, cwd, model, reasoning_effort, agent_nickname, agent_role,",
    "source, updated_at, preview, rollout_path, tokens_used, git_branch, sandbox_policy, approval_mode",
    "FROM threads",
    `WHERE archived = 0 AND updated_at >= ${Math.floor(cutoffSeconds)}`,
    "ORDER BY updated_at DESC LIMIT 200;"
  ].join(" ");
  const { stdout } = await execFile("sqlite3", ["-json", dbPath, sql], {
    maxBuffer: 4 * 1024 * 1024
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
        approvalMode: row.approval_mode
      }
    ])
  );
}
function metadataFor({ filePath, events, dbMetadata }) {
  const id = threadIdFromPath(filePath);
  const session = firstSessionMetadata(events, id);
  const turn = latestTurnContext2(events);
  return {
    ...dbMetadata.get(id) || {},
    id: id || session.id,
    cwd: session.cwd || dbMetadata.get(id)?.cwd,
    source: session.source ?? dbMetadata.get(id)?.source,
    modelProvider: session.model_provider,
    model: turn.model || dbMetadata.get(id)?.model,
    effort: turn.effort || dbMetadata.get(id)?.effort,
    preview: dbMetadata.get(id)?.preview,
    sourcePath: filePath
  };
}
function createCodexObserver({
  codexHome = process.env.CODEX_HOME || path2.join(os.homedir(), ".codex"),
  now = () => Date.now(),
  execFile = execFilePromise,
  lookbackDays = 3,
  maxFiles = 120,
  headBytes = 256 * 1024,
  tailBytes = 768 * 1024,
  classifierOptions = {},
  source = {}
} = {}) {
  return {
    async scan() {
      const scannedAt = now();
      const warnings = [];
      const sessionsRoot = path2.join(codexHome, "sessions");
      const cutoffMs = scannedAt - lookbackDays * DAY_MS;
      let dbMetadata = /* @__PURE__ */ new Map();
      try {
        dbMetadata = await loadSqliteMetadata({
          codexHome,
          cutoffSeconds: cutoffMs / 1e3,
          execFile
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
              source
            })
          );
        } catch (error) {
          warnings.push(`${path2.basename(candidate.filePath)}: ${error.message}`);
        }
      }
      const agents = rankSnapshots(enrichAgentRelationships(snapshots));
      return { agents, counts: summarizeSnapshots(agents), scannedAt, warnings };
    }
  };
}

// io.github.1mentat.agentdeck.ulanziPlugin/plugin/remote-probe-entry.js
var SCHEMA_VERSION = 2;
var MAX_WARNINGS = 20;
var MAX_WARNING_LENGTH = 300;
function publicAgent(agent) {
  return {
    threadId: agent.threadId,
    parentThreadId: agent.parentThreadId,
    name: agent.name,
    project: agent.project,
    cwd: agent.cwd,
    task: agent.task,
    model: agent.model,
    effort: agent.effort,
    status: agent.status,
    statusSince: agent.statusSince,
    lastActivityAt: agent.lastActivityAt,
    isSubagent: agent.isSubagent,
    context: agent.context,
    terminals: {
      running: agent.terminals?.running || 0,
      fidelity: "inferred",
      entries: (agent.terminals?.entries || []).slice(0, 4).map((entry) => ({
        label: String(entry.label || "COMMAND").slice(0, 18),
        startedAt: entry.startedAt || 0
      }))
    },
    subagents: {
      total: agent.subagents?.total || 0,
      active: agent.subagents?.active || 0,
      waiting: agent.subagents?.waiting || 0,
      done: agent.subagents?.done || 0,
      children: (agent.subagents?.children || []).slice(0, 8).map((child) => ({
        name: String(child.name || "Subagent").slice(0, 24),
        status: child.status,
        task: String(child.task || "").slice(0, 48)
      }))
    },
    activity: agent.activity,
    plan: agent.plan,
    permissions: agent.permissions,
    git: agent.git
  };
}
async function main() {
  const major = Number(process2.versions.node.split(".")[0]);
  if (!Number.isFinite(major) || major < 20) {
    throw new Error("AGENT_DECK_NODE_UNSUPPORTED: Node.js 20 or later is required");
  }
  const dashboard = await createCodexObserver().scan();
  const envelope = {
    schemaVersion: SCHEMA_VERSION,
    provider: "codex",
    scannedAt: dashboard.scannedAt,
    agents: dashboard.agents.map(publicAgent),
    counts: dashboard.counts,
    warnings: dashboard.warnings.slice(0, MAX_WARNINGS).map((warning) => String(warning).slice(0, MAX_WARNING_LENGTH))
  };
  process2.stdout.write(JSON.stringify(envelope));
}
main().catch((error) => {
  process2.stderr.write(
    `agent-deck probe failed: ${String(error?.message || error).slice(0, 500)}
`
  );
  process2.exitCode = 1;
});
