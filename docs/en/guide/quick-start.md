# Quick Start

This page keeps only the steps required for a first successful Whale Play session: install, configure an API, create a character, and start chatting. Use the linked guides for details.

---

## 1. Download And Launch

Use the prebuilt installer for normal use. You do not need Node.js, pnpm, or Rust.

1. Open the [GitHub Releases](https://github.com/YELEBAI/Whaleplay/releases) page.
2. Download the latest Windows installer, such as `Whale-Play_<version>_x64-setup.exe` or `Whale-Play_<version>_x64.msi`.
3. Run the installer.
4. Start **Whale Play** from the Start menu or desktop shortcut.

If the installer, system dependencies, or permissions fail, see the [installation guide](./installation.md).

<details>
<summary>Need unreleased features or want to contribute? Run from source</summary>

Running from source is for testing the latest changes, contributing, or debugging. Normal users do not need this path.

```bash
git clone https://github.com/YELEBAI/Whaleplay.git
cd Whaleplay
pnpm install
pnpm tauri dev
```

For quick React UI debugging only, you can run:

```bash
pnpm dev
```

Then open the `http://localhost:1420` URL shown in the terminal.

</details>

---

## 2. Configure A Model API

Whale Play needs an API key from a model provider. The default path is still DeepSeek-first.

1. Open **Settings**.
2. In the API / model configuration area, fill in `baseUrl`, API key, and model name.
3. Save the profile.
4. Click the connection test and confirm that the success toast appears.

If you use DeepSeek first-party service:

1. Go to [platform.deepseek.com](https://platform.deepseek.com/) and sign up or log in.
2. Create an API key.
3. Paste it into Whale Play's Settings page with the model configuration.

---

## 3. Create Your First Character

1. Open the **Characters** page.
2. Click **New Character**.
3. Fill in at least:

| Field         | What it means  | Example                                                        |
| ------------- | -------------- | -------------------------------------------------------------- |
| Name          | Character name | Luna                                                           |
| Description   | Short summary  | A forest spirit guarding an ancient library                    |
| Personality   | Key traits     | wise, curious, gentle                                          |
| First Message | Opening line   | "Welcome, traveler. The pages have already seen your arrival." |

4. Save the character.

---

## 4. Start Chatting

1. Return to Home or the Characters page.
2. Click the character card to open chat.
3. Type a message at the bottom, then press Enter or click Send.
4. If a reply is empty, repeats itself, or is blocked by healthy mode, Whale Play shows a toast; you can regenerate or stop the current generation.

Common chat actions:

- Regenerate: delete the current AI reply and generate again from the previous user message.
- Stop: abort the current streaming response.
- Right-click a message: copy, delete, create savepoint, and more.
- Agentic Play: switch into a host-like mode with structured choices, dice rolls, and state updates.

---

## Next Steps

- [Chat guide](./chat.md): message actions, regenerate, branches, and savepoints.
- [Agentic Play](./agentic-play.md): structured choices, dice, and game state.
- [Characters](./characters.md): character fields, import/export, and creation tips.
- [Settings](./settings.md): model params, healthy mode, regex, image generation.
- [Image generation](./image-generation.md): ComfyUI, auto images, and prompt editing.

Happy roleplaying.
