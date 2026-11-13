// Lieux célèbres pour comparer une distance, avec une vue aérienne stylisée (SVG) et le trajet dessiné dessus.
// Longueurs usuelles (arrondies).

export const PLACES = [
  { id: "champs", name: "les Champs-Élysées", short: "Champs-Élysées", where: "Paris", flag: "🇫🇷", km: 1.91, scene: "avenue" },
  { id: "brooklyn", name: "le pont de Brooklyn", short: "Pont de Brooklyn", where: "New York", flag: "🇺🇸", km: 1.83, scene: "bridge", color: "#9a8466" },
  { id: "millau", name: "le viaduc de Millau", short: "Viaduc de Millau", where: "Aveyron", flag: "🇫🇷", km: 2.46, scene: "bridge", color: "#f2f2f2", valley: true },
  { id: "goldengate", name: "le Golden Gate Bridge", short: "Golden Gate", where: "San Francisco", flag: "🇺🇸", km: 2.74, scene: "bridge", color: "#d2412f" },
  { id: "monaco", name: "le circuit de Monaco", short: "Circuit de Monaco", where: "Monte-Carlo", flag: "🇲🇨", km: 3.34, scene: "circuit", sea: true },
  { id: "centralpark", name: "Central Park", short: "Central Park", where: "New York", flag: "🇺🇸", km: 4.0, scene: "park" },
  { id: "promenade", name: "la promenade des Anglais", short: "Promenade des Anglais", where: "Nice", flag: "🇫🇷", km: 7, scene: "coast" },
  { id: "lemans", name: "le circuit des 24 Heures du Mans", short: "Circuit du Mans", where: "Le Mans", flag: "🇫🇷", km: 13.63, scene: "circuit" },
  { id: "manhattan", name: "l'île de Manhattan", short: "Manhattan", where: "New York", flag: "🇺🇸", km: 21.6, scene: "city" },
  { id: "manche", name: "la traversée de la Manche", short: "Traversée de la Manche", where: "Calais → Douvres", flag: "🌊", km: 33, scene: "sea" },
  { id: "marathon", name: "le marathon de Paris", short: "Marathon de Paris", where: "Paris", flag: "🏅", km: 42.195, scene: "paris" },
  { id: "tmb", name: "le Tour du Mont-Blanc", short: "Tour du Mont-Blanc", where: "Alpes", flag: "🏔️", km: 170, scene: "trail" },
  { id: "canyon", name: "le Grand Canyon", short: "Grand Canyon", where: "Arizona", flag: "🇺🇸", km: 446, scene: "canyon" },
  { id: "parismarseille", name: "Paris → Marseille", short: "Paris → Marseille", where: "Autoroute du Soleil", flag: "🇫🇷", km: 775, scene: "road", green: true },
  { id: "route66", name: "la Route 66", short: "Route 66", where: "Chicago → Santa Monica", flag: "🇺🇸", km: 3940, scene: "road" },
  { id: "wall", name: "la Grande Muraille de Chine", short: "Muraille de Chine", where: "Chine", flag: "🇨🇳", km: 21196, scene: "wall" },
  { id: "earth", name: "le tour de la Terre", short: "Tour de la Terre", where: "Équateur", flag: "🌍", km: 40075, scene: "globe" },
];

// Comparaisons classées : d'abord celles dont le rapport est « parlant » (proche de 1, entre 0,3× et 6×).
export function placesFor(km) {
  if (!(km > 0)) return [];
  return PLACES.map((p) => ({ place: p, ratio: km / p.km }))
    .sort((a, b) => Math.abs(Math.log(a.ratio * 0.9)) - Math.abs(Math.log(b.ratio * 0.9)));
}

// Prochain défi pour un cumul : le premier lieu pas encore « bouclé ».
export function nextChallenge(totalKm) {
  const p = PLACES.find((x) => x.km > totalKm) || PLACES[PLACES.length - 1];
  return { place: p, ratio: totalKm / p.km };
}

export const ofName = (n) => n.replace(/^le /, "du ").replace(/^les /, "des ").replace(/^la /, "de la ").replace(/^l'/, "de l'").replace(/^(?!du |des |de )/, "de ");

export function ratioText(ratio, place) {
  if (ratio >= 0.995) {
    const r = ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10;
    return { big: `${r.toLocaleString("fr-FR")}×`, line: place.name };
  }
  const pct = ratio * 100;
  const v = pct >= 10 ? Math.round(pct) : pct >= 1 ? Math.round(pct * 10) / 10 : Math.round(pct * 100) / 100;
  return { big: `${v.toLocaleString("fr-FR")} %`, line: ofName(place.name) };
}

// ---------- Scènes (vue du ciel, sans détails) ----------
const R = (seed) => { let x = seed; return () => (x = (x * 16807) % 2147483647) / 2147483647; };

function blocks(rnd, x0, y0, x1, y1, cell, gap, colors) {
  let s = "";
  for (let y = y0; y < y1; y += cell) for (let x = x0; x < x1; x += cell) {
    const c = colors[Math.floor(rnd() * colors.length)];
    s += `<rect x="${x + gap / 2}" y="${y + gap / 2}" width="${cell - gap}" height="${cell - gap}" rx="6" fill="${c}"/>`;
  }
  return s;
}

const SCENES = {
  avenue: (p, rnd) => ({
    bg: `<rect width="1000" height="1000" fill="#d6d0c4"/>
      <g transform="rotate(-28 500 500)">${blocks(rnd, -300, -300, 1300, 1300, 90, 16, ["#c3bcae", "#cfc8ba", "#bbb3a3", "#e3ddd1"])}</g>
      <path d="M90 780 L 910 250" stroke="#6f8f5a" stroke-width="70" stroke-linecap="round"/>
      <path d="M90 780 L 910 250" stroke="#8a8a8a" stroke-width="44"/>
      <circle cx="910" cy="250" r="78" fill="#8a8a8a"/><circle cx="910" cy="250" r="34" fill="#eae3d3"/>
      ${[...Array(12)].map((_, i) => `<path d="M910 250 L ${910 + 200 * Math.cos(i * Math.PI / 6)} ${250 + 200 * Math.sin(i * Math.PI / 6)}" stroke="#9a9a9a" stroke-width="18"/>`).join("")}
      <rect x="40" y="740" width="110" height="110" rx="14" fill="#a9a196"/>`,
    d: "M95 776 L 905 254",
  }),
  bridge: (p) => ({
    bg: p.valley
      ? `<rect width="1000" height="1000" fill="#6f8c4f"/><path d="M0 560 C 250 470 380 620 520 520 S 820 420 1000 470 L 1000 640 C 760 600 640 700 480 650 S 160 650 0 720Z" fill="#4e6b3a"/>
         <path d="M0 640 C 300 560 600 700 1000 560" stroke="#5f9fb5" stroke-width="22" fill="none"/>
         <circle cx="260" cy="260" r="90" fill="#7f9b5d"/><circle cx="780" cy="800" r="120" fill="#7f9b5d"/>`
      : `<rect width="1000" height="1000" fill="#2f6f9a"/>
         <path d="M0 0 H 460 C 380 120 300 160 0 330Z" fill="#7a9663"/><path d="M0 0 H 300 C 230 80 120 110 0 180Z" fill="#c9c2b3"/>
         <path d="M1000 1000 H 520 C 620 860 720 820 1000 660Z" fill="#7a9663"/><path d="M1000 1000 H 740 C 800 900 880 880 1000 840Z" fill="#c9c2b3"/>
         <path d="M0 520 C 300 480 600 560 1000 470" stroke="#3b7fac" stroke-width="40" fill="none" opacity=".6"/>`,
    fg: `<path d="M120 880 L 880 120" stroke="${p.color}" stroke-width="54" stroke-linecap="round" opacity=".95"/>
      <rect x="340" y="610" width="60" height="60" rx="6" fill="${p.color}" stroke="#0003" stroke-width="6" transform="rotate(-45 370 640)"/>
      <rect x="600" y="350" width="60" height="60" rx="6" fill="${p.color}" stroke="#0003" stroke-width="6" transform="rotate(-45 630 380)"/>`,
    d: "M120 880 L 880 120",
  }),
  circuit: (p) => ({
    bg: p.sea
      ? `<rect width="1000" height="1000" fill="#d4ccbd"/><path d="M0 720 C 220 680 360 760 560 700 S 860 640 1000 690 V 1000 H 0Z" fill="#2c7fb0"/>
         <path d="M0 720 C 220 680 360 760 560 700 S 860 640 1000 690" stroke="#e8dfc8" stroke-width="18" fill="none"/>
         <g opacity=".7">${[...Array(18)].map((_, i) => `<rect x="${(i * 173) % 900 + 30}" y="${(i * 97) % 500 + 60}" width="90" height="70" rx="10" fill="${["#c2b8a6", "#e6dfd0", "#b9ad97"][i % 3]}"/>`).join("")}</g>`
      : `<rect width="1000" height="1000" fill="#7d9a5b"/><rect x="60" y="80" width="300" height="220" rx="20" fill="#8eab69"/><rect x="620" y="640" width="320" height="260" rx="20" fill="#6c8a4c"/>
         <circle cx="760" cy="230" r="130" fill="#6c8a4c"/>`,
    d: p.sea ? "M180 600 C 120 470 220 360 340 380 S 520 240 600 260 S 820 200 860 330 S 760 520 820 600 S 600 660 480 620 S 300 680 180 600Z"
      : "M150 820 L 210 250 C 220 160 320 140 360 220 L 470 470 C 500 530 560 520 590 470 L 760 180 C 800 120 880 140 870 230 L 840 760 C 830 860 760 880 690 850 L 230 870 C 180 872 150 860 150 820Z",
    track: true,
  }),
  park: (p, rnd) => ({
    bg: `<rect width="1000" height="1000" fill="#cfc9bd"/>
      <g transform="rotate(-29 500 500)">${blocks(rnd, -300, -300, 1300, 1300, 80, 14, ["#bdb5a5", "#c9c1b2", "#d9d3c7"])}
      <rect x="390" y="70" width="230" height="860" rx="16" fill="#5f8d48"/>
      <ellipse cx="505" cy="380" rx="70" ry="110" fill="#3f86b4"/><ellipse cx="490" cy="820" rx="50" ry="40" fill="#3f86b4"/>
      <circle cx="450" cy="120" r="34" fill="#4d7a39"/><circle cx="560" cy="620" r="44" fill="#4d7a39"/></g>`,
    dRot: "M470 110 C 430 110 420 130 420 170 L 420 830 C 420 870 440 890 480 890 L 530 890 C 570 890 590 870 590 830 L 590 170 C 590 130 570 110 530 110 Z",
    rot: -29,
  }),
  coast: () => ({
    bg: `<rect width="1000" height="1000" fill="#d3cbbb"/><path d="M0 560 C 300 600 700 520 1000 590 V 1000 H 0Z" fill="#1e86b8"/>
      <path d="M0 560 C 300 600 700 520 1000 590" stroke="#efe2c4" stroke-width="44" fill="none"/>
      ${[...Array(14)].map((_, i) => `<rect x="${i * 72 + 4}" y="${380 + (i % 3) * 20}" width="62" height="${90 + (i % 4) * 14}" rx="8" fill="${["#e9e1d2", "#c7bba6", "#f1d9c5"][i % 3]}"/>`).join("")}
      ${[...Array(14)].map((_, i) => `<circle cx="${i * 72 + 36}" cy="510" r="14" fill="#6f9a52"/>`).join("")}`,
    d: "M20 535 C 300 572 700 492 980 562",
  }),
  city: (p, rnd) => ({
    bg: `<rect width="1000" height="1000" fill="#2c6e98"/>
      <path d="M380 0 H 700 C 760 300 720 700 600 1000 H 300 C 360 700 330 300 380 0Z" fill="#cbc4b6" transform="rotate(-12 500 500)"/>
      <g clip-path="url(#isl)">${blocks(rnd, 250, -50, 800, 1050, 46, 10, ["#bab1a0", "#d9d2c4", "#a99f8c"])}</g>
      <clipPath id="isl"><path d="M380 0 H 700 C 760 300 720 700 600 1000 H 300 C 360 700 330 300 380 0Z" transform="rotate(-12 500 500)"/></clipPath>
      <rect x="470" y="300" width="60" height="230" rx="6" fill="#5f8d48" transform="rotate(-12 500 500)"/>`,
    d: "M420 960 L 470 760 L 420 620 L 520 470 L 480 300 L 560 150 L 560 40",
  }),
  paris: (p, rnd) => ({
    bg: `<rect width="1000" height="1000" fill="#d4cdbf"/>
      <g transform="rotate(14 500 500)">${blocks(rnd, -200, -200, 1200, 1200, 70, 12, ["#c4bba9", "#ddd6c8", "#b8ae9b", "#cfc6b4"])}</g>
      <path d="M-20 300 C 200 420 300 560 500 520 S 800 420 1020 640" stroke="#3f86b4" stroke-width="54" fill="none"/>
      <circle cx="220" cy="230" r="70" fill="#6f9a52"/><rect x="640" y="720" width="190" height="120" rx="16" fill="#6f9a52"/>`,
    d: "M180 760 C 120 600 200 380 360 300 S 700 180 820 300 S 900 600 760 720 S 420 860 180 760Z",
  }),
  sea: () => ({
    bg: `<rect width="1000" height="1000" fill="#24648f"/>
      <path d="M0 0 H 1000 V 200 C 800 260 600 180 400 240 S 100 230 0 280Z" fill="#7c9e60"/><path d="M0 280 C 100 230 300 250 400 240 S 800 260 1000 200" stroke="#f4f1e8" stroke-width="20" fill="none"/>
      <path d="M0 1000 H 1000 V 780 C 820 740 620 820 420 770 S 140 790 0 740Z" fill="#a3ad6c"/><path d="M0 740 C 140 790 220 770 420 770 S 820 740 1000 780" stroke="#e9dcb8" stroke-width="16" fill="none"/>
      <path d="M100 520 C 300 480 700 560 900 500" stroke="#2f75a3" stroke-width="60" fill="none" opacity=".6"/>`,
    d: "M300 775 C 380 620 540 420 640 225",
  }),
  trail: () => ({
    bg: `<rect width="1000" height="1000" fill="#5f7d4a"/>
      ${[[500, 470, 300], [300, 560, 190], [700, 560, 210], [420, 330, 170], [640, 360, 160]].map(([x, y, r]) => `<path d="M${x - r} ${y + r * 0.7} L ${x} ${y - r * 0.7} L ${x + r} ${y + r * 0.7}Z" fill="#8a8f84"/><path d="M${x - r * 0.38} ${y - r * 0.17} L ${x} ${y - r * 0.7} L ${x + r * 0.38} ${y - r * 0.17} L ${x + r * 0.12} ${y - r * 0.26} L ${x - r * 0.05} ${y - r * 0.12}Z" fill="#f5f7fa"/>`).join("")}
      <path d="M0 900 C 300 840 600 960 1000 880 V 1000 H 0Z" fill="#4c6a3a"/>`,
    d: "M500 880 C 220 870 90 700 110 500 S 300 120 520 110 S 900 260 890 500 S 760 880 500 880Z",
  }),
  canyon: () => ({
    bg: `<rect width="1000" height="1000" fill="#c9773f"/>
      <path d="M0 300 C 200 240 300 420 520 360 S 820 260 1000 340 V 700 C 800 640 640 760 460 700 S 160 640 0 720Z" fill="#a85a2c"/>
      <path d="M0 380 C 220 320 300 500 520 440 S 820 340 1000 420 V 620 C 800 560 640 680 460 620 S 160 560 0 640Z" fill="#8b4421"/>
      <path d="M0 260 C 200 200 340 380 540 320" stroke="#e09a5c" stroke-width="30" fill="none" opacity=".7"/>`,
    d: "M0 520 C 120 450 220 600 340 540 S 520 440 620 520 S 840 600 1000 500",
    water: true,
  }),
  road: (p) => ({
    bg: p.green
      ? `<rect width="1000" height="1000" fill="#9aae6a"/>${[...Array(10)].map((_, i) => `<rect x="${(i * 211) % 900}" y="${(i * 137) % 900}" width="180" height="120" rx="14" fill="${["#b7c27d", "#86a05a", "#c9b778"][i % 3]}" transform="rotate(${i * 17} 500 500)"/>`).join("")}`
      : `<rect width="1000" height="1000" fill="#d9b989"/>${[...Array(9)].map((_, i) => `<ellipse cx="${(i * 233) % 1000}" cy="${(i * 151) % 1000}" rx="140" ry="60" fill="${["#cfa874", "#e4c79c"][i % 2]}"/>`).join("")}`,
    d: "M60 900 C 260 820 300 640 460 600 S 700 480 760 320 S 900 120 960 80",
    road: true,
  }),
  wall: () => ({
    bg: `<rect width="1000" height="1000" fill="#5d7a45"/>
      <path d="M0 860 C 200 700 160 540 340 500 S 560 560 640 400 S 820 200 1000 140 V 0 H 0Z" fill="#6f8c52"/>
      <path d="M0 980 C 240 820 260 680 420 640 S 660 640 740 500 S 900 340 1000 300 V 1000 H 0Z" fill="#4c6838"/>
      <path d="M0 600 C 120 520 140 380 300 300 S 520 180 600 60" stroke="#80a062" stroke-width="40" fill="none" opacity=".7"/>`,
    d: "M60 860 C 200 720 170 580 330 520 S 540 590 620 430 S 780 250 940 170",
    wall: true,
  }),
  globe: () => ({
    bg: `<rect width="1000" height="1000" fill="#121735"/>
      ${[...Array(40)].map((_, i) => `<circle cx="${(i * 197) % 1000}" cy="${(i * 331) % 1000}" r="${(i % 3) + 1.5}" fill="#fff" opacity=".6"/>`).join("")}
      <circle cx="500" cy="500" r="330" fill="#1f5f99"/>
      <path d="M330 300 C 400 260 470 330 440 400 S 380 520 330 470 S 280 340 330 300Z M560 360 C 640 330 720 400 690 480 S 600 620 560 560 S 520 400 560 360Z M420 620 C 470 600 520 660 490 720 S 400 740 420 620Z" fill="#5f9a56"/>`,
    d: "M170 500 A 330 110 0 1 0 830 500 A 330 110 0 1 0 170 500",
  }),
};

let measureEl = null;
function pointAt(d, r) {
  if (typeof document === "undefined") return null;
  try {
    if (!measureEl) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("style", "position:absolute;width:0;height:0;visibility:hidden");
      measureEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
      svg.appendChild(measureEl); document.body.appendChild(svg);
    }
    measureEl.setAttribute("d", d);
    const L = measureEl.getTotalLength();
    const pt = measureEl.getPointAtLength(Math.max(0, Math.min(1, r)) * L);
    return { x: pt.x, y: pt.y };
  } catch { return null; }
}

/** Vue aérienne stylisée + trajet. ratio = distance / longueur du lieu. */
export function placeSVG(place, ratio, { rounded = 0, id = "p" } = {}) {
  const rnd = R(place.id.split("").reduce((a, c) => a + c.charCodeAt(0), 7));
  const sc = SCENES[place.scene](place, rnd);
  const d = sc.dRot || sc.d;
  const tf = sc.rot ? ` transform="rotate(${sc.rot} 500 500)"` : "";
  const r = Math.max(0, Math.min(1, ratio));
  const shown = r < 0.012 ? 0.012 : r; // toujours un petit bout visible
  const end = pointAt(d, shown);
  const endPt = end && sc.rot ? rotPt(end, sc.rot) : end;
  const start = pointAt(d, 0);
  const startPt = start && sc.rot ? rotPt(start, sc.rot) : start;
  const base = sc.wall
    ? `<path d="${d}" stroke="#3a3326" stroke-width="34" fill="none" stroke-linecap="round" opacity=".6"/><path d="${d}" stroke="#d8c7a1" stroke-width="20" fill="none" stroke-linecap="round" stroke-dasharray="26 8"/>`
    : sc.road ? `<path d="${d}" stroke="#4a4a4a" stroke-width="34" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#f3c64b" stroke-width="4" fill="none" stroke-dasharray="22 18"/>`
    : sc.track ? `<path d="${d}" stroke="#555" stroke-width="30" fill="none" stroke-linejoin="round"/><path d="${d}" stroke="#fff" stroke-width="3" fill="none" stroke-dasharray="14 12" opacity=".7"/>`
    : sc.water ? `<path d="${d}" stroke="#4aa3c9" stroke-width="22" fill="none" stroke-linecap="round"/>`
    : `<path d="${d}" stroke="#ffffff" stroke-width="12" fill="none" stroke-dasharray="18 16" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
    <defs><clipPath id="${id}c"><rect width="1000" height="1000" rx="${rounded}"/></clipPath>
      <radialGradient id="${id}v" cx="50%" cy="45%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#0b0f2a" stop-opacity=".55"/></radialGradient></defs>
    <g clip-path="url(#${id}c)">
      <g style="filter:saturate(.85)">${sc.bg}${sc.fg || ""}</g>
      <g${tf}>${base}
        <path d="${d}" pathLength="1000" stroke="#ffffff" stroke-width="30" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${shown * 1000} 2000" opacity=".95"/>
        <path d="${d}" pathLength="1000" stroke="#f4555a" stroke-width="18" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${shown * 1000} 2000"/>
      </g>
      ${startPt ? `<circle cx="${startPt.x}" cy="${startPt.y}" r="20" fill="#fff"/><circle cx="${startPt.x}" cy="${startPt.y}" r="11" fill="#1e2342"/>` : ""}
      ${endPt && r < 1 ? `<circle cx="${endPt.x}" cy="${endPt.y}" r="46" fill="#f4555a" opacity=".25"/><circle cx="${endPt.x}" cy="${endPt.y}" r="26" fill="#fff"/><circle cx="${endPt.x}" cy="${endPt.y}" r="16" fill="#f4555a"/>` : ""}
      <rect width="1000" height="1000" fill="url(#${id}v)"/>
    </g></svg>`;
}

function rotPt(p, deg) {
  const a = (deg * Math.PI) / 180, cx = 500, cy = 500;
  const x = p.x - cx, y = p.y - cy;
  return { x: cx + x * Math.cos(a) - y * Math.sin(a), y: cy + x * Math.sin(a) + y * Math.cos(a) };
}
