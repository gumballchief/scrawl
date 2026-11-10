"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Pt = { x: number; y: number };
type Seg = { x: number; y: number; w: number };
type Level = { title: string; platforms: Seg[]; coins: Pt[]; enemies: Pt[]; spikes: Seg[]; start: Pt; goal: Pt };
type Status = "idle" | "reading" | "ready" | "error";
type Input = { left: boolean; right: boolean; jump: boolean };

const W = 1280;
const H = 720;
const BUDGET = 1;

// Physics, in drawing units (the drawing spans 0 to 100).
const G = 120;
const JUMP = 49;
const JUMP2 = 42;
const RUN = 18;
const PW = 1.6;
const PH = 2.1;
const ER = 0.85;

const INK = "#1b3a8c";
const RED = "#d42a3c";
const HI = "#ffe03a";
const GRAPHITE = "#23262d";
const GRID = "#dbe5f1";
const PAPER = "#f6f8fc";

type Enemy = { x: number; y: number; minX: number; maxX: number; dir: number; alive: boolean };
type Game = {
  plats: Seg[];
  spikes: Seg[];
  coins: (Pt & { got: boolean })[];
  enemies: Enemy[];
  start: Pt;
  goal: Pt;
  p: { x: number; y: number; vx: number; vy: number; ground: boolean; jumps: number; face: number };
  view: { minX: number; maxX: number; minY: number; maxY: number; s: number; ox: number; oy: number };
  born: number;
  stagger: number;
  revealDur: number;
  started: number | null;
  elapsed: number;
  deaths: number;
  won: boolean;
  flash: number;
};

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const pt = (v: Partial<Pt> | undefined): Pt => ({ x: num(v?.x, 50), y: num(v?.y, 50) });
const seg = (v: Partial<Seg>): Seg => ({ x: num(v.x), y: num(v.y), w: Math.abs(num(v.w)) });

function buildGame(level: Level): Game {
  const plats = (level.platforms || []).map(seg).filter((p) => p.w > 0.5);
  const below = (x: number, y: number, reach: number) => {
    let best: Seg | null = null;
    for (const p of plats) {
      if (x >= p.x - 0.6 && x <= p.x + p.w + 0.6 && p.y >= y - 2 && p.y - y <= reach) {
        if (!best || p.y < best.y) best = p;
      }
    }
    return best;
  };

  const start = pt(level.start);
  const sp = below(start.x, start.y, 30);
  if (sp) start.y = sp.y;
  else plats.push({ x: start.x - 3, y: start.y + 1, w: 6 }), (start.y = start.y + 1);

  const goal = pt(level.goal);
  const gp = below(goal.x, goal.y, 10);
  if (gp) goal.y = gp.y;
  else plats.push({ x: goal.x - 3, y: goal.y + 0.5, w: 6 }), (goal.y = goal.y + 0.5);

  const spikes = (level.spikes || []).map(seg).filter((s) => s.w > 0.3).map((s) => {
    const p = below(s.x + s.w / 2, s.y, 8);
    return p ? { ...s, y: p.y } : s;
  });

  const enemies: Enemy[] = (level.enemies || []).map(pt).map((e) => {
    const p = below(e.x, e.y, 8);
    if (!p) return { x: e.x, y: e.y, minX: e.x, maxX: e.x, dir: 1, alive: true };
    const minX = p.x + ER, maxX = Math.max(p.x + ER, p.x + p.w - ER);
    return { x: Math.min(maxX, Math.max(minX, e.x)), y: p.y, minX, maxX, dir: 1, alive: true };
  });

  const coins = (level.coins || []).map(pt).map((c) => ({ ...c, got: false }));

  const xs = [start.x, goal.x, ...plats.flatMap((p) => [p.x, p.x + p.w]), ...spikes.flatMap((s) => [s.x, s.x + s.w]), ...coins.map((c) => c.x), ...enemies.map((e) => e.x)];
  const ys = [start.y, goal.y, ...plats.map((p) => p.y), ...spikes.map((s) => s.y), ...coins.map((c) => c.y), ...enemies.map((e) => e.y)];
  const minX = Math.min(...xs) - 3, maxX = Math.max(...xs) + 3;
  const minY = Math.min(...ys) - 8, maxY = Math.max(...ys) + 4;
  const s = Math.min(W / (maxX - minX), H / (maxY - minY));
  const ox = (W - (maxX - minX) * s) / 2, oy = (H - (maxY - minY) * s) / 2;

  const order = plats.length + spikes.length + coins.length + enemies.length + 2;
  const stagger = Math.min(0.07, 1.2 / order);

  return {
    plats, spikes, coins, enemies, start, goal,
    p: { x: start.x, y: start.y, vx: 0, vy: 0, ground: false, jumps: 0, face: 1 },
    view: { minX, maxX, minY, maxY, s, ox, oy },
    born: performance.now(),
    stagger,
    revealDur: order * stagger + 0.35,
    started: null,
    elapsed: 0,
    deaths: 0,
    won: false,
    flash: 0,
  };
}

function respawn(g: Game) {
  g.deaths++;
  g.flash = 0.3;
  Object.assign(g.p, { x: g.start.x, y: g.start.y - 0.01, vx: 0, vy: 0, ground: false, jumps: 0 });
}

function step(g: Game, dt: number, input: Input, now: number) {
  g.flash = Math.max(0, g.flash - dt);
  for (const e of g.enemies) {
    if (!e.alive || e.maxX - e.minX < 0.1) continue;
    e.x += e.dir * 3.5 * dt;
    if (e.x > e.maxX) (e.x = e.maxX), (e.dir = -1);
    if (e.x < e.minX) (e.x = e.minX), (e.dir = 1);
  }
  if (g.won) return;
  const p = g.p;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if ((dir || input.jump) && g.started === null) g.started = now;
  p.vx = dir * RUN;
  if (dir) p.face = dir;
  if (input.jump) {
    if (p.ground) (p.vy = -JUMP), (p.jumps = 1), (p.ground = false);
    else if (p.jumps < 2) (p.vy = -JUMP2), (p.jumps = 2);
  }
  p.vy = Math.min(p.vy + G * dt, 70);
  const prevY = p.y;
  p.x = Math.min(g.view.maxX - PW / 2, Math.max(g.view.minX + PW / 2, p.x + p.vx * dt));
  p.y += p.vy * dt;
  p.ground = false;
  if (p.vy >= 0) {
    for (const pl of g.plats) {
      if (p.x + PW / 2 > pl.x && p.x - PW / 2 < pl.x + pl.w && prevY <= pl.y + 0.05 && p.y >= pl.y) {
        p.y = pl.y;
        p.vy = 0;
        p.ground = true;
        p.jumps = 0;
        break;
      }
    }
  }
  const L = p.x - PW / 2, R = p.x + PW / 2, T = p.y - PH, B = p.y;
  for (const e of g.enemies) {
    if (!e.alive) continue;
    if (R > e.x - ER && L < e.x + ER && B > e.y - 2 * ER && T < e.y) {
      if (p.vy > 0 && prevY <= e.y - ER) {
        e.alive = false;
        p.vy = -JUMP * 0.75;
        p.jumps = 1;
      } else return respawn(g);
    }
  }
  for (const s of g.spikes) {
    if (R > s.x + 0.2 && L < s.x + s.w - 0.2 && B > s.y - 1.1 && T < s.y) return respawn(g);
  }
  for (const c of g.coins) {
    if (!c.got && Math.hypot(c.x - p.x, c.y - (p.y - PH / 2)) < 1.7) c.got = true;
  }
  if (Math.abs(p.x - g.goal.x) < 1.5 && B > g.goal.y - 4.5 && T < g.goal.y + 0.5) {
    g.won = true;
    g.elapsed = g.started === null ? 0 : (now - g.started) / 1000;
  }
  if (p.y > g.view.maxY + 6) respawn(g);
}

const rnd = (a: number, b: number) => {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v) - 0.5;
};

function pen(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, seed: number, amp = 1.6) {
  ctx.beginPath();
  ctx.moveTo(x1 + rnd(seed, 1) * amp, y1 + rnd(seed, 2) * amp);
  ctx.quadraticCurveTo((x1 + x2) / 2 + rnd(seed, 3) * amp * 2, (y1 + y2) / 2 + rnd(seed, 4) * amp * 2, x2 + rnd(seed, 5) * amp, y2 + rnd(seed, 6) * amp);
  ctx.stroke();
}

function drawPaper(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 32; x < W; x += 32) ctx.moveTo(x + 0.5, 0), ctx.lineTo(x + 0.5, H);
  for (let y = 32; y < H; y += 32) ctx.moveTo(0, y + 0.5), ctx.lineTo(W, y + 0.5);
  ctx.stroke();
}

const backOut = (q: number) => (q >= 1 ? 1 : 1 + 2.70158 * Math.pow(q - 1, 3) + 1.70158 * Math.pow(q - 1, 2));

function draw(ctx: CanvasRenderingContext2D, g: Game, now: number) {
  drawPaper(ctx);
  const { s, ox, oy, minX, minY } = g.view;
  const X = (u: number) => ox + (u - minX) * s;
  const Y = (u: number) => oy + (u - minY) * s;
  const t = (now - g.born) / 1000;
  let k = 0;
  const pr = () => Math.max(0, Math.min(1, (t - k++ * g.stagger) / 0.35));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  g.plats.forEach((p, i) => {
    const q = pr();
    if (q <= 0) return;
    const x0 = X(p.x), x1 = X(p.x + p.w * q), y0 = Y(p.y), th = Math.max(7, 0.85 * s);
    ctx.fillStyle = "rgba(27,58,140,0.10)";
    ctx.fillRect(x0, y0, x1 - x0, th);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, th);
    ctx.clip();
    ctx.strokeStyle = "rgba(27,58,140,0.45)";
    ctx.lineWidth = 1.5;
    for (let hx = x0 - th; hx < x1; hx += 11) {
      ctx.beginPath();
      ctx.moveTo(hx, y0 + th);
      ctx.lineTo(hx + th, y0);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    pen(ctx, x0, y0, x1, y0, i + 1);
    pen(ctx, x0, y0 + th, x1, y0 + th, i + 31);
    pen(ctx, x0, y0, x0, y0 + th, i + 61, 0.8);
    if (q >= 1) pen(ctx, x1, y0, x1, y0 + th, i + 91, 0.8);
  });

  g.spikes.forEach((sp, i) => {
    const q = pr();
    if (q <= 0) return;
    const n = Math.max(2, Math.round(sp.w / 1.1));
    const x0 = X(sp.x), w = sp.w * s, y0 = Y(sp.y), h = 1.3 * s;
    const shown = Math.ceil(n * q);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let j = 0; j < shown; j++) {
      const a = x0 + (j / n) * w;
      ctx.lineTo(a + w / n / 2, y0 - h + rnd(i, j) * 3);
      ctx.lineTo(a + w / n, y0);
    }
    ctx.fillStyle = "rgba(212,42,60,0.14)";
    ctx.fill();
    ctx.strokeStyle = RED;
    ctx.lineWidth = 2.6;
    ctx.stroke();
  });

  g.coins.forEach((c, i) => {
    const q = pr();
    if (q <= 0 || c.got) return;
    const r = 0.75 * s * backOut(q);
    const bob = Math.sin(now / 300 + i) * 0.12 * s;
    ctx.beginPath();
    ctx.arc(X(c.x), Y(c.y) + bob, Math.max(1, r), 0, Math.PI * 2);
    ctx.fillStyle = HI;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  });

  g.enemies.forEach((e, i) => {
    const q = pr();
    if (q <= 0 || !e.alive) return;
    const r = ER * s;
    ctx.save();
    ctx.translate(X(e.x), Y(e.y) - r);
    ctx.rotate(Math.sin(now / 120 + i) * 0.14);
    ctx.globalAlpha = q;
    ctx.strokeStyle = RED;
    ctx.lineWidth = 4;
    pen(ctx, -r, -r, r, r, i + 7, 1);
    pen(ctx, r, -r, -r, r, i + 17, 1);
    ctx.restore();
  });

  {
    const q = pr();
    if (q > 0) {
      const gx = X(g.goal.x), gy = Y(g.goal.y), ph = 4.2 * s * q;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      pen(ctx, gx, gy, gx, gy - ph, 5, 0.6);
      const wave = Math.sin(now / 220) * 0.25 * s;
      ctx.beginPath();
      ctx.moveTo(gx, gy - ph);
      ctx.lineTo(gx + 2.4 * s * q, gy - ph + 0.8 * s + wave);
      ctx.lineTo(gx, gy - ph + 1.6 * s);
      ctx.closePath();
      ctx.fillStyle = HI;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  {
    const q = pr();
    if (q > 0) {
      const p = g.p, pw = PW * s, ph = PH * s;
      const x = X(p.x) - pw / 2, y = Y(p.y) - ph;
      ctx.globalAlpha = q;
      ctx.fillStyle = g.flash > 0 ? RED : INK;
      ctx.beginPath();
      ctx.roundRect(x, y, pw, ph, pw * 0.38);
      ctx.fill();
      const er = pw * 0.14;
      for (const side of [-1, 1]) {
        const ex = x + pw / 2 + p.face * pw * 0.14 + side * pw * 0.17, ey = y + ph * 0.33;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(ex, ey, er, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = GRAPHITE;
        ctx.beginPath();
        ctx.arc(ex + p.face * er * 0.4, ey, er * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
}

function loadImg(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That image could not be opened."));
    img.src = url;
  });
}

function toJpeg(src: CanvasImageSource, w: number, h: number) {
  const scale = Math.min(1, 1280 / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

export default function Scrawl() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const gameRef = useRef<Game | null>(null);
  const levelRef = useRef<Level | null>(null);
  const input = useRef<Input>({ left: false, right: false, jump: false });

  const [status, setStatus] = useState<Status>("idle");
  const [err, setErr] = useState("");
  const [cam, setCam] = useState<"off" | "starting" | "on" | "denied">("off");
  const [shot, setShot] = useState<string | null>(null);
  const [showShot, setShowShot] = useState(false);
  const [title, setTitle] = useState("");
  const [last, setLast] = useState<{ ms: number; cost: number | null } | null>(null);
  const [spent, setSpent] = useState(0);
  const [built, setBuilt] = useState(0);
  const [hud, setHud] = useState({ coins: 0, total: 0, time: 0, deaths: 0, won: false });
  const [wait, setWait] = useState(0);
  const [mode, setMode] = useState<"camera" | "draw">("camera");
  const [hasInk, setHasInk] = useState(false);
  const padRef = useRef<HTMLCanvasElement>(null);
  const penAt = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const c = padRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) (ctx.fillStyle = "#fff"), ctx.fillRect(0, 0, c.width, c.height);
  }, []);

  const padPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget, r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const padDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (status === "reading") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = padPoint(e);
    penAt.current = p;
    const ctx = e.currentTarget.getContext("2d")!;
    ctx.fillStyle = "#15171c";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    setHasInk(true);
  };
  const padMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const last = penAt.current;
    if (!last) return;
    const p = padPoint(e);
    const ctx = e.currentTarget.getContext("2d")!;
    ctx.strokeStyle = "#15171c";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    penAt.current = p;
  };
  const padUp = () => (penAt.current = null);
  const clearPad = () => {
    const c = padRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) (ctx.fillStyle = "#fff"), ctx.fillRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __scrawl: gameRef, __scrawlLevel: levelRef, __scrawlLib: { step, buildGame } });
  }, []);

  // Game loop
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let lastT = performance.now();
    let lastHud = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - lastT) / 1000, 1 / 30);
      lastT = now;
      const g = gameRef.current;
      if (g) {
        if (now - g.born > g.revealDur * 1000) step(g, dt, input.current, now);
        input.current.jump = false;
        draw(ctx, g, now);
        if (now - lastHud > 100) {
          lastHud = now;
          setHud({
            coins: g.coins.filter((c) => c.got).length,
            total: g.coins.length,
            time: g.won ? g.elapsed : g.started === null ? 0 : (now - g.started) / 1000,
            deaths: g.deaths,
            won: g.won,
          });
        }
      } else drawPaper(ctx);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keyboard
  useEffect(() => {
    const key = (e: KeyboardEvent, down: boolean) => {
      if (!gameRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") input.current.left = down;
      else if (k === "ArrowRight" || k === "d" || k === "D") input.current.right = down;
      else if (k === " " || k === "ArrowUp" || k === "w" || k === "W") {
        if (down && !e.repeat) input.current.jump = true;
      } else return;
      e.preventDefault();
      if (t && t.tagName === "BUTTON") {
        t.blur();
        canvasRef.current?.focus();
      }
    };
    const down = (e: KeyboardEvent) => key(e, true);
    const up = (e: KeyboardEvent) => key(e, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Seconds counter while Muse reads
  useEffect(() => {
    if (status !== "reading") return;
    const t0 = performance.now();
    setWait(0);
    const id = setInterval(() => setWait((performance.now() - t0) / 1000), 100);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  const videoCb = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current;
      el.play().catch(() => {});
    }
  }, []);

  const startCam = async () => {
    setCam("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      streamRef.current = s;
      setShowShot(false);
      setCam("on");
    } catch {
      setCam("denied");
    }
  };

  const send = async (image: string) => {
    setShot(image);
    setShowShot(true);
    setStatus("reading");
    setErr("");
    try {
      const res = await fetch("/api/level", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
      const data = await res.json().catch(() => ({ error: "The server sent back something unreadable." }));
      if (!res.ok || !data.level) throw new Error(data.error || `Request failed (${res.status}).`);
      const level = data.level as Level;
      if (typeof data.cost === "number") setSpent((v) => v + data.cost);
      if (!level.platforms?.length && !level.coins?.length) {
        throw new Error("Muse did not find a level in that photo. Draw with thick lines and fill most of the frame with the paper.");
      }
      levelRef.current = level;
      gameRef.current = buildGame(level);
      input.current = { left: false, right: false, jump: false };
      setHud({ coins: 0, total: gameRef.current.coins.length, time: 0, deaths: 0, won: false });
      setTitle(level.title || "Your level");
      setLast({ ms: data.ms, cost: typeof data.cost === "number" ? data.cost : null });
      setBuilt((n) => n + 1);
      setStatus("ready");
      canvasRef.current?.focus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("error");
    }
  };

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    send(toJpeg(v, v.videoWidth, v.videoHeight));
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const url = URL.createObjectURL(f);
    try {
      const img = await loadImg(url);
      send(toJpeg(img, img.naturalWidth, img.naturalHeight));
    } catch (er) {
      setErr(er instanceof Error ? er.message : "That image could not be opened.");
      setStatus("error");
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const useExample = async () => {
    const img = await loadImg("/example-sketch.jpg");
    send(toJpeg(img, img.naturalWidth, img.naturalHeight));
  };

  const replay = () => {
    if (!levelRef.current) return;
    gameRef.current = buildGame(levelRef.current);
    input.current = { left: false, right: false, jump: false };
    setHud({ coins: 0, total: gameRef.current.coins.length, time: 0, deaths: 0, won: false });
    canvasRef.current?.focus();
  };

  const drawNew = () => {
    if (mode === "draw") clearPad();
    else if (cam === "on") setShowShot(false);
    else startCam();
  };

  const busy = status === "reading";
  let primary: { label: string; act: () => void; disabled?: boolean };
  if (busy) primary = { label: "Reading your drawing", act: () => {}, disabled: true };
  else if (mode === "draw")
    primary = { label: "Build my level", act: () => padRef.current && send(padRef.current.toDataURL("image/jpeg", 0.9)), disabled: !hasInk };
  else if (cam === "starting") primary = { label: "Starting the camera", act: () => {}, disabled: true };
  else if (cam !== "on") primary = { label: "Turn on the camera", act: startCam };
  else if (showShot) primary = { label: "Retake", act: () => setShowShot(false) };
  else primary = { label: "Snap my drawing", act: snap };

  const perDollar = last?.cost ? Math.floor(BUDGET / last.cost) : null;

  return (
    <div className="sc">
      <header className="sc-top">
        <div className="sc-brand">
          <h1 className="sc-logo">
            <span>Scrawl</span>
            <svg viewBox="0 0 200 18" preserveAspectRatio="none" aria-hidden="true">
              <path d="M3 11 C 50 5, 120 15, 197 8" stroke={HI} strokeWidth="12" fill="none" strokeLinecap="round" />
            </svg>
          </h1>
          <p className="sc-tag">Draw a game level on paper. Hold it up. Play it a few seconds later.</p>
        </div>
        <div className="sc-meter" aria-live="polite">
          <div>
            <div className="sc-meter-big">${(BUDGET - spent).toFixed(4)}</div>
            <div className="sc-meter-small">left of your $1</div>
          </div>
          <div>
            <div className="sc-meter-big">{built}</div>
            <div className="sc-meter-small">{built === 1 ? "level built" : "levels built"}</div>
          </div>
          <div className="sc-bar" role="img" aria-label={`$${spent.toFixed(4)} of $1 spent`}>
            <i style={{ transform: `scaleX(${Math.min(1, Math.max(0.012, spent / BUDGET))})` }} />
          </div>
        </div>
      </header>

      <main className="sc-main">
        <section className="sc-sheet sc-left" aria-label="Your drawing">
          <div className="sc-tabs" role="tablist" aria-label="How to add your drawing">
            <button role="tab" aria-selected={mode === "camera"} className="sc-tab" onClick={() => setMode("camera")} disabled={busy}>
              Paper and camera
            </button>
            <button role="tab" aria-selected={mode === "draw"} className="sc-tab" onClick={() => setMode("draw")} disabled={busy}>
              Draw it here
            </button>
          </div>
          <div className="sc-cam">
            <canvas
              ref={padRef}
              width={800}
              height={600}
              className="sc-pad"
              style={{ display: mode === "draw" ? "block" : "none" }}
              onPointerDown={padDown}
              onPointerMove={padMove}
              onPointerUp={padUp}
              onPointerCancel={padUp}
              aria-label="Drawing pad"
            />
            {mode === "draw" ? (
              !hasInk && <div className="sc-pad-hint">Draw your level here with a mouse, trackpad or finger.</div>
            ) : showShot && shot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shot} alt="The drawing sent to Muse" />
            ) : cam === "on" ? (
              <video ref={videoCb} muted playsInline autoPlay />
            ) : (
              <div className="sc-cam-empty">
                {cam === "denied"
                  ? "The camera is blocked. Allow it from the address bar, or upload a photo instead."
                  : cam === "starting"
                    ? "Starting the camera"
                    : "Turn on the camera, then hold your drawing up to it."}
              </div>
            )}
            {busy && <div className="sc-scan" />}
          </div>

          <div className="sc-actions">
            <button className="sc-btn sc-btn-hi" onClick={primary.act} disabled={primary.disabled}>
              {primary.label}
            </button>
            {mode === "draw" ? (
              <button className="sc-btn" onClick={clearPad} disabled={busy || !hasInk}>
                Clear
              </button>
            ) : (
              <button className="sc-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
                Upload a photo
              </button>
            )}
            <button className="sc-btn" onClick={useExample} disabled={busy}>
              Try the example
            </button>
            <input ref={fileRef} className="sc-file" type="file" accept="image/*" onChange={onFile} tabIndex={-1} aria-hidden="true" />
          </div>

          <p className="sc-key-title">How to draw</p>
          <ul className="sc-key">
            <li>
              <svg viewBox="0 0 34 22" aria-hidden="true"><path d="M3 10 H31 M3 15 H31" stroke={INK} strokeWidth="2.4" strokeLinecap="round" /><path d="M8 15 L12 10 M15 15 L19 10 M22 15 L26 10" stroke={INK} strokeWidth="1.3" opacity=".6" /></svg>
              Platform
            </li>
            <li>
              <svg viewBox="0 0 34 22" aria-hidden="true"><circle cx="17" cy="11" r="6.5" fill={HI} stroke={INK} strokeWidth="2.2" /></svg>
              Coin
            </li>
            <li>
              <svg viewBox="0 0 34 22" aria-hidden="true"><path d="M10 4 L24 18 M24 4 L10 18" stroke={RED} strokeWidth="3" strokeLinecap="round" /></svg>
              Enemy
            </li>
            <li>
              <svg viewBox="0 0 34 22" aria-hidden="true"><path d="M3 18 L8 6 L13 18 L18 6 L23 18 L28 6 L31 14" stroke={RED} strokeWidth="2.2" fill="none" strokeLinejoin="round" /></svg>
              Spikes
            </li>
            <li>
              <svg viewBox="0 0 34 22" aria-hidden="true"><text x="17" y="18" textAnchor="middle" fontSize="19" fontWeight="800" fill={INK} fontFamily="var(--font-display), sans-serif">S</text></svg>
              Start
            </li>
            <li>
              <svg viewBox="0 0 34 22" aria-hidden="true"><path d="M12 20 V3" stroke={INK} strokeWidth="2.4" strokeLinecap="round" /><path d="M12 3 L25 7.5 L12 12 Z" fill={HI} stroke={INK} strokeWidth="2" strokeLinejoin="round" /></svg>
              Finish
            </li>
          </ul>
        </section>

        <section className="sc-sheet sc-right" aria-label="Your level">
          <div className="sc-info">
            <h2 className="sc-title">{status === "ready" || status === "reading" ? title || "Your level" : title || "No level yet"}</h2>
            {gameRef.current && (
              <div className="sc-stats">
                <span>Coins <b>{hud.coins}/{hud.total}</b></span>
                <span>Time <b>{hud.time.toFixed(1)}s</b></span>
                <span>Falls <b>{hud.deaths}</b></span>
              </div>
            )}
          </div>

          <div className="sc-stage">
            <canvas ref={canvasRef} width={W} height={H} tabIndex={0} aria-label="The game. Arrow keys move, Space jumps." />
            {status === "idle" && (
              <div className="sc-overlay">
                <div>
                  <h2>Your level shows up here</h2>
                  <p>Draw a level on paper and snap it with the camera. Muse Ember reads the drawing and builds it in a few seconds.</p>
                </div>
              </div>
            )}
            {status === "reading" && (
              <div className="sc-overlay">
                <div>
                  <h2>Reading your drawing</h2>
                  <p>Muse Ember is finding the platforms, coins and enemies. {wait.toFixed(1)}s</p>
                </div>
              </div>
            )}
            {status === "error" && (
              <div className="sc-overlay sc-err">
                <div>
                  <h2>Muse could not build that one</h2>
                  <p>{err}</p>
                  {shot && (
                    <button className="sc-btn" onClick={() => send(shot)}>
                      Send it again
                    </button>
                  )}
                </div>
              </div>
            )}
            {status === "ready" && hud.won && (
              <div className="sc-overlay">
                <div>
                  <h2>Cleared in {hud.time.toFixed(1)}s</h2>
                  <p>
                    {hud.coins} of {hud.total} coins, {hud.deaths} {hud.deaths === 1 ? "fall" : "falls"}.
                  </p>
                  <div className="sc-actions" style={{ justifyContent: "center", marginTop: 16 }}>
                    <button className="sc-btn sc-btn-hi" style={{ flex: "0 0 auto" }} onClick={replay}>
                      Play again
                    </button>
                    <button className="sc-btn" onClick={drawNew}>
                      Draw a new one
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {last && status !== "reading" && (
            <p className="sc-punch">
              Muse Ember read this drawing in {(last.ms / 1000).toFixed(1)}s for{" "}
              {last.cost === null ? "a cost OpenRouter did not report" : `$${last.cost.toFixed(5)}`}.
              {perDollar !== null && <> At that price, $1 builds <b>{perDollar.toLocaleString()} levels</b>.</>}
            </p>
          )}
          <p className="sc-help">
            Move with <kbd>←</kbd> <kbd>→</kbd> and jump with <kbd>Space</kbd>. Jump again in the air for a double jump. Land on an X to squash it.
          </p>
        </section>
      </main>

      <p className="sc-foot">
        Built at Build Day: OpenRouter x Meta. Every level is read live by meta/muse-ember through OpenRouter.
      </p>
    </div>
  );
}
