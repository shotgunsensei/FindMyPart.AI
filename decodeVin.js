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
    const { vin } = req.body || {};
    if (!vin || typeof vin !== "string") return json(res, 400, { error: "Missing vin" });
    const v = vin.trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return json(res, 400, { error: "Invalid VIN format" });

    // NHTSA decode (best-effort; it can return empty fields for some VINs)
    let nhtsa = null;
    try {
      const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${v}?format=json`, {
        headers: { "User-Agent": "FindMyPart.AI/1.0" },
      });
      const j = await r.json();
      nhtsa = j?.Results?.[0] || null;
    } catch {
      // swallow; AI can still normalize basics
    }

    const base = {
      make: nhtsa?.Make || "",
      model: nhtsa?.Model || "",
      year: nhtsa?.ModelYear || "",
      trim: nhtsa?.Trim || nhtsa?.Series || "",
      engine: nhtsa?.EngineModel || nhtsa?.DisplacementL || "",
      transmission: nhtsa?.TransmissionStyle || "",
      driveType: nhtsa?.DriveType || "",
      bodyClass: nhtsa?.BodyClass || "",
    };

    // Use OpenAI to normalize + fill gaps conservatively (no guessing if unknown)
    const input = [
      {
        role: "system",
        content:
          "You extract and normalize vehicle attributes. If a field is not confidently known from the provided data, return an empty string for that field. No hallucinations.",
      },
      {
        role: "user",
        content:
          `VIN: ${v}\nNHTSA JSON (may be null):\n${JSON.stringify(nhtsa)}\n\nReturn a JSON object with fields: make, model, year, trim, engine, transmission, driveType, bodyClass.`,
      },
    ];

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "vehicle_data",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              make: { type: "string" },
              model: { type: "string" },
              year: { type: "string" },
              trim: { type: "string" },
              engine: { type: "string" },
              transmission: { type: "string" },
              driveType: { type: "string" },
              bodyClass: { type: "string" },
            },
            required: ["make", "model", "year", "trim", "engine", "transmission", "driveType", "bodyClass"],
          },
        },
      },
    });

    const data = JSON.parse(response.output_text || "{}");

    const merged = {
      make: base.make || data.make || "",
      model: base.model || data.model || "",
      year: base.year || data.year || "",
      trim: base.trim || data.trim || "",
      engine: base.engine || data.engine || "",
      transmission: base.transmission || data.transmission || "",
      driveType: base.driveType || data.driveType || "",
      bodyClass: base.bodyClass || data.bodyClass || "",
      rawJson: JSON.stringify({ nhtsa, openai: data }),
    };

    return json(res, 200, merged);
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: "Server error" });
  }
}
