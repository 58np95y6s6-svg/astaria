import { getStore } from "@netlify/blobs";

// ASTARIA_MEMORY_STORE=1 : stockage en mémoire (tests / dev hors Netlify).
const mem = new Map();
const memStore = {
  get: async (k) => (mem.has(k) ? JSON.parse(mem.get(k)) : null),
  setJSON: async (k, v) => { mem.set(k, JSON.stringify(v)); },
};

export function store() {
  if (process.env.ASTARIA_MEMORY_STORE === "1") return memStore;
  return getStore({ name: "nba", consistency: "strong" });
}

export async function readJSON(key, fallback = null) {
  try {
    const v = await store().get(key, { type: "json" });
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export async function writeJSON(key, value) {
  await store().setJSON(key, value);
}

export function json(data, { status = 200, cache = 0, headers = {} } = {}) {
  const h = { "Content-Type": "application/json; charset=utf-8", ...headers };
  if (cache > 0) {
    h["Cache-Control"] = "public, max-age=0, must-revalidate";
    h["Netlify-CDN-Cache-Control"] = `public, s-maxage=${cache}, stale-while-revalidate=${cache * 4}`;
  } else {
    h["Cache-Control"] = "no-store";
  }
  return new Response(JSON.stringify(data), { status, headers: h });
}

export function errorJSON(e, status = 500) {
  return json({ error: String(e?.message || e) }, { status });
}
