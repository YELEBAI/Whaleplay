# 安装

Whale Play 的推荐安装方式是下载预构建桌面安装包。只有在需要未发布功能、参与开发或排查问题时，才建议从源码启动。

---

## 方式一：下载预构建安装包（推荐）

适合绝大多数用户。无需安装 Node.js、pnpm、Rust，也不需要打开终端。

1. 打开项目的 [GitHub Releases 页面](https://github.com/YELEBAI/Whaleplay/releases)。
2. 找到最新版本。
3. 下载适用于你平台的安装包：
   - **Windows**：`Whale-Play_<版本号>_x64-setup.exe` 或 `Whale-Play_<版本号>_x64.msi`
4. 运行安装程序，按提示完成安装。
5. 从开始菜单或桌面图标启动 **Whale Play**。

> 预构建安装包可能滞后于当前开发分支。如果你需要刚合入但尚未发布的功能，请使用下面的源码启动方式。

---

## 方式二：从源码启动（最新功能 / 开发调试）

源码启动适合开发者、测试者，或需要使用未发布功能的用户。

### 系统要求

| 要求     | 详情                                                                              |
| -------- | --------------------------------------------------------------------------------- |
| 操作系统 | Windows 10+、macOS 12+ 或 Linux（Debian/Ubuntu 需要 `webkit2gtk-4.1` 或同等依赖） |
| Node.js  | 版本 24 或更高                                                                    |
| pnpm     | 使用 `npm install -g pnpm` 安装                                                   |
| Rust     | 运行 Tauri 桌面窗口或打包时需要稳定工具链                                         |

### 启动桌面开发版

```bash
git clone https://github.com/YELEBAI/Whaleplay.git
cd Whaleplay
pnpm install
pnpm tauri dev
```

`pnpm tauri dev` 会启动 Vite、编译 Rust 后端，并打开原生桌面窗口。它最接近正式安装包的行为，适合测试系统通知、文件对话框、SQLite、Tauri IPC 等功能。

### 只调试前端 UI

```bash
pnpm dev
```

运行后在浏览器打开终端显示的 `http://localhost:1420`。这个模式适合快速调试 React UI，但不完全等同于正式桌面应用。

### Windows 一键脚本

如果你已经下载了源码，也可以运行仓库内的脚本：

- PowerShell：右键 `setup.ps1`，选择“使用 PowerShell 运行”；或执行 `.\setup.ps1`
- 批处理：双击 `一键安装启动.bat` 或 `yi-jian-an-zhuang-qi-dong.bat`

脚本会检查 Node.js / pnpm，并尝试安装依赖和启动开发环境。它主要用于源码开发，不是普通用户的首选安装路径。

---

## 方式三：自己构建安装包

如果你需要基于本地源码生成可分发安装包：

```bash
pnpm build:desktop
```

安装包会生成在：

```text
apps/desktop/src-tauri/target/release/bundle/
```

---

## 故障排除

### `pnpm install` 因网络错误失败

```bash
pnpm config set registry https://registry.npmmirror.com
pnpm install
```

### Linux 找不到 `webkit2gtk`

Debian/Ubuntu：

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### macOS/Linux 权限错误

全局安装 pnpm 时可能需要：

```bash
sudo npm install -g pnpm
```

### 仍有问题？

在 [GitHub Issues](https://github.com/YELEBAI/Whaleplay/issues) 提交问题，并附上系统版本、安装方式和错误截图。
