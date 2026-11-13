// Lecture de l'export de l'app Santé (.zip ou .xml), en flux : fonctionne même avec un gros fichier.
import { parseHealthWorkout } from "./core.js";

let fflateP = null;
const loadFflate = () => (fflateP ||= import("https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js"));

/** Retourne les séances trouvées. onProgress(texte). */
export async function readHealthExport(file, onProgress = () => {}) {
  const out = [];
  let buf = "";
  const dec = new TextDecoder();
  const scan = (final) => {
    for (;;) {
      const i = buf.indexOf("<Workout ");
      if (i < 0) { buf = final ? "" : buf.slice(-16); return; }
      const oe = buf.indexOf(">", i);
      if (oe < 0) { buf = buf.slice(i); return; }
      let end;
      if (buf[oe - 1] === "/") end = oe + 1;
      else { const c = buf.indexOf("</Workout>", oe); if (c < 0) { buf = buf.slice(i); return; } end = c + 10; }
      const w = parseHealthWorkout(buf.slice(i, end));
      if (w) out.push(w);
      buf = buf.slice(end);
    }
  };
  const feedText = (bytes, final) => { buf += dec.decode(bytes, { stream: !final }); scan(final); };

  const isZip = /\.zip$/i.test(file.name) || file.type.includes("zip");
  const total = file.size || 1;
  let read = 0;
  const reader = file.stream().getReader();
  const pct = () => onProgress(`Lecture de l'export… ${Math.min(99, Math.round((read / total) * 100))} % · ${out.length} séance${out.length > 1 ? "s" : ""}`);

  if (!isZip) {
    for (;;) { const { done, value } = await reader.read(); if (done) break; read += value.length; feedText(value, false); pct(); }
    feedText(new Uint8Array(), true);
    return out;
  }
  onProgress("Préparation…");
  const { Unzip, UnzipInflate } = await loadFflate();
  let found = false, finished = null;
  const doneP = new Promise((res, rej) => { finished = { res, rej }; });
  const uz = new Unzip((entry) => {
    if (found || !/(^|\/)export(ation)?\.xml$/i.test(entry.name)) return;
    found = true;
    entry.ondata = (err, chunk, final) => {
      if (err) { finished.rej(err); return; }
      feedText(chunk, final);
      if (final) finished.res();
    };
    entry.start();
  });
  uz.register(UnzipInflate);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) { uz.push(new Uint8Array(), true); break; }
    read += value.length; uz.push(value); pct();
    await new Promise((r) => setTimeout(r, 0)); // laisse respirer l'interface
  }
  if (!found) throw new Error("Fichier export.xml introuvable dans ce .zip");
  await doneP;
  return out;
}
