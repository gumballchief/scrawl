// Films the running Scrawl app (dev server on :3081) into film/demo.mp4.
// Every Muse call in the video is real: the page sends each drawing photo to meta/muse-ember live.
//   node film/record.mjs [second drawing to upload]
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// PUPPETEER_FROM: any package.json path that can resolve puppeteer-core. FFMPEG_PATH: ffmpeg.exe (ffprobe beside it).
const require = createRequire(process.env.PUPPETEER_FROM || import.meta.url);
const puppeteer = require("puppeteer-core");
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const here = import.meta.dirname;
const BASE = "http://localhost:3081/";
const second = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  args: ["--window-size=1440,900", "--hide-scrollbars"],
});
const page = await browser.newPage();
const hideDevBadge = () => page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()));
await page.goto(BASE, { waitUntil: "networkidle0" });
await page.waitForFunction(() => !!window.__scrawlLib, { timeout: 20000 });
await hideDevBadge();
await sleep(600);

async function sendAndPlay(send) {
  await page.evaluate(() => (window.__prevGame = window.__scrawl.current));
  await send();
  await page.waitForFunction(() => window.__scrawl.current && window.__scrawl.current !== window.__prevGame, { timeout: 60000, polling: 100 });
  await hideDevBadge();
  const reveal = await page.evaluate(() => window.__scrawl.current.revealDur);
  await sleep(reveal * 1000 + 900);
  // A bot plays with real key presses. It first tries its settings on a copy of the level, then plays live.
  return page.evaluate(async () => {
    const kd = (key) => window.dispatchEvent(new KeyboardEvent("keydown", { key }));
    const ku = (key) => window.dispatchEvent(new KeyboardEvent("keyup", { key }));
    const { step, buildGame } = window.__scrawlLib;
    const level = window.__scrawlLevel.current;
    const policy = (pause, dj) => {
      const m = { landedAt: -1e9, wasGround: false };
      return (g, now) => {
        const p = g.p;
        if (p.ground && !m.wasGround) m.landedAt = now;
        m.wasGround = p.ground;
        const waiting = p.ground && now - m.landedAt < pause;
        const jump = (p.ground && !waiting) || (!p.ground && p.jumps === 1 && p.vy > dj);
        return { right: !waiting, jump };
      };
    };
    let best = null;
    for (const pause of [260, 180, 120, 0]) for (const dj of [-6, -14, 2, -22, -30]) {
      const g = buildGame(level);
      const pol = policy(pause, dj);
      let now = 0;
      const inp = { left: false, right: false, jump: false };
      for (let f = 0; f < 60 * 30 && !g.won && g.deaths < 3; f++) {
        const a = pol(g, now);
        inp.right = a.right; inp.jump = a.jump;
        step(g, 1 / 60, inp, now);
        now += 1000 / 60;
      }
      const score = (g.won ? 1000 : 0) + g.coins.filter((c) => c.got).length * 10 - g.deaths * 30 + pause / 100;
      if (!best || score > best.score) best = { pause, dj, score, won: g.won };
    }
    const g = window.__scrawl.current;
    const pol = policy(best.pause, best.dj);
    let holding = false;
    const t0 = performance.now();
    await new Promise((done) => {
      const tick = (now) => {
        if (g.won || now - t0 > 20000) { ku("ArrowRight"); return done(); }
        const a = pol(g, now);
        if (a.right && !holding) { kd("ArrowRight"); holding = true; }
        if (!a.right && holding) { ku("ArrowRight"); holding = false; }
        if (a.jump) kd(" ");
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return { title: level.title, plan: best, won: g.won, deaths: g.deaths, coins: g.coins.filter((c) => c.got).length, total: g.coins.length };
  });
}

const raw = path.join(here, "demo-raw.webm");
const rec = await page.screencast({ path: raw, ffmpegPath: FFMPEG });
await sleep(2200);
const one = await sendAndPlay(() =>
  page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("Try the example")).click()),
);
await sleep(3200);
let two = null;
if (second) {
  two = await sendAndPlay(async () => {
    const input = await page.$("input[type=file]");
    await input.uploadFile(second);
  });
  await sleep(3800);
}
await rec.stop();
await browser.close();

const mp4 = path.join(here, "demo.mp4");
execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", raw, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", mp4]);
const secs = execFileSync(FFMPEG.replace("ffmpeg.exe", "ffprobe.exe"), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4]).toString().trim();
console.log(JSON.stringify({ one, two, seconds: Number(secs).toFixed(1), mb: (fs.statSync(mp4).size / 1e6).toFixed(1) }));
