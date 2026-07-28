# Build a read-only Codex agent dashboard for Ulanzi D200X

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository does not contain its own `PLANS.md`. This document is maintained in accordance with
`~/.codex/PLANS.md`, which defines the local ExecPlan format and requirements.

## Purpose / Big Picture

After this work, a Ulanzi D200X owner can add read-only Codex dashboard actions to device keys. The
keys show how many local Codex threads are working, waiting for the user, recently completed, or
stale, and can show individual agent cards with the current project, task, reasoning effort, elapsed
time, and subagent identity. The first release does not start, steer, approve, reject, or switch
Codex sessions. A user can see the feature working by installing the packaged plugin in Ulanzi
Studio, dragging the overview and agent-slot actions onto D200X keys, and starting a Codex task in a
terminal.

The implementation observes existing local Codex state without modifying Codex configuration. It
reads the SQLite metadata database and JSON Lines session logs under the configured Codex home
directory. “JSON Lines” means a text file containing one JSON object per line. The SQLite database
supplies stable thread metadata; recent JSON Lines events supply task lifecycle and activity
details. The Ulanzi plugin runs under Node.js and sends dynamically rendered SVG key images to
Ulanzi Studio over its local plugin WebSocket.

## Progress

- [x] (2026-07-23 19:57Z) Confirmed the user wants a Codex-first, read-only dashboard; deferred
      session switching and dictation.
- [x] (2026-07-23 19:57Z) Researched Ulanzi Studio 3.x plugin bundles, the installed D200X
      configuration, public forum examples, and the public Claude Code Usage plugin.
- [x] (2026-07-23 19:57Z) Verified the current Codex app-server protocol has exact active and
      waiting flags, but an independent app-server sees already-running CLI threads as `notLoaded`.
- [x] (2026-07-23 20:10Z) Implemented the dependency-light Codex observer and conservative
      classifier, including synthetic session fixtures and partial-log recovery.
- [x] (2026-07-23 20:10Z) Implemented dynamic SVG rendering for overview, needs-user,
      recent-completion, and ranked agent-slot actions.
- [x] (2026-07-23 20:10Z) Implemented the Ulanzi runtime, four-action manifest, shared observer
      polling, and Agent Slot property inspector.
- [x] (2026-07-23 20:23Z) Ran 14 unit and integration tests successfully and built a validated 64
      KiB distributable ZIP.
- [x] (2026-07-23 20:20Z) Inspected the public Codex Usage forum material and current marketplace.
      The forum provides screenshots and instructions but no plugin bundle, and the marketplace does
      not list Codex Usage, so no third-party plugin was installed or needed cleanup.
- [x] (2026-07-23 20:28Z) Installed the plugin locally, restarted Ulanzi Studio, and verified that
      Overview, Needs You, Agent Slot, and Recent Completion appear in action search. Left the
      existing D200X profile unchanged.
- [x] (2026-07-23 21:02Z) Added a proportional repository harness modeled on `harness-engineering`:
      agent routing, architecture ownership, cross-agent guidance, pinned formatting, line-ending
      policy, and one complete `npm run check` command.
- [x] (2026-07-23 21:04Z) Initialized the repository on the `main` Git branch and verified the new
      harness end to end: formatting passed, all 14 tests passed, the plugin packaged, and ZIP
      integrity validation passed.
- [x] (2026-07-27 17:09Z) Renamed the product and durable plugin identity to Agent Deck under the
      user-owned `io.github.1mentat.agentdeck` namespace, including its bundle, actions, package,
      tests, documentation, and local installer.
- [x] (2026-07-27 17:13Z) Installed Agent Deck, retired the provisional bundle to a recoverable
      temporary backup, restarted Studio, and verified the Agent Deck group and all four actions.
      Existing placed actions were repaired and remained functional under the Agent Deck UUIDs.
- [x] (2026-07-27 17:41Z) Corrected two provisional `CODEX RADAR` labels embedded in dynamically
      rendered SVGs, added a branding regression test, rebuilt and reinstalled Agent Deck, restarted
      Studio, and observed the D200X reconnect.

## Surprises & Discoveries

- Observation: Ulanzi Studio’s plugin runtime is a Node.js process connected to a local WebSocket,
  and key images can be replaced with base64-encoded SVG at runtime. Evidence: the public
  `narlei/ulanzideck_claude` plugin uses `CodePath: plugin/app.js`, `Type: JavaScript`, and
  `setBaseDataIcon` with generated SVG data URLs.

- Observation: the Chinese “Codex For D200X” forum post describes a one-page keyboard-shortcut
  preset, not a live state integration. Evidence: its documented actions are new/close conversation,
  approve/reject shortcut, dictation, voice, terminal, and model selection, and it says the preset
  is zero-code.

- Observation: Codex’s current protocol contains the exact concepts needed by the desired UI.
  Evidence: generated local protocol bindings define thread active flags `waitingOnApproval` and
  `waitingOnUserInput`, `TurnStatus`, `ThreadGoal`, `CollabAgentState`, reasoning effort, and
  parent/child thread relationships.

- Observation: a newly started independent `codex app-server` cannot report live status for sessions
  owned by existing CLI processes. Evidence: `thread/list` returned the currently active research
  thread with status `notLoaded`, and `thread/loaded/list` returned an empty list.

- Observation: the Codex state database remains useful across processes even though exact live
  app-server status does not. Evidence: `~/.codex/state_5.sqlite` includes thread model, reasoning
  effort, working directory, nickname, role, timestamps, and `thread_spawn_edges`; session JSON
  Lines contain `task_started`, `task_complete`, `sub_agent_activity`, tool calls, and messages.

- Observation: the forum's Codex Usage post is documentation for a quota display, not a downloadable
  source reference. Evidence: thread 463 contains two PNG attachments and says the plugin invokes
  the local `codex` command to show five-hour and weekly quota percentages. The current Ulanzi
  marketplace did not list Codex Usage.

- Observation: Ulanzi Studio loads a manually installed plugin manifest after an application
  restart. Evidence: after copying only the plugin bundle into the user plugin directory and
  restarting Studio, action search returned the plugin group and all four declared actions.

- Observation: Renaming a manifest and action UUIDs does not rename text embedded in dynamic key
  images. Evidence: the D200X still displayed `CODEX RADAR` after the identity migration because
  `plugin/renderer.js` hard-coded that label in loading and overview SVGs. A renderer assertion now
  requires `AGENT DECK` and rejects the provisional label.

## Decision Log

- Decision: Ship a passive, read-only observer before any control actions. Rationale: It provides
  immediate ambient visibility while avoiding accidental approvals, interruptions, focus changes, or
  prompt submission. Session switching and dictation remain future actions behind separate
  interfaces. Date/Author: 2026-07-23 / Codex and user

- Decision: Use a provider boundary even though release 1 supports only Codex. Rationale: A
  normalized agent snapshot allows Claude Code or managed app-server sources to be added later
  without rewriting Ulanzi rendering and action logic. Date/Author: 2026-07-23 / Codex

- Decision: Use passive local-file observation as the release-1 source of truth, and label uncertain
  stale work honestly. Rationale: It works with existing independent Codex CLI sessions and requires
  no global config changes. Exact live flags are available only when a client shares the owning
  app-server, which current CLI sessions do not. Date/Author: 2026-07-23 / Codex

- Decision: Keep production dependencies minimal and isolate Ulanzi transport code from observer and
  renderer code. Rationale: The observer and renderer can be tested with the system Node.js runtime,
  while only the packaged plugin requires the small `ws` dependency used by known Ulanzi examples.
  Date/Author: 2026-07-23 / Codex

- Decision: Expire unconfirmed quiet work after 90 minutes and failures after 60 minutes, while
  leaving explicit waiting states latched. Rationale: Passive logs can retain an unmatched task
  start after a CLI process exits. Bounded quiet/failure visibility prevents abandoned work from
  polluting a “current agents” display, while explicit unmatched user-input or approval requests
  remain actionable until cleared. Date/Author: 2026-07-23 / Codex

- Decision: Add a small repository harness without introducing a general build framework or CI
  platform. Rationale: This project needs durable routing, architecture ownership, deterministic
  formatting, and an obvious proof command, but its native Node scripts and tests already own build
  and integration behavior. A pinned development-only Prettier dependency plus `npm run check`
  covers the observed gap at low carrying cost. Date/Author: 2026-07-23 / Codex

- Decision: Name the product Agent Deck and use `io.github.1mentat.agentdeck` as its durable
  namespace. Rationale: Agent Deck is provider-neutral, fits the physical control surface, and
  remains suitable for planned local and SSH-backed session sources. A GitHub-owned reverse-domain
  namespace avoids implying OpenAI ownership and should be stabilized before users place actions in
  Studio profiles. Date/Author: 2026-07-27 / Codex and user

## Outcomes & Retrospective

The Agent Deck read-only MVP is implemented, tested, packaged, and locally installed. Four Ulanzi
actions expose Codex work summaries while every key press remains refresh-only. Fifteen tests cover
classification, waiting-state latching, elevated approvals, quiet-session expiry, subagent identity,
observation, escaping, and a real local-WebSocket runtime exchange under Ulanzi Studio's bundled
Node.js. Ulanzi Studio recognizes all four actions after restart.

The implementation preserves the fidelity boundary discovered during research: passive observation
reliably shows task lifecycle, recent activity, subagents, and explicit user-input or
elevated-execution requests, but it never invents an exact blocked state for merely stale work. The
existing D200X profile was deliberately not modified, so final on-device key placement and
property-inspector interaction remain a short manual acceptance step for the owner.

The repository now also carries its operating knowledge in `AGENTS.md` and `ARCHITECTURE.md`,
exposes equivalent Claude Code routing through `CLAUDE.md`, pins its formatter in the root package
lock, and provides `npm run check` as the single complete local verification path. This keeps future
agent work discoverable and repeatable without adding a separate task runner or duplicated
validation layer.

## Context and Orientation

The repository was empty at the start of this work and is now a Git repository on the `main` branch.
The top-level plugin directory is `io.github.1mentat.agentdeck.ulanziPlugin`. Ulanzi Studio
discovers user plugins under `~/Library/Application Support/Ulanzi/UlanziDeck/Plugins`, but
development and tests remain inside this repository until an explicitly authorized install.

The plugin has four layers. `plugin/codex-observer.js` discovers recent Codex threads and converts
their metadata and recent events into normalized agent snapshots. `plugin/classifier.js` contains
deterministic state transitions and sorting rules with no Ulanzi dependency. `plugin/renderer.js`
converts snapshots into 200-by-200 SVG data URLs suitable for D200X keys. `plugin/app.js` connects
those pieces to Ulanzi lifecycle events and maintains one runtime instance per placed action.
Browser files under `property-inspector/` let a user select a ranked slot and optional filters.

A “thread” is one Codex conversation. A “turn” is one user request and the agent work that follows
it. A “subagent” is a child thread spawned by another thread. A “snapshot” is the normalized,
read-only summary used by every key renderer. A “latched” waiting state remains visible after
activity stops until a matching response or a new task event clears it.

Release-1 classification is conservative. An explicit unmatched `request_user_input` call is
`waiting_user`. A task that has started but not completed and has recent activity is `working`. A
task-complete event is `completed_recent` for a configurable window. A started task with no recent
activity and no explicit waiting event is `quiet`, not falsely claimed to be blocked. Errors and
aborted turns are `failed`. When metadata is incomplete, the UI shows a shortened project directory
and thread preview rather than inventing a task name.

## Plan of Work

First, add the package metadata, normalized types in documentation comments, classifier, observer,
and test fixtures. The observer must accept an injected Codex home path so tests never read the real
user state. It must tolerate a missing database, partial final JSON line, log rotation, inaccessible
files, and old Codex versions. Prefer JSON Lines as the portable base; use the system `sqlite3`
command only as an optional metadata accelerator and fall back cleanly when unavailable.

Second, add the SVG renderer. Use a restrained dark background and a stable status palette: blue for
working, amber for needs-user, green for recent completion, red for failure, and slate for quiet or
unknown. Agent cards must remain legible at key size and expose identity, a short task label,
reasoning effort, and age. Overview and urgent keys must be distinguishable without reading small
text.

Third, add the Ulanzi runtime and property inspector. The manifest will expose Overview, Needs You,
Agent Slot, and Recent actions. Every action is read-only; a press only forces a refresh. The Agent
Slot property inspector selects a one-based ranked slot and may optionally filter by project
substring. The runtime must stop polling inactive actions and share one observer poll across all
active instances.

Fourth, test and package. Unit tests use Node’s built-in test runner and synthetic session files. A
smoke test loads the manifest, renders all states, and checks that every data URL decodes to valid
SVG. The package command installs production dependencies into the plugin directory and creates
`dist/io.github.1mentat.agentdeck.ulanziPlugin.zip` without modifying the installed Ulanzi
application.

Finally, inspect the public Codex Usage material and marketplace availability, then install the new
dashboard only with the owner's authorization. The forum and marketplace inspection found no
obtainable Codex Usage bundle, so there was nothing to install or uninstall. The owner authorized
local plugin installation; Agent Deck was installed and Studio was restarted without editing the
active D200X profile.

## Concrete Steps

Work from the repository root.

Create and test the observer and renderer:

    npm test

Expected output contains passing Node tests for lifecycle classification, waiting-state latching,
subagent metadata, ranking, and SVG rendering, with zero failures.

Build the distributable:

    npm run package

Expected output names:

    dist/io.github.1mentat.agentdeck.ulanziPlugin.zip

Inspect the ZIP without installing it:

    unzip -l dist/io.github.1mentat.agentdeck.ulanziPlugin.zip

The listing must contain one top-level `io.github.1mentat.agentdeck.ulanziPlugin/` directory,
`manifest.json`, `plugin/app.js`, the property inspector, resources, package metadata, and
production dependencies.

The locally installed plugin can now be found by searching the Studio action list for `Agent Deck`;
the result contains Overview, Needs You, Agent Slot, and Recent Completion. The local test profile
has placed Agent Deck actions. To finish physical-device acceptance, start a disposable Codex task
and observe the Agent Slot transition from quiet or absent to blue working and later to green recent
completion. An explicit request for user input should turn the Needs You key amber and keep it amber
until answered.

## Validation and Acceptance

Automated acceptance requires all unit tests to pass and the package ZIP to have the expected
layout. The classifier test must prove that `task_started` without `task_complete` becomes working
while recent, `task_complete` becomes recently completed, an unmatched user-input request remains
waiting after the normal activity timeout, and a matched response clears that waiting condition. A
fixture with parent and child metadata must render the subagent nickname or path. Renderer tests
must decode every returned data URL and find an SVG root with no unescaped user content.

Manual acceptance requires Ulanzi Studio 3.0 or later to load the plugin without a runtime error.
Overview must show counts derived from local sessions. Agent Slot 1 must show the highest-priority
current agent. Needs You must not claim an ordinary quiet thread is blocked. Pressing any release-1
key must not modify a Codex session, send text, approve a command, change focus, or alter the
current Ulanzi profile.

## Idempotence and Recovery

Tests and packaging are repeatable. Packaging recreates only the repository-local `dist` directory.
Observation is read-only. If a session file changes during a read, the observer ignores a partial
last line and retries on the next poll. If the Codex database is locked or `sqlite3` is unavailable,
the observer falls back to session metadata. If the Ulanzi WebSocket closes, the plugin logs the
error and exits without changing Codex state.

Marketplace reference inspection is reversible: install through Ulanzi Studio, inspect the new
plugin directory, uninstall through Ulanzi Studio, and verify removal. Do not edit the user’s D200X
profile to inspect the reference plugin. Development installation of this plugin, when authorized,
replaces only its own UUID-named directory.

## Artifacts and Notes

The public reference repository is `https://github.com/narlei/ulanzideck_claude`. Its MIT-licensed
structure demonstrates Ulanzi’s manifest fields, Node entry point, property inspector, WebSocket
events, and dynamic SVG key rendering.

The two forum references are `https://bbs.ulanzistudio.com/forum.php?mod=viewthread&tid=428` for the
shortcut preset and `https://bbs.ulanzistudio.com/forum.php?mod=viewthread&tid=463` for quota
display. They are product comparisons, not implementation dependencies.

The local Codex CLI used during research is version 0.144.6. Generated experimental app-server
bindings showed `ThreadActiveFlag = "waitingOnApproval" | "waitingOnUserInput"`, but an independent
server did not own existing CLI runtime state.

Final automated validation on 2026-07-27 passed 15 of 15 tests. After the Agent Deck identity
migration, the package is `dist/io.github.1mentat.agentdeck.ulanziPlugin.zip`, is 65 KiB, passed
`unzip -t`, and had SHA-256 `c2636ee056895abab010f86f72e5d0f6d95b0c03178d4761989a7c0a7aae2acf`.

A final read-only scan of the real Codex home reported one high-effort `working` thread, one
`completed_recent` thread, and zero `needsYou` threads for the `ulanzi-ai` project. This matches the
expected state while the implementation session is active.

## Interfaces and Dependencies

At the end of the observer milestone, `plugin/classifier.js` must export:

    classifyThread({ metadata, events, now, options }) -> AgentSnapshot
    rankSnapshots(snapshots) -> AgentSnapshot[]

`AgentSnapshot` is a plain JavaScript object with at least `id`, `parentId`, `name`, `project`,
`task`, `model`, `effort`, `status`, `statusSince`, `lastActivityAt`, `isSubagent`, and
`sourcePath`.

`plugin/codex-observer.js` must export:

    createCodexObserver({ codexHome, now, execFile }) -> { scan() }

`scan()` returns a promise for a normalized dashboard object with `agents`, `counts`, `scannedAt`,
and non-fatal `warnings`.

`plugin/renderer.js` must export:

    renderOverview(dashboard) -> data URL
    renderNeedsYou(dashboard) -> data URL
    renderAgent(snapshot, options) -> data URL
    renderRecent(dashboard) -> data URL

`plugin/ulanzi-api.js` owns the local WebSocket protocol. `plugin/app.js` owns Ulanzi events and
must not contain session-parsing rules. The only production npm dependency should initially be `ws`,
matching public Ulanzi JavaScript examples.

Change note (2026-07-23 19:57Z): Created the initial self-contained plan after completing
feasibility research and receiving the user’s Codex-first, read-only scope decision.

Change note (2026-07-23 20:28Z): Updated every living section after implementation, automated
validation, package creation, marketplace/forum inspection, local installation, and non-mutating
Studio action discovery.

Change note (2026-07-23 21:02Z): Added the proportional repository-tooling milestone and recorded
why the project uses a small native Node harness instead of a heavier framework.

Change note (2026-07-23 21:04Z): Recorded Git initialization and the successful first full run of
the repository-owned verification command.

Change note (2026-07-27 17:13Z): Migrated the product from its provisional Codex-specific identity
to Agent Deck and the user-owned `io.github.1mentat.agentdeck` namespace, then recorded the local
reinstall and the user's successful repair of existing action placements.

Change note (2026-07-27 17:41Z): Recorded and fixed the dynamic SVG branding string missed by the
identity migration, and raised the automated suite to 15 tests with a product-name assertion.
