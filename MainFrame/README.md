# MainFrameWork (dev quickstart)

This is the Tauri app itself. For the project overview, feature list, and
docs index, see the [root README](../README.md).

## Development

```bash
npm install
npm run tauri dev
```

MainFrameWork runs in the system tray — closing the window hides it to the
tray instead of quitting, so closing the dev window will **not** stop this
process. Use Ctrl+C in the terminal (or the tray icon's "Quit" item) to
actually stop it. See the root README's [System
Tray](../README.md#system-tray) section for the full behavior.

## Building

```bash
npm run build
cd src-tauri && cargo build
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
