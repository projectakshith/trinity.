# trinity

> interface for morpheus.

A chat client for the [Morpheus](../morpheus) coding agent. Trinity talks to `morpheus serve` over WebSocket, so the agent keeps running on your laptop while you watch and drive it from a browser or your phone. Built with [Manic](https://manicjs.tech) in frontend (SPA) mode; styled after the Morpheus TUI.

### setup

```bash
# once: expose morpheus/client to Trinity
cd ../morpheus && bun link
cd ../trinity && bun install

bun dev          # http://localhost:6070
bun run build    # static app in .manic/client (what Capacitor will bundle)
```

### connecting

1. On the laptop: `morpheus serve` (add `--host 0.0.0.0` or your tailscale IP to reach it from other devices).
2. Open Trinity and enter the printed `ws://…` address and token (`~/.morpheus/daemon.json`).

Or open a pairing link that fills both in: `http://<trinity-host>:6070/?url=ws://<laptop>:7878&token=<token>`. The token gives shell access to the laptop, so don't share it.

### what's there

- sessions sidebar (saved + live), new session, follows `/new` and `/resume`
- streamed feed: prompts, thoughts, notes, live action line, markdown replies
- tool activity column with the TUI's cards (diffs, command output), via `describeStep` from `morpheus/client`
- status bar (state, elapsed, steps, context, tokens, queue), stop/queue, slash commands
- daemon-side autocomplete for `/commands` and `@files`
- model picker from Neo's catalog
- auto-reconnect with replay; phones relink when the app returns to the foreground

### notes

- `@manicjs/lint` is removed from `.oxlintrc.json`: oxlint runs it under Node, which refuses to type-strip TypeScript inside `node_modules`, so `manic build` fails with it enabled.
