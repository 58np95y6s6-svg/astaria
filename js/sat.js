// Vraies vues satellite (Esri World Imagery) avec le trajet dessiné dessus, pour les lieux dont on connaît le tracé.
// Chargées à la demande sur le téléphone ; sans réseau, on garde l'illustration.

// Tracés réels [lat, lon], dans le sens de la marche.
export const SAT = {
  normandie: { path: [[49.4446, 0.2706], [49.4251, 0.2779]] },
};

const TILE = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
const proj = (lat, lon, z) => {
  const n = 256 * 2 ** z, s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
};
const loadImg = (src) => new Promise((res, rej) => {
  const im = new Image(); im.crossOrigin = "anonymous";
  im.onload = () => res(im); im.onerror = () => rej(new Error("tuile")); im.src = src;
});

/** Canvas W×H : photo satellite + trajet (ratio = part parcourue, plafonnée à 1). */
export async function satCanvas(id, ratio, W = 1000, H = 1000, { timeout = 8000 } = {}) {
  const cfg = SAT[id];
  if (!cfg) throw new Error("pas de vue satellite");
  const pts0 = cfg.path;
  // Zoom : le tracé occupe ~62 % du cadre
  let z = 18, px;
  for (; z > 2; z--) {
    px = pts0.map(([a, b]) => proj(a, b, z));
    const xs = px.map((p) => p[0]), ys = px.map((p) => p[1]);
    if (Math.max(...xs) - Math.min(...xs) <= W * 0.62 && Math.max(...ys) - Math.min(...ys) <= H * 0.62) break;
  }
  const xs = px.map((p) => p[0]), ys = px.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const ox = cx - W / 2, oy = cy - H / 2;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#2a3550"; ctx.fillRect(0, 0, W, H);
  const tx0 = Math.floor(ox / 256), ty0 = Math.floor(oy / 256), tx1 = Math.floor((ox + W) / 256), ty1 = Math.floor((oy + H) / 256);
  const jobs = [];
  for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
    jobs.push(loadImg(TILE(z, tx, ty)).then((im) => ctx.drawImage(im, tx * 256 - ox, ty * 256 - oy)));
  }
  await Promise.race([Promise.all(jobs), new Promise((_, rej) => setTimeout(() => rej(new Error("délai dépassé")), timeout))]);

  // Léger assombrissement pour faire ressortir le trajet
  ctx.fillStyle = "rgba(10,14,40,.18)"; ctx.fillRect(0, 0, W, H);
  const P = px.map(([x, y]) => [x - ox, y - oy]);
  const seg = []; let L = 0;
  for (let i = 1; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); seg.push(d); L += d; }
  const r = Math.max(0.012, Math.min(1, ratio));
  const path = (upto) => {
    ctx.beginPath(); ctx.moveTo(...P[0]);
    let acc = 0, end = P[0];
    for (let i = 1; i < P.length; i++) {
      if (acc + seg[i - 1] >= upto) { const t = (upto - acc) / seg[i - 1]; end = [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t]; ctx.lineTo(...end); return end; }
      acc += seg[i - 1]; ctx.lineTo(...P[i]); end = P[i];
    }
    return end;
  };
  const k = W / 1000;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  // Tracé complet en pointillés blancs
  ctx.setLineDash([18 * k, 16 * k]); ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 9 * k; path(L); ctx.stroke(); ctx.setLineDash([]);
  // Partie parcourue : halo blanc + corail
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 26 * k; path(L * r); ctx.stroke();
  ctx.strokeStyle = "#f4555a"; ctx.lineWidth = 15 * k; const end = path(L * r); ctx.stroke();
  const dot = ([x, y], R, col) => { ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); };
  dot(P[0], 18 * k, "#fff"); dot(P[0], 10 * k, "#1e2342");
  if (r < 1) { dot(end, 42 * k, "rgba(244,85,90,.3)"); dot(end, 24 * k, "#fff"); dot(end, 15 * k, "#f4555a"); }
  // Mention de la source
  ctx.font = `600 ${Math.max(10, 18 * k)}px -apple-system, Helvetica, Arial, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.textAlign = "right";
  ctx.fillText("Imagerie © Esri, Maxar, Earthstar Geographics", W - 14 * k, H - 14 * k);
  ctx.textAlign = "left";
  return c;
}
