import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import test from 'node:test';

test('manifest exposes four read-only keypad actions', async () => {
  const manifest = JSON.parse(
    await fs.readFile('io.github.1mentat.agentdeck.ulanziPlugin/manifest.json', 'utf8'),
  );
  assert.equal(manifest.UUID, 'io.github.1mentat.agentdeck.ulanzi');
  assert.equal(manifest.Type, 'JavaScript');
  assert.equal(manifest.Actions.length, 4);
  assert.deepEqual(
    manifest.Actions.map((action) => action.Name),
    ['Overview', 'Needs You', 'Agent Slot', 'Recent Completion'],
  );
  assert.ok(manifest.Actions.every((action) => action.Controllers.includes('Keypad')));
  assert.ok(
    manifest.Actions.every(
      (action) => action.PropertyInspectorPath === 'property-inspector/inspector.html',
    ),
  );
});
