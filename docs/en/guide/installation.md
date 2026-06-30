# Installation

The recommended way to install Whale Play is to download the prebuilt desktop installer. Run from source only when you need unreleased features, want to contribute, or need to debug a problem.

---

## Option 1: Download A Prebuilt Installer (Recommended)

Best for most users. No Node.js, pnpm, Rust, or terminal is required.

1. Open the project's [GitHub Releases page](https://github.com/YELEBAI/Whaleplay/releases).
2. Find the latest release.
3. Download the installer for your platform:
   - **Windows**: `Whale-Play_<version>_x64-setup.exe` or `Whale-Play_<version>_x64.msi`
4. Run the installer and follow the prompts.
5. Start **Whale Play** from the Start menu or desktop shortcut.

> Prebuilt installers may lag behind the current development branch. If you need a just-merged but unreleased feature, use the source path below.

---

## Option 2: Run From Source (Latest Features / Development)

Use this path if you are contributing, testing, or need unreleased functionality.

### Requirements

| Requirement      | Details                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Operating system | Windows 10+, macOS 12+, or Linux (requires `webkit2gtk-4.1` on Debian/Ubuntu or equivalent) |
| Node.js          | Version 24 or newer                                                                         |
| pnpm             | Install with `npm install -g pnpm`                                                          |
| Rust             | Stable toolchain, required for the Tauri desktop window and packaging                       |

### Launch The Desktop Dev App

```bash
git clone https://github.com/YELEBAI/Whaleplay.git
cd Whaleplay
pnpm install
pnpm tauri dev
```

`pnpm tauri dev` starts Vite, compiles the Rust backend, and opens the native desktop window. It is closest to the packaged app and should be used when testing notifications, file dialogs, SQLite, Tauri IPC, and other desktop integrations.

### Frontend-Only UI Debugging

```bash
pnpm dev
```

Then open the `http://localhost:1420` URL shown in the terminal. This is useful for fast React UI iteration, but it is not identical to the packaged desktop app.

### Windows Helper Scripts

If you already have the source tree, you can also run the included helper scripts:

- PowerShell: right-click `setup.ps1` and choose "Run with PowerShell", or run `.\setup.ps1`
- Batch: double-click `一键安装启动.bat` or `yi-jian-an-zhuang-qi-dong.bat`

The scripts check Node.js / pnpm, install dependencies, and try to start the development environment. They are mainly for source development, not the preferred path for normal users.

---

## Option 3: Build An Installer Locally

To create a distributable installer from your local checkout:

```bash
pnpm build:desktop
```

Bundles are written to:

```text
apps/desktop/src-tauri/target/release/bundle/
```

---

## Troubleshooting

### `pnpm install` fails with network errors

```bash
pnpm config set registry https://registry.npmmirror.com
pnpm install
```

### `webkit2gtk` not found on Linux

Debian/Ubuntu:

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### Permission errors on macOS/Linux

Global pnpm installation may need:

```bash
sudo npm install -g pnpm
```

### Still stuck?

Open an issue on [GitHub Issues](https://github.com/YELEBAI/Whaleplay/issues) with your OS version, install method, and an error screenshot.
