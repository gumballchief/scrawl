import { muse, part, MuseError } from "@/lib/muse";

const point = {
  type: "object",
  properties: { x: { type: "number" }, y: { type: "number" } },
  required: ["x", "y"],
  additionalProperties: false,
};

const schema = {
  name: "level",
  schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "A short, fun name for this level, 2 to 4 words, inspired by the drawing." },
      platforms: {
        type: "array",
        items: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" } },
          required: ["x", "y", "w"],
          additionalProperties: false,
        },
      },
      coins: { type: "array", items: point },
      enemies: { type: "array", items: point },
      spikes: {
        type: "array",
        items: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" } },
          required: ["x", "y", "w"],
          additionalProperties: false,
        },
      },
      start: point,
      goal: point,
    },
    required: ["title", "platforms", "coins", "enemies", "spikes", "start", "goal"],
    additionalProperties: false,
  },
};

const system = `You turn a photo of a hand-drawn 2D platformer level into JSON.

Coordinates run from 0 to 100 across the drawing area only (ignore the table, hands and paper edges): x = 0 is the left edge of the drawing, x = 100 the right edge, y = 0 the top, y = 100 the bottom.

How people draw:
- A horizontal line, bar or box = a platform. x is its LEFT end, y its height, w its length.
- A small circle, dot or "o" = a coin.
- An "X", a scribbled monster or a face = an enemy. Give the point where it stands.
- A zigzag, a row of triangles or "^^^" = spikes. x is the left end, y its height, w its length.
- An "S", a stick figure or an arrow = the start.
- A flag, a star, an "F" or a door = the goal.

Be faithful to where things are in the drawing; do not invent a different level. Keep every platform that is drawn. If there is no start, put it above the leftmost platform. If there is no goal, put it above the rightmost platform.`;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { image?: string };
    const image = body.image || "";
    if (!image.startsWith("data:image/")) {
      return Response.json({ error: "Send a photo of your drawing first." }, { status: 400 });
    }
    const r = await muse({
      system,
      prompt: "Here is my drawing. Turn it into the level JSON.",
      parts: [part.image(image)],
      schema,
      effort: "minimal",
    });
    return Response.json({ level: r.json, ms: r.ms, cost: r.usage?.cost ?? null, model: r.model, usage: r.usage });
  } catch (e) {
    const err = e as MuseError;
    return Response.json({ error: err.message || "Muse could not read the drawing." }, { status: err.status || 500 });
  }
}
