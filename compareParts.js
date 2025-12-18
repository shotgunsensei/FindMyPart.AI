import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const { vehicle, parts } = req.body || {};
    if (!vehicle || typeof vehicle !== "object") return json(res, 400, { error: "Missing vehicle" });
    if (!Array.isArray(parts) || parts.length < 2) return json(res, 400, { error: "Select at least 2 parts" });

    const v = vehicle;
    const safeParts = parts.slice(0, 6).map((p) => ({
      title: String(p.title || ""),
      price: String(p.price || "Unknown"),
      source: String(p.source || ""),
      url: String(p.url || ""),
      snippet: String(p.snippet || ""),
    }));

    const input = [
      {
        role: "system",
        content:
          "You compare automotive parts. Use only the provided snippets. If compatibility is uncertain, state 'Not confirmed'. Output Markdown only.",
      },
      {
        role: "user",
        content:
          `Vehicle: ${v.year} ${v.make} ${v.model} ${v.trim || ""}\n\nParts JSON:\n${JSON.stringify(
            safeParts
          )}\n\nCreate:\n1) A Markdown table comparing Price, Source, Claimed fitment/compatibility, Notable features, and Risks/unknowns.\n2) A short summary recommending how to choose.\n`,
      },
    ];

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input,
      // plain text markdown is fine
    });

    return json(res, 200, { markdown: response.output_text || "" });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: "Server error" });
  }
}
