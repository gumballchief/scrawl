// Server-only helper for Meta's Muse models on OpenRouter. Never import this from a "use client" file.
// The key comes from OPENROUTER_API_KEY (Vercel env) or from ~/.secrets/muse-build-day.env on this laptop.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const MODELS = {
  ember: "meta/muse-ember", // launched Nov 9: smallest, fastest, cheapest. Default.
  spark: "meta/muse-spark-1.3", // bigger reasoning model, no audio input
  wonder: "meta/muse-wonder", // frontier model, about 40x Ember's price
} as const;

export const DEFAULT_MODEL = process.env.MUSE_MODEL || MODELS.ember;
const BASE = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
export const keyFile = join(homedir(), ".secrets", "muse-build-day.env");

let cachedKey = "";
export function museKey(): string {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY.trim();
  if (cachedKey) return cachedKey;
  try {
    for (const line of readFileSync(keyFile, "utf8").split(/\r?\n/)) {
      const m = line.match(/^OPENROUTER_API_KEY=(.+)$/);
      if (m) cachedKey = m[1].trim();
    }
  } catch {}
  return cachedKey;
}

export type Part =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: string } }
  | { type: "video_url"; video_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export type Message =
  | { role: "system" | "assistant"; content: string }
  | { role: "user"; content: string | Part[] };

export const part = {
  text: (text: string): Part => ({ type: "text", text }),
  /** https URL or data:image/...;base64,... */
  image: (url: string): Part => ({ type: "image_url", image_url: { url } }),
  /** Raw base64 (no data: prefix) plus a format such as mp3, wav, m4a, ogg. URLs are not allowed for audio. */
  audio: (base64: string, format: string): Part => ({ type: "input_audio", input_audio: { data: base64, format } }),
  /** https URL or data:video/mp4;base64,... (mp4, mpeg, mov, webm) */
  video: (url: string): Part => ({ type: "video_url", video_url: { url } }),
  /** PDFs and other documents, as a data URL or https URL. */
  file: (filename: string, dataUrl: string): Part => ({ type: "file", file: { filename, file_data: dataUrl } }),
};

const AUDIO_FORMATS: Record<string, string> = {
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav",
  "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/m4a": "m4a", "audio/aac": "aac", "audio/ogg": "ogg",
  "audio/webm": "webm", "audio/flac": "flac", "audio/x-flac": "flac", "audio/aiff": "aiff",
};

/** Turns an uploaded file (as a data URL) into the right message part for its type. */
export function partFromDataUrl(name: string, dataUrl: string): Part {
  const mime = (dataUrl.match(/^data:([^;,]+)/)?.[1] || "").toLowerCase();
  if (mime.startsWith("image/")) return part.image(dataUrl);
  if (mime.startsWith("video/")) return part.video(dataUrl);
  if (mime.startsWith("audio/")) {
    const format = AUDIO_FORMATS[mime] || mime.split("/")[1].replace(/^x-/, "");
    return part.audio(dataUrl.slice(dataUrl.indexOf(",") + 1), format);
  }
  return part.file(name || "file", dataUrl);
}

export type MuseOptions = {
  prompt?: string;
  system?: string;
  parts?: Part[]; // added to the user message after the prompt
  messages?: Message[]; // full control; replaces prompt/system/parts
  schema?: { name: string; schema: Record<string, unknown> }; // forces JSON that matches this JSON Schema
  effort?: "minimal" | "low" | "medium" | "high"; // reasoning effort; lower = faster
  web?: boolean; // lets the model search the web (costs $0.0025 per search)
  model?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: unknown[]; // OpenAI-style function tools; tool_choice "auto" is the only mode Ember supports
};

export type MuseResult = {
  text: string;
  json?: unknown;
  toolCalls?: unknown[];
  model: string;
  ms: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};

export class MuseError extends Error {
  constructor(message: string, public status = 500, public code = "muse_error") {
    super(message);
  }
}

function buildBody(o: MuseOptions, stream: boolean) {
  let messages: Message[];
  if (o.messages?.length) messages = o.messages;
  else {
    messages = [];
    if (o.system) messages.push({ role: "system", content: o.system });
    const content: Part[] = [];
    if (o.prompt) content.push(part.text(o.prompt));
    if (o.parts) content.push(...o.parts);
    if (!content.length) throw new MuseError("Nothing to send: add a prompt or a file.", 400, "empty");
    messages.push({ role: "user", content: content.length === 1 && content[0].type === "text" ? content[0].text : content });
  }
  const body: Record<string, unknown> = { model: o.model || DEFAULT_MODEL, messages, stream };
  if (o.maxTokens) body.max_tokens = o.maxTokens;
  if (o.temperature !== undefined) body.temperature = o.temperature;
  if (o.effort) body.reasoning = { effort: o.effort };
  if (o.schema) body.response_format = { type: "json_schema", json_schema: { name: o.schema.name, strict: true, schema: o.schema.schema } };
  const tools = [...(o.tools || []), ...(o.web ? [{ type: "openrouter:web_search" }] : [])];
  if (tools.length) body.tools = tools;
  return body;
}

const PLAIN_ERRORS: Record<number, [string, string]> = {
  401: ["The OpenRouter key was rejected. Save a fresh one with set-keys.ps1.", "bad_key"],
  402: ["This OpenRouter key has no credits left.", "no_credits"],
  403: ["OpenRouter blocked this request (moderation or key limits).", "blocked"],
  408: ["Muse took too long to answer. Try again or send less.", "timeout"],
  413: ["That file is too big to send. Try a smaller or shorter one.", "too_big"],
  429: ["Too many requests right now. Wait a few seconds and try again.", "rate_limited"],
  502: ["Muse is having trouble right now. Try again.", "provider_down"],
  503: ["Muse is busy right now. Try again.", "provider_busy"],
};

async function send(o: MuseOptions, stream: boolean) {
  const key = museKey();
  if (!key) throw new MuseError("No OpenRouter key saved yet. Run set-keys.ps1 in the muse-build-day folder.", 503, "no_key");
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://openrouter.ai",
      "X-Title": "Muse Build Day",
    },
    body: JSON.stringify(buildBody(o, stream)),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const raw = await res.text();
    let detail = raw.slice(0, 300);
    try { detail = JSON.parse(raw).error?.message || detail; } catch {}
    const [plain, code] = PLAIN_ERRORS[res.status] || [`Muse returned an error (${res.status}): ${detail}`, "http_" + res.status];
    throw new MuseError(res.status === 400 ? `Muse rejected the request: ${detail}` : plain, res.status, code);
  }
  return res;
}

/** One call, full answer. Pass `schema` to get parsed JSON back in `json`. */
export async function muse(o: MuseOptions): Promise<MuseResult> {
  const started = Date.now();
  const data = await (await send(o, false)).json();
  if (data.error) throw new MuseError(data.error.message || "Muse returned an error.", data.error.code || 500, "provider_error");
  const msg = data.choices?.[0]?.message || {};
  const text: string = typeof msg.content === "string" ? msg.content : "";
  const out: MuseResult = { text, model: data.model || o.model || DEFAULT_MODEL, ms: Date.now() - started, usage: data.usage };
  if (msg.tool_calls?.length) out.toolCalls = msg.tool_calls;
  if (o.schema) {
    try { out.json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")); }
    catch { throw new MuseError("Muse didn't return valid JSON. Try again.", 502, "bad_json"); }
  }
  return out;
}

/** Streams plain text as it is written. Return it straight from a route: new Response(await museStream(o)). */
export async function museStream(o: MuseOptions): Promise<ReadableStream<Uint8Array>> {
  const res = await send(o, true);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { controller.close(); return; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        let wrote = false;
        for (const line of lines) {
          if (!line.startsWith("data:")) continue; // skips ": OPENROUTER PROCESSING" keep-alives
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") { controller.close(); reader.cancel().catch(() => {}); return; }
          try {
            const chunk = JSON.parse(payload);
            if (chunk.error) { controller.error(new MuseError(chunk.error.message || "Muse stopped with an error.", 502, "stream_error")); return; }
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) { controller.enqueue(encoder.encode(delta)); wrote = true; }
          } catch {}
        }
        if (wrote) return;
      }
    },
    cancel() { reader.cancel().catch(() => {}); },
  });
}
