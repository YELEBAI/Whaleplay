import { useSettingsStore } from "@/features/settings/settings.store";

const { invoke } = await import("@tauri-apps/api/core");

export interface NeoBuilderWebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export type WebSearchProvider = "default" | "tavily";
export type TavilySearchDepth = "basic" | "advanced" | "fast" | "ultra-fast";

export async function searchWeb(query: string, limit = 5): Promise<NeoBuilderWebSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const { webSearchProvider, tavilyApiKey, tavilySearchDepth } = useSettingsStore.getState();

  if (webSearchProvider === "tavily") {
    return searchTavily(cleanQuery, limit, tavilyApiKey, tavilySearchDepth);
  }

  // default — DuckDuckGo via Tauri backend
  return invoke<NeoBuilderWebSearchResult[]>("web_search", {
    query: cleanQuery,
    limit,
  });
}

async function searchTavily(
  query: string,
  limit: number,
  apiKey: string,
  depth: TavilySearchDepth,
): Promise<NeoBuilderWebSearchResult[]> {
  if (!apiKey) {
    console.warn("[web-search] Tavily API key not configured, falling back to default");
    return invoke<NeoBuilderWebSearchResult[]>("web_search", { query, limit });
  }
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: Math.min(limit, 20),
        search_depth: depth,
        topic: "general",
        include_answer: "basic",
        include_raw_content: false,
        include_images: false,
      }),
    });
    if (!res.ok) throw new Error(`Tavily returned ${res.status}`);
    const data = (await res.json()) as TavilySearchResponse;
    return (data.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.content }));
  } catch (err) {
    console.warn("[web-search] Tavily search failed, falling back to default:", err);
    return invoke<NeoBuilderWebSearchResult[]>("web_search", { query, limit });
  }
}

interface TavilySearchResponse {
  query?: string;
  answer?: string;
  results?: { title: string; url: string; content: string; score: number }[];
  response_time?: string;
}
