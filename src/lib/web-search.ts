/**
 * Tavily-backed web search snippets for enrichment fallbacks and backup when
 * OpenAI Responses web_search is unavailable or returns nothing.
 */

export type WebSearchSnippet = {
  title?: string;
  url?: string;
  content: string;
};

/**
 * Returns ranked text snippets suitable for grounding company enrichment.
 */
export async function webSearchSnippets(query: string, maxResults = 8): Promise<WebSearchSnippet[]> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "basic",
        max_results: maxResults,
        include_answer: false,
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    const out: WebSearchSnippet[] = [];
    for (const r of data.results ?? []) {
      const content = typeof r.content === "string" ? r.content.trim() : "";
      if (!content || content.length < 20) continue;
      out.push({
        title: r.title?.trim(),
        url: r.url?.trim(),
        content,
      });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
