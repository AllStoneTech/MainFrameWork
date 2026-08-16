# MainFrameWork (dev quickstart)

This is the Tauri app itself. For the project overview, feature list, and
docs index, see the [root README](../README.md).

## Development

```bash
npm install
npm run tauri dev
```

Closing the window hides the app to the tray instead of quitting it — use
Ctrl+C in the terminal (or the tray's "Quit" item) to actually stop the dev
server. See [System Tray](../README.md#system-tray) for the full behavior.

## Building

```bash
npm run build
cd src-tauri && cargo build
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
