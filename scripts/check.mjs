import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const artifact = path.join(root, 'dist', 'io.github.1mentat.agentdeck.ulanziPlugin.zip');

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: 'inherit' });
}

console.log('Checking repository formatting…');
run('npm', ['run', 'format:check']);

console.log('Running tests…');
run('npm', ['test']);

console.log('Building distributable…');
run('npm', ['run', 'package']);

console.log('Validating ZIP integrity…');
run('/usr/bin/unzip', ['-tq', artifact]);

console.log('Agent Deck checks passed.');
