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
  const isAgentSlot = api.actionUuid().endsWith('.agentslot');
  const hostPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
  let loaded = false;
  let saveTimer = null;

  function populate(settings) {
    const value = settings && typeof settings === 'object' ? settings : {};
    if (document.activeElement !== slot) slot.value = String(value.slot || 1);
    if (document.activeElement !== projectFilter) projectFilter.value = value.projectFilter || '';
    if (document.activeElement !== sourceMode) sourceMode.value = value.sourceMode || 'local';
    if (document.activeElement !== sshHost) sshHost.value = value.sshHost || '';
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
    api.setSettings(settings);
  }

  function debounceSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 250);
  }

  api.on('connected', () => {
    agentFields.hidden = !isAgentSlot;
    title.textContent = isAgentSlot ? 'Agent Slot' : 'Agent Deck';
    if (!isAgentSlot) {
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
  api.connect();
})();
