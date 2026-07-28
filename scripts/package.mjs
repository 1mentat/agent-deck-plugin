import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const pluginName = 'io.github.1mentat.agentdeck.ulanziPlugin';
const pluginDir = path.join(root, pluginName);
const distDir = path.join(root, 'dist');
const zipPath = path.join(distDir, `${pluginName}.zip`);

console.log('Building remote probe…');
execFileSync(process.execPath, ['scripts/build-remote-probe.mjs'], {
  cwd: root,
  stdio: 'inherit',
});

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });

console.log('Installing production plugin dependency…');
execFileSync('npm', ['install', '--omit=dev', '--ignore-scripts'], {
  cwd: pluginDir,
  stdio: 'inherit',
});

console.log('Building distributable ZIP…');
execFileSync(
  '/usr/bin/zip',
  ['-r', '-q', zipPath, pluginName, '-x', '*/.DS_Store', '*/.git/*', '*.log'],
  { cwd: root, stdio: 'inherit' },
);

const stat = await fs.stat(zipPath);
const entries = execFileSync('/usr/bin/unzip', ['-Z1', zipPath], { encoding: 'utf8' });
if (!entries.includes(`${pluginName}/generated/codex-remote-probe.mjs`)) {
  throw new Error('Distributable is missing the generated remote probe');
}
if (!entries.includes(`${pluginName}/LICENSE`)) {
  throw new Error('Distributable is missing the 0BSD license');
}
if (entries.includes('esbuild') || entries.includes(`${pluginName}/node_modules/.bin/esbuild`)) {
  throw new Error('Distributable unexpectedly contains the build-time esbuild dependency');
}
console.log(`Created ${path.relative(root, zipPath)} (${Math.ceil(stat.size / 1024)} KiB)`);
