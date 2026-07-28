(function () {
  const listeners = new Map();
  const params = new URLSearchParams(window.location.search);
  const address = params.get('address') || '127.0.0.1';
  const port = params.get('port') || '3906';
  const target = {
    uuid: params.get('uuid') || '',
    key: params.get('key') || '',
    actionid: params.get('actionid') || '',
  };
  let socket;

  function emit(name, value) {
    for (const listener of listeners.get(name) || []) listener(value);
  }

  function send(cmd, extra) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ cmd, ...target, ...(extra || {}) }));
  }

  window.AgentDeckPI = {
    connect() {
      socket = new WebSocket(`ws://${address}:${port}`);
      socket.addEventListener('open', () => {
        send('connected', { code: 0 });
        emit('connected', {});
      });
      socket.addEventListener('message', (event) => {
        let value;
        try {
          value = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!value || (value.code !== undefined && value.cmdType !== 'REQUEST')) return;
        emit(value.cmd, value);
      });
    },
    on(name, listener) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(listener);
    },
    getSettings() {
      send('getSettings');
    },
    setSettings(settings) {
      send('setSettings', { settings });
    },
    initialParam() {
      try {
        return JSON.parse(params.get('param') || 'null');
      } catch {
        return null;
      }
    },
    actionUuid() {
      return target.uuid;
    },
  };
})();
