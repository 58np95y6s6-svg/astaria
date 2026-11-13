// Séances et réglages, stockés sur l'appareil (localStorage) + export / import JSON.
const KEY = "ibifit-workouts";
const SKEY = "ibifit-settings";

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export const loadWorkouts = () => read(KEY, []).sort((a, b) => (a.date < b.date ? 1 : -1));
export const loadSettings = () => ({ factors: {}, ...read(SKEY, {}) });
export const saveSettings = (s) => write(SKEY, s);

export function upsertWorkout(w) {
  const list = read(KEY, []);
  const i = list.findIndex((x) => x.id === w.id);
  const item = { ...w, id: w.id || crypto.randomUUID?.() || String(Date.now() + Math.random()), updatedAt: new Date().toISOString() };
  if (i >= 0) list[i] = item; else list.push(item);
  if (!write(KEY, list)) throw new Error("Stockage du téléphone indisponible (navigation privée ?)");
  return item;
}

export const deleteWorkout = (id) => write(KEY, read(KEY, []).filter((w) => w.id !== id));

export function exportAll() {
  const blob = new Blob([JSON.stringify({ workouts: read(KEY, []), settings: loadSettings() }, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ibifit-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importAll(file) {
  const data = JSON.parse(await file.text());
  const incoming = Array.isArray(data) ? data : data.workouts || [];
  const list = read(KEY, []);
  const ids = new Set(list.map((w) => w.id));
  const added = incoming.filter((w) => w && w.id && !ids.has(w.id));
  write(KEY, [...list, ...added]);
  if (data.settings) write(SKEY, { ...loadSettings(), ...data.settings });
  return added.length;
}
