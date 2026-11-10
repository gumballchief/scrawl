// POST /api/muse
// Body: { prompt, system?, files?: [{ name, dataUrl }], schema?: { name, schema }, effort?, web?, model?, stream? }
// Returns { text, json?, ms, usage, model } or, with stream: true, plain text as it is written.
// Errors come back as { error, code } with a plain-English message.
import { muse, museStream, MuseError, partFromDataUrl, type MuseOptions } from "@/lib/muse";

type Body = Omit<MuseOptions, "parts" | "messages"> & { files?: { name: string; dataUrl: string }[]; stream?: boolean };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request wasn't valid JSON.", code: "bad_request" }, { status: 400 });
  }
  const { files, stream, ...rest } = body;
  const options: MuseOptions = { ...rest, parts: (files || []).map((f) => partFromDataUrl(f.name, f.dataUrl)) };
  try {
    if (stream) {
      return new Response(await museStream(options), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    }
    return Response.json(await muse(options));
  } catch (e) {
    const err = e instanceof MuseError ? e : new MuseError(e instanceof Error ? e.message : "Something went wrong.", 500);
    if (!(e instanceof MuseError)) console.error("[muse]", e);
    return Response.json({ error: err.message, code: err.code }, { status: err.status >= 400 && err.status < 600 ? err.status : 500 });
  }
}
