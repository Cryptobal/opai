import { NextRequest, NextResponse } from "next/server";

// In-memory cache
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json(
      { success: false, error: "url is required" },
      { status: 400 }
    );
  }

  // Check cache
  const cached = cache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ success: true, data: cached.data });
  }

  try {
    // Fetch the page HTML (with timeout)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OPAIBot/1.0)",
        Accept: "text/html",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error("Fetch failed");

    const html = await res.text();

    // Parse OpenGraph tags with regex (simple, no dependencies needed)
    const getMetaContent = (property: string): string | null => {
      // Match <meta property="og:title" content="..."> or <meta name="og:title" content="...">
      const regex = new RegExp(
        `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']|<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
        "i"
      );
      const match = html.match(regex);
      return match ? match[1] || match[2] || null : null;
    };

    // Also try <title> tag as fallback
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);

    const data = {
      title:
        getMetaContent("og:title") || titleMatch?.[1]?.trim() || null,
      description:
        getMetaContent("og:description") ||
        getMetaContent("description") ||
        null,
      image: getMetaContent("og:image") || null,
      siteName: getMetaContent("og:site_name") || null,
      url,
    };

    // Only cache if we got at least a title
    if (data.title) {
      cache.set(url, { data, ts: Date.now() });
    }

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: true, data: null }); // Graceful failure
  }
}
