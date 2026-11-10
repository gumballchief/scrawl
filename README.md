# Scrawl

Draw a game level on paper, hold it up to your webcam, and play it a few seconds later.

Built in one hour at **Build Day: OpenRouter x Meta** (SF, Nov 9 2026) for the $1 Challenge: *one dollar of Muse Ember, what can you make possible?*

https://github.com/user-attachments/assets/5433e09a-ffb1-4ed1-b1ce-5ab514408ddf

Every level in the video was read live by Muse Ember from a photo of a drawing.

## What it does

1. You draw a level with a pen: lines are platforms, circles are coins, an X is an enemy, a zigzag is spikes, an S is the start and a flag is the finish.
2. Snap it with the webcam, upload a photo, or draw it right on the page with a mouse, trackpad or finger.
3. **Muse Ember** (`meta/muse-ember` on OpenRouter) looks at the photo and returns the level as structured JSON (strict JSON schema: platforms, coins, enemies, spikes, start, goal, and a title it makes up).
4. The page turns that JSON into a playable platformer drawn in notebook ink: run, double jump, squash enemies, grab coins, reach the flag.

## The $1 part

Each drawing costs about **$0.0004 to $0.0007** and takes **2.5 to 4 seconds** with Ember on minimal reasoning. That is roughly **1,500 to 2,500 playable levels for one dollar**. The page shows the real cost of every level (from OpenRouter's usage data) and a live meter of how much of your dollar is left.

## How it's built

- Next.js 16 app. `web/app/api/level/route.ts` sends the photo to Muse Ember through OpenRouter's chat completions API with `response_format: json_schema` and `reasoning: { effort: "minimal" }`.
- `web/app/scrawl.tsx` is the whole front end: webcam capture, the level builder (snaps enemies and spikes onto the platforms under them, adds a ledge if the start or flag is floating), the game loop and the hand-drawn renderer on a canvas.
- `film/record.mjs` recorded the demo video from the real running app. Every level in it was read live by Muse Ember. A bot plays the levels: it tries its moves on a copy of the level first, then plays it live with real key presses.

## Run it

```
cd web
npm install
OPENROUTER_API_KEY=sk-or-... npm run dev
```

Open http://localhost:3000, click "Try the example" or turn on the camera.
