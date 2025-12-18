import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const SERPER_KEY = process.env.SERPER_API_KEY;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function serperSearch(q) {
  if (!SERPER_KEY) return null;
  const r = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": SERPER_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q, num: 10 }),
  });
  if (!r.ok) return null;
  return r.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const { vehicle, query } = req.body || {};
    if (!vehicle || typeof vehicle !== "object") return json(res, 400, { error: "Missing vehicle" });
    if (!query || typeof query !== "string") return json(res, 400, { error: "Missing query" });

    const v = vehicle;
    const q = `${v.year || ""} ${v.make || ""} ${v.model || ""} ${v.trim || ""} ${query}`.trim();

    const search = await serperSearch(q);
    const organic = search?.organic?.slice(0, 8)?.map((x) => ({
      title: x.title,
      url: x.link,
      snippet: x.snippet || "",
      source: (() => {
        try { return new URL(x.link).hostname; } catch { return "web"; }
      })(),
    })) || [];

    // If no search key, still return something useful (but clearly non-grounded)
    if (!SERPER_KEY) {
      return json(res, 200, [
        {
          title: `${query} (no web search configured)`,
          price: "Unknown",
          source: "setup-required",
          url: "",
          snippet:
            "Configure SERPER_API_KEY on the server to enable real-time web results. This placeholder avoids hallucinated links.",
        },
      ]);
    }

    const input = [
      {
        role: "system",
        content:
          "You are an automotive parts research assistant. Only use the provided web results. Do not invent URLs, brands, or prices. If price isn't in the snippet/title, set price to 'Unknown'.",
      },
      {
        role: "user",
        content:
          `Vehicle: ${v.year} ${v.make} ${v.model} ${v.trim || ""}\nUser query: ${query}\n\nWeb results JSON:\n${JSON.stringify(organic)}\n\nReturn a JSON array of part results with fields: title, price, source, url, snippet. Prefer the most directly matching items.`,
      },
    ];

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "part_results",
          strict: true,
          schema: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                price: { type: "string" },
                source: { type: "string" },
                url: { type: "string" },
                snippet: { type: "string" },
              },
              required: ["title", "price", "source", "url", "snippet"],
            },
          },
        },
      },
    });

    const parts = JSON.parse(response.output_text || "[]");
    return json(res, 200, parts);
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: "Server error" });
  }
}
