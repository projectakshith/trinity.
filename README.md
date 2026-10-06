# trinity

> a personal assistant.

Trinity is a personal assistant hub. Tools plug into it; the first is [Morpheus](https://github.com/projectakshith/morpheus), a coding agent that runs on your laptop and streams to Trinity over WebSocket, so you can drive it from a browser or your phone. Automations are next. Built with Next.js (static export), typeset in Instrument Serif and Afacad.

### setup

```bash
cd ../trinity && bun install

bun dev          # http://localhost:6070 (also reachable over LAN / Tailscale)
bun run build    # static app in out/ (what Capacitor will bundle)
```

### connecting

1. On the laptop: `morpheus serve` (add `--host 0.0.0.0` or your tailscale IP to reach it from other devices).
2. In Trinity open Morpheus and enter the printed `ws://…` address and token (`~/.morpheus/daemon.json`).

Or open a pairing link that fills both in: `http://<trinity-host>:6070/?url=ws://<laptop>:7878&token=<token>`. The token gives shell access to the laptop, so don't share it.

### Android app

The Android project lives in `android/`. Build and copy the static app with `bun run android:sync`, then create a shareable debug APK with `bun run android:apk`. The APK is at `android/app/build/outputs/apk/debug/app-debug.apk`. Send it to the phone and install it there; a USB connection is optional. The Android SDK and Java 21 are required for the native build. Android Studio is optional.

For access away from home, put the Mac and phone on the same Tailscale network. Start `morpheus serve` and `bun run daemon` on the Mac, then expose their localhost ports privately with Tailscale Serve:

```bash
tailscale serve --bg --https=7878 7878
tailscale serve --bg --https=7979 7979
```

In the Android app, connect Morpheus with `wss://<mac>.<tailnet>.ts.net:7878` and the token in `~/.morpheus/daemon.json`. On Brief, tap **Connection** and enter `https://<mac>.<tailnet>.ts.net:7979` and the token in `~/.trinity/daemon.json`. Keep both tokens private. The app stores both links on the phone so it can reconnect after reopening.

The web version is deployed on Vercel at https://trinity-eosin.vercel.app from `main`. The APK loads that URL through Capacitor's `server.url`, so pushing to `main` updates both the site and the installed app on its next launch. The app needs a network connection to open. Changes to native code, Capacitor plugins, or `capacitor.config.ts`, including future phone CUA support, still need a new APK.

### what's there

- home: greeting, a composer that starts a Morpheus task, tool cards, recent sessions
- Morpheus: chat with the agent's work folded inline ("Worked for 12s · 3 steps"), expandable diffs and command output, model picker, branch and token usage
- daemon-side autocomplete for `/commands` and `@files`, stop and queue, follows `/new` and `/resume`
- light and dark themes, sidebar drawer on phones, auto-reconnect with replay
- automations: placeholder

### structure

```
src/
  app/          routes only: /, /morpheus/?s=<session>, /automations/
  shell/        AppShell (sidebar frame, providers), Sidebar, TopBar
  home/         home page, built from the tool registry
  tools/
    registry.ts the list of tools
    types.ts    the Tool contract: nav badge, home card status, sidebar and home sections, ask/new-chat hooks
    morpheus/   connection, session state, pages, chat, steps, model picker
    automations/
  ui/           Icon, Markdown, Composer (tool-agnostic)
  lib/          format, theme, storage, small hooks
  styles/       tokens and base styles
  config.ts     owner name
```

Adding a tool means a folder under `src/tools/`, an entry in `registry.ts`, and a route in `src/app/`.

### trinityd and the pet

`trinityd` (`daemon/`) reads your WhatsApp (local desktop database, read-only), Gmail and Google Calendar. It gathers recent activity in code, makes one cheap model call through Neo to rank what matters, and caches the digest in `~/.trinity/`. The call only runs again when something changed. The pet (`pet/`) is a small ◈ that walks along the bottom of your screen. It hops and speaks up when something new needs you. Click it for the brief, drag it around, or right-click for more.

```bash
bun run daemon   # http://127.0.0.1:7979, refreshes every 15 min
bun run pet      # native macOS app
```

- **WhatsApp:** give Full Disk Access to the terminal that runs `trinityd` (System Settings › Privacy & Security › Full Disk Access).
- **Gmail + Calendar:** create an OAuth client (type *Desktop app*) in Google Cloud with the Gmail and Calendar APIs enabled. Put its id and secret in `~/.trinity/config.json` under `google`, restart `trinityd`, then open `http://127.0.0.1:7979/auth/google`.
- **Model:** `model` in `~/.trinity/config.json` (default `gemini-3.8-flash-high`). Set `local/qwen3:14b` to keep everything on-device. Token usage is logged to `~/.trinity/usage.jsonl`.

### notes

- `morpheus/client` is TypeScript source from the pinned public Morpheus commit, compiled by Next via `transpilePackages`. To test unpublished local Morpheus changes, run `bun link` in `../morpheus`, then `bun link morpheus` in Trinity. Re-run `bun install` to restore the pinned dependency.
