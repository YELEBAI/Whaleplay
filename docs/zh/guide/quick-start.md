# 快速开始

本页只保留第一次使用 Whale Play 必须完成的步骤：安装、配置 API、创建角色、开始聊天。更多细节再跳到对应指南。

---

## 1. 下载并启动

推荐使用预构建安装包，不需要安装 Node.js、pnpm 或 Rust。

1. 打开 [GitHub Releases](https://github.com/YELEBAI/Whaleplay/releases)。
2. 下载最新版本的 Windows 安装包，例如 `Whale-Play_<版本号>_x64-setup.exe` 或 `Whale-Play_<版本号>_x64.msi`。
3. 运行安装程序。
4. 从开始菜单或桌面图标启动 **Whale Play**。

如果遇到安装包下载、系统依赖或权限问题，请看[安装指南](./installation.md)。

<details>
<summary>需要未发布功能或参与开发时：从源码启动</summary>

源码启动适合测试最新改动、参与开发或排查问题。普通使用不需要这一步。

```bash
git clone https://github.com/YELEBAI/Whaleplay.git
cd Whaleplay
pnpm install
pnpm tauri dev
```

如果只想快速调试 React UI，也可以运行：

```bash
pnpm dev
```

然后在浏览器打开终端显示的 `http://localhost:1420`。

</details>

---

## 2. 配置模型 API

Whale Play 需要你提供模型供应商的 API Key。默认路径仍以 DeepSeek 为主。

1. 打开 **设置**。
2. 在 API / 模型配置区域填写 `baseUrl`、API Key、模型名。
3. 保存配置。
4. 点击测试连接，确认右下角出现成功提示。

如果你使用 DeepSeek 第一方服务：

1. 前往 [platform.deepseek.com](https://platform.deepseek.com/) 注册或登录。
2. 创建 API Key。
3. 在 Whale Play 设置页填入 Key 和模型配置。

---

## 3. 创建第一个角色

1. 打开 **角色** 页面。
2. 点击 **New Character**。
3. 至少填写：

| 字段          | 说明       | 示例                                     |
| ------------- | ---------- | ---------------------------------------- |
| Name          | 角色名称   | 露娜                                     |
| Description   | 简短介绍   | 守护古老图书馆的森林精灵                 |
| Personality   | 关键性格   | 智慧、好奇、温柔                         |
| First Message | 角色开场白 | “欢迎你，旅人。书页已经预见了你的到来。” |

4. 保存角色。

---

## 4. 开始聊天

1. 回到首页或角色页。
2. 双击角色卡片进入聊天。
3. 在底部输入消息，按 Enter 或点击发送。
4. 如果回复为空、重复刷屏或被健康模式拦截，右下角会显示提示；可以重新生成或停止当前生成。

聊天页常用操作：

- 重新生成：删除当前 AI 回复并从上一条用户消息重新生成。
- 停止：中止正在进行的流式输出。
- 右键消息：复制、删除、创建存档点等。
- Agentic Play：进入带选项、掷骰和状态更新的主持人模式。

---

## 下一步

- [聊天指南](./chat.md)：消息操作、重新生成、分支和存档点。
- [Agentic Play](./agentic-play.md)：结构化选项、掷骰和游戏状态。
- [角色指南](./characters.md)：角色卡字段、导入导出和创建建议。
- [设置指南](./settings.md)：模型参数、健康模式、正则、图片生成。
- [图片生成](./image-generation.md)：ComfyUI、自动图片和提示词编辑。

祝你角色扮演愉快。
