# Monitor Codex sessions through configured SSH hosts

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository does not contain its own `PLANS.md`. This document is maintained in accordance with
`~/.codex/PLANS.md`, which defines the local ExecPlan format and requirements.

## Purpose / Big Picture

After this change, an Agent Deck action can show Codex sessions from the local Mac, one host already
configured in the user's OpenSSH configuration, or both together. The remote sessions use the same
observer, classifier, ranking, waiting-state rules, and key renderers as local sessions. An Agent
Slot identifies its source host, Overview aggregates the selected sources, and a failed SSH source
is visibly offline rather than silently appearing idle.

The user configures a host by typing an OpenSSH `Host` alias in an Agent Deck property inspector.
The real alias is private runtime configuration. It must never appear as a default, fixture,
documentation example, generated probe, package artifact, or source-code constant. Agent Deck passes
the configured value to the system `/usr/bin/ssh`; OpenSSH continues to own the resolved hostname,
user, port, identity, proxy, host-key policy, and connection multiplexing.

The remote operation is read-only and requires no Agent Deck installation on the remote machine.
Agent Deck streams a bundled Node.js probe to `node --input-type=module -` over SSH. The probe reads
the remote Codex home, emits one bounded JSON response, and exits. It does not write a remote file,
start or steer a Codex session, or copy SSH credentials.

## Progress

- [x] (2026-07-27 19:57Z) Inspected the current observer, classifier, application polling loop,
      property inspector, package path, tests, and Ulanzi settings protocol.
- [x] (2026-07-27 19:57Z) Selected a zero-install remote-probe design and a per-action source
      configuration that never embeds the user's real SSH alias in the repository.
- [x] (2026-07-27 20:14Z) Added source identity fields and a coordinator while preserving local-only
      behavior for settings that predate source selection.
- [x] (2026-07-27 20:15Z) Built a single-file remote Codex probe from the existing observer and
      classifier and proved direct-observer parity with a synthetic Codex home.
- [x] (2026-07-27 20:17Z) Implemented the bounded SSH transport, source health, clock-skew
      correction, polling deduplication, and independent local refreshes.
- [x] (2026-07-27 20:18Z) Extended every action's property inspector with This Mac, Host via SSH,
      and All sources scope settings.
- [x] (2026-07-27 20:18Z) Rendered source labels and explicit configuration, connecting, and offline
      states on D200X keys.
- [x] (2026-07-27 20:21Z) Added fixture, parity, failure, security, runtime, and package tests;
      `npm run check` passes all 31 tests and validates the 79 KiB distributable.
- [x] (2026-07-27 23:10Z) Installed the verified package into Agent Deck's own Ulanzi plugin
      directory and confirmed the installed manifest and generated probe match the verified source.
- [x] (2026-07-27 21:20-04:00) Audited the publication candidate, removed private paths and an
      internal package-registry hostname, moved plans under descriptive names, and disabled
      unnecessary SSH forwarding and local-command capabilities. Added the 0BSD license selected by
      the owner.
- [ ] Configure a real SSH alias only in Studio and verify a remote Codex task on the D200X without
      recording the alias in repository artifacts or transcripts.

## Surprises & Discoveries

- Observation: The current Ulanzi integration exposes settings for one placed action context, and
  the installed examples do not expose a plugin-global settings command. Evidence:
  `plugin/ulanzi-api.js` and `property-inspector/pi-api.js` implement `getSettings` and
  `setSettings` with an action UUID, key, and action ID; a search of installed plugin JavaScript
  found no global-settings protocol.

- Observation: The current Codex observer is already suitable for execution on another Node.js host
  once its relative import is bundled. Evidence: `plugin/codex-observer.js` depends only on Node
  built-ins and the pure local `plugin/classifier.js`. SQLite enrichment is optional and already
  falls back to JSON Lines session metadata.

- Observation: Remote and local wall clocks may differ even when both classify their own work
  correctly. Evidence: snapshots contain absolute `statusSince` and `lastActivityAt` timestamps,
  while the key renderer computes ages against the local dashboard scan time. A merge without clock
  adjustment can display incorrect ages.

- Observation: A single application-level in-flight refresh promise would let an eight-second SSH
  timeout suppress the normal 2.5-second local polling cadence. Evidence: the coordinator test
  `continues local scans while an SSH scan is still in flight` starts a second local scan before
  resolving the first remote scan.

- Observation: npm generated otherwise valid lockfiles with the machine's configured internal
  registry hostname in every `resolved` field. Evidence: clean installs succeeded after replacing
  those locations with canonical `https://registry.npmjs.org/` URLs, and both dependency audits
  reported zero vulnerabilities.

## Decision Log

- Decision: Reuse the same observer and classifier inside a generated, single-file remote probe.
  Rationale: This prevents local and SSH sources from developing competing definitions of working,
  waiting, quiet, failed, and recently completed. A bundle sent on standard input avoids permanent
  remote installation and remote file writes. Date/Author: 2026-07-27 / Codex

- Decision: Add `esbuild` version `0.28.1` as an exact root development dependency and keep `ws` as
  the only shipped runtime dependency. Rationale: A standard Node bundler can turn the observer,
  classifier, and remote entry point into one auditable ESM file while leaving Node built-ins
  external. Hand-written concatenation or import rewriting would create a fragile second build
  language. The bundler runs only during development, testing, and packaging. Date/Author:
  2026-07-27 / Codex

- Decision: Store `sourceMode` and `sshHost` in each action's existing Ulanzi settings. Rationale:
  Per-action settings are the supported persistence boundary visible in the current Ulanzi protocol.
  They also let one key show local work while another shows SSH work. The runtime deduplicates
  identical aliases so repeated settings do not create repeated connections. Date/Author: 2026-07-27
  / Codex

- Decision: Default every existing and new action to `sourceMode: "local"` and `sshHost: ""`.
  Rationale: Installing the feature must preserve current behavior and must not guess, discover, or
  embed a host. SSH begins only after a user enters an alias in Studio. Date/Author: 2026-07-27 /
  Codex and user

- Decision: Accept only OpenSSH aliases matching `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`. Rationale: The
  setting is an SSH-config alias, not a free-form hostname command. Rejecting leading dashes,
  whitespace, shell syntax, user-at-host forms, and wildcard entries keeps it an argument to
  `/usr/bin/ssh` rather than a command language. Users retain advanced routing through their SSH
  config. Date/Author: 2026-07-27 / Codex

- Decision: Require `node` version 20 or later in the remote non-interactive SSH path for the first
  release. Rationale: The local plugin already targets Node 20, and requiring the same remote
  primitive keeps the probe zero-install and testable. Agent Deck should return an actionable
  `NODE UNAVAILABLE` state if `ssh <alias> node --version` would fail; it must not accept an
  arbitrary remote shell command setting. Date/Author: 2026-07-27 / Codex

- Decision: Use `/usr/bin/ssh -T -o BatchMode=yes -o ConnectTimeout=5` and leave host-key checking,
  identity, proxy, and multiplexing behavior to the user's SSH configuration. Rationale: Batch mode
  prevents password or passphrase prompts from hanging a background plugin. Agent Deck must not
  weaken host-key verification, inspect private keys, or replace the user's SSH trust policy. A host
  requiring first-use confirmation must be established manually before Agent Deck can monitor it.
  Date/Author: 2026-07-27 / Codex

- Decision: Disable tunnel, agent, and X11 forwarding plus configured local commands on monitoring
  connections. Rationale: The remote probe needs only one SSH session and standard input/output;
  inherited forwarding or `LocalCommand` settings would unnecessarily broaden its effects.
  Date/Author: 2026-07-27 / Codex

- Decision: Exclude agents from an unavailable SSH source from live ranking and counts, and expose
  the source as offline. Rationale: Reusing last-known agents without a stale marker could falsely
  claim that remote work is still working or waiting. The coordinator may retain the last successful
  response for diagnostics, but active keys use only a successful current scan. Date/Author:
  2026-07-27 / Codex

- Decision: Poll local state every 2.5 seconds and each distinct SSH source no more often than every
  15 seconds, with an 8-second execution timeout and one in-flight scan per source. Rationale: Local
  file scans are cheap; opening background SSH sessions at the local cadence would waste resources
  and could create connection storms. A key press may request an immediate refresh, but it must join
  an in-flight scan and respect a short per-source rate limit. Date/Author: 2026-07-27 / Codex

- Decision: Present `sourceMode` as Scope values `This Mac`, `Host via SSH`, and `All sources`.
  Rationale: These labels describe what the key includes; the stored values remain stable internal
  identifiers. `All sources` means the local Mac plus that action's configured SSH alias, and Agent
  Slot always labels the source of the selected session. Date/Author: 2026-07-27 / Codex and user

- Decision: Let source adapters reject with bounded stable error codes and let the coordinator turn
  those errors into health records. Rationale: This keeps transport diagnostics testable without
  exposing stderr, while centralizing the rule that an offline source contributes no live agents.
  Date/Author: 2026-07-27 / Codex

- Decision: Do not serialize local and SSH completion behind one application refresh promise.
  Rationale: The coordinator deduplicates each source's own in-flight scan, so overlapping scheduler
  ticks can refresh local state while joining the slower SSH promise safely. Date/Author: 2026-07-27
  / Codex

## Outcomes & Retrospective

Milestones 1 through 4 and automated Milestone 5 acceptance are implemented. Classification remains
provider-owned and transport-independent, the remote probe requires no installation, local-only is
still the default, and SSH failure is an explicit user-visible state. The verified ZIP includes the
generated probe and only the `ws` production dependency; it excludes the root build dependency.
Installation is complete and checksum-verified. Studio configuration and real-device verification
remain intentionally pending. The primary constraint is that the first release requires Node.js 20
or later to be available to non-interactive SSH commands on the configured host.

The per-action configuration is intentionally proportional to the Ulanzi protocol currently
observed. If a future Studio API proves a durable plugin-global settings surface, host aliases can
move behind a shared source catalog without changing the normalized source and snapshot interfaces
defined below.

## Context and Orientation

The Ulanzi plugin is `io.github.1mentat.agentdeck.ulanziPlugin`. `plugin/codex-observer.js` reads a
Codex home and returns a dashboard containing ranked agent snapshots, counts, a scan time, and
warnings. `plugin/classifier.js` owns all lifecycle classification and ranking. `plugin/app.js` owns
a source coordinator, schedules it every 2.5 seconds while actions are active, and renders each
action from its selected source dashboard. `plugin/renderer.js` creates the dynamic SVG key images.
`property-inspector/` configures Scope for every action and rank and project filtering for Agent
Slot.

An OpenSSH `Host` alias is the name at the beginning of a `Host` entry in the user's SSH config. It
is not necessarily a DNS hostname. Agent Deck must treat it as an opaque, validated connection name
and must not parse the user's SSH configuration or persist the resolved connection details.

A source is one place from which Agent Deck receives normalized agent snapshots. The built-in local
source has ID `local`. An SSH source has an in-memory ID derived from its configured alias. A source
health record says whether a scan is online, offline, misconfigured, or unsupported. A source
coordinator is the module that polls each distinct required source once, applies source identity,
merges successful snapshots, and produces the source-filtered dashboard for each action.

A remote probe is generated JavaScript streamed to the remote Node process on standard input. The
probe contains the same observer and classifier used locally. Its standard output is reserved for a
single versioned JSON envelope; diagnostic text goes to standard error and is bounded by the local
transport. The envelope contains only the normalized fields needed by Agent Deck, not raw session
events or assistant/tool output.

Each action gains these settings while retaining its existing settings:

    sourceMode: "local" | "ssh" | "local_and_ssh"
    sshHost: string

Agent Slot continues to own:

    slot: integer from 1 through 12
    projectFilter: string

Missing source settings are interpreted as local mode with an empty SSH alias. That makes existing
profiles backward compatible.

## Plan of Work

### Milestone 1: Make source identity a first-class local concept

Add `provider`, `sourceId`, `sourceKind`, and `sourceLabel` to the normalized snapshot returned by
`plugin/classifier.js`, using injected defaults so classifier fixtures remain deterministic. The
local observer tags snapshots as provider `codex`, source ID `local`, source kind `local`, and
source label `LOCAL`. IDs used by the merged dashboard become composite IDs so the same thread
identifier on two sources cannot collide.

Create `plugin/source-coordinator.js`. It owns a local source, a map of SSH sources keyed by alias,
per-source polling timestamps, in-flight promises, source health, and dashboard merging. Initially
exercise it with the local source only. Refactor `plugin/app.js` to ask the coordinator for a
dashboard selected by an instance's settings instead of reading a process-global dashboard directly.
Existing actions without new settings must render byte-equivalent status content and keep the
current 2.5-second local cadence.

At the end of this milestone, all existing tests pass and new coordinator tests prove local-only
backward compatibility, composite IDs, source filtering, and one shared scan for several actions.

### Milestone 2: Build and prove the zero-install remote probe

Add `plugin/remote-probe-entry.js`. It creates the existing Codex observer, performs one scan, maps
each snapshot through an explicit output allowlist, and writes a JSON envelope with schema version
1, provider `codex`, the remote scan time, agents, counts, and bounded warnings. It catches fatal
errors, writes a concise diagnostic to standard error, and exits nonzero without writing partial
JSON to standard output.

Add `scripts/build-remote-probe.mjs` and pin `esbuild` `0.28.1` in the root `devDependencies`.
Bundle the entry point for Node 20 as ESM with Node built-ins external. Write the generated file to
`io.github.1mentat.agentdeck.ulanziPlugin/generated/codex-remote-probe.mjs`. Add that directory to
`.prettierignore`; generated output is build material, not a hand-edited owner. Make `npm test`
build the probe before tests, and make `scripts/package.mjs` build it before constructing the ZIP.

Add a parity test that creates one synthetic Codex home, scans it directly with
`createCodexObserver`, executes the generated probe locally with `CODEX_HOME` pointing at the same
fixture, and compares normalized agents, statuses, ordering, and counts after removing transport
timestamps. The test must cover working, explicit user input, elevated approval, quiet, recent
completion, and subagent identity. It establishes that SSH uses the same session semantics rather
than a second parser.

### Milestone 3: Add the bounded SSH source

Create `plugin/ssh-codex-source.js`. Load the generated probe once and expose a constructor with an
injectable child-process spawn function for tests. Validate the alias before spawning. Invoke only
the fixed system executable and fixed remote command:

    /usr/bin/ssh -T -o BatchMode=yes -o ConnectTimeout=5 \
      -o ClearAllForwardings=yes -o ForwardAgent=no -o ForwardX11=no \
      -o PermitLocalCommand=no <alias> node --input-type=module -

Pass the alias as one argument; never concatenate it into the remote command. Stream the probe to
the child standard input and close it. Collect at most 8 MiB of standard output and 64 KiB of
standard error. Kill the child after 8 seconds, reject malformed or mismatched protocol versions,
and turn known exit conditions into stable error codes such as `SSH_UNAVAILABLE`, `SSH_TIMEOUT`,
`HOST_KEY_REQUIRED`, `NODE_UNAVAILABLE`, `PROBE_PROTOCOL`, and `OUTPUT_LIMIT`. Detailed stderr may
be logged in bounded form for diagnosis but must not be rendered on a key.

The transport records local start and receive times. Compute clock offset using the midpoint of
those times relative to the remote envelope's scan time, then adjust `statusSince` and
`lastActivityAt` before merging. Prefix every remote agent's ID with its source ID, tag it with the
configured source label, discard remote-only file paths that no renderer or filter needs, and
recompute merged counts locally with `summarizeSnapshots`.

Integrate SSH sources into `plugin/source-coordinator.js`. It must scan only aliases required by at
least one active action, deduplicate identical aliases, stop scheduling an alias after the last
dependent action becomes inactive or is cleared, and never permit overlapping scans of one alias.
One SSH failure updates source health but does not block local refreshes or another source.

Add tests using an injected fake spawn implementation. Cover exact SSH arguments, probe delivery on
standard input, alias validation before spawn, success, timeout, nonzero exit, missing Node,
malformed JSON, protocol mismatch, output limits, clock skew, deduplicated polling, independent
source failures, and exclusion of offline agents from live counts. Test fixtures use names such as
`fixture-host`; no real alias enters a fixture or snapshot.

### Milestone 4: Configure and render sources on every action

Add `PropertyInspectorPath` to Overview, Needs You, and Recent Completion in `manifest.json`; Agent
Slot already has it. Refactor `property-inspector/inspector.html` and `inspector.js` so common
source controls appear for every action while rank and project filter appear only for Agent Slot.
Use the action UUID supplied in the property-inspector URL to choose the conditional fields.

The common UI contains a Source selector with Local, SSH, and Local + SSH choices and an
`SSH config alias` text input. The host field is disabled in Local mode. Saving trims the alias but
never lowercases it because OpenSSH patterns can be case-sensitive in user expectations. Invalid
values show an inline validation message and are not saved. No placeholder may resemble the user's
real alias; use the generic text `SSH config alias`.

Update `plugin/app.js` to normalize old and new settings, register active source requirements with
the coordinator, and render a dashboard filtered to each instance's source mode. A mode requiring
SSH with an empty or invalid alias renders `SET SSH HOST`. An SSH-only action whose source is
offline renders `SSH OFFLINE` or the more specific stable error label. A Local + SSH Overview
continues to show successful local counts and adds a small offline-source indicator if SSH fails.

Update `plugin/renderer.js` so Agent Slot cards identify the source without sacrificing status,
effort, and age. Local cards show `LOCAL`; remote cards show a safely truncated alias. Subagent
cards retain the subagent marker alongside the source. Needs You and Recent Completion use the
selected source-filtered dashboard. Renderer inputs remain escaped, including the configured alias.

Extend renderer, inspector, manifest, and WebSocket runtime tests. Prove that an alias containing
SVG metacharacters is either rejected by validation or escaped before rendering, a combined
dashboard ranks urgent remote work ahead of ordinary local work, and a source failure cannot be
mistaken for an all-clear state.

### Milestone 5: Package, install, and verify the real journey

Update `README.md`, `ARCHITECTURE.md`, and `AGENTS.md` with source settings, the remote Node
requirement, read-only and SSH authority boundaries, diagnostics, and the new module ownership. The
documentation refers only to `<ssh-alias>` or `fixture-host`; it must not contain the user's actual
alias or resolved connection data.

Run the complete repository check. Inspect the ZIP to prove it contains the generated probe and does
not contain root development dependencies. Install the verified bundle using the existing local
installer and restart Ulanzi Studio. Do not change source settings in the user's profile until the
user authorizes that profile mutation during implementation.

For manual acceptance, first establish the host key and any credential prompts in a normal terminal
outside Agent Deck. Confirm that this non-interactive primitive succeeds:

    ssh -T -o BatchMode=yes <ssh-alias> node --version

Enter the real alias only in Studio's property inspector. Configure one Agent Slot as SSH and one
Overview as Local + SSH. Start or observe a disposable Codex task on the remote machine. The Agent
Slot must show the remote source label, task, effort, and status; Overview must include both
sources. Trigger an explicit remote user-input request and confirm Needs You turns amber. Stop
connectivity or use a temporary generic invalid setting on a spare action, confirm the source
becomes offline without erasing local counts, then restore the setting. Do not paste the alias,
resolved host, username, identity path, or raw SSH diagnostic into plan updates or fixtures.

## Concrete Steps

Work from the repository root.

Before editing, record the baseline:

    npm run check

Expect 15 passing tests, successful creation of `dist/io.github.1mentat.agentdeck.ulanziPlugin.zip`,
and successful ZIP integrity validation.

Add the pinned bundler and update the lock file:

    npm install --save-dev --save-exact esbuild@0.28.1 --ignore-scripts

After implementing the probe build, create it explicitly during iteration:

    npm run build:probe

Expect `io.github.1mentat.agentdeck.ulanziPlugin/generated/codex-remote-probe.mjs` to exist and
contain no `ws` dependency or configured host value.

Run narrow tests while working:

    node --test tests/remote-probe.test.js
    node --test tests/ssh-codex-source.test.js
    node --test tests/source-coordinator.test.js
    node --test tests/renderer.test.js tests/ulanzi-runtime.test.js

The exact final test count will increase during implementation. Every listed file must pass with no
network access because SSH behavior is injected or simulated.

Run final automated acceptance:

    npm run check
    unzip -l dist/io.github.1mentat.agentdeck.ulanziPlugin.zip

Expect formatting to pass, every test to pass, the package to build, and ZIP integrity validation to
pass. The ZIP listing must include `generated/codex-remote-probe.mjs`, must include only the
production `ws` dependency under plugin `node_modules`, and must not include root `node_modules` or
`esbuild`.

Install only after automated acceptance and explicit local-install authorization:

    npm run install:local

Restart Ulanzi Studio, configure the alias only through Studio, and perform the real-host journey in
Milestone 5. Record bounded evidence such as source mode, online/offline result, displayed status,
and timing. Do not record the actual alias.

## Validation and Acceptance

Local backward compatibility is accepted when a profile with no `sourceMode` or `sshHost` settings
behaves exactly as Local mode and all existing local classifier tests still pass.

Semantic parity is accepted when the generated remote probe and direct observer return the same
ordered statuses and counts for the same synthetic Codex home. The parity test must fail if the
probe uses a copied or altered classifier.

SSH safety is accepted when tests prove that the configured alias is a single `/usr/bin/ssh`
argument, invalid aliases never spawn a process, the remote command is constant, BatchMode and the
connection timeout are present, no host-key weakening option is present, output and time are
bounded, and no private-key material is read by Agent Deck.

Failure truthfulness is accepted when a remote timeout, authentication failure, missing remote Node,
malformed response, and protocol mismatch each produce an offline source health record; none may
produce `ALL CLEAR`, retain a remote agent in live counts, block local refresh, or crash the plugin.

UI acceptance is met when every action exposes source settings, Local remains the default, SSH mode
requires a valid alias, Agent Slot shows its source, combined Overview aggregates successful
sources, and source-derived text is escaped.

Real-environment acceptance is met when the D200X shows one actual remote Codex task and its effort,
transitions an explicit remote input request into Needs You, continues showing local work during a
remote outage, and recovers on the next successful shared SSH poll. The user must observe the
physical device because Studio's semantic tree alone cannot prove the pixels shown on the D200X.

Privacy acceptance is met when a repository-wide search after manual verification finds no actual
host alias or resolved SSH detail in source, tests, docs, generated files, package contents, or plan
updates. The alias may exist only in user-controlled Ulanzi profile settings and process memory.

## Idempotence and Recovery

Probe generation, formatting, tests, and packaging are repeatable and write only generated or
repository-local build artifacts. Rebuilding the probe replaces only
`generated/codex-remote-probe.mjs`. Packaging recreates only `dist/`. Local installation replaces
only `io.github.1mentat.agentdeck.ulanziPlugin` in Ulanzi's plugin directory.

SSH scans do not write remote state. Killing a timed-out child closes the connection; the next poll
starts cleanly. An offline host does not require cache deletion or application restart. Correct the
SSH config, authentication agent, host-key state, or remote Node path outside Agent Deck, then press
the key or wait for the next poll.

If the new source coordinator regresses local behavior, retain the original local observer behind a
temporary local-only adapter until parity tests pass. Do not weaken classifier tests or change
status semantics to make transport tests green.

If the generated probe cannot run under the documented remote Node version, stop before installing,
record the exact Node and esbuild error without private SSH details, and fix the probe target. Do
not fall back to copying files into the remote home or evaluating a user-provided remote shell
command.

If manual verification reveals profile corruption or unexpected settings propagation, quit Studio,
restore the profile from a timestamped backup, reinstall the last verified local-only ZIP, and leave
SSH settings unconfigured. Profile backup and restoration require explicit user authorization at
implementation time.

## Artifacts and Notes

The remote protocol version 1 envelope is JSON with this conceptual shape:

    {
      "schemaVersion": 1,
      "provider": "codex",
      "scannedAt": 0,
      "agents": [],
      "counts": {},
      "warnings": []
    }

Standard output contains only this envelope. A successful response with unknown schema version is a
protocol failure, not partially accepted data. Warnings are bounded and must not include raw session
events.

The source coordinator deliberately recomputes merged counts from accepted agent snapshots. Remote
counts are parity evidence but not a second source of truth after source tagging, clock adjustment,
or filtering.

The final automated acceptance transcript is:

    npm run check
    # 31 tests passed; formatting passed
    # Created dist/io.github.1mentat.agentdeck.ulanziPlugin.zip (79 KiB)
    # No errors detected in compressed data

The ZIP listing includes `generated/codex-remote-probe.mjs` and the pinned `ws` production package.
It contains no `esbuild` package. A repository privacy scan found none of the private host fragments
supplied outside this plan.

The configured alias is not a secret credential, but it can disclose private network topology. Treat
it as private configuration: render it only on the user's device, avoid normal logs, and never add
the real value to the repository.

## Interfaces and Dependencies

Extend the normalized object returned by `plugin/classifier.js` with:

    provider: "codex"
    sourceId: string
    sourceKind: "local" | "ssh"
    sourceLabel: string

`plugin/codex-observer.js` must accept source defaults without knowing about SSH:

    createCodexObserver({
      codexHome,
      now,
      execFile,
      source: { provider, sourceId, sourceKind, sourceLabel },
      ...existingOptions
    }) -> { scan() }

Create `plugin/ssh-codex-source.js` with:

    validateSshAlias(value) -> { ok: boolean, value?: string, error?: string }

    createSshCodexSource({
      hostAlias,
      probePath,
      spawn,
      now,
      timeoutMs,
      maxStdoutBytes,
      maxStderrBytes
    }) -> {
      id,
      kind,
      label,
      scan() -> Promise<Dashboard>
    }

`scan()` resolves with one successful normalized dashboard or rejects with a stable bounded error
code. It never throws raw child-process output across the coordinator boundary. The source
coordinator catches that stable error and creates the offline health record.

Create `plugin/source-coordinator.js` with:

    createSourceCoordinator({
      localSource,
      sshSourceFactory,
      now,
      localPollMs,
      sshPollMs
    }) -> {
      setAction(context, settings, active),
      clearAction(context),
      refresh(),
      dashboardFor(actionSettings),
      requiredSourceIds()
    }

`dashboardFor` returns the existing `agents`, `counts`, `scannedAt`, and `warnings` fields plus:

    sources: Array<{
      id: string,
      kind: "local" | "ssh",
      label: string,
      status: "pending" | "online" | "offline",
      scannedAt: number,
      lastSuccessAt: number,
      errorCode?: string
    }>

An invalid or missing alias is represented by top-level `configurationError: "SET_SSH_HOST"` without
constructing or spawning an SSH source.

Add `esbuild` `0.28.1` as an exact root development dependency. Do not add it to the plugin's
runtime `package.json`. Keep `ws` pinned as the only production dependency.

Change note (2026-07-27 19:57Z): Created this self-contained plan after inspecting Agent Deck's
current source, tests, package flow, and Ulanzi settings boundary. The plan deliberately omits the
user's real SSH alias and makes that omission an acceptance requirement.

Change note (2026-07-27 20:19Z): Updated the living plan after implementing milestones 1 through 4.
Recorded the stable-error ownership and independent local-refresh decisions, aligned interface names
with the implemented coordinator, and left installation and real-host verification explicitly
pending.

Change note (2026-07-27 20:22Z): Recorded successful automated acceptance, package and privacy audit
evidence, and the remaining authorization-gated installation and physical-device journey.

Change note (2026-07-27 23:10Z): Recorded the authorized local installation and checksum evidence.
No Studio action settings or SSH aliases were read or changed during installation.

Change note (2026-07-27 21:20-04:00): Recorded publication sanitization, descriptive plan routing,
public-registry lockfiles, and least-authority SSH connection options discovered during pre-push
review.
