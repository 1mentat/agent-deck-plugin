import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { build } from 'esbuild';

const root = process.cwd();
const output = path.join(
  root,
  'io.github.1mentat.agentdeck.ulanziPlugin',
  'generated',
  'codex-remote-probe.mjs',
);

await fs.mkdir(path.dirname(output), { recursive: true });
await build({
  entryPoints: [
    path.join(root, 'io.github.1mentat.agentdeck.ulanziPlugin', 'plugin', 'remote-probe-entry.js'),
  ],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  legalComments: 'none',
  sourcemap: false,
});

console.log(`Built ${path.relative(root, output)}`);
