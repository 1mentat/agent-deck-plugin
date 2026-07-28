const SIZE = 200;
const BG = '#111827';
const PANEL = '#182235';
const TEXT = '#f8fafc';
const MUTED = '#a8b3c7';

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
