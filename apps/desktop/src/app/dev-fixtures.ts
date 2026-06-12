/**
 * Dev helper — exposes the long conversation fixture on window.__seedFixture
 * for testing chat display, branching, and message trees.
 * Run in browser console: await __seedFixture()
 */

export function registerDevFixtures() {
  if (typeof window === "undefined") return;

  const fixturePath = "../../scripts/long-conversation.fixture";

  (window as unknown as Record<string, unknown>).__mockUpdate = () => {
    // eslint-disable-next-line no-console
    console.log("🔧 Mocking update available...");
    window.dispatchEvent(
      new CustomEvent("neotavern-mock-update", {
        detail: { version: "99.0.0", body: "🐳 模拟更新：修复了所有 bug，添加了所有功能。" },
      }),
    );
  };

  (window as unknown as Record<string, unknown>).__seedFixture = async () => {
    // eslint-disable-next-line no-console
    console.log("🌌 Seeding long conversation fixture...");

    const mod = await import(/* @vite-ignore */ fixturePath);
    const result = await mod.seedLongConversation();

    // Force-reload stores so the app picks up the new data immediately
    const { useChatStore } = await import("@/features/chat/chat.store");
    const { useCharacterStore } = await import("@/features/character/character.store");

    await useCharacterStore.getState().loadCharacters();
    await useChatStore.getState().loadChats();

    // eslint-disable-next-line no-console
    console.log(`✅ Done! "${result.chat.title}" — ${result.messageIds.length} messages, 3 branch points.`);
    // eslint-disable-next-line no-console
    console.log(`   Character: ${result.character.name}`);
    // eslint-disable-next-line no-console
    console.log("   Chat reloaded into sidebar — click to open.");
  };
}
