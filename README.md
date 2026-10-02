# trinity

> a personal assistant.

Trinity is a personal assistant hub. Tools plug into it; the first is [Morpheus](https://github.com/projectakshith/morpheus), a coding agent that runs on your laptop and streams to Trinity over WebSocket, so you can drive it from a browser or your phone. Automations are next. Built with Next.js (static export), typeset in Instrument Serif and Inter.

### setup

```bash
# once: expose morpheus/client to Trinity
cd ../morpheus && bun link
cd ../trinity && bun install

bun dev          # http://localhost:6070 (also reachable over LAN / Tailscale)
bun run build    # static app in out/ (what Capacitor will bundle)
```

### connecting

1. On the laptop: `morpheus serve` (add `--host 0.0.0.0` or your tailscale IP to reach it from other devices).
2. In Trinity open Morpheus and enter the printed `ws://…` address and token (`~/.morpheus/daemon.json`).

Or open a pairing link that fills both in: `http://<trinity-host>:6070/?url=ws://<laptop>:7878&token=<token>`. The token gives shell access to the laptop, so don't share it.

### what's there

- home: greeting, a composer that starts a Morpheus task, tool cards, recent sessions
- Morpheus: chat with the agent's work folded inline ("Worked for 12s · 3 steps"), expandable diffs and command output, model picker, branch and token usage
- daemon-side autocomplete for `/commands` and `@files`, stop and queue, follows `/new` and `/resume`
- light and dark themes, sidebar drawer on phones, auto-reconnect with replay
- automations: placeholder

### notes

- `morpheus/client` is TypeScript source in the sibling repo, compiled by Next via `transpilePackages`; `next.config.ts` widens the Turbopack root to the parent folder so the symlink resolves.
