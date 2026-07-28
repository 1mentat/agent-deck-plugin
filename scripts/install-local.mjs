import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const pluginName = 'io.github.1mentat.agentdeck.ulanziPlugin';
const source = path.join(process.cwd(), pluginName);
const installBase = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'Ulanzi',
  'UlanziDeck',
  'Plugins',
);
const destination = path.join(installBase, pluginName);

await fs.access(path.join(source, 'manifest.json'));
await fs.access(path.join(source, 'node_modules', 'ws', 'package.json'));
await fs.mkdir(installBase, { recursive: true });
await fs.rm(destination, { recursive: true, force: true });
await fs.cp(source, destination, {
  recursive: true,
  filter: (entry) => !entry.endsWith('.DS_Store') && !entry.endsWith('.log'),
});

console.log(`Installed ${pluginName} at ${destination}`);
console.log('Restart Ulanzi Studio to load it.');
