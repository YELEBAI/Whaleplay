# Chat

The chat view is where you talk to your characters. This guide covers all the ways you can interact with conversations — sending messages, editing, deleting, managing savepoints, and more.

---

## Starting a Chat

1. From the **Home** page or the **Characters** page, click on a character's avatar or name.
2. A new chat view opens. If it's the first time chatting with this character, you'll see their **First Message** appear automatically.
3. The character will say something to kick things off — now it's your turn to reply!

![Chat interface overview](../../images/chat-overview.png)

> **📸 Screenshot needed:** Start a chat with a character and send 3–4 messages back and forth. Capture the full chat view showing the message bubbles, the input box at the bottom, and the chat controls (edit/delete icons on messages). Save as `docs/images/chat-overview.png`.

---

## Sending Messages

The message input box is at the bottom of the chat view.

| Action                    | How to do it                                                              |
| ------------------------- | ------------------------------------------------------------------------- |
| **Send a message**        | Type your message and press **Enter** (or click the send button ➤).       |
| **Start a new line**      | Press **Shift + Enter** to insert a line break without sending.           |
| **Send an empty message** | Not possible — the send button will be disabled until you type something. |

Once you send a message, Whale Play will start generating the AI's response. The character's reply will appear in a new message bubble.

---

## Message Actions

Hover over any message bubble (yours or the AI's) to reveal action icons. These let you manage individual messages.

### Editing Messages

Click the **edit (pencil) icon** on any message to edit its content.

- **Editing your own message:** Change what you said, then press **Enter** to save. The AI's response after it will be removed so the conversation stays consistent.
- **Editing the AI's message:** You can rewrite the AI's response. This doesn't trigger a regeneration — it just lets you correct or adjust what the character said.

After editing, a small "Edited" label will appear on the message.

### Copying Messages

Click the **copy icon** (two overlapping squares) on any message to copy its text to your clipboard. This works for both your messages and the AI's responses.

### Deleting Messages

Click the **delete (trash) icon**. A dialog will ask what you want to delete:

| Option                                | What it does                                                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Delete this message only**          | Removes just the selected message. The conversation continues from the message before it.                                              |
| **Delete this and the AI's response** | Removes the selected message **and** the character's reply to it. Useful if you want to rephrase what you said and get a new response. |

> **Tip:** Deleting messages is the cleanest way to "rewind" a conversation. If you want to save a moment before making changes, use a [Savepoint](#savepoints-creating-and-loading-snapshots) first.

---

## Regenerating AI Responses

Don't like how the character responded? You can ask the AI to try again.

1. Hover over the AI's message.
2. Click the **refresh/recycle icon** 🔄.
3. The old response disappears, and the AI generates a new one.

You can regenerate as many times as you want. Each new response keeps the same chat history — only the last message changes.

---

## Stopping Generation

If the AI is still typing and you want to cut it off mid-response:

- Click the **stop (square) icon** ⏹ that appears in the input area while the AI is generating.

The partial message will be kept as-is. You can then delete it or ask the AI to regenerate.

---

## Generation Status And Notices

While a reply is being generated, Whale Play reports important state in the footer or toast notifications:

| State                       | Meaning                                                                                                          | What you can do                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Thinking / writing          | The model is generating. When reasoning display is disabled, reasoning deltas are shown as visible text instead. | Wait, stop, or regenerate later.                 |
| Stopped                     | You manually stopped this generation.                                                                            | Delete the partial reply or regenerate.          |
| Repeated output stopped     | Flood guard detected repeated or looping output.                                                                 | Regenerate, or adjust the prompt/model settings. |
| Healthy mode blocked input  | Your input was blocked before being sent to the model.                                                           | Edit the input and try again.                    |
| Healthy mode blocked output | The model reply was blocked after generation.                                                                    | Regenerate, or change the content mode.          |

These notices use the app's shared notification system rather than a separate error box above the input.

---

## Savepoints: Creating and Loading Snapshots

Savepoints let you **bookmark a moment** in a conversation. They're like save files in a video game — you can return to that exact point later, even after sending more messages.

### Creating a Savepoint

1. Click the **savepoint (bookmark) icon** 🔖 in the chat toolbar (top of the chat view, or accessible from a message's menu).
2. Give your savepoint a **name** (e.g., "Before the big reveal").
3. Click **"Save"**.

The savepoint captures the entire conversation up to that moment, including all messages, the character card version used, and any active world books.

### Loading a Savepoint

1. Click the **savepoint button** in the chat toolbar to open the savepoint list.
2. Find the savepoint you want to return to.
3. Click **"Load"**.
4. The chat will rewind to exactly that point. Any messages after the savepoint are removed.

![Savepoint dialog](../../images/chat-savepoint.png)

> **📸 Screenshot needed:** Open the savepoint dialog showing a list of 2–3 named savepoints. Include the "Save" button and input field for creating a new one. Save as `docs/images/chat-savepoint.png`.

### When to Use Savepoints

- **Before making risky edits** — try something bold, and if it doesn't work, load your savepoint.
- **Before regenerating** — save the current response if you might want it back.
- **Branching conversations** — save a point, send messages down one path, then load and try another direction.

---

## Token Usage Statistics and Context Bar

At the top of the chat view, you'll see a **context bar** that shows how much of the AI's available memory (context window) is being used.

```
[████████░░░░░░░░░░░░] 2,345 / 8,192 tokens (28%)
```

- **Filled portion (dark):** Tokens currently used by the chat history, character card, and active world books.
- **Empty portion (light):** Remaining space for new messages.
- **Numbers:** Current token count / maximum context size.

If the bar turns **yellow or red**, the conversation is getting long. Whale Play will automatically start trimming older messages to stay within the limit, but you can also:

- Delete old messages manually.
- Start a fresh chat (old chats remain accessible from the sidebar).
- Increase the context limit in [Settings](./settings.md).

---

## Font Size Adjustment

You can change the font size of messages to suit your reading preference.

1. Click the **font size (A) icon** in the chat toolbar.
2. Choose from the available sizes: **Small**, **Medium**, or **Large**.
3. The change applies immediately to all messages in the current chat.

This setting is per-chat and won't affect other conversations.

---

## Keyboard Shortcuts

| Shortcut        | Action                          |
| --------------- | ------------------------------- |
| `Enter`         | Send message                    |
| `Shift + Enter` | New line in message             |
| `Ctrl + Z`      | Undo last action (if supported) |

---

## Next Steps

- Create a [Persona](./persona.md) so characters know who they're talking to
- Add a [World Book](./worldbook.md) to give your characters more background to draw from
- Tweak the AI's behavior with [Presets](./presets.md)
