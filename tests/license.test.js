import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import test from 'node:test';

test('repository and distributable declare the same 0BSD license', async () => {
  const [rootLicense, pluginLicense, rootPackage, pluginPackage] = await Promise.all([
    fs.readFile('LICENSE', 'utf8'),
    fs.readFile('io.github.1mentat.agentdeck.ulanziPlugin/LICENSE', 'utf8'),
    fs.readFile('package.json', 'utf8').then(JSON.parse),
    fs.readFile('io.github.1mentat.agentdeck.ulanziPlugin/package.json', 'utf8').then(JSON.parse),
  ]);

  assert.equal(pluginLicense, rootLicense);
  assert.match(rootLicense, /^BSD Zero Clause License/);
  assert.equal(rootPackage.license, '0BSD');
  assert.equal(pluginPackage.license, '0BSD');
});
