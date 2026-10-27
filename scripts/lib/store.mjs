// Stockage fichier : chaque clé devient <DATA_DIR>/<clé>.json (publié dans la branche "data").
import fs from "node:fs/promises";
import path from "node:path";

export const DATA_DIR = path.resolve(process.env.DATA_DIR || "data-out");

export async function readJSON(key, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, `${key}.json`), "utf8"));
  } catch {
    return fallback;
  }
}

export async function writeJSON(key, value) {
  const f = path.join(DATA_DIR, `${key}.json`);
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, JSON.stringify(value));
}

export async function exists(key) {
  try { await fs.access(path.join(DATA_DIR, `${key}.json`)); return true; } catch { return false; }
}
