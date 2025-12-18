# FindMyPart.AI (Vite + React + Vercel Serverless + OpenAI)

This project is a lightweight VIN decoder + parts-finder UI.  
**All model calls now run server-side** (no API keys in the browser).

## What changed vs the original ZIP
- Removed Gemini client usage.
- Added Vercel Serverless Functions under `/api/*` that call **OpenAI**.
- Optional real-time web results via **Serper** (Google Search API) to avoid hallucinated links.
- Frontend now calls `/api/decodeVin`, `/api/searchParts`, `/api/compareParts`.

## Local dev
Prereqs: Node 18+.

1) Install:
```bash
npm install
```

2) Create `.env.local`:
```bash
OPENAI_API_KEY=REPLACE_ME
SERPER_API_KEY=OPTIONAL_FOR_REAL_SEARCH
```

3) Run (frontend only):
```bash
npm run dev
```
For local `/api/*` functions, use Vercel CLI:
```bash
npm i -g vercel
vercel dev
```

## Deploy (recommended: Vercel)
1) Push this repo to GitHub.
2) Import into Vercel.
3) Set environment variables in Vercel:
   - `OPENAI_API_KEY`
   - `SERPER_API_KEY` (optional but recommended)
4) Deploy.

## Paid access (cheapest practical approach)
The cheapest path that still works well:
- Static + serverless hosting: **Vercel free tier**
- Payments: **Gumroad** (sell “license keys”) or **Stripe Checkout**
- Minimal gating: require a license key for API calls

This repo currently ships without paywall logic; add it in the API routes by validating an `Authorization: Bearer <key>` header against a small key store (Supabase / Upstash / D1 / even a JSON file during MVP).
