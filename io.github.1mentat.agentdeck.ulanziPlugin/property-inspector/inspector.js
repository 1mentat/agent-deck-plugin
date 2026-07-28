(function () {
  const api = window.AgentDeckPI;
  const panel = document.getElementById('panel');
  const title = document.getElementById('title');
  const help = document.getElementById('help');
  const slot = document.getElementById('slot');
  const projectFilter = document.getElementById('projectFilter');
  const sourceMode = document.getElementById('sourceMode');
  const sshHost = document.getElementById('sshHost');
  const sshError = document.getElementById('sshError');
  const agentFields = document.getElementById('agentFields');
  const dashboardFields = document.getElementById('dashboardFields');
  const dashboardGroup = document.getElementById('dashboardGroup');
  const dashboardProjectFilter = document.getElementById('dashboardProjectFilter');
  const contextWarningPercent = document.getElementById('contextWarningPercent');
  const showTask = document.getElementById('showTask');
  const isAgentSlot = api.actionUuid().endsWith('.agentslot');
  const isDashboard = api.actionUuid().endsWith('.dashboard');
  const hostPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
  let loaded = false;
  let saveTimer = null;

  function populate(settings) {
    const value = settings && typeof settings === 'object' ? settings : {};
    if (document.activeElement !== slot) slot.value = String(value.slot || 1);
    if (document.activeElement !== projectFilter) projectFilter.value = value.projectFilter || '';
    if (document.activeElement !== sourceMode) sourceMode.value = value.sourceMode || 'local';
    if (document.activeElement !== sshHost) sshHost.value = value.sshHost || '';
    if (document.activeElement !== dashboardGroup) {
      dashboardGroup.value = value.dashboardGroup || 'main';
    }
    if (document.activeElement !== dashboardProjectFilter) {
      dashboardProjectFilter.value = value.projectFilter || '';
    }
    if (document.activeElement !== contextWarningPercent) {
      contextWarningPercent.value = String(value.contextWarningPercent || 80);
    }
    if (document.activeElement !== showTask) {
      showTask.value = value.showTask === false ? 'false' : 'true';
    }
    updateHostState();
  }

  function updateHostState() {
    const requiresHost = sourceMode.value !== 'local';
    sshHost.disabled = !requiresHost;
    sshError.hidden = true;
  }

  function save() {
    if (!loaded) return;
    const host = sshHost.value.trim();
    if (sourceMode.value !== 'local' && !hostPattern.test(host)) {
      sshError.textContent =
        'Enter one SSH config alias using letters, numbers, dot, dash, or underscore.';
      sshError.hidden = false;
      return;
    }
    sshError.hidden = true;
    const settings = { sourceMode: sourceMode.value, sshHost: host };
    if (isAgentSlot) {
      settings.slot = Math.max(1, Math.min(12, Number(slot.value) || 1));
      settings.projectFilter = projectFilter.value.trim();
    }
    if (isDashboard) {
      settings.dashboardGroup = dashboardGroup.value.trim().slice(0, 32) || 'main';
      settings.dashboardRevision = Date.now();
      settings.projectFilter = dashboardProjectFilter.value.trim();
      settings.contextWarningPercent = Math.max(
        50,
        Math.min(95, Number(contextWarningPercent.value) || 80),
      );
      settings.showTask = showTask.value !== 'false';
    }
    api.setSettings(settings);
  }

  function debounceSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 250);
  }

  api.on('connected', () => {
    agentFields.hidden = !isAgentSlot;
    dashboardFields.hidden = !isDashboard;
    title.textContent = isAgentSlot ? 'Agent Slot' : isDashboard ? 'Dashboard Tile' : 'Agent Deck';
    if (isDashboard) {
      help.textContent =
        'Fill all 13 usable positions on one page with Dashboard Tile. Settings from the last configured tile control the visible group; presses change only the read-only dashboard view.';
    } else if (!isAgentSlot) {
      help.textContent =
        'The action is read-only. All sources combines this Mac with the configured SSH host.';
    }
    const initial = api.initialParam();
    if (initial) populate(initial);
    api.getSettings();
    panel.hidden = false;
    setTimeout(() => {
      loaded = true;
    }, 500);
  });
  api.on('didReceiveSettings', (message) => {
    populate(message.settings || message.param || {});
    loaded = true;
  });
  slot.addEventListener('change', save);
  projectFilter.addEventListener('input', debounceSave);
  sourceMode.addEventListener('change', () => {
    updateHostState();
    save();
  });
  sshHost.addEventListener('input', debounceSave);
  dashboardGroup.addEventListener('input', debounceSave);
  dashboardProjectFilter.addEventListener('input', debounceSave);
  contextWarningPercent.addEventListener('change', save);
  showTask.addEventListener('change', save);
  api.connect();
})();
