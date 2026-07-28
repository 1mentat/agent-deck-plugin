# Agent Deck for Ulanzi D200X

Agent Deck is a read-only Ulanzi Studio plugin that turns D200X keys into an ambient dashboard for
Codex work on this Mac, a configured SSH host, or both together. It observes Codex session state
without changing Codex configuration or sending anything to a running agent.

The first release includes four actions:

- **Overview** shows active, waiting, and recently completed counts.
- **Needs You** latches the highest-priority explicit input or elevated-permission request.
- **Agent Slot** shows one ranked agent or subagent with project, task, reasoning effort, status,
  and age.
- **Recent Completion** shows the latest completed task.

## Build and install

Requirements are Node.js 20 or later, npm, and macOS with Ulanzi Studio 3.0.11 or later.

Clone, verify, and install the plugin:

    git clone https://github.com/1mentat/agent-deck-plugin.git
    cd agent-deck-plugin
    npm ci
    npm run check
    npm run install:local

Restart Ulanzi Studio. Search the action list for **Agent Deck**, then drag actions onto D200X keys.
The installer replaces only Agent Deck's plugin directory under
`~/Library/Application Support/Ulanzi/UlanziDeck/Plugins/`; it does not edit the active Studio
profile. `npm run check` formats nothing: it verifies formatting, runs the tests, builds the plugin
ZIP, and validates the archive. The ZIP remains available at
`dist/io.github.1mentat.agentdeck.ulanziPlugin.zip`.

To update an existing checkout:

    git pull --ff-only
    npm ci
    npm run check
    npm run install:local

Restart Studio after reinstalling.

## Configure actions

Each action's property inspector has a **Scope** setting:

- **This Mac** observes the local Codex home and is the backward-compatible default.
- **Host via SSH** observes one OpenSSH `Host` alias.
- **All sources** combines this Mac with that configured alias.

Before entering an SSH alias in Studio, establish its host key and credentials in a terminal and
confirm that non-interactive Node.js is available:

    ssh -T -o BatchMode=yes -o ConnectTimeout=5 <ssh-alias> node --version

The command must print Node.js 20 or later without prompting. Agent Deck passes the alias to
`/usr/bin/ssh`; hostnames, users, keys, ports, proxies, and host-key policy remain in the user's SSH
configuration. It streams a read-only probe over standard input, writes no remote files, disables
forwarding and local commands for the monitoring connection, and polls each distinct alias at most
once every 15 seconds.

For multiple Agent Slot keys, select each key and set its ranked position and optional project
filter. A slot always labels the source host of its current agent. If SSH is unavailable, the key
shows an offline or diagnostic state while local agents remain visible in **All sources**.

## Development

Start with [`AGENTS.md`](AGENTS.md) for the working loop and [`ARCHITECTURE.md`](ARCHITECTURE.md)
for module ownership and proof boundaries. Narrower commands are available while iterating:

    npm test
    npm run package

`npm run package` creates the distributable ZIP; `npm run install:local` expects that package step
to have installed the pinned production WebSocket dependency into the plugin directory.

## Status fidelity

Agent Deck deliberately distinguishes certainty from inference. Explicit unmatched user-input
requests and elevated-permission tool calls appear under **Needs You**. A recently active open task
is **Working**. An old open task becomes **Quiet**, because passive session files cannot prove
whether a different Codex CLI process is still computing or has been abandoned. A future opt-in
shared app-server mode can provide exact runtime flags while keeping this passive mode as the
zero-configuration default.

## License

Agent Deck is available under the [0BSD license](LICENSE).
