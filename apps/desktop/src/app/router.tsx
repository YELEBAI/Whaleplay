import { createBrowserRouter } from "react-router";
import { Layout } from "@/components";
import { HomePage } from "@/pages/HomePage";
import { CharacterPage } from "@/pages/character";
import { ChatPage } from "@/pages/ChatPage";
import { SettingsPage } from "@/pages/settings";
import { PresetPage } from "@/pages/PresetPage";
import { WorldbookPage } from "@/pages/WorldbookPage";
import { PersonaPage } from "@/pages/PersonaPage";
import { NeoBuilderPage } from "@/pages/neo-builder";
import { AboutPage } from "@/pages/AboutPage";

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "character", element: <CharacterPage /> },
      { path: "character-builder", element: <NeoBuilderPage /> },
      { path: "chat/:id", element: <ChatPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "preset", element: <PresetPage /> },
      { path: "worldbook", element: <WorldbookPage /> },
      { path: "persona", element: <PersonaPage /> },
      { path: "about", element: <AboutPage /> },
    ],
  },
]);
