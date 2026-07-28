const SIZE = 200;
const BG = '#111827';
const PANEL = '#182235';
const TEXT = '#f8fafc';
const MUTED = '#a8b3c7';

import { selectedDashboardAgent, visibleDashboardAgents } from './dashboard-state.js';

const STATUS = Object.freeze({
  working: { color: '#4f8cff', label: 'WORKING', glyph: '●' },
  waiting_user: { color: '#f5b942', label: 'INPUT', glyph: '!' },
  waiting_approval: { color: '#f59e42', label: 'APPROVAL', glyph: '!' },
  completed_recent: { color: '#39d98a', label: 'DONE', glyph: '✓' },
  failed: { color: '#ff5d6c', label: 'FAILED', glyph: '×' },
  quiet: { color: '#8491a7', label: 'QUIET', glyph: '◌' },
  inactive: { color: '#556176', label: 'IDLE', glyph: '·' },
});

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(value, max) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function svg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${body}</svg>`;
}

function dataUrl(document) {
  return `data:image/svg+xml;base64,${Buffer.from(document).toString('base64')}`;
}

function rect(x, y, width, height, fill, radius = 0) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}"/>`;
}

function progressBar(value, color, y = 151) {
  const width = Math.max(0, Math.min(164, Math.round((Number(value) || 0) * 1.64)));
  return [rect(18, y, 164, 18, '#263247', 9), rect(18, y, width, 18, color, 9)].join('');
}

function text(value, x, y, size, options = {}) {
  const { fill = TEXT, weight = 700, anchor = 'middle', letterSpacing = 0 } = options;
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${escapeXml(value)}</text>`;
}

function statusStyle(status) {
  return STATUS[status] || STATUS.inactive;
}

export function formatAge(timestamp, now = Date.now()) {
  if (!timestamp) return '—';
  const delta = Math.max(0, now - timestamp);
  if (delta < 60_000) return `${Math.max(1, Math.floor(delta / 1000))}s`;
  if (delta < 60 * 60_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 24 * 60 * 60_000) return `${Math.floor(delta / (60 * 60_000))}h`;
  return `${Math.floor(delta / (24 * 60 * 60_000))}d`;
}

function emptyCard(title, message, color = '#556176') {
  return dataUrl(
    svg(
      [
        rect(0, 0, SIZE, SIZE, BG),
        rect(0, 0, SIZE, 9, color),
        text(title, 100, 61, 22, { fill: MUTED, letterSpacing: 1 }),
        text('◌', 100, 121, 54, { fill: color }),
        text(message, 100, 165, 18, { fill: MUTED, weight: 600 }),
      ].join(''),
    ),
  );
}

const SOURCE_ERROR_LABELS = Object.freeze({
  SSH_TIMEOUT: 'SSH TIMEOUT',
  HOST_KEY_REQUIRED: 'HOST KEY',
  NODE_UNAVAILABLE: 'NODE NEEDED',
  PROBE_PROTOCOL: 'PROBE ERROR',
  OUTPUT_LIMIT: 'PROBE ERROR',
  SSH_UNAVAILABLE: 'SSH OFFLINE',
});

function sourceIssue(dashboard) {
  if (dashboard?.configurationError) return 'SET SSH HOST';
  if (dashboard?.pendingSources?.length) return 'SSH SCANNING';
  const offline = dashboard?.offlineSources?.[0];
  return offline ? SOURCE_ERROR_LABELS[offline.errorCode] || 'SSH OFFLINE' : null;
}

export function renderLoading() {
  return emptyCard('AGENT DECK', 'SCANNING', '#4f8cff');
}

export function renderOverview(dashboard) {
  const issue = sourceIssue(dashboard);
  const hasOnline = dashboard?.sources?.some((item) => item.status === 'online');
  if (issue && !hasOnline) return emptyCard('AGENT DECK', issue, '#f59e42');
  const counts = dashboard?.counts || {};
  const active = counts.active || 0;
  const needs = counts.needsYou || 0;
  const recent = counts.recent || 0;
  const color = needs
    ? STATUS.waiting_user.color
    : active
      ? STATUS.working.color
      : recent
        ? STATUS.completed_recent.color
        : issue
          ? '#f59e42'
          : '#556176';
  const headline = needs
    ? `${needs} NEEDS YOU`
    : active
      ? `${active} ACTIVE`
      : recent
        ? `${recent} DONE`
        : issue
          ? issue
          : 'ALL CLEAR';

  return dataUrl(
    svg(
      [
        rect(0, 0, SIZE, SIZE, BG),
        rect(0, 0, SIZE, 10, color),
        text('AGENT DECK', 100, 37, 19, { fill: MUTED, letterSpacing: 1.3 }),
        text(String(active), 100, 113, 70, { fill: color }),
        text(headline, 100, 142, 18, { fill: TEXT, letterSpacing: 0.5 }),
        issue && (active || recent)
          ? text(issue, 100, 157, 10, { fill: '#f59e42', letterSpacing: 0.5 })
          : '',
        rect(18, issue ? 165 : 160, 50, issue ? 21 : 26, PANEL, 8),
        rect(75, issue ? 165 : 160, 50, issue ? 21 : 26, PANEL, 8),
        rect(132, issue ? 165 : 160, 50, issue ? 21 : 26, PANEL, 8),
        text(`▶ ${counts.working || 0}`, 43, 179, 15, { fill: STATUS.working.color }),
        text(`! ${needs}`, 100, 179, 15, { fill: STATUS.waiting_user.color }),
        text(`✓ ${recent}`, 157, 179, 15, { fill: STATUS.completed_recent.color }),
      ].join(''),
    ),
  );
}

export function renderNeedsYou(dashboard) {
  const agent = dashboard?.agents?.find(
    (item) => item.status === 'waiting_user' || item.status === 'waiting_approval',
  );
  if (!agent) {
    const issue = sourceIssue(dashboard);
    return emptyCard(
      'NEEDS YOU',
      issue || 'QUEUE CLEAR',
      issue ? '#f59e42' : STATUS.completed_recent.color,
    );
  }
  const style = statusStyle(agent.status);
  return dataUrl(
    svg(
      [
        rect(0, 0, SIZE, SIZE, '#241d13'),
        rect(0, 0, SIZE, 12, style.color),
        `<circle cx="100" cy="61" r="28" fill="${style.color}"/>`,
        text('!', 100, 75, 42, { fill: '#241d13' }),
        text(agent.status === 'waiting_approval' ? 'APPROVAL' : 'INPUT NEEDED', 100, 112, 19, {
          fill: style.color,
          letterSpacing: 0.7,
        }),
        text(truncate(agent.name, 15), 100, 141, 25),
        text(truncate(agent.task, 21), 100, 170, 15, { fill: MUTED, weight: 600 }),
        text(formatAge(agent.statusSince, dashboard.scannedAt), 181, 190, 13, {
          fill: MUTED,
          anchor: 'end',
          weight: 600,
        }),
      ].join(''),
    ),
  );
}

export function renderAgent(agent, { rank = 1, now = Date.now(), dashboard } = {}) {
  if (!agent) return emptyCard(`AGENT ${rank}`, sourceIssue(dashboard) || 'NO SESSION');
  const style = statusStyle(agent.status);
  const effort = String(agent.effort || '').toUpperCase();
  const effortBadge = effort ? truncate(effort, 5) : '—';
  const source = truncate(agent.sourceLabel || 'LOCAL', 10).toUpperCase();
  const identity = agent.isSubagent ? 'SUB' : truncate(agent.project, 10).toUpperCase();
  const prefix = truncate(`${identity} · ${source}`, 20);
  return dataUrl(
    svg(
      [
        rect(0, 0, SIZE, SIZE, BG),
        rect(0, 0, SIZE, 11, style.color),
        text(prefix, 16, 35, 14, { fill: MUTED, anchor: 'start', letterSpacing: 0.8 }),
        text(`#${rank}`, 184, 35, 14, { fill: MUTED, anchor: 'end' }),
        text(truncate(agent.name, 16), 16, 73, 27, { anchor: 'start' }),
        text(truncate(agent.task, 23), 16, 102, 15, { fill: MUTED, anchor: 'start', weight: 600 }),
        text(truncate(agent.task.slice(23), 23), 16, 122, 15, {
          fill: MUTED,
          anchor: 'start',
          weight: 600,
        }),
        rect(15, 142, 112, 36, '#202b3e', 10),
        text(style.glyph, 32, 168, 22, { fill: style.color }),
        text(style.label, 47, 166, 15, { fill: style.color, anchor: 'start', letterSpacing: 0.5 }),
        rect(135, 142, 50, 36, '#202b3e', 10),
        text(effortBadge, 160, 166, 14, { fill: TEXT }),
        text(formatAge(agent.statusSince || agent.lastActivityAt, now), 184, 193, 13, {
          fill: MUTED,
          anchor: 'end',
          weight: 600,
        }),
      ].join(''),
    ),
  );
}

export function renderRecent(dashboard) {
  const agent = dashboard?.agents?.find((item) => item.status === 'completed_recent');
  if (!agent) return emptyCard('RECENT', sourceIssue(dashboard) || 'NOTHING YET');
  return dataUrl(
    svg(
      [
        rect(0, 0, SIZE, SIZE, '#10241d'),
        rect(0, 0, SIZE, 11, STATUS.completed_recent.color),
        text('RECENTLY DONE', 100, 38, 18, {
          fill: STATUS.completed_recent.color,
          letterSpacing: 0.8,
        }),
        text('✓', 100, 103, 61, { fill: STATUS.completed_recent.color }),
        text(truncate(agent.name, 16), 100, 137, 24),
        text(truncate(agent.task, 23), 100, 166, 15, { fill: MUTED, weight: 600 }),
        text(formatAge(agent.statusSince, dashboard.scannedAt), 181, 190, 13, {
          fill: MUTED,
          anchor: 'end',
          weight: 600,
        }),
      ].join(''),
    ),
  );
}

function formatTokens(value) {
  const number = Math.max(0, Number(value) || 0);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}m`;
  if (number >= 1000) return `${Math.round(number / 1000)}k`;
  return String(number);
}

function metricTile(title, value, subtitle, color = STATUS.working.color, options = {}) {
  return dataUrl(
    svg(
      [
        rect(0, 0, SIZE, SIZE, BG),
        rect(0, 0, SIZE, 10, color),
        text(title, 100, 42, 18, { fill: MUTED, letterSpacing: 1 }),
        text(value, 100, 119, options.valueSize || 60, { fill: color }),
        text(truncate(subtitle, 22), 100, 164, 16, { fill: TEXT, weight: 600 }),
        options.footer ? text(options.footer, 100, 190, 12, { fill: MUTED, weight: 600 }) : '',
      ].join(''),
    ),
  );
}

function contextTile(agent, dashboard, settings = {}) {
  const context = agent?.context || {};
  if (!context.windowTokens) return emptyCard('CONTEXT', agent ? 'NOT RECORDED' : 'NO SESSION');
  const percent = context.percent || 0;
  const warning = Math.max(50, Math.min(95, Number(settings.contextWarningPercent) || 80));
  const color =
    percent >= warning ? STATUS.failed.color : percent >= warning - 20 ? '#f5b942' : '#39d98a';
  return dataUrl(
    svg(
      [
        rect(0, 0, SIZE, SIZE, BG),
        rect(0, 0, SIZE, 10, color),
        text('CONTEXT', 100, 39, 18, { fill: MUTED, letterSpacing: 1 }),
        text(`${percent}%`, 100, 112, 59, { fill: color }),
        text(
          `${formatTokens(context.usedTokens)} / ${formatTokens(context.windowTokens)}`,
          100,
          139,
          16,
          {
            fill: TEXT,
          },
        ),
        progressBar(percent, color),
        text(`${context.compactions || 0} COMPACTIONS`, 100, 190, 12, {
          fill: MUTED,
          weight: 600,
        }),
      ].join(''),
    ),
  );
}

function identityTile(agent, now) {
  if (!agent) return emptyCard('DETAIL', 'SESSION STALE', STATUS.quiet.color);
  const style = statusStyle(agent.status);
  return dataUrl(
    svg(
      [
        rect(0, 0, SIZE, SIZE, BG),
        rect(0, 0, SIZE, 12, style.color),
        text(agent.isSubagent ? 'SUBAGENT' : 'AGENT', 100, 40, 16, {
          fill: MUTED,
          letterSpacing: 1,
        }),
        text(truncate(agent.name, 16), 100, 82, 27),
        text(style.glyph, 54, 137, 32, { fill: style.color }),
        text(style.label, 77, 133, 17, { fill: style.color, anchor: 'start' }),
        text(formatAge(agent.statusSince || agent.lastActivityAt, now), 100, 170, 18, {
          fill: MUTED,
        }),
      ].join(''),
    ),
  );
}

function terminalTile(agent, cursor) {
  if (!agent) return emptyCard('TERMINALS', 'NO SESSION');
  const terminals = agent.terminals || { running: 0, entries: [], fidelity: 'inferred' };
  const entry = terminals.entries?.length
    ? terminals.entries[cursor % terminals.entries.length]
    : null;
  const color = terminals.running ? STATUS.working.color : STATUS.completed_recent.color;
  return metricTile(
    'TERMINALS',
    `${terminals.running || 0}${terminals.fidelity === 'inferred' ? '~' : ''}`,
    entry?.label || 'NONE OBSERVED',
    color,
    {
      footer: entry ? `${formatAge(entry.startedAt)} · TAP TO CYCLE` : 'PASSIVE OBSERVATION',
    },
  );
}

function subagentTile(agent, cursor) {
  if (!agent) return emptyCard('SUBAGENTS', 'NO SESSION');
  const details = agent.subagents || {};
  const child = details.children?.length
    ? details.children[cursor % details.children.length]
    : null;
  const color = details.waiting
    ? STATUS.waiting_user.color
    : details.active
      ? STATUS.working.color
      : STATUS.completed_recent.color;
  return metricTile('SUBAGENTS', String(details.total || 0), child?.name || 'NO CHILDREN', color, {
    footer: `${details.active || 0} ACTIVE · ${details.waiting || 0} WAIT`,
  });
}

function textTile(title, headline, lines = [], color = STATUS.working.color) {
  return dataUrl(
    svg(
      [
        rect(0, 0, SIZE, SIZE, BG),
        rect(0, 0, SIZE, 10, color),
        text(title, 16, 38, 17, { fill: MUTED, anchor: 'start', letterSpacing: 0.8 }),
        text(truncate(headline, 17), 16, 78, 25, { anchor: 'start' }),
        ...lines.slice(0, 4).map((line, index) =>
          text(truncate(line, 23), 16, 111 + index * 22, 14, {
            fill: MUTED,
            anchor: 'start',
            weight: 600,
          }),
        ),
      ].join(''),
    ),
  );
}

export function renderDashboardTile({ role, dashboard, state, settings = {}, now } = {}) {
  const currentTime = now || dashboard?.scannedAt || Date.now();
  const agent = selectedDashboardAgent(dashboard, state);
  if (state?.mode !== 'detail') {
    const agents = visibleDashboardAgents(dashboard, state);
    if (role.kind === 'agent') {
      return renderAgent(agents[(role.rank || 1) - 1], {
        rank: role.rank,
        now: currentTime,
        dashboard,
      });
    }
    if (role.kind === 'fleet') {
      const counts = dashboard?.counts || {};
      return metricTile(
        state?.filter === 'all' ? 'FLEET' : `FILTER: ${String(state?.filter).toUpperCase()}`,
        String(counts.active || 0),
        `${counts.roots || 0} ROOT · ${counts.subagents || 0} SUB`,
        counts.needsYou ? STATUS.waiting_user.color : STATUS.working.color,
        { footer: `${counts.failed || 0} FAILED · ${counts.recent || 0} DONE` },
      );
    }
    if (role.kind === 'needs') return renderNeedsYou(dashboard);
    if (role.kind === 'context') {
      const fullest = [...agents].sort(
        (a, b) => (b.context?.percent || 0) - (a.context?.percent || 0),
      )[0];
      return contextTile(fullest, dashboard, settings);
    }
    if (role.kind === 'terminals') {
      return metricTile(
        'TERMINALS',
        `${dashboard?.counts?.terminals || 0}~`,
        state?.filter === 'terminals' ? 'FILTER ACTIVE' : 'OBSERVED RUNNING',
        dashboard?.counts?.terminals ? STATUS.working.color : STATUS.completed_recent.color,
        { footer: 'TAP TO FILTER' },
      );
    }
    if (role.kind === 'scope') {
      const mode = state?.sourceModeOverride || settings.sourceMode || 'local';
      const label = mode === 'local_and_ssh' ? 'ALL' : mode === 'ssh' ? 'SSH' : 'LOCAL';
      return metricTile('SCOPE', label, 'TAP TO CHANGE', '#9b7cff', { valueSize: 39 });
    }
  }

  if (role.kind === 'back') return metricTile('DETAIL', '←', 'BACK TO FLEET', '#9b7cff');
  if (role.kind === 'identity') return identityTile(agent, currentTime);
  if (role.kind === 'context') return contextTile(agent, dashboard, settings);
  if (role.kind === 'terminals') return terminalTile(agent, state?.terminalCursor || 0);
  if (role.kind === 'subagents') return subagentTile(agent, state?.subagentCursor || 0);
  if (!agent) return emptyCard('DETAIL', 'SESSION STALE', STATUS.quiet.color);
  if (role.kind === 'task') {
    const task = settings.showTask === false ? 'TASK HIDDEN' : agent.task;
    return textTile('TASK', task, [task?.slice(17) || '', agent.plan?.current || '']);
  }
  if (role.kind === 'activity') {
    return textTile('ACTIVITY', agent.activity?.label || 'UNKNOWN', [
      agent.activity?.kind || '',
      formatAge(agent.activity?.since, currentTime),
    ]);
  }
  if (role.kind === 'plan') {
    const plan = agent.plan || {};
    return metricTile(
      'PLAN / MODEL',
      plan.total ? `${plan.completed}/${plan.total}` : '—',
      `${agent.model || 'MODEL'} · ${agent.effort || '—'}`,
      '#9b7cff',
      { valueSize: 42, footer: plan.current || 'NO PLAN RECORDED' },
    );
  }
  if (role.kind === 'source') {
    return textTile('SOURCE / REPO', agent.sourceLabel || 'LOCAL', [
      agent.project,
      agent.git?.branch || 'NO BRANCH',
    ]);
  }
  if (role.kind === 'status') {
    const style = statusStyle(agent.status);
    return textTile(
      'RUNTIME',
      style.label,
      [
        agent.permissions?.profile || agent.permissions?.sandbox || 'DEFAULT POLICY',
        agent.permissions?.approval || '',
        `${agent.context?.compactions || 0} COMPACTIONS`,
      ],
      style.color,
    );
  }
  if (role.kind === 'previous') return metricTile('AGENT', '‹', 'PREVIOUS', '#9b7cff');
  if (role.kind === 'next') return metricTile('AGENT', '›', 'NEXT', '#9b7cff');
  if (role.kind === 'pin') {
    return metricTile(
      state?.pinned ? 'PINNED' : 'FOLLOWING',
      state?.pinned ? '◆' : '◇',
      'TAP TO TOGGLE',
      state?.pinned ? '#f5b942' : STATUS.working.color,
      { valueSize: 48 },
    );
  }
  return emptyCard('AGENT DECK', 'UNASSIGNED TILE');
}
