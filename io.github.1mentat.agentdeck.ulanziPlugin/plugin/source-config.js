export const SOURCE_MODES = Object.freeze({
  local: 'local',
  ssh: 'ssh',
  all: 'local_and_ssh',
});

export const SSH_HOST_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isValidSshHost(value) {
  return SSH_HOST_PATTERN.test(String(value || ''));
}

export function normalizeSourceSettings(settings = {}) {
  const requested = String(settings.sourceMode || SOURCE_MODES.local);
  const sourceMode = Object.values(SOURCE_MODES).includes(requested)
    ? requested
    : SOURCE_MODES.local;
  return {
    ...settings,
    sourceMode,
    sshHost: String(settings.sshHost || '').trim(),
  };
}

export function sourceIdForHost(host) {
  return `ssh:${host}`;
}

export function selectedSourceIds(settings = {}) {
  const normalized = normalizeSourceSettings(settings);
  const sourceIds = [];
  if (normalized.sourceMode !== SOURCE_MODES.ssh) sourceIds.push('local');
  if (normalized.sourceMode !== SOURCE_MODES.local && isValidSshHost(normalized.sshHost)) {
    sourceIds.push(sourceIdForHost(normalized.sshHost));
  }
  return sourceIds;
}

export function sourceConfigurationError(settings = {}) {
  const normalized = normalizeSourceSettings(settings);
  if (normalized.sourceMode === SOURCE_MODES.local) return null;
  return isValidSshHost(normalized.sshHost) ? null : 'SET_SSH_HOST';
}
