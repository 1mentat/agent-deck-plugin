import process from 'node:process';
import { createCodexObserver } from './codex-observer.js';

const SCHEMA_VERSION = 1;
const MAX_WARNINGS = 20;
const MAX_WARNING_LENGTH = 300;

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
  };
}

async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(major) || major < 20) {
    throw new Error('AGENT_DECK_NODE_UNSUPPORTED: Node.js 20 or later is required');
  }
  const dashboard = await createCodexObserver().scan();
  const envelope = {
    schemaVersion: SCHEMA_VERSION,
    provider: 'codex',
    scannedAt: dashboard.scannedAt,
    agents: dashboard.agents.map(publicAgent),
    counts: dashboard.counts,
    warnings: dashboard.warnings
      .slice(0, MAX_WARNINGS)
      .map((warning) => String(warning).slice(0, MAX_WARNING_LENGTH)),
  };
  process.stdout.write(JSON.stringify(envelope));
}

main().catch((error) => {
  process.stderr.write(
    `agent-deck probe failed: ${String(error?.message || error).slice(0, 500)}\n`,
  );
  process.exitCode = 1;
});
