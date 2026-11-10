// GET /api/muse/status: is a key saved, and how much credit is left. Free: it never calls the model.
import { connection } from "next/server";
import { DEFAULT_MODEL, museKey } from "@/lib/muse";

export async function GET() {
  await connection();
  const key = museKey();
  if (!key) return Response.json({ key: false, model: DEFAULT_MODEL });
  const base = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  try {
    const r = await fetch(`${base}/key`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return Response.json({ key: true, works: false, status: r.status, model: DEFAULT_MODEL });
    const d = (await r.json()).data || {};
    return Response.json({ key: true, works: true, used: d.usage ?? null, limit: d.limit ?? null, remaining: d.limit_remaining ?? null, model: DEFAULT_MODEL });
  } catch {
    return Response.json({ key: true, works: null, model: DEFAULT_MODEL });
  }
}
