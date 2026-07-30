# Build the interactive Agent Deck dashboard

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain
this document in accordance with `~/.codex/PLANS.md`.

## Purpose / Big Picture

After this change, a D200X page filled with Agent Deck Dashboard Tile actions acts as a coordinated,
read-only console rather than a collection of unrelated status keys. Its normal fleet view shows
urgency, context pressure, observed background terminals, scope, and ranked agents. Pressing an
agent tile selects that exact session and changes every Dashboard Tile on the page into a detailed
view of that session: context occupancy, observed terminals, subagents, task, current activity,
model and effort, source, and navigation controls. Pressing Back restores the fleet view.

The existing Overview, Needs You, Agent Slot, and Recent Completion actions remain compatible. The
new detailed data also enriches those actions where useful, but no button sends a prompt, grants
approval, stops a process, edits Codex configuration, switches sessions, or changes a Studio
profile. Local installation replaces only Agent Deck's plugin directory; the user creates and
populates the dedicated Studio page.

## Progress

- [x] (2026-07-28 20:57Z) Researched Codex's persisted token, compaction, subagent, tool, plan,
      permission, and task lifecycle events and the official app-server live-state boundary.
- [x] (2026-07-28 20:57Z) Chose a two-mode, thirteen-tile fleet/detail page and a passive first
      implementation.
- [x] (2026-07-28 20:57Z) Created this ExecPlan before changing feature code.
- [x] (2026-07-28 21:10Z) Extended the passive observer and classifier with context, compaction,
      activity, plan, terminal, permission, branch, and child-agent details.
- [x] (2026-07-28 21:10Z) Added the coordinated Dashboard Tile action, shared interaction state, and
      fleet/detail renderers.
- [x] (2026-07-28 21:10Z) Extended the property inspector with shared dashboard, source, privacy,
      project, and context-warning controls.
- [x] (2026-07-28 21:10Z) Updated the bounded SSH protocol to schema 2, regenerated the zero-install
      probe, and documented the architecture and dedicated-page setup.
- [x] (2026-07-28 21:10Z) Added synthetic and real-loopback coverage; `npm run check` passed 39
      tests and produced the validated 90 KiB package.
- [x] (2026-07-28 21:10Z) Installed Agent Deck 0.2.0 locally and verified that the installed
      manifest and dashboard module match the repository. The manifest lists Dashboard Tile;
      restarting the already-running Studio process and placing the 13 tiles remain deliberate user
      actions.
- [x] (2026-07-28 22:18Z) Corrected the live property inspector so an SSH alias can be entered while
      Scope remains This Mac, added an executable inspector wiring test, and prepared patch release
      0.2.1.
- [x] (2026-07-30 17:39Z) Diagnosed the reported post-sleep stall against the live Studio process:
      the plugin and WebSocket remained connected, no SSH child was stuck, and a fresh configured
      probe succeeded in 1.6 seconds.
- [x] (2026-07-30 17:39Z) Added allowlisted, rotated runtime diagnostics, a source-health footer on
      Scope, and a synthetic SSH failure-to-recovery sequence for patch release 0.2.2.
- [x] (2026-07-30 17:39Z) Ran the complete check: all 44 tests passed, dependency audit reported no
      vulnerabilities, and the validated package is 92 KiB.
- [x] (2026-07-30 17:39Z) Installed 0.2.2 and verified that the installed manifest and runtime
      logger match the repository and that the logger is present in the distributable.
- [ ] Restart Studio and verify that the runtime log records startup plus an initial source
      transition without exposing the configured alias. The attempted automated quit was canceled,
      so the existing Studio process remains untouched.

## Surprises & Discoveries

- Observation: The local SQLite `threads` table already has cumulative `tokens_used`, branch
  metadata, model, effort, agent identity, and rollout path, while JSONL `event_msg/token_count`
  records provide both latest-request usage and model context-window size. Evidence:
  `state_5.sqlite` exposes `tokens_used`, `git_branch`, `model`, and `reasoning_effort`; recent
  synthetic-schema inspection found `last_token_usage`, `total_token_usage`, and
  `model_context_window` under token-count events.

- Observation: The context gauge must use the latest model request's input-token count, not
  cumulative thread tokens. Cumulative totals regularly exceed the model window because they add
  usage across many turns. Evidence: Local records showed cumulative totals in the millions
  alongside latest request sizes below a 258,400-token context window.

- Observation: Background terminals are not authoritatively represented in passive session metadata.
  The official app-server can list them only for loaded threads through an experimental method.
  Passive mode can therefore report only handles observed from persisted tool outputs and must label
  that result inferred. Evidence: The current Codex manual documents experimental
  `thread/backgroundTerminals/list`; the independently running ChatGPT app-server is attached to its
  parent over stdio and offers no attachable endpoint to this plugin.

- Observation: Ulanzi's runtime gives every placed action a unique context and physical key, while
  all instances share one JavaScript process. This permits a press on one Dashboard Tile to update
  shared selection state and rerender all active Dashboard Tiles without modifying the Studio
  profile. Evidence: `plugin/ulanzi-api.js` encodes action UUID, key, and action ID into each
  context, and `plugin/app.js` already keeps all instances in one map.

- Observation: Studio may return per-action settings responses after a newer property-inspector
  save, so arrival order is not a safe definition of the current dashboard configuration. Evidence:
  The loopback runtime test sends revisions 200 and 100 in that order and observes the plugin
  correcting the stale response back to revision 200.

- Observation: The repository check's real WebSocket test needs permission to bind loopback in a
  restricted sandbox, although all non-transport tests run without that permission. Evidence: The
  restricted run passed 38 tests and failed only with
  `listen EPERM: operation not permitted 127.0.0.1`; the permitted run passed all 39 tests.

- Observation: The source model can store an SSH alias independently from the selected scope, but
  the initial property inspector disabled the alias input whenever This Mac was selected. Evidence:
  the live dashboard profile stored ordinary per-action source settings, while
  `property-inspector/inspector.js` assigned `sshHost.disabled = !requiresHost`.

- Observation: Ordinary SSH failure recovery existed but had no durable transition logs and no
  focused failure-to-success test. Studio's proprietary daily log exposed no useful Agent Deck
  records. Evidence: during the live incident, the long-running plugin process and loopback socket
  were healthy, no child SSH process remained, and a direct configured probe returned 78 agents;
  only code inspection established the 8-second timeout and 15-second retry cadence.

## Decision Log

- Decision: Implement a passive detailed dashboard first and preserve an explicit fidelity marker
  for inferred terminal state. Rationale: It works for local and SSH-observed sessions without
  changing how Codex is launched. A live app-server provider remains additive because renderers
  consume normalized snapshots. Date/Author: 2026-07-28 / Codex

- Decision: Add one position-aware Dashboard Tile action instead of adding a separate manifest
  action for every metric. Rationale: The user can fill one dedicated page with copies of a single
  action; the physical key selects the role, and all tiles share page state. This avoids thirteen
  independently designed actions while keeping the four existing actions compatible. Date/Author:
  2026-07-28 / Codex

- Decision: Do not edit or import the user's Ulanzi profile automatically. Rationale: Profiles
  contain device-owned identifiers and absolute paths. Repository invariants prohibit profile
  changes without explicit authorization, and a manual one-page setup is safe and recoverable.
  Date/Author: 2026-07-28 / Codex

- Decision: Sanitize activity and terminal labels before rendering them. Rationale: Full commands,
  prompts, paths, and tool output are too sensitive and too large for an ambient key. The default
  display will use short categories or executable basenames and never raw output. Date/Author:
  2026-07-28 / Codex

- Decision: Stamp dashboard property-inspector saves with `dashboardRevision = Date.now()` and
  reject older settings responses in the runtime. Rationale: All 13 action instances store settings
  separately in Studio. A revision makes their shared configuration converge deterministically after
  saves and restarts. Accepting a new authoritative configuration also clears the temporary Scope
  override so the configured scope is visible again. Date/Author: 2026-07-28 / Codex

- Decision: Bump the plugin, repository package, and distributable package version to 0.2.0.
  Rationale: The new fifth action, SSH schema change, normalized detail fields, and coordinated
  interaction model are a user-visible feature release rather than a patch to 0.1.0. Date/Author:
  2026-07-28 / Codex

- Decision: Keep the SSH alias editable in every Scope mode and validate it whenever it is
  non-empty. Rationale: This Mac does not require an alias, but users should be able to prepare one
  before switching to SSH or All. SSH and All continue to require a valid alias. Date/Author:
  2026-07-28 / Codex

- Decision: Persist source and socket transitions in a 256 KiB JSON Lines log with one rotated
  backup, and display selected-source freshness on the Scope tile. Rationale: A visible sync age
  distinguishes stale data from a responsive dashboard, while durable retry and recovery events make
  sleep/wake incidents diagnosable. The logger accepts only event-specific error codes, durations,
  booleans, and counts; it cannot write aliases or session-derived text. Date/Author: 2026-07-30 /
  Codex

## Outcomes & Retrospective

Agent Deck 0.2.2 now implements the planned passive fleet/detail dashboard while preserving all four
original actions and the no-control security boundary. The complete check passed 44 of 44 tests,
regenerated the schema-2 remote probe, audited the production dependency with no vulnerabilities,
and created `dist/io.github.1mentat.agentdeck.ulanziPlugin.zip` at 92 KiB. The local installer
replaced only Agent Deck's plugin directory, and byte comparisons proved that its manifest and
`plugin/dashboard-state.js` match the repository. Patch 0.2.2 adds an allowlisted, rotated runtime
log, a visible source-sync age, and explicit failure-to-recovery coverage without changing the
read-only observation boundary.

The 0.2.2 files are installed, but Ulanzi Studio declined the automated quit request and continues
running the previous in-memory plugin process. A user-initiated Studio restart remains necessary
before the Scope freshness footer and durable runtime log can be verified on the live device.

Ulanzi Studio was already running the pre-install process, so this implementation did not terminate
or relaunch it. The user must restart Studio once, create or choose the dedicated page, and place
Dashboard Tile in all 13 usable positions. Inferred terminal counts remain intentionally marked with
`~`; hardware use will determine whether that passive signal is useful enough to retain or should
later be supplemented by an opt-in live app-server provider.

## Context and Orientation

Agent Deck is a JavaScript plugin under `io.github.1mentat.agentdeck.ulanziPlugin/`. Ulanzi Studio
starts `plugin/app.js` in its bundled Node.js runtime and communicates through a loopback WebSocket
wrapped by `plugin/ulanzi-api.js`. Every placed key is an action instance. Its context encodes the
manifest action UUID, physical key, and unique action ID.

`plugin/codex-observer.js` reads recent JSON Lines session logs from a Codex home and optional rows
from `state_5.sqlite`. It passes a thread's metadata and events into `plugin/classifier.js`. A
normalized snapshot is a plain object containing the safe state needed by renderers.
`plugin/source-coordinator.js` combines a local observer with zero-install SSH probes.
`plugin/remote-probe-entry.js` is bundled by `scripts/build-remote-probe.mjs` into the program
streamed over the configured SSH alias. Any new snapshot fields needed remotely must be explicitly
included in the probe's public allowlist.

`plugin/renderer.js` converts dashboard state into escaped 200-by-200 SVG data URLs. `plugin/app.js`
owns action lifecycle, polling, settings, and which renderer is called. `property-inspector/` is the
Studio settings panel. Tests use only synthetic Codex homes and may never copy private session
content.

A fleet view is the normal dashboard mode showing several agents. A detail view is the page-wide
mode for one selected source-qualified agent ID. A context window is the maximum token capacity
available to a model request. Context occupancy is the latest recorded request's input tokens
divided by that maximum; cumulative token usage is a different lifetime counter. A background
terminal is a long-running tool process. Because passive logs do not prove that such a process still
exists, the first implementation calls it an observed terminal and marks its fidelity `inferred`. A
root agent has no parent thread. A subagent is a child thread whose metadata records a parent thread
ID.

The D200X page model has a five-column top row, a five-column middle row, and three usable keys in
the bottom row; Studio reserves the bottom-right two-cell region for its wide background display.
Dashboard Tile roles are assigned from the key coordinate. If a runtime uses a different or opaque
key string, the app falls back to stable placement order so the action remains usable and tests can
model both cases.

## Plan of Work

First, enrich the normalized domain model without touching rendering. In `plugin/classifier.js`, add
small parsers for the latest token-count event, context compactions, current activity, plan updates,
permissions, and conservatively observed terminal handles. The parsers must ignore raw tool output
after extracting bounded metadata. Add `enrichAgentRelationships(snapshots)` to run after all
threads have been classified; it attaches bounded child summaries to each parent and aggregate
active, waiting, and done counts. Keep `rankSnapshots` and status semantics in this module.

In `plugin/codex-observer.js`, select SQLite `tokens_used` and `git_branch`, pass them through
metadata, classify all threads, enrich relationships, then rank. The head-and-tail reader remains
bounded. Details that cannot be observed become explicit empty or unknown values rather than
fabricated status. Update `plugin/remote-probe-entry.js` and its schema version so SSH sends only
the normalized bounded detail fields; regenerate the bundled probe.

Second, add `plugin/dashboard-state.js`. It translates physical key strings into thirteen roles and
applies read-only press events. Fleet roles are fleet summary, needs-you, context risk, observed
terminals, scope, and agent slots one through eight. A slot press selects its exact source-qualified
ID and enters detail mode. Detail roles are back, identity, context, terminals, subagents, task,
activity, plan/model, source, runtime status, previous, pin/follow, and next. Metric presses filter
visible slots, Scope cycles only among settings already authorized for the page, and detail presses
only change local display cursors.

Third, add Dashboard Tile to `manifest.json` and wire it in `plugin/app.js`. Shared state is keyed
by a normalized dashboard group, defaulting to `main`. Active Dashboard Tile instances contribute
their settings; the most recently configured instance becomes the group's source configuration.
Presses dispatch through `dashboard-state.js`, and every active tile in the group rerenders.
Existing action behavior remains unchanged except that its snapshot contains new safe fields.

Fourth, add fleet and detail tile renderers in `plugin/renderer.js`. Use short labels, strong status
colors, a context progress bar, inferred-terminal marker, bounded child counts, escaped text, and a
visible Fleet or Detail navigation affordance. Do not render raw prompt content beyond the already
sanitized task summary, full command lines, tool output, full paths, session IDs, or SSH connection
details.

Fifth, extend `property-inspector/` for Dashboard Tile settings. Add a dashboard group, default
scope, optional project filter, context warning percentage, and a privacy toggle that defaults to
safe labels. Stamp each save with a revision so delayed per-action responses cannot overwrite newer
group settings. Keep the SSH alias validation already used by existing actions. Settings remain per
action at the Ulanzi layer; runtime group resolution lets one configured tile control the visible
page without writing a separate settings file.

Finally, add synthetic tests for every new parser, relationship aggregation, tile mapping,
interaction transition, renderer, remote-probe parity, manifest entry, property inspector, and
runtime icon flow. Update `README.md` with the dedicated-page grid and manual Studio instructions,
and update `ARCHITECTURE.md` with the normalized detail and fidelity boundary. Run formatting, the
entire test suite, packaging, and local installation. Search the installed manifest and Studio logs
to prove discovery without changing the user's active profile.

## Concrete Steps

Work from the repository root.

Create and maintain the plan, then implement domain details and their tests:

    npm test

During renderer and interaction work, run the focused files as needed:

    node --test tests/classifier.test.js tests/observer.test.js tests/renderer.test.js

Regenerate the remote probe whenever observer, classifier, or remote entry code changes:

    npm run build:probe

After all implementation and documentation edits:

    npm run format
    npm run check

Expect formatting verification to pass, all 44 Node tests to pass, and
`dist/io.github.1mentat.agentdeck.ulanziPlugin.zip` to be recreated and validated.

Install only after the complete check succeeds:

    npm run install:local

Restart or allow Ulanzi Studio to reload, then verify that its installed Agent Deck manifest
includes Dashboard Tile. Do not edit the active profile. The remaining human-visible placement step
is to create or choose a dedicated page and drag Dashboard Tile into all thirteen usable positions.

## Validation and Acceptance

The domain tests must prove that a synthetic token event produces a bounded context object with used
tokens, window tokens, percentage, cumulative tokens, and compaction count. They must prove that a
synthetic parent plus children yields correct active, waiting, and done aggregates without changing
urgency ranking. They must prove that terminal inference never treats a completed handle as running
and labels unresolved handles inferred.

The interaction tests must start in Fleet mode, press a populated agent slot, observe Detail mode
selecting that exact ID, navigate previous and next, toggle pin/follow, and press Back to restore
Fleet mode. A missing selected session must degrade to a visible stale state rather than select a
different agent silently.

Renderer tests must decode every fleet and detail tile into valid SVG, confirm XML escaping, confirm
context pressure and inferred-terminal notation, and assert that raw command arguments and session
IDs do not appear. The runtime integration test must place a Dashboard Tile through the mock Ulanzi
WebSocket and receive a non-loading SVG.

Remote parity must prove that direct and generated-probe snapshots expose equal public detail fields
from one synthetic Codex home. Packaging must contain the new module, action, property inspector,
generated probe, and documentation-approved manifest without private hosts or local absolute paths.

After installation, the installed manifest must match the repository manifest and list Dashboard
Tile. This proves Studio can discover the action. Actual page placement is intentionally not
automated and should be reported separately.

## Idempotence and Recovery

All repository edits and checks are repeatable. `npm run build:probe`, `npm run format`,
`npm run check`, and `npm run package` may be rerun. Packaging recreates only repository-local
`dist/`. Local installation replaces only Agent Deck's own plugin directory and may be rerun after a
successful package build. It does not modify Studio profiles.

If a new parser encounters an unknown event shape, it must return an empty detail and a non-fatal
result; do not make observation fail. If the generated probe falls out of date, rerun
`npm run build:probe`. If installation fails, leave the current Studio profile untouched, fix the
package, rerun `npm run check`, then retry installation.

## Artifacts and Notes

Official Codex behavior used by this implementation is intentionally summarized here rather than
required as an external dependency. Persisted session logs contain token-count, compaction, tool,
task, turn-context, and subagent events. The official app-server also exposes streamed token usage,
runtime thread flags, child filters, collaboration items, and an experimental background-terminal
list. The passive implementation does not call app-server and does not claim app-server-grade
terminal liveness.

The intended fleet grid is:

    FLEET       NEEDS YOU    CONTEXT      TERMINALS    SCOPE
    AGENT 1     AGENT 2      AGENT 3      AGENT 4     AGENT 5
    AGENT 6     AGENT 7      AGENT 8      [Studio wide background]

The intended detail grid is:

    BACK        IDENTITY     CONTEXT      TERMINALS    SUBAGENTS
    TASK        ACTIVITY     PLAN/MODEL   SOURCE       RUNTIME
    PREVIOUS    PIN/FOLLOW   NEXT         [Studio wide background]

The final verification transcript was:

    tests 44
    pass 44
    fail 0
    found 0 vulnerabilities
    Created dist/io.github.1mentat.agentdeck.ulanziPlugin.zip (92 KiB)
    Agent Deck checks passed.

The installed manifest verification found:

    "Name": "Agent Deck"
    "Version": "0.2.2"
    "Name": "Dashboard Tile"

## Interfaces and Dependencies

No new runtime dependency is permitted. Continue using Node.js built-ins and the pinned `ws`
dependency already packaged for Ulanzi transport.

`plugin/classifier.js` must export:

    enrichAgentRelationships(snapshots) -> snapshots

Every classified snapshot must include bounded objects named `context`, `terminals`, `subagents`,
`activity`, `plan`, `permissions`, and `git` even when their fields are unknown.

`plugin/dashboard-state.js` must export pure functions sufficient for tests and `plugin/app.js`,
including a function that maps a key or stable fallback index to a fleet/detail role and a function
that applies a press to immutable-or-copied dashboard state.

`plugin/renderer.js` must export a Dashboard Tile renderer that accepts the tile role, dashboard,
shared page state, and optional time and returns a 200-by-200 SVG data URL.

`plugin/remote-probe-entry.js` must bound arrays and strings, omit raw terminal output and private
tool inputs, and increment the schema version because public agent records gain fields.

Plan revision note, 2026-07-28: Initial plan created from the approved two-mode dashboard design and
current repository/runtime research so implementation can proceed from a self-contained
specification.

Plan revision note, 2026-07-28: Recorded the completed normalized detail model, coordinated
interaction and rendering work, settings-revision safeguard, schema-2 SSH parity, 0.2.0 release
version, full test/package evidence, privacy scan, and local installation outcome so the plan
remains a complete restart and audit record.

Plan revision note, 2026-07-28: Recorded the live property-inspector discovery and 0.2.1 correction
that decouples SSH alias entry from the active Scope selection.

Plan revision note, 2026-07-30: Recorded live post-sleep diagnosis, privacy-safe runtime logging,
the Scope freshness indicator, explicit SSH recovery coverage, and 0.2.2 package evidence.
