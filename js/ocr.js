// Lecture d’une capture sur le téléphone (Tesseract chargé à la demande, ≈5 Mo la 1re fois).
// ---------- Lecture d'une capture (navigateur) ----------
let tessLoading = null;
function loadTesseract() {
  if (globalThis.Tesseract) return Promise.resolve(globalThis.Tesseract);
  tessLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    s.onload = () => resolve(globalThis.Tesseract);
    s.onerror = () => { tessLoading = null; reject(new Error("Impossible de charger le module de lecture (connexion ?)")); };
    document.head.appendChild(s);
  });
  return tessLoading;
}

// Prétraitement : niveaux de gris, inversion si fond sombre, agrandissement ×2.
async function prepare(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(2, 2400 / bmp.width);
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const dark = sum / (d.length / 4) < 128;
  for (let i = 0; i < d.length; i += 4) {
    let v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (dark) v = 255 - v; // pas de seuillage : il dégrade les chiffres en couleur de l'app Forme
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export async function ocrImage(file, onProgress) {
  const T = await loadTesseract();
  onProgress?.("Préparation de l'image…");
  const canvas = await prepare(file);
  const worker = await T.createWorker("fra", 1, {
    logger: (m) => { if (m.status === "recognizing text") onProgress?.(`Lecture du ticket… ${Math.round(m.progress * 100)} %`); else if (/load/.test(m.status)) onProgress?.("Chargement du module de lecture (1re fois ≈ 5 Mo)…"); },
  });
  try {
    const { data } = await worker.recognize(canvas);
    return data.text;
  } finally { await worker.terminate(); }
}
