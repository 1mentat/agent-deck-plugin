import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const root = process.cwd();
const pluginDir = path.join(root, 'io.github.1mentat.agentdeck.ulanziPlugin');
const requireFromPlugin = createRequire(path.join(pluginDir, 'package.json'));
const { WebSocketServer } = requireFromPlugin('ws');

test(
  'Ulanzi runtime connects and emits a live Dashboard Tile icon',
  { timeout: 12_000 },
  async (t) => {
    const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-deck-runtime-'));
    t.after(() => fs.rm(codexHome, { recursive: true, force: true }));
    const sessions = path.join(codexHome, 'sessions', '2026', '07', '23');
    await fs.mkdir(sessions, { recursive: true });
    const id = '019f9079-6912-7033-997f-32b8146e9107';
    const now = Date.now();
    await fs.writeFile(
      path.join(sessions, `rollout-runtime-${id}.jsonl`),
      [
        {
          timestamp: new Date(now - 4_000).toISOString(),
          type: 'session_meta',
          payload: { id, cwd: '/tmp/runtime-project', source: 'cli' },
        },
        {
          timestamp: new Date(now - 3_000).toISOString(),
          type: 'turn_context',
          payload: { model: 'gpt-test', effort: 'high' },
        },
        {
          timestamp: new Date(now - 2_000).toISOString(),
          type: 'event_msg',
          payload: { type: 'task_started' },
        },
      ]
        .map(JSON.stringify)
        .join('\n') + '\n',
    );

    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    t.after(() => server.close());
    await new Promise((resolve) => server.once('listening', resolve));
    const port = server.address().port;
    const bundledNode = '/Applications/Ulanzi Studio.app/Contents/MacOS/NodeJS/node';
    const node = await fs.access(bundledNode).then(
      () => bundledNode,
      () => process.execPath,
    );
    const child = spawn(node, ['plugin/app.js', '127.0.0.1', String(port), 'en'], {
      cwd: pluginDir,
      env: { ...process.env, CODEX_HOME: codexHome },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    t.after(() => {
      if (child.exitCode === null) child.kill('SIGTERM');
    });

    const dashboardSvg = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`runtime timed out: ${stderr}`)), 8_000);
      server.once('connection', (socket) => {
        let rendered = null;
        let correctedStaleSettings = false;
        const finish = () => {
          if (!rendered || !correctedStaleSettings) return;
          clearTimeout(timeout);
          resolve(rendered);
        };
        socket.on('message', (raw) => {
          const message = JSON.parse(raw.toString());
          if (message.cmd === 'connected') {
            socket.send(
              JSON.stringify({
                cmd: 'add',
                cmdType: 'REQUEST',
                uuid: 'io.github.1mentat.agentdeck.ulanzi.dashboard',
                key: '0_0',
                actionid: 'runtime-test',
                param: {},
              }),
            );
            return;
          }
          if (message.cmd === 'getSettings' && message.actionid === 'runtime-test') {
            for (const dashboardRevision of [200, 100]) {
              socket.send(
                JSON.stringify({
                  cmd: 'didReceiveSettings',
                  cmdType: 'REQUEST',
                  uuid: 'io.github.1mentat.agentdeck.ulanzi.dashboard',
                  key: '0_0',
                  actionid: 'runtime-test',
                  settings: {
                    sourceMode: 'local',
                    dashboardGroup: 'main',
                    dashboardRevision,
                  },
                }),
              );
            }
            return;
          }
          if (
            message.cmd === 'setSettings' &&
            message.actionid === 'runtime-test' &&
            message.settings?.dashboardRevision === 200
          ) {
            correctedStaleSettings = true;
            finish();
            return;
          }
          const data = message?.param?.statelist?.[0]?.data;
          if (!data?.startsWith('data:image/svg+xml;base64,')) return;
          const document = Buffer.from(data.split(',')[1], 'base64').toString('utf8');
          if (!document.includes('FLEET') || document.includes('SCANNING')) return;
          rendered = document;
          finish();
        });
      });
    });

    assert.match(dashboardSvg, /1/);
    assert.equal(stderr, '');
  },
);
