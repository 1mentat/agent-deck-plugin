import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import test from 'node:test';

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
