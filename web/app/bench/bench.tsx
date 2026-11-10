"use client";
// Test bench: proves the key, the model and every input type work before the real build starts.
import { useEffect, useRef, useState } from "react";

type Picked = { name: string; size: number; type: string; dataUrl: string };
type Status = { key: boolean; works?: boolean | null; status?: number; used?: number | null; limit?: number | null; remaining?: number | null; model: string };

const SAMPLE_SCHEMA = {
  name: "answer",
  schema: {
    type: "object",
    properties: { summary: { type: "string" }, tags: { type: "array", items: { type: "string" } } },
    required: ["summary", "tags"],
    additionalProperties: false,
  },
};

const MODELS = [
  ["meta/muse-ember", "Ember (new, fastest)"],
  ["meta/muse-spark-1.3", "Spark 1.3"],
  ["meta/muse-wonder", "Wonder (biggest)"],
];

const kind = (t: string) => (t.startsWith("image/") ? "image" : t.startsWith("video/") ? "video" : t.startsWith("audio/") ? "audio" : "file");
const size = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export default function Bench() {
  const [status, setStatus] = useState<Status | null>(null);
  const [prompt, setPrompt] = useState("Describe what you see or hear in one short paragraph.");
  const [files, setFiles] = useState<Picked[]>([]);
  const [model, setModel] = useState(MODELS[0][0]);
  const [effort, setEffort] = useState("");
  const [asJson, setAsJson] = useState(false);
  const [web, setWeb] = useState(false);
  const [stream, setStream] = useState(true);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState("");
  const [error, setError] = useState("");
  const [meta, setMeta] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/muse/status").then((r) => r.json()).then(setStatus).catch(() => setStatus(null));
  }, []);

  async function pick(list: FileList | null) {
    if (!list) return;
    const read = (f: File) =>
      new Promise<Picked>((done, fail) => {
        const r = new FileReader();
        r.onload = () => done({ name: f.name, size: f.size, type: f.type || "application/octet-stream", dataUrl: String(r.result) });
        r.onerror = () => fail(r.error);
        r.readAsDataURL(f);
      });
    const added = await Promise.all(Array.from(list).map(read));
    setFiles((prev) => [...prev, ...added]);
    if (input.current) input.current.value = "";
  }

  async function run() {
    setBusy(true);
    setOut("");
    setError("");
    setMeta("");
    const started = performance.now();
    const useStream = stream && !asJson;
    try {
      const res = await fetch("/api/muse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          model,
          effort: effort || undefined,
          web,
          stream: useStream,
          schema: asJson ? SAMPLE_SCHEMA : undefined,
          files: files.map((f) => ({ name: f.name, dataUrl: f.dataUrl })),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: `Request failed (${res.status}).` }));
        throw new Error(e.error);
      }
      if (useStream) {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let first = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!first) first = performance.now();
          setOut((o) => o + decoder.decode(value, { stream: true }));
        }
        setMeta(`first words ${first ? Math.round(first - started) : "?"} ms, done ${Math.round(performance.now() - started)} ms`);
      } else {
        const d = await res.json();
        setOut(asJson ? JSON.stringify(d.json, null, 2) : d.text || "(empty reply)");
        const u = d.usage || {};
        const cost = typeof u.cost === "number" ? `, $${u.cost.toFixed(5)}` : "";
        setMeta(`${d.ms} ms, ${u.prompt_tokens ?? "?"} in / ${u.completion_tokens ?? "?"} out tokens${cost}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const keyLine = !status
    ? "Checking the key"
    : !status.key
      ? "No key yet. Run set-keys.ps1, then reload."
      : status.works === false
        ? `Key saved but OpenRouter rejected it (${status.status}).`
        : status.works
          ? `Key works.${status.remaining != null ? ` $${Number(status.remaining).toFixed(2)} left.` : status.used != null ? ` $${Number(status.used).toFixed(4)} used.` : ""}`
          : "Key saved. Couldn't reach OpenRouter to check it.";
  const keyOk = status?.key && status.works !== false;

  return (
    <main className="mx-auto max-w-[880px] px-4 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-6" style={{ borderColor: "var(--rule)" }}>
        <div>
          <h1 className="m-0 text-[40px] leading-none font-semibold tracking-[-0.03em] sm:text-[52px]" style={{ fontStretch: "85%" }}>
            Muse test bench
          </h1>
          <p className="mt-3 mb-0 text-[15px]" style={{ color: "var(--ink-2)" }}>
            Send text, images, audio, video or PDFs to Meta&apos;s Muse and see what comes back.
          </p>
        </div>
        <p className="m-0 flex items-center gap-2 text-[13px]" style={{ fontFamily: "var(--mono)", color: keyOk ? "var(--ok)" : "var(--ember-dark)" }}>
          <span className="inline-block size-2 rounded-full" style={{ background: keyOk ? "var(--ok)" : "var(--ember)" }} />
          {keyLine}
        </p>
      </header>

      <section className="mt-8 grid gap-5">
        <label className="grid gap-2">
          <span className="text-[13px] font-semibold">Prompt</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className="w-full resize-y rounded-[10px] border p-4 text-[16px] leading-relaxed outline-none focus:border-[var(--ink)]"
            style={{ background: "var(--card)", borderColor: "var(--rule)" }}
          />
        </label>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}
          className="rounded-[10px] border border-dashed p-4"
          style={{ borderColor: "var(--ink-3)", background: "var(--card)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[14px]" style={{ color: "var(--ink-2)" }}>Drop files here: image, audio, video (mp4, mov, webm) or PDF</span>
            <button type="button" onClick={() => input.current?.click()} className="cursor-pointer rounded-[8px] border px-3 py-1.5 text-[14px] font-medium hover:bg-[var(--paper)]" style={{ borderColor: "var(--ink)" }}>
              Choose files
            </button>
            <input ref={input} type="file" multiple hidden accept="image/*,audio/*,video/*,application/pdf" onChange={(e) => pick(e.target.files)} />
          </div>
          {files.length > 0 && (
            <ul className="m-0 mt-4 grid list-none gap-2 p-0">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-3 text-[14px]">
                  {kind(f.type) === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.dataUrl} alt="" className="size-10 rounded-[6px] object-cover" />
                  ) : (
                    <span className="grid size-10 place-items-center rounded-[6px] text-[11px] font-semibold uppercase" style={{ background: "var(--ember-wash)", color: "var(--ember-dark)" }}>
                      {kind(f.type)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span style={{ fontFamily: "var(--mono)", color: "var(--ink-3)", fontSize: 12 }}>{size(f.size)}</span>
                  <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="cursor-pointer text-[13px] underline" style={{ color: "var(--ink-2)" }}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[14px]">
          <label className="flex items-center gap-2">
            Model
            <select value={model} onChange={(e) => setModel(e.target.value)} className="rounded-[8px] border px-2 py-1.5" style={{ background: "var(--card)", borderColor: "var(--rule)" }}>
              {MODELS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Thinking
            <select value={effort} onChange={(e) => setEffort(e.target.value)} className="rounded-[8px] border px-2 py-1.5" style={{ background: "var(--card)", borderColor: "var(--rule)" }}>
              <option value="">Default</option>
              <option value="minimal">Minimal</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={stream && !asJson} disabled={asJson} onChange={(e) => setStream(e.target.checked)} className="accent-[var(--ember)]" />Stream</label>
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={asJson} onChange={(e) => setAsJson(e.target.checked)} className="accent-[var(--ember)]" />JSON answer</label>
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} className="accent-[var(--ember)]" />Web search</label>
        </div>

        <div>
          <button
            type="button"
            onClick={run}
            disabled={busy || (!prompt.trim() && !files.length)}
            className="cursor-pointer rounded-[10px] px-6 py-3 text-[16px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: busy ? "var(--ember-dark)" : "var(--ember)" }}
          >
            {busy ? "Muse is working" : "Send to Muse"}
          </button>
        </div>
      </section>

      {(out || error || busy) && (
        <section className="mt-8 rounded-[10px] border p-5" style={{ background: "var(--card)", borderColor: error ? "var(--ember)" : "var(--rule)" }}>
          {error ? (
            <p className="m-0 text-[15px] font-medium" style={{ color: "var(--ember-dark)" }}>{error}</p>
          ) : (
            <pre className="m-0 text-[15px] leading-relaxed whitespace-pre-wrap" style={{ fontFamily: asJson ? "var(--mono)" : "var(--sans)" }}>
              {out || "Waiting for the first words"}
            </pre>
          )}
          {meta && <p className="mt-4 mb-0 text-[12px]" style={{ fontFamily: "var(--mono)", color: "var(--ink-3)" }}>{meta}</p>}
        </section>
      )}
    </main>
  );
}
