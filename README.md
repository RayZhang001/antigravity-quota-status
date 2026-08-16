# Antigravity Quota Status

A small status-bar extension for **Google Antigravity IDE** that keeps the quota information you normally have to open **Settings → Models** to see directly in view.

It shows the two quota windows exposed by Antigravity's local quota summary:

```text
✨ Gemini W 92% · 5h 69% ↶ 2h 23m  —  Claude/GPT W 63% · 5h 19% ↶ 4h 13m
```

> This is an unofficial community extension and is not affiliated with or endorsed by Google.

## Why this exists

Antigravity exposes weekly and 5-hour quota in its Models settings, but checking it repeatedly interrupts your workflow. This extension reads the same local quota summary and keeps the useful part in the status bar.

The design goal is intentionally narrow: **show quota clearly, stay local, and do as little background work as possible.**

## Features

- **Weekly + 5-hour quota at a glance** for Antigravity model groups.
- **Reset countdowns** without opening Settings.
- **Hover details** with remaining percentages and reset times.
- **One-click refresh** from the status item.
- **Model details on demand** using Antigravity's local model status response.
- **Quick jump to Settings → Models** with `Alt+Q` / `Option+Q`.
- **No runtime dependencies, no webview, no external service, no API key.**
- Configurable refresh interval and status-bar display mode.

## Installation

### From Open VSX

Once published, search for **Antigravity Quota Status** in Antigravity's Extensions view and install it normally.

### From a VSIX

Download the `.vsix`, then in Antigravity choose **Extensions → … → Install from VSIX…**.

## Usage

The extension activates after Antigravity starts and adds a quota item to the right side of the status bar.

Click the item to:

- refresh quota immediately;
- open Antigravity's built-in Models settings;
- inspect model-level metadata;
- view the latest raw quota-summary JSON for debugging.

### Commands

| Command | Default shortcut | Purpose |
| --- | --- | --- |
| `Antigravity Quota: Show Usage Details` | Click status item | Open the action menu |
| `Antigravity Quota: Refresh Quota` | Command Palette | Refresh immediately |
| `Antigravity Quota: Open Models Settings` | `Alt+Q` / `Option+Q` | Jump to the built-in quota screen |
| `Antigravity Quota: Show Model Breakdown` | Command Palette | Inspect model metadata on demand |

### Settings

| Setting | Default | Description |
| --- | --- | --- |
| `antigravityQuota.refreshIntervalSeconds` | `120` | Background refresh interval, 30–3600 seconds |
| `antigravityQuota.statusBarDisplay` | `both` | Show `both`, `weekly`, or `fiveHour` quota |
| `antigravityQuota.showResetCountdown` | `true` | Show the 5-hour reset countdown in the status bar |

## How it works

Antigravity runs a local language-server process. The extension discovers that process and its localhost listening port, then makes read-only requests to the local language-server service.

For normal background refreshes it uses:

```text
RetrieveUserQuotaSummary
```

That response contains the grouped **weekly** and **5-hour** quota buckets shown by Antigravity's own quota UI.

The heavier model catalog is only requested when you explicitly choose **Show Model Breakdown**, using:

```text
GetUserStatus
```

After the first successful connection, the extension caches the local server connection. Normal polling therefore performs only the quota-summary request; process/port discovery is repeated only after a connection failure.

## Privacy and security

- Requests stay on `127.0.0.1`.
- The extension does not send telemetry.
- It does not ask for your Google credentials or an API key.
- It does not read your prompts, conversations, workspace files, or source code.
- A CSRF token used by Antigravity's local service is discovered from the local Antigravity process and is kept in memory only.

The **View raw quota response** command opens local diagnostic data in an editor tab. Review it before sharing it publicly.

## Compatibility and limitations

This extension relies on **undocumented internal Antigravity RPCs**. They can change in an Antigravity update without notice. If that happens, the extension may need an update even though the built-in Models screen still works.

The connection discovery code is designed for Windows, macOS, and Linux, but platform behavior can vary. Bug reports with your OS, Antigravity version, and the extension error message are welcome.

The direct Models-tab navigation also uses Antigravity-specific workbench commands and may need adjustment if Google changes the Settings UI.

## Development

There is no build step and no runtime dependency tree.

```bash
npm run check
```

For local testing, open this folder as an extension project in a VS Code-compatible extension host or package it as a VSIX and install it in Antigravity.

Project structure:

```text
src/
  extension.js              lifecycle, commands, polling
  antigravityConnection.js  local process/port discovery
  quotaClient.js            RPC transport and response parsing
  presentation.js           status-bar and tooltip formatting
```

## License

MIT. See [LICENSE](LICENSE).
