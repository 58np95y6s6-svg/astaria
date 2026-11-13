// Lieux célèbres pour comparer une distance, avec une vue aérienne stylisée (SVG) et le trajet dessiné dessus.
// Longueurs usuelles (arrondies).

export const PLACES = [
  // --- Lieux (trajet dessiné sur une vue aérienne) ---
  { id: "khufu", name: "le tour de la pyramide de Khéops", short: "Pyramide de Khéops", where: "Gizeh", flag: "🇪🇬", km: 0.92, scene: "pyramid", quip: "Les pharaons auraient validé." },
  { id: "champs", name: "les Champs-Élysées", short: "Champs-Élysées", where: "Paris", flag: "🇫🇷", km: 1.91, scene: "avenue", quip: "Sans le moindre arrêt shopping." },
  { id: "brooklyn", name: "le pont de Brooklyn", short: "Pont de Brooklyn", where: "New York", flag: "🇺🇸", km: 1.83, scene: "bridge", color: "#9a8466" },
  { id: "hollywood", name: "le Walk of Fame d'Hollywood", short: "Walk of Fame", where: "Los Angeles", flag: "🇺🇸", km: 2.1, scene: "avenue", noArc: true, palette: ["#e7c9c0", "#d9b4a8", "#f0dccf", "#cfa597"], quip: "Une étoile à chaque pas." },
  { id: "normandie", name: "le pont de Normandie", short: "Pont de Normandie", where: "Le Havre", flag: "🇫🇷", km: 2.14, scene: "bridge", color: "#eef1f4" },
  { id: "millau", name: "le viaduc de Millau", short: "Viaduc de Millau", where: "Aveyron", flag: "🇫🇷", km: 2.46, scene: "bridge", color: "#f2f2f2", valley: true, quip: "Au-dessus des nuages, ou presque." },
  { id: "goldengate", name: "le Golden Gate Bridge", short: "Golden Gate", where: "San Francisco", flag: "🇺🇸", km: 2.74, scene: "bridge", color: "#d2412f" },
  { id: "croisette", name: "la Croisette", short: "La Croisette", where: "Cannes", flag: "🇫🇷", km: 2.8, scene: "coast", quip: "Tapis rouge non fourni." },
  { id: "re", name: "le pont de l'île de Ré", short: "Pont de l'île de Ré", where: "La Rochelle", flag: "🇫🇷", km: 2.93, scene: "bridge", color: "#d9d4ca" },
  { id: "monaco", name: "le circuit de Monaco", short: "Circuit de Monaco", where: "Monte-Carlo", flag: "🇲🇨", km: 3.34, scene: "circuit", sea: true, quip: "Un peu moins vite qu'une F1." },
  { id: "centralpark", name: "Central Park", short: "Central Park", where: "New York", flag: "🇺🇸", km: 4.0, scene: "park" },
  { id: "copacabana", name: "la plage de Copacabana", short: "Copacabana", where: "Rio de Janeiro", flag: "🇧🇷", km: 4.0, scene: "coast", sand: "#f3e3b8", quip: "Version tapis, sans le sable." },
  { id: "silverstone", name: "le circuit de Silverstone", short: "Silverstone", where: "Angleterre", flag: "🇬🇧", km: 5.89, scene: "circuit", alt: 1 },
  { id: "vegas", name: "le Strip de Las Vegas", short: "Las Vegas Strip", where: "Nevada", flag: "🇺🇸", km: 6.8, scene: "avenue", noArc: true, palette: ["#f2b8d0", "#b8d8f2", "#f7e08a", "#c9b8f2"], quip: "Ce qui se passe sur le tapis reste sur le tapis." },
  { id: "promenade", name: "la promenade des Anglais", short: "Promenade des Anglais", where: "Nice", flag: "🇫🇷", km: 7, scene: "coast" },
  { id: "spa", name: "le circuit de Spa-Francorchamps", short: "Spa-Francorchamps", where: "Belgique", flag: "🇧🇪", km: 7.0, scene: "circuit", alt: 2 },
  { id: "vascodegama", name: "le pont Vasco de Gama", short: "Pont Vasco de Gama", where: "Lisbonne", flag: "🇵🇹", km: 12.3, scene: "bridge", color: "#e9e4dc" },
  { id: "seine", name: "la Seine dans Paris", short: "La Seine à Paris", where: "Paris", flag: "🇫🇷", km: 13, scene: "paris", river: true, quip: "Sans bateau-mouche." },
  { id: "lemans", name: "le circuit des 24 Heures du Mans", short: "Circuit du Mans", where: "Le Mans", flag: "🇫🇷", km: 13.63, scene: "circuit" },
  { id: "gibraltar", name: "le détroit de Gibraltar", short: "Détroit de Gibraltar", where: "Espagne → Maroc", flag: "🌊", km: 14, scene: "sea", quip: "L'Europe → l'Afrique, à pied." },
  { id: "mbsummit", name: "le Mont-Blanc… à la verticale", short: "Mont-Blanc (altitude)", where: "Alpes", flag: "🏔️", km: 4.81, scene: "peak", quip: "Sans crampons ni piolet." },
  { id: "everest", name: "l'Everest… à la verticale", short: "Everest (altitude)", where: "Himalaya", flag: "🇳🇵", km: 8.85, scene: "peak", high: true, quip: "Oxygène en option." },
  { id: "nordschleife", name: "la Nordschleife du Nürburgring", short: "Nordschleife", where: "Allemagne", flag: "🇩🇪", km: 20.8, scene: "circuit", alt: 3, quip: "« L'enfer vert », version tapis." },
  { id: "manhattan", name: "l'île de Manhattan", short: "Manhattan", where: "New York", flag: "🇺🇸", km: 21.6, scene: "city" },
  { id: "manche", name: "la traversée de la Manche", short: "Traversée de la Manche", where: "Calais → Douvres", flag: "🌊", km: 33, scene: "sea" },
  { id: "periph", name: "le périphérique parisien", short: "Périphérique", where: "Paris", flag: "🇫🇷", km: 35, scene: "circuit", city: true, quip: "Et sans bouchon !" },
  { id: "marathon", name: "le marathon de Paris", short: "Marathon de Paris", where: "Paris", flag: "🏅", km: 42.195, scene: "paris" },
  { id: "tmb", name: "le Tour du Mont-Blanc", short: "Tour du Mont-Blanc", where: "Alpes", flag: "🏔️", km: 170, scene: "trail" },
  { id: "canyon", name: "le Grand Canyon", short: "Grand Canyon", where: "Arizona", flag: "🇺🇸", km: 446, scene: "canyon" },
  { id: "parismarseille", name: "Paris → Marseille", short: "Paris → Marseille", where: "Autoroute du Soleil", flag: "🇫🇷", km: 775, scene: "road", green: true, quip: "Sans péage." },
  { id: "dunkerque", name: "Dunkerque → Perpignan", short: "Dunkerque → Perpignan", where: "France", flag: "🇫🇷", km: 1000, scene: "road", green: true },
  { id: "compostelle", name: "le chemin de Compostelle (depuis Le Puy)", short: "Chemin de Compostelle", where: "Le Puy → Santiago", flag: "🐚", km: 1500, scene: "road", green: true, quip: "Ultreïa !" },
  { id: "tdf", name: "le Tour de France", short: "Tour de France", where: "France", flag: "🚴", km: 3400, scene: "road", green: true, quip: "Maillot jaune de la marche." },
  { id: "route66", name: "la Route 66", short: "Route 66", where: "Chicago → Santa Monica", flag: "🇺🇸", km: 3940, scene: "road" },
  { id: "amazone", name: "l'Amazone", short: "L'Amazone", where: "Pérou → Brésil", flag: "🇧🇷", km: 6400, scene: "canyon", jungle: true },
  { id: "nil", name: "le Nil", short: "Le Nil", where: "Afrique", flag: "🇪🇬", km: 6650, scene: "canyon", desert: true },
  { id: "transsib", name: "le Transsibérien", short: "Transsibérien", where: "Moscou → Vladivostok", flag: "🇷🇺", km: 9289, scene: "road", rail: true, quip: "Sept jours de train, à pied." },
  { id: "wall", name: "la Grande Muraille de Chine", short: "Muraille de Chine", where: "Chine", flag: "🇨🇳", km: 21196, scene: "wall" },
  { id: "earth", name: "le tour de la Terre", short: "Tour de la Terre", where: "Équateur", flag: "🌍", km: 40075, scene: "globe" },
  { id: "moon", name: "la distance Terre → Lune", short: "Terre → Lune", where: "Espace", flag: "🌙", km: 384400, scene: "space", quip: "Houston, on a un marcheur." },

  // --- Objets mis bout à bout (le chiffre est le nombre d'objets) ---
  { id: "spaghetti", count: true, plural: "spaghettis mis bout à bout", short: "Spaghettis", flag: "🍝", km: 0.00025, glyph: "spaghetti", bg: "#b8432e", quip: "Al dente, évidemment." },
  { id: "smartphone", count: true, plural: "smartphones posés bout à bout", short: "Smartphones", flag: "📱", km: 0.000147, glyph: "phone", bg: "#e9ecf3", quip: "Et pas un seul regardé." },
  { id: "croissant", count: true, plural: "croissants alignés", short: "Croissants", flag: "🥐", km: 0.00015, glyph: "croissant", bg: "#f4e7d0", quip: "Brûlés, pas mangés. Promis." },
  { id: "baguette", count: true, plural: "baguettes mises bout à bout", short: "Baguettes", flag: "🥖", km: 0.00065, glyph: "baguette", bg: "#f4e7d0", quip: "De quoi nourrir tout le quartier." },
  { id: "bed", count: true, plural: "lits king size alignés", short: "Lits king size", flag: "🛏️", km: 0.002, glyph: "bed", bg: "#e8e1f2", quip: "Et tu n'as fait la sieste dans aucun." },
  { id: "bus", count: true, plural: "bus londoniens à la file", short: "Bus londoniens", flag: "🚌", km: 0.0112, glyph: "bus", bg: "#cfd3d8", quip: "Tous ratés, à pied c'était plus rapide." },
  { id: "bowling", count: true, plural: "pistes de bowling", short: "Pistes de bowling", flag: "🎳", km: 0.0183, glyph: "bowling", bg: "#2d2a4a", quip: "Strike !" },
  { id: "tennis", count: true, plural: "courts de tennis", short: "Courts de tennis", flag: "🎾", km: 0.02377, glyph: "tennis", bg: "#6aa35a", quip: "Jeu, set et match." },
  { id: "whale", count: true, plural: "baleines bleues à la queue leu leu", short: "Baleines bleues", flag: "🐋", km: 0.025, glyph: "whale", bg: "#1e6a9a", quip: "Sans se mouiller." },
  { id: "basket", count: true, plural: "terrains de basket", short: "Terrains de basket", flag: "🏀", km: 0.028, glyph: "basket", bg: "#3b3f5e", quip: "Swish." },
  { id: "pool", count: true, plural: "longueurs de piscine olympique", short: "Piscine olympique", flag: "🏊", km: 0.05, glyph: "pool", bg: "#d9e7ef", quip: "Mais au sec." },
  { id: "a380", count: true, plural: "Airbus A380 nez à queue", short: "Airbus A380", flag: "✈️", km: 0.0727, glyph: "plane", bg: "#7a8796", quip: "Embarquement immédiat." },
  { id: "statue", count: true, plural: "statues de la Liberté empilées", short: "Statue de la Liberté", flag: "🗽", km: 0.093, glyph: "statue", bg: "#bfe0d8", quip: "Flambeau compris." },
  { id: "sprint", count: true, plural: "sprints de 100 m façon Usain Bolt", short: "100 m d'Usain Bolt", flag: "⚡", km: 0.1, scene: "stadium", straight: true, quip: "Lui en 9''58. Toi, à ton rythme." },
  { id: "foot", count: true, plural: "terrains de foot", short: "Terrains de foot", flag: "⚽", km: 0.105, glyph: "foot", bg: "#4f8a3c", quip: "Et pas un seul carton." },
  { id: "tgv", count: true, plural: "rames de TGV", short: "Rames de TGV", flag: "🚄", km: 0.2, glyph: "tgv", bg: "#c9c3b8", quip: "Sans retard, toi." },
  { id: "titanic", count: true, plural: "Titanic bout à bout", short: "Titanic", flag: "🚢", km: 0.269, glyph: "ship", bg: "#25628e", quip: "Aucun iceberg en vue." },
  { id: "eiffel", count: true, plural: "tours Eiffel couchées", short: "Tour Eiffel couchée", flag: "🗼", km: 0.33, glyph: "eiffel", bg: "#cfd9e6", quip: "Elle mérite bien une sieste." },
  { id: "track", count: true, plural: "tours de piste d'athlétisme", short: "Tours de piste", flag: "🏟️", km: 0.4, scene: "stadium", quip: "Le coach serait fier." },
  { id: "burj", count: true, plural: "Burj Khalifa couchées", short: "Burj Khalifa couchée", flag: "🏙️", km: 0.828, glyph: "burj", bg: "#e2c9a0", quip: "828 m de gratte-ciel à l'horizontale." },
];

const isCount = (p) => !!p.count;

// Toutes les comparaisons « parlantes » pour une distance : lieux entre 0,25× et 8×, objets de 2 à 99 999.
export function placesFor(km) {
  if (!(km > 0)) return [];
  const all = PLACES.map((p) => ({ place: p, ratio: km / p.km }));
  const places = all.filter((x) => !isCount(x.place) && x.ratio >= 0.25 && x.ratio <= 8)
    .sort((a, b) => Math.abs(Math.log(a.ratio * 0.9)) - Math.abs(Math.log(b.ratio * 0.9)));
  const counts = all.filter((x) => isCount(x.place) && x.ratio >= 2 && x.ratio < 100000)
    .sort((a, b) => Math.abs(Math.log(a.ratio / 60)) - Math.abs(Math.log(b.ratio / 60)));
  const out = [];
  for (let i = 0; i < Math.max(places.length, counts.length); i++) { if (places[i]) out.push(places[i]); if (counts[i]) out.push(counts[i]); }
  if (!out.length) out.push(...all.filter((x) => !isCount(x.place)).sort((a, b) => Math.abs(Math.log(a.ratio)) - Math.abs(Math.log(b.ratio))).slice(0, 1));
  return out;
}

// Choix stable mais varié d'une séance à l'autre (selon son identifiant).
export function pickFor(km, seed = "") {
  const list = placesFor(km);
  if (!list.length) return null;
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % Math.min(list.length, 12)];
}

// Prochain défi pour un cumul : le premier lieu pas encore « bouclé ».
export function nextChallenge(totalKm) {
  const ps = PLACES.filter((x) => !isCount(x) && x.scene !== "peak").sort((a, b) => a.km - b.km);
  const p = ps.find((x) => x.km > totalKm) || ps[ps.length - 1];
  return { place: p, ratio: totalKm / p.km };
}
export const challengePlaces = () => PLACES.filter((x) => !isCount(x) && x.scene !== "peak").sort((a, b) => a.km - b.km);

export const ofName = (n) => n.replace(/^le /, "du ").replace(/^les /, "des ").replace(/^la /, "de la ").replace(/^l'/, "de l'").replace(/^(?!du |des |de )/, "de ");

export function ratioText(ratio, place) {
  if (isCount(place)) {
    const n = ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10;
    return { big: n.toLocaleString("fr-FR"), line: place.plural };
  }
  if (ratio >= 0.995) {
    const r = ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10;
    return { big: `${r.toLocaleString("fr-FR")}×`, line: place.name };
  }
  const pct = ratio * 100;
  const v = pct >= 10 ? Math.round(pct) : pct >= 1 ? Math.round(pct * 10) / 10 : Math.round(pct * 100) / 100;
  return { big: `${v.toLocaleString("fr-FR")} %`, line: ofName(place.name) };
}

// Longueur affichée (« 4 km », « 65 cm »).
export function lenLabel(km) {
  if (km >= 1) return `${km.toLocaleString("fr-FR")} km`;
  const m = km * 1000;
  return m >= 1 ? `${m.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} m` : `${(m * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} cm`;
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
      <g transform="rotate(-28 500 500)">${blocks(rnd, -300, -300, 1300, 1300, 90, 16, p.palette || ["#c3bcae", "#cfc8ba", "#bbb3a3", "#e3ddd1"])}</g>
      <path d="M90 780 L 910 250" stroke="#6f8f5a" stroke-width="70" stroke-linecap="round"/>
      <path d="M90 780 L 910 250" stroke="#8a8a8a" stroke-width="44"/>
      ${p.noArc ? "" : `<circle cx="910" cy="250" r="78" fill="#8a8a8a"/><circle cx="910" cy="250" r="34" fill="#eae3d3"/>`}
      ${p.noArc ? "" : [...Array(12)].map((_, i) => `<path d="M910 250 L ${910 + 200 * Math.cos(i * Math.PI / 6)} ${250 + 200 * Math.sin(i * Math.PI / 6)}" stroke="#9a9a9a" stroke-width="18"/>`).join("")}
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
    bg: p.city ? `<rect width="1000" height="1000" fill="#d4cdbf"/>${blocks(R(9), 0, 0, 1000, 1000, 64, 12, ["#c4bba9", "#ddd6c8", "#b8ae9b"])}<path d="M-20 420 C 200 520 400 560 600 500 S 900 440 1020 560" stroke="#3f86b4" stroke-width="40" fill="none"/>`
      : p.sea
      ? `<rect width="1000" height="1000" fill="#d4ccbd"/><path d="M0 720 C 220 680 360 760 560 700 S 860 640 1000 690 V 1000 H 0Z" fill="#2c7fb0"/>
         <path d="M0 720 C 220 680 360 760 560 700 S 860 640 1000 690" stroke="#e8dfc8" stroke-width="18" fill="none"/>
         <g opacity=".7">${[...Array(18)].map((_, i) => `<rect x="${(i * 173) % 900 + 30}" y="${(i * 97) % 500 + 60}" width="90" height="70" rx="10" fill="${["#c2b8a6", "#e6dfd0", "#b9ad97"][i % 3]}"/>`).join("")}</g>`
      : `<rect width="1000" height="1000" fill="#7d9a5b"/><rect x="60" y="80" width="300" height="220" rx="20" fill="#8eab69"/><rect x="620" y="640" width="320" height="260" rx="20" fill="#6c8a4c"/>
         <circle cx="760" cy="230" r="130" fill="#6c8a4c"/>`,
    d: p.city ? "M500 130 C 720 130 880 260 880 480 S 760 860 500 870 S 120 760 120 500 S 280 130 500 130Z"
      : p.alt === 1 ? "M200 800 C 120 700 160 560 260 520 L 420 440 C 470 410 460 330 400 300 L 300 250 C 240 210 300 120 380 140 L 760 230 C 850 250 880 340 830 420 L 700 640 C 660 710 720 760 790 760 C 860 760 880 840 800 870 L 300 880 C 250 880 220 830 200 800Z"
      : p.alt === 2 ? "M150 860 L 260 620 C 290 560 360 560 380 500 L 330 300 C 310 200 400 150 470 210 L 840 520 C 900 570 880 660 800 650 L 600 610 C 540 600 500 650 520 710 L 560 820 C 580 880 520 910 470 890 Z"
      : p.alt === 3 ? "M120 500 C 100 300 240 160 380 200 C 460 220 420 330 500 340 C 600 350 580 170 700 160 C 840 150 900 300 860 420 C 830 510 700 470 690 560 C 680 660 880 680 860 800 C 840 900 640 890 560 820 C 480 750 420 860 300 850 C 170 840 140 660 120 500Z"
      : p.sea ? "M180 600 C 120 470 220 360 340 380 S 520 240 600 260 S 820 200 860 330 S 760 520 820 600 S 600 660 480 620 S 300 680 180 600Z"
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
  coast: (p) => ({
    bg: `<rect width="1000" height="1000" fill="#d3cbbb"/><path d="M0 560 C 300 600 700 520 1000 590 V 1000 H 0Z" fill="#1e86b8"/>
      <path d="M0 560 C 300 600 700 520 1000 590" stroke="${p.sand || "#efe2c4"}" stroke-width="${p.sand ? 90 : 44}" fill="none"/>
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
    d: p.river ? "M-20 300 C 200 420 300 560 500 520 S 800 420 1020 640" : "M180 760 C 120 600 200 380 360 300 S 700 180 820 300 S 900 600 760 720 S 420 860 180 760Z",
    water: p.river,
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
  canyon: (p) => ({
    bg: `<rect width="1000" height="1000" fill="${p.jungle ? "#2f6b34" : p.desert ? "#dcc08e" : "#c9773f"}"/>
      <path d="M0 300 C 200 240 300 420 520 360 S 820 260 1000 340 V 700 C 800 640 640 760 460 700 S 160 640 0 720Z" fill="${p.jungle ? "#3e7f3e" : p.desert ? "#7fa058" : "#a85a2c"}"/>
      <path d="M0 380 C 220 320 300 500 520 440 S 820 340 1000 420 V 620 C 800 560 640 680 460 620 S 160 560 0 640Z" fill="${p.jungle ? "#24572a" : p.desert ? "#5f8a42" : "#8b4421"}"/>
      ${p.jungle ? [...Array(30)].map((_, i) => `<circle cx="${(i * 137) % 1000}" cy="${(i * 263) % 1000}" r="${30 + (i % 4) * 10}" fill="${["#2a6330", "#3a7a3a", "#1f5226"][i % 3]}"/>`).join("") : p.desert ? "" : `<path d="M0 260 C 200 200 340 380 540 320" stroke="#e09a5c" stroke-width="30" fill="none" opacity=".7"/>`}`,
    d: "M0 520 C 120 450 220 600 340 540 S 520 440 620 520 S 840 600 1000 500",
    water: true,
  }),
  road: (p) => ({
    bg: p.rail ? `<rect width="1000" height="1000" fill="#e9eef2"/>${[...Array(60)].map((_, i) => `<path d="M${(i * 173) % 1000} ${(i * 311) % 1000} l 18 -44 l 18 44Z" fill="${["#2f5a3c", "#3d6b48"][i % 2]}"/>`).join("")}`
      : p.green
      ? `<rect width="1000" height="1000" fill="#9aae6a"/>${[...Array(10)].map((_, i) => `<rect x="${(i * 211) % 900}" y="${(i * 137) % 900}" width="180" height="120" rx="14" fill="${["#b7c27d", "#86a05a", "#c9b778"][i % 3]}" transform="rotate(${i * 17} 500 500)"/>`).join("")}`
      : `<rect width="1000" height="1000" fill="#d9b989"/>${[...Array(9)].map((_, i) => `<ellipse cx="${(i * 233) % 1000}" cy="${(i * 151) % 1000}" rx="140" ry="60" fill="${["#cfa874", "#e4c79c"][i % 2]}"/>`).join("")}`,
    d: ["M60 900 C 260 820 300 640 460 600 S 700 480 760 320 S 900 120 960 80",
      "M80 120 C 300 160 380 380 300 520 S 420 860 940 900",
      "M40 700 C 200 560 340 760 520 600 S 700 280 860 340 S 960 160 980 100",
      "M100 960 C 120 700 360 720 420 500 S 700 300 640 140 S 880 60 960 40"][p.id.length % 4],
    road: !p.rail, rail: p.rail,
  }),
  wall: () => ({
    bg: `<rect width="1000" height="1000" fill="#5d7a45"/>
      <path d="M0 860 C 200 700 160 540 340 500 S 560 560 640 400 S 820 200 1000 140 V 0 H 0Z" fill="#6f8c52"/>
      <path d="M0 980 C 240 820 260 680 420 640 S 660 640 740 500 S 900 340 1000 300 V 1000 H 0Z" fill="#4c6838"/>
      <path d="M0 600 C 120 520 140 380 300 300 S 520 180 600 60" stroke="#80a062" stroke-width="40" fill="none" opacity=".7"/>`,
    d: "M60 860 C 200 720 170 580 330 520 S 540 590 620 430 S 780 250 940 170",
    wall: true,
  }),
  pyramid: () => ({
    bg: `<rect width="1000" height="1000" fill="#e2c48e"/>${[...Array(8)].map((_, i) => `<ellipse cx="${(i * 233) % 1000}" cy="${(i * 151) % 1000}" rx="160" ry="50" fill="#d6b47a"/>`).join("")}
      <path d="M260 260 L 740 260 L 500 500Z" fill="#d9b06a"/><path d="M740 260 L 740 740 L 500 500Z" fill="#b98f4f"/>
      <path d="M260 740 L 740 740 L 500 500Z" fill="#a37c41"/><path d="M260 260 L 260 740 L 500 500Z" fill="#cfa45d"/>
      <path d="M760 820 L 880 820 L 820 760Z" fill="#c69b57"/><path d="M110 150 L 200 150 L 155 105Z" fill="#c69b57"/>`,
    d: "M200 200 L 800 200 L 800 800 L 200 800 Z",
  }),
  peak: (p) => ({
    bg: `<rect width="1000" height="1000" fill="${p.high ? "#9fb7cf" : "#a9c6e0"}"/>
      <path d="M0 1000 L 0 760 L 180 600 L 300 700 L 500 140 L 700 640 L 820 560 L 1000 740 L 1000 1000Z" fill="#6f7782"/>
      <path d="M500 140 L 590 390 L 540 360 L 500 410 L 455 350 L 410 390Z" fill="#fff"/>
      <path d="M0 1000 L 0 880 C 300 820 700 900 1000 860 L 1000 1000Z" fill="#4e6b3a"/>`,
    d: "M300 930 L 620 840 L 380 740 L 600 640 L 430 540 L 560 440 L 470 340 L 500 150",
  }),
  space: () => ({
    bg: `<rect width="1000" height="1000" fill="#0c1030"/>${[...Array(70)].map((_, i) => `<circle cx="${(i * 197) % 1000}" cy="${(i * 331) % 1000}" r="${(i % 3) + 1.5}" fill="#fff" opacity=".7"/>`).join("")}
      <circle cx="190" cy="760" r="130" fill="#1f5f99"/><path d="M120 700 C 170 660 230 700 210 750 S 130 800 120 700Z" fill="#5f9a56"/>
      <circle cx="830" cy="210" r="70" fill="#d9d9d9"/><circle cx="805" cy="190" r="14" fill="#bdbdbd"/><circle cx="850" cy="240" r="10" fill="#bdbdbd"/>`,
    d: "M300 680 C 420 420 560 300 760 240",
  }),
  stadium: (p) => ({
    bg: `<rect width="1000" height="1000" fill="#3f7d3a"/>
      <rect x="120" y="270" width="760" height="460" rx="230" fill="#c8553d"/>
      ${[1, 2, 3, 4, 5].map((k) => `<rect x="${120 + k * 14}" y="${270 + k * 14}" width="${760 - k * 28}" height="${460 - k * 28}" rx="${230 - k * 14}" fill="none" stroke="#f3e2dc" stroke-width="2"/>`).join("")}
      <rect x="214" y="364" width="572" height="272" rx="136" fill="#4f9a45"/>`,
    d: p.straight ? "M300 714 L 700 714" : "M500 714 L 350 714 A 214 214 0 0 1 350 286 L 650 286 A 214 214 0 0 1 650 714 Z",
    track: false,
  }),
  tiles: (p) => {
    const g = GLYPHS[p.glyph];
    const rows = [80, 250, 420, 590, 760, 930];
    let out = `<rect width="1000" height="1000" fill="${p.bg}"/>`;
    rows.forEach((y, ri) => {
      const sc = Math.min(118 / g.h, 290 / g.w), w = g.w * sc, h = g.h * sc;
      for (let x = -(ri % 2) * w / 2 + 20; x < 1000; x += w + 18) out += `<g transform="translate(${x.toFixed(1)} ${(y - h / 2).toFixed(1)}) scale(${sc.toFixed(3)})">${g.svg}</g>`;
    });
    return { bg: out, d: "M60 165 H 940 C 990 165 990 335 940 335 H 60 C 10 335 10 505 60 505 H 940 C 990 505 990 675 940 675 H 60 C 10 675 10 845 60 845 H 940" };
  },
  globe: () => ({
    bg: `<rect width="1000" height="1000" fill="#121735"/>
      ${[...Array(40)].map((_, i) => `<circle cx="${(i * 197) % 1000}" cy="${(i * 331) % 1000}" r="${(i % 3) + 1.5}" fill="#fff" opacity=".6"/>`).join("")}
      <circle cx="500" cy="500" r="330" fill="#1f5f99"/>
      <path d="M330 300 C 400 260 470 330 440 400 S 380 520 330 470 S 280 340 330 300Z M560 360 C 640 330 720 400 690 480 S 600 620 560 560 S 520 400 560 360Z M420 620 C 470 600 520 660 490 720 S 400 740 420 620Z" fill="#5f9a56"/>`,
    d: "M170 500 A 330 110 0 1 0 830 500 A 330 110 0 1 0 170 500",
  }),
};

// Objets dessinés (vus de profil ou du dessus), dans leur propre repère w × h.
const GLYPHS = {
  baguette: { w: 200, h: 40, svg: `<rect y="5" width="200" height="30" rx="15" fill="#d39a4f"/><path d="M40 13 l22 14 M85 13 l22 14 M130 13 l22 14 M170 15 l16 10" stroke="#f3d39b" stroke-width="6" stroke-linecap="round"/>` },
  croissant: { w: 120, h: 70, svg: `<path d="M8 58 C 18 6 102 6 112 58 C 96 40 76 34 60 34 C 44 34 24 40 8 58Z" fill="#d9973f"/><path d="M40 20 L 48 44 M60 14 L 60 40 M80 20 L 72 44" stroke="#b97425" stroke-width="5" stroke-linecap="round"/>` },
  spaghetti: { w: 220, h: 20, svg: `<path d="M0 10 C 40 2 80 18 120 10 S 190 2 220 10" stroke="#f3d67a" stroke-width="7" fill="none" stroke-linecap="round"/>` },
  phone: { w: 52, h: 104, svg: `<rect width="52" height="104" rx="11" fill="#22252e"/><rect x="5" y="9" width="42" height="86" rx="6" fill="#6fb2f0"/><rect x="18" y="3" width="16" height="4" rx="2" fill="#000"/>` },
  bed: { w: 160, h: 200, svg: `<rect width="160" height="200" rx="12" fill="#8b5e3c"/><rect x="8" y="8" width="144" height="184" rx="8" fill="#fff"/><rect x="18" y="16" width="56" height="36" rx="10" fill="#dfe6f3"/><rect x="86" y="16" width="56" height="36" rx="10" fill="#dfe6f3"/><rect x="8" y="80" width="144" height="112" rx="8" fill="#8f7fc9"/>` },
  bus: { w: 220, h: 80, svg: `<rect width="220" height="70" rx="14" fill="#d5302c"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${14 + i * 40}" y="12" width="30" height="22" rx="4" fill="#cfe6f6"/>`).join("")}<circle cx="48" cy="72" r="10" fill="#222"/><circle cx="172" cy="72" r="10" fill="#222"/>` },
  bowling: { w: 260, h: 56, svg: `<rect width="260" height="56" rx="6" fill="#d8a866"/><rect y="0" width="260" height="8" fill="#555"/><rect y="48" width="260" height="8" fill="#555"/>${[0, 1, 2, 3].map((i) => `<circle cx="${226 + i * 8}" cy="${18 + (i % 2) * 18}" r="5" fill="#fff"/>`).join("")}<circle cx="40" cy="28" r="10" fill="#3a3fa0"/>` },
  tennis: { w: 240, h: 110, svg: `<rect width="240" height="110" rx="4" fill="#3d7fbd"/><rect x="10" y="10" width="220" height="90" fill="none" stroke="#fff" stroke-width="4"/><path d="M120 6 V 104 M60 25 V 85 M180 25 V 85 M60 55 H 180 M10 25 H 230 M10 85 H 230" stroke="#fff" stroke-width="3"/>` },
  basket: { w: 240, h: 130, svg: `<rect width="240" height="130" rx="4" fill="#d89a5a"/><rect x="8" y="8" width="224" height="114" fill="none" stroke="#fff" stroke-width="4"/><path d="M120 8 V 122" stroke="#fff" stroke-width="4"/><circle cx="120" cy="65" r="20" fill="none" stroke="#fff" stroke-width="4"/><path d="M8 25 C 70 25 70 105 8 105 M232 25 C 170 25 170 105 232 105" stroke="#fff" stroke-width="4" fill="none"/>` },
  whale: { w: 240, h: 90, svg: `<path d="M10 50 C 10 15 120 10 170 35 L 205 20 C 215 15 225 25 218 35 L 205 50 L 218 65 C 225 75 215 85 205 80 L 170 65 C 120 90 10 85 10 50Z" fill="#7aa7d6"/><circle cx="45" cy="45" r="5" fill="#123"/><path d="M30 64 C 70 76 120 74 150 62" stroke="#c8dcf0" stroke-width="5" fill="none"/>` },
  pool: { w: 250, h: 120, svg: `<rect width="250" height="120" rx="8" fill="#39a0d8"/>${[1, 2, 3, 4, 5].map((i) => `<path d="M10 ${i * 20} H 240" stroke="#fff" stroke-width="3" stroke-dasharray="10 6"/>`).join("")}` },
  plane: { w: 200, h: 200, svg: `<path d="M100 5 C 112 5 114 25 114 40 L 114 80 L 195 115 L 195 130 L 114 112 L 114 160 L 140 178 L 140 190 L 100 182 L 60 190 L 60 178 L 86 160 L 86 112 L 5 130 L 5 115 L 86 80 L 86 40 C 86 25 88 5 100 5Z" fill="#eef1f5"/>` },
  statue: { w: 70, h: 220, svg: `<rect x="10" y="170" width="50" height="50" fill="#8c9a8f"/><path d="M20 170 L 25 70 C 25 55 45 55 45 70 L 50 170Z" fill="#6fae9c"/><circle cx="35" cy="48" r="12" fill="#6fae9c"/><path d="M48 60 L 58 12" stroke="#6fae9c" stroke-width="7"/><path d="M52 12 C 52 -2 66 -2 64 12Z" fill="#f2b33d"/>` },
  foot: { w: 240, h: 155, svg: `<rect width="240" height="155" fill="#3f8a3a"/>${[0, 2, 4, 6].map((i) => `<rect x="${i * 30}" width="30" height="155" fill="#4c9a46"/>`).join("")}<rect x="8" y="8" width="224" height="139" fill="none" stroke="#fff" stroke-width="4"/><path d="M120 8 V 147" stroke="#fff" stroke-width="4"/><circle cx="120" cy="77" r="22" fill="none" stroke="#fff" stroke-width="4"/><rect x="8" y="45" width="36" height="64" fill="none" stroke="#fff" stroke-width="4"/><rect x="196" y="45" width="36" height="64" fill="none" stroke="#fff" stroke-width="4"/>` },
  tgv: { w: 300, h: 44, svg: `<path d="M0 6 H 250 C 285 6 300 28 300 40 H 0Z" fill="#eef0f4"/><rect y="24" width="292" height="7" fill="#7b2d8e"/>${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${12 + i * 38}" y="11" width="26" height="9" rx="2" fill="#2f3a4a"/>`).join("")}` },
  ship: { w: 280, h: 90, svg: `<path d="M0 50 H 280 L 262 88 H 18Z" fill="#1b1b1b"/><rect x="0" y="80" width="280" height="8" fill="#a32a22"/><rect x="30" y="34" width="220" height="16" fill="#f2f2f2"/>${[0, 1, 2, 3].map((i) => `<rect x="${70 + i * 44}" y="4" width="18" height="30" fill="#e3a14a"/><rect x="${70 + i * 44}" y="4" width="18" height="8" fill="#1b1b1b"/>`).join("")}` },
  eiffel: { w: 300, h: 120, svg: `<path d="M0 10 L 0 110 L 60 85 L 120 70 L 290 58 L 300 60 L 290 62 L 120 50 L 60 35Z" fill="#7a5a3c"/><path d="M0 40 C 20 50 20 70 0 80" fill="#cfd9e6"/><path d="M60 45 H 66 V 75 H 60Z M120 52 H 124 V 68 H 120Z" fill="#5a3f28"/>` },
  burj: { w: 300, h: 50, svg: `<path d="M0 0 L 80 6 L 160 14 L 230 20 L 300 25 L 230 30 L 160 36 L 80 44 L 0 50Z" fill="#c9d3dd"/><path d="M0 25 H 280" stroke="#9fb0c2" stroke-width="3"/>` },
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
  const sc = SCENES[place.glyph ? "tiles" : place.scene](place, rnd);
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
    : sc.rail ? `<path d="${d}" stroke="#6b4f3a" stroke-width="30" fill="none" stroke-dasharray="6 10"/><path d="${d}" stroke="#555" stroke-width="16" fill="none"/><path d="${d}" stroke="#e9eef2" stroke-width="8" fill="none"/>`
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
