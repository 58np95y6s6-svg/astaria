// Image de story Instagram (1080 × 1920) : vue aérienne du lieu + trajet, comparaison, stats.
import { placeSVG, ratioText, lenLabel } from "./places.js";

const W = 1080, H = 1920;
const FONT = `-apple-system, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif`;

function svgImage(svg) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Illustration illisible"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", '<svg width="1000" height="1000" '));
  });
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function fit(ctx, text, max, size, weight = 800) {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${FONT}`; s -= 4; } while (ctx.measureText(text).width > max && s > 20);
}

/**
 * opts = { place, ratio, kicker, title, subtitle, stats: [[valeur, libellé], …], date }
 * Retourne un Blob PNG.
 */
export async function renderStory(o) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");

  // Fond : dégradé bleu nuit → violet, halo corail
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, "#151a36"); g.addColorStop(0.55, "#262150"); g.addColorStop(1, "#3a1f45");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const halo = ctx.createRadialGradient(W * 0.85, H * 0.72, 0, W * 0.85, H * 0.72, 700);
  halo.addColorStop(0, "rgba(244,85,90,.45)"); halo.addColorStop(1, "rgba(244,85,90,0)");
  ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
  const halo2 = ctx.createRadialGradient(80, 260, 0, 80, 260, 520);
  halo2.addColorStop(0, "rgba(98,120,255,.28)"); halo2.addColorStop(1, "rgba(98,120,255,0)");
  ctx.fillStyle = halo2; ctx.fillRect(0, 0, W, H);

  // En-tête
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 52px ${FONT}`;
  ctx.fillStyle = "#fff"; ctx.fillText("iBi", 70, 190);
  const wb = ctx.measureText("iBi").width;
  ctx.fillStyle = "#f4555a"; ctx.fillText("Fit", 70 + wb, 190);
  ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.textAlign = "right"; fit(ctx, o.date || "", 720, 34, 600);
  ctx.fillText(o.date || "", W - 70, 188); ctx.textAlign = "left";

  // Illustration (paysage, rognée au centre)
  const X = 60, Y = 236, S = 960, SH = o.food ? 720 : 800, RAD = 64;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
  rr(ctx, X, Y, S, SH, RAD); ctx.fillStyle = "#1e2342"; ctx.fill();
  ctx.restore();
  const img = await svgImage(placeSVG(o.place, o.ratio, { id: "st" }));
  const sh = (1000 * SH) / S;
  ctx.save(); rr(ctx, X, Y, S, SH, RAD); ctx.clip(); ctx.drawImage(img, 0, (1000 - sh) / 2, 1000, sh, X, Y, S, SH); ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 3; rr(ctx, X, Y, S, SH, RAD); ctx.stroke();

  // Pastille : lieu, ville, longueur
  const chip = `${o.place.flag}  ${o.place.short} · ${lenLabel(o.place.km)}`;
  fit(ctx, chip, S - 160, 34, 700);
  const cw = ctx.measureText(chip).width + 56;
  ctx.fillStyle = "rgba(15,18,42,.7)"; rr(ctx, X + 30, Y + SH - 104, cw, 72, 36); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.fillText(chip, X + 58, Y + SH - 56);

  // Comparaison
  const rt = ratioText(o.ratio, o.place);
  let y = Y + SH + 80;
  ctx.font = `600 36px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,.65)";
  ctx.fillText(o.kicker || "J'ai parcouru l'équivalent de", 70, y);
  y += 176;
  ctx.fillStyle = "#fff"; fit(ctx, rt.big, 940, 180, 900);
  ctx.fillText(rt.big, 62, y);
  y += 96;
  ctx.fillStyle = "#fff"; fit(ctx, rt.line, 940, 62);
  ctx.fillText(rt.line, 70, y);
  if (o.place.quip) {
    y += 56;
    ctx.fillStyle = "rgba(255,255,255,.8)"; fit(ctx, o.place.quip, 940, 36, 500);
    ctx.font = ctx.font.replace(/^500/, "italic 500");
    ctx.fillText(o.place.quip, 70, y);
  }
  y += 60;
  ctx.font = `700 40px ${FONT}`; ctx.fillStyle = "#ff7a7e";
  fit(ctx, o.subtitle || "", 940, 40, 700);
  ctx.fillText(o.subtitle || "", 70, y);

  // Bandeau « calories = nourriture »
  if (o.food) {
    const fy = y + 30, fh = 92;
    const g2 = ctx.createLinearGradient(60, 0, 1020, 0);
    g2.addColorStop(0, "rgba(255,154,122,.30)"); g2.addColorStop(1, "rgba(244,85,90,.22)");
    ctx.fillStyle = g2; rr(ctx, 60, fy, 960, fh, 46); ctx.fill();
    ctx.fillStyle = "#fff"; fit(ctx, o.food, 900, 38, 800);
    ctx.textAlign = "center"; ctx.fillText(o.food, 540, fy + 60); ctx.textAlign = "left";
  }

  // Bloc stats (verre)
  const by = 1560, bh = 170;
  ctx.fillStyle = "rgba(255,255,255,.09)"; rr(ctx, 60, by, 960, bh, 44); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 2; rr(ctx, 60, by, 960, bh, 44); ctx.stroke();
  const st = (o.stats || []).slice(0, 4), colW = 960 / Math.max(1, st.length);
  st.forEach(([v, l], i) => {
    const cx = 60 + colW * i + colW / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff"; fit(ctx, String(v), colW - 30, 54);
    ctx.fillText(String(v), cx, by + 88);
    ctx.font = `600 28px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.fillText(l, cx, by + 132);
    if (i) { ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.fillRect(60 + colW * i, by + 40, 2, bh - 80); }
  });
  ctx.textAlign = "left";

  return new Promise((res) => c.toBlob(res, "image/png"));
}

// Partage (feuille iOS → Instagram → Story). Doit être appelé directement depuis un toucher.
export async function shareBlob(blob, name = "ibifit-story.png") {
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return "shared"; } catch (e) { if (e.name === "AbortError") return "cancel"; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return "download";
}
