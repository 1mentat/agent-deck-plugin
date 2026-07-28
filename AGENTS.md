# Agent Deck

Agent Deck is a read-only Ulanzi Studio plugin for showing Codex thread state on a D200X. Read
`README.md` for the user-facing workflow and `ARCHITECTURE.md` for code ownership and runtime
boundaries.

## Working loop

1. Inspect the owning module and its tests before changing behavior.
2. For a complex feature or significant refactor, create a descriptively named ExecPlan under
   `plans/` and maintain it in accordance with `~/.codex/PLANS.md`.
3. Keep the passive observer, classifier, renderer, and Ulanzi transport as separate layers.
4. Run `npm run check` before handing off a change. This checks formatting, runs the complete test
   suite, builds the distributable, and validates the ZIP archive.
5. When behavior affects Studio or the D200X, also verify it in Ulanzi Studio and state which part
   of the real-device journey was observed.

## Invariants

- Release-one actions are read-only. They may read `~/.codex` and refresh key images, but they must
  not send prompts, approve commands, switch sessions, change focus, or modify Codex configuration.
- SSH observation may run only the fixed bundled probe through `/usr/bin/ssh` in batch mode. Keep
  host aliases in action settings and process memory; never add a user's real alias to source,
  fixtures, documentation, generated artifacts, packages, or logs.
- Do not call merely stale work blocked. Only an unmatched explicit user-input or elevated-execution
  request may enter a needs-user state. Quiet work must remain visibly uncertain.
- `plugin/classifier.js` owns status semantics and ranking. Adapters and renderers must consume its
  normalized snapshots rather than reimplementing classification.
- `plugin/codex-observer.js` must tolerate missing, locked, changing, or partially written Codex
  state and return non-fatal warnings where possible.
- Keep runtime dependencies small and pinned. A new dependency needs a concrete capability that is
  cheaper and safer to own upstream than locally.
- Packaging may recreate repository-local `dist/`. Local installation may replace only the plugin's
  own `io.github.1mentat.agentdeck.ulanziPlugin` directory. Do not change a user's Studio profile
  without explicit authorization.

## Useful commands

    npm test
    npm run format
    npm run check
    npm run package
    npm run install:local

Tests use synthetic Codex homes and must not depend on private session content. The WebSocket
integration test binds only to loopback. `npm run install:local` writes outside the repository and
is not part of the normal verification loop.
