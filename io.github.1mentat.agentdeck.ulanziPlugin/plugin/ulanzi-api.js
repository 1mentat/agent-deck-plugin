import EventEmitter from 'node:events';
import WebSocket from 'ws';

const EVENTS = Object.freeze({
  connected: 'connected',
  add: 'add',
  run: 'run',
  setactive: 'setactive',
  clear: 'clear',
  didReceiveSettings: 'didReceiveSettings',
  paramfromapp: 'paramfromapp',
  paramfromplugin: 'paramfromplugin',
});

export default class UlanziApi extends EventEmitter {
  constructor() {
    super();
    this.websocket = null;
    this.uuid = '';
    this.key = '';
    this.actionid = '';
  }

  connect(uuid, defaultPort = 3906, defaultAddress = '127.0.0.1') {
    const [addressArg, portArg] = process.argv.slice(2);
    const address = addressArg || defaultAddress;
    const port = portArg || defaultPort;
    this.uuid = uuid;
    this.websocket = new WebSocket(`ws://${address}:${port}`);

    this.websocket.on('open', () => {
      this.websocket.send(JSON.stringify({ code: 0, cmd: EVENTS.connected, uuid: this.uuid }));
      this.emit(EVENTS.connected, {});
    });
    this.websocket.on('error', (error) => this.emit('error', error));
    this.websocket.on('close', () => this.emit('close'));
    this.websocket.on('message', (raw) => this.handleMessage(raw));
  }

  handleMessage(raw) {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!data || (data.code !== undefined && data.cmdType !== 'REQUEST')) return;
    if (!this.key && data.uuid === this.uuid && data.key) this.key = data.key;
    if (!this.actionid && data.uuid === this.uuid && data.actionid) this.actionid = data.actionid;

    this.send(data.cmd, { code: 0, ...data });
    if (data.cmd === EVENTS.clear && Array.isArray(data.param)) {
      for (const item of data.param) item.context = this.encodeContext(item);
    } else {
      data.context = this.encodeContext(data);
    }
    this.emit(data.cmd, data);
  }

  encodeContext(value) {
    return `${value.uuid || ''}___${value.key || ''}___${value.actionid || ''}`;
  }

  decodeContext(context) {
    const [uuid = '', key = '', actionid = ''] = String(context || '').split('___');
    return { uuid, key, actionid };
  }

  send(cmd, params = {}) {
    if (this.websocket?.readyState !== WebSocket.OPEN) return;
    this.websocket.send(
      JSON.stringify({
        cmd,
        uuid: this.uuid,
        key: this.key,
        actionid: this.actionid,
        ...params,
      }),
    );
  }

  withContext(context, values = {}) {
    const decoded = this.decodeContext(context);
    return {
      uuid: decoded.uuid || this.uuid,
      key: decoded.key || this.key,
      actionid: decoded.actionid || this.actionid,
      ...values,
    };
  }

  setBaseDataIcon(context, data) {
    const target = this.withContext(context);
    this.send('state', {
      param: {
        statelist: [{ ...target, type: 1, data, textData: '', showtext: false }],
      },
    });
  }

  getSettings(context) {
    this.send('getSettings', this.withContext(context));
  }

  setSettings(settings, context) {
    this.send('setSettings', this.withContext(context, { settings }));
  }

  onConnected(fn) {
    this.on(EVENTS.connected, fn);
    return this;
  }
  onAdd(fn) {
    this.on(EVENTS.add, fn);
    return this;
  }
  onRun(fn) {
    this.on(EVENTS.run, fn);
    return this;
  }
  onSetActive(fn) {
    this.on(EVENTS.setactive, fn);
    return this;
  }
  onClear(fn) {
    this.on(EVENTS.clear, fn);
    return this;
  }
  onDidReceiveSettings(fn) {
    this.on(EVENTS.didReceiveSettings, fn);
    return this;
  }
  onParamFromApp(fn) {
    this.on(EVENTS.paramfromapp, fn);
    return this;
  }
  onParamFromPlugin(fn) {
    this.on(EVENTS.paramfromplugin, fn);
    return this;
  }
}
