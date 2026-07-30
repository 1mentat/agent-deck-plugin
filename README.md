# Agent Deck for Ulanzi D200X

Agent Deck is a read-only Ulanzi Studio plugin that turns D200X keys into an ambient dashboard for
Codex work on this Mac, a configured SSH host, or both together. It observes Codex session state
without changing Codex configuration or sending anything to a running agent.

Agent Deck includes five actions:

- **Overview** shows active, waiting, and recently completed counts.
- **Needs You** latches the highest-priority explicit input or elevated-permission request.
- **Agent Slot** shows one ranked agent or subagent with project, task, reasoning effort, status,
  and age.
- **Recent Completion** shows the latest completed task.
- **Dashboard Tile** fills one position in a coordinated fleet-and-detail page. Pressing an agent
  tile selects that exact session and changes every tile on the page to show its context pressure,
  observed terminals, subagents, activity, plan, model, permissions, and source.

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

The SSH alias remains editable in **This Mac** mode so a host can be prepared before changing Scope.
A valid alias is required only when **Host via SSH** or **All sources** is selected.

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

## Configure a dedicated dashboard page

Create or choose one otherwise empty D200X page in Ulanzi Studio. Drag **Dashboard Tile** into all
13 usable key positions. Studio reserves the bottom-right two-cell region for its wide background
display, so the intended fleet grid is:

    FLEET       NEEDS YOU    CONTEXT      TERMINALS    SCOPE
    AGENT 1     AGENT 2      AGENT 3      AGENT 4     AGENT 5
    AGENT 6     AGENT 7      AGENT 8      [Studio wide background]

Dashboard Tile determines its role from its physical position; there is no per-key role picker.
Configure any visible Dashboard Tile to set the group, scope, optional SSH alias, optional project
filter, context warning threshold, and whether sanitized task text may appear on keys. Agent Deck
copies those settings to the other visible tiles in the group so the page remains consistent after
Studio restarts. Leave the group as `main` for one page.

In fleet mode, press **Needs You**, **Context**, or **Terminals** to filter the ranked Agent keys;
press the same metric again or press **Fleet** to clear the filter. Press **Scope** to cycle only
among the local and SSH sources already configured for that page. Press an Agent key to pin that
exact session and enter detail mode:

    BACK        IDENTITY     CONTEXT      TERMINALS    SUBAGENTS
    TASK        ACTIVITY     PLAN/MODEL   SOURCE       RUNTIME
    PREVIOUS    PIN/FOLLOW   NEXT         [Studio wide background]

In detail mode, Terminals and Subagents cycle their bounded entries. Previous and Next select
another visible agent, Pin/Follow chooses stable identity versus following the selected rank, and
Back returns to fleet mode. These presses change only Agent Deck's local display state.

The Scope tile footer reports the selected source's health. `SYNC 5s AGO` means its most recent
probe succeeded five seconds ago; scanning, timeout, and offline labels remain visible until a later
probe recovers.

The Context tile shows the latest recorded model request's input tokens divided by its context
window. This is intentionally different from cumulative token usage across the thread. Terminal
counts carry a trailing `~` because passive Codex logs can prove that Agent Deck observed a running
handle but cannot prove that an independently owned process is still alive. Command arguments,
terminal output, full session IDs, and full paths are never rendered.

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

Context usage, compaction events, parent-child relationships, model, effort, permissions, branch,
and persisted plan/tool activity are recorded session facts but can be delayed by the normal poll
interval. Background-terminal liveness remains inferred in passive mode and is marked with `~`.

## Troubleshooting

Agent Deck records bounded runtime events at `~/Library/Logs/Agent Deck/runtime.jsonl`. To watch
connection transitions while reproducing a problem:

    tail -f ~/Library/Logs/Agent\ Deck/runtime.jsonl

The log records plugin socket lifecycle plus SSH offline, retry, and recovery transitions. It
rotates at 256 KiB and keeps one previous file as `runtime.jsonl.1`. Records contain only event
names, timestamps, source kind, stable error codes, durations, and counts. SSH aliases, hostnames,
commands, output, paths, prompts, and session identifiers are never logged.

## License

Agent Deck is available under the [0BSD license](LICENSE).
