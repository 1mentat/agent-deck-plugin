# Architecture

Agent Deck turns passive Codex state into small, dynamic images for Ulanzi D200X keys. The
repository keeps observation, domain semantics, presentation, and device transport separate so each
boundary can be tested without running the full application.

## Runtime flow

`plugin/codex-observer.js` reads recent JSON Lines session logs and optional SQLite thread metadata
from a Codex home. It sends each thread to `plugin/classifier.js`, which returns a normalized
snapshot and sorts snapshots by user urgency, failure, activity, uncertainty, and recent completion.
The snapshot also carries bounded context usage, compaction count, plan and activity labels,
permissions, branch metadata, inferred terminal handles, and child-agent summaries. Relationship
enrichment happens after all candidate threads are classified so adapters and renderers do not
reimplement the parent-child graph. `plugin/source-coordinator.js` polls the local observer and any
SSH sources needed by active actions, then produces a source-filtered dashboard for each action.
`plugin/app.js` passes those snapshots to `plugin/renderer.js`, then sends the returned SVG data
URLs through `plugin/ulanzi-api.js` to Ulanzi Studio's local WebSocket.

`plugin/dashboard-state.js` is the pure interaction model for the position-aware Dashboard Tile. It
maps the 13 usable key coordinates to fleet or detail roles, stores one selected source-qualified
agent ID, applies filters and read-only navigation, and computes a temporary scope override. All
active Dashboard Tile instances share that state in `plugin/app.js`; one press rerenders the whole
visible group. The property inspector propagates the last configured visible tile's settings to the
rest of the group through Ulanzi's ordinary per-action settings API.

`plugin/runtime-logger.js` writes a bounded JSON Lines diagnostic log under the user's standard
macOS Logs directory. Its event-specific allowlist accepts lifecycle state, error codes, durations,
and counts only. Source labels, aliases, paths, commands, output, prompts, and session identifiers
cannot cross this logging boundary. The source coordinator emits SSH transition events through an
injected callback so its domain logic remains independent from filesystem logging.

`plugin/ssh-codex-source.js` starts the fixed system SSH executable in batch mode and streams
`generated/codex-remote-probe.mjs` to remote Node.js. The probe bundles the same observer and
classifier, writes no remote files, and returns one bounded protocol response. The coordinator
deduplicates equal aliases, corrects remote clock skew, excludes offline sources from live counts,
and keeps their health visible.

The property inspector stores source mode and SSH alias per action. Agent Slot also stores its rank
and optional project filter. A slot is dynamic: it selects the current snapshot at that ranked
position rather than pinning a thread identifier.

## Ownership

| Path                                                     | Responsibility                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `io.github.1mentat.agentdeck.ulanziPlugin/manifest.json` | Plugin identity, compatibility, actions, and static resources                               |
| `plugin/codex-observer.js`                               | File discovery, tolerant parsing, and optional SQLite enrichment                            |
| `plugin/classifier.js`                                   | Status state machine, task labels, normalized snapshots, ranking, and counts                |
| `plugin/dashboard-state.js`                              | Dashboard roles, fleet/detail selection, filters, scope cycling, and display cursors        |
| `plugin/source-config.js`                                | Source-setting defaults, SSH-alias validation, and source selection                         |
| `plugin/source-coordinator.js`                           | Per-action source requirements, polling, health, and merged dashboards                      |
| `plugin/ssh-codex-source.js`                             | Bounded read-only SSH process and remote protocol adapter                                   |
| `plugin/remote-probe-entry.js`                           | Allowlisted, versioned output from one remote observer scan                                 |
| `generated/codex-remote-probe.mjs`                       | Build-generated single-file probe streamed to remote Node.js                                |
| `plugin/renderer.js`                                     | Escaped 200-by-200 SVG key images                                                           |
| `plugin/runtime-logger.js`                               | Rotated, allowlisted local lifecycle and source-health diagnostics                          |
| `plugin/ulanzi-api.js`                                   | Ulanzi WebSocket messages and context encoding                                              |
| `plugin/app.js`                                          | Action lifecycle, shared polling, settings, filtering, and refresh                          |
| `property-inspector/`                                    | Source settings plus Agent Slot and coordinated Dashboard Tile configuration                |
| `tests/`                                                 | Domain fixtures, manifest checks, renderer safety, observation, and real loopback transport |
| `scripts/package.mjs`                                    | Creation of the distributable plugin ZIP                                                    |
| `scripts/build-remote-probe.mjs`                         | Bundling of the observer and classifier for zero-install remote execution                   |
| `scripts/install-local.mjs`                              | Replacement of this plugin's own local Studio installation                                  |
| `scripts/check.mjs`                                      | One-command repository verification                                                         |
| `plans/`                                                 | Completed implementation trajectories and their decision logs                               |

## Compatibility and proof boundaries

Passive files cannot prove the exact runtime status of a thread owned by an independent Codex
process. The classifier therefore treats recent events as working, explicit unmatched requests as
waiting, and stale open work as quiet. A future shared app-server provider may improve fidelity, but
it must preserve this normalized snapshot boundary.

The same boundary applies to background terminals. Persisted tool events can show an unresolved
terminal handle, its sanitized executable label, and when it was observed, but cannot prove that a
process owned by another Codex client is still alive. The normalized record therefore says
`fidelity: inferred`, the renderer adds `~`, and SSH protocol version 2 carries only bounded labels
and timestamps. It never carries raw commands or output.

Unit tests prove deterministic classification and rendering. The integration test proves the plugin
can connect and emit an icon through Ulanzi Studio's bundled Node.js runtime. Searching Studio for
the five actions proves manifest discovery. Actual device placement remains separate evidence
because it changes the user's Studio profile.

SSH configuration is also a user-owned boundary. Agent Deck validates and passes only an opaque
alias. It does not parse SSH configuration, read private keys, weaken host-key verification, or log
resolved connection details. Monitoring connections explicitly disable tunnel, agent, and X11
forwarding plus configured local commands. Transport tests inject a fake child process and never
contact a real host.
