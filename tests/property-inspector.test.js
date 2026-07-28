import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const directory = 'io.github.1mentat.agentdeck.ulanziPlugin/property-inspector';

test('property inspector presents Scope without embedding a host default', async () => {
  const [html, script] = await Promise.all([
    fs.readFile(`${directory}/inspector.html`, 'utf8'),
    fs.readFile(`${directory}/inspector.js`, 'utf8'),
  ]);
  assert.match(html, />Scope</);
  assert.match(html, />All sources</);
  assert.match(html, />This Mac</);
  assert.match(html, />Host via SSH</);
  assert.match(html, /placeholder="SSH config alias"/);
  assert.match(script, /sourceMode: sourceMode\.value, sshHost: host/);
  assert.match(script, /\^\[A-Za-z0-9\]/);
  assert.match(html, /Dashboard group/);
  assert.match(html, /Context warning/);
  assert.match(html, /Show sanitized task/);
  assert.match(script, /isDashboard/);
  assert.match(script, /settings\.dashboardRevision = Date\.now\(\)/);
});

test('property inspector saves an SSH alias while scope remains local', async () => {
  const script = await fs.readFile(`${directory}/inspector.js`, 'utf8');
  const listeners = new Map();
  const elements = new Map();
  const element = (id, value = '') => {
    const item = {
      id,
      value,
      hidden: false,
      disabled: false,
      textContent: '',
      addEventListener(event, handler) {
        listeners.set(`${id}:${event}`, handler);
      },
    };
    elements.set(id, item);
    return item;
  };
  element('panel');
  element('title');
  element('help');
  element('slot', '1');
  element('projectFilter');
  const sourceMode = element('sourceMode', 'local');
  const sshHost = element('sshHost');
  element('sshError');
  element('agentFields');
  element('dashboardFields');
  element('dashboardGroup', 'main');
  element('dashboardProjectFilter');
  element('contextWarningPercent', '80');
  element('showTask', 'true');

  const handlers = new Map();
  const saved = [];
  const api = {
    actionUuid: () => 'io.github.1mentat.agentdeck.ulanzi.dashboard',
    initialParam: () => null,
    getSettings() {},
    setSettings(settings) {
      saved.push(settings);
    },
    on(event, handler) {
      handlers.set(event, handler);
    },
    connect() {
      handlers.get('connected')();
    },
  };
  vm.runInNewContext(script, {
    window: { AgentDeckPI: api },
    document: {
      activeElement: null,
      getElementById: (id) => elements.get(id),
    },
    setTimeout: (handler) => {
      handler();
      return 1;
    },
    clearTimeout() {},
    Date,
    Number,
    String,
    Math,
  });

  assert.equal(sourceMode.value, 'local');
  assert.equal(sshHost.disabled, false);
  sshHost.value = 'fixture-host';
  listeners.get('sshHost:input')();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].sourceMode, 'local');
  assert.equal(saved[0].sshHost, 'fixture-host');
});
