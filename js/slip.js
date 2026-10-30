// Import d'un ticket (capture Betclic / Winamax) : lecture du texte (OCR sur le téléphone) puis
// transcription en lignes de pari. Le texte peut aussi être collé (iPhone : copier le texte d'une photo).

export const NBA_TEAMS = [
  ["Atlanta Hawks", "hawks"], ["Boston Celtics", "celtics"], ["Brooklyn Nets", "nets"], ["Charlotte Hornets", "hornets"],
  ["Chicago Bulls", "bulls"], ["Cleveland Cavaliers", "cavaliers", "cavs"], ["Dallas Mavericks", "mavericks", "mavs"], ["Denver Nuggets", "nuggets"],
  ["Detroit Pistons", "pistons"], ["Golden State Warriors", "warriors"], ["Houston Rockets", "rockets"], ["Indiana Pacers", "pacers"],
  ["LA Clippers", "clippers"], ["Los Angeles Lakers", "lakers"], ["Memphis Grizzlies", "grizzlies"], ["Miami Heat", "heat"],
  ["Milwaukee Bucks", "bucks"], ["Minnesota Timberwolves", "timberwolves", "wolves"], ["New Orleans Pelicans", "pelicans"], ["New York Knicks", "knicks"],
  ["Oklahoma City Thunder", "thunder"], ["Orlando Magic", "magic"], ["Philadelphia 76ers", "76ers", "sixers"], ["Phoenix Suns", "suns"],
  ["Portland Trail Blazers", "blazers"], ["Sacramento Kings", "kings"], ["San Antonio Spurs", "spurs"], ["Toronto Raptors", "raptors"],
  ["Utah Jazz", "jazz"], ["Washington Wizards", "wizards"],
];

const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’`]/g, "'");
const num = (s) => (s == null ? null : parseFloat(String(s).replace(",", ".")));
const ODDS_RE = /(?:^|[^\d,.])(\d{1,2}[,.]\d{2})(?![\d,.])/g;
const TIME_RE = /\d\s*:\s*\d|:\s*[o0]{2}|cette nuit|ce soir|demain|aujourd/;

// Équipes citées dans une ligne (par surnom : « celtics », « blazers »…), dans l'ordre d'apparition.
function teamsIn(line) {
  const n = ` ${norm(line).replace(/[^a-z0-9]+/g, " ")} `;
  const hits = [];
  for (const [full, ...nicks] of NBA_TEAMS) {
    for (const k of nicks) {
      const i = n.indexOf(` ${k} `);
      if (i >= 0) { hits.push({ full, nick: nicks[0], i }); break; }
    }
  }
  return hits.sort((a, b) => a.i - b.i);
}

// Repère un joueur connu (index des joueurs de la saison) dans un texte.
function playerIn(text, players) {
  if (!players) return null;
  const n = ` ${norm(text).replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ")} `;
  let best = null;
  for (const [id, p] of Object.entries(players)) {
    const pn = norm(p.name).replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
    if (pn.length > 4 && n.includes(` ${pn} `) && (!best || pn.length > best.len)) best = { id, name: p.name, teamId: p.teamId, len: pn.length };
  }
  return best;
}

function statOf(t) {
  if (/points?\s*\+\s*rebonds?\s*\+\s*passes?|pts\s*\+\s*reb\s*\+\s*p/.test(t)) return "pra";
  if (/points?\s*\+\s*rebonds?/.test(t)) return "pr";
  if (/points?\s*\+\s*passes?/.test(t)) return "pa";
  if (/rebonds?\s*\+\s*passes?/.test(t)) return "ra";
  if (/3 ?points|trois points|paniers? a 3|3pts/.test(t)) return "fg3m";
  if (/rebond/.test(t)) return "reb";
  if (/passe/.test(t)) return "ast";
  if (/interception/.test(t)) return "stl";
  if (/contre/.test(t)) return "blk";
  if (/point/.test(t)) return "pts";
  return null;
}

// Format « Nom + de X » (Betclic) : une sélection joueur par ligne, la stat sur la ligne suivante.
// Gère aussi les MYCOMBI (plusieurs sélections du même match, une seule cote pour le groupe).
const SEL_RE = /^(.*?)\s*(\+|-|−|plus|moins)\s*de\s*(\d{1,2}(?:[,.]\d)?)(?!\d)(.*)$/;
function parsePlayerList(lines, players) {
  if (!players) return [];
  const legs = [];
  let group = null, gn = 0;
  const oddsIn = (t) => { const m = [...String(t).matchAll(ODDS_RE)].map((x) => num(x[1])).filter((x) => x > 1 && x < 60); return m.length ? m[m.length - 1] : null; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], n = norm(l);
    if (/€|cote\s*totale|gains?\s*possibles?|gains?\s*potentiels?/.test(n)) continue;
    if (/my ?combi|bet ?builder|meme match|same game/.test(n)) {
      group = { id: `g${++gn}`, odds: oddsIn(l) ?? (i + 1 < lines.length ? oddsIn(lines[i + 1]) : null) };
      continue;
    }
    const m = SEL_RE.exec(n);
    const who = m ? playerIn(m[1], players) : null;
    if (who) {
      legs.push({ kind: "player", player: who.name, playerId: who.id, playerTeamId: who.teamId,
        side: /^(-|−|moins)/.test(m[2]) ? "under" : "over", line: num(m[3]), odds: group ? null : oddsIn(m[4]),
        group: group?.id || null, groupOdds: group?.odds || null, market: statOf(m[4]), text: l, missing: [] });
      continue;
    }
    const last = legs[legs.length - 1];
    if (!last) continue;
    if (TIME_RE.test(n) || teamsIn(l).length >= 2) { group = null; continue; } // rappel du match : fin du groupe
    if (!last.market && /nombre de|total du joueur|du joueur|points?|rebonds?|passes?/.test(n)) { last.market = statOf(n); continue; }
    if (last.odds == null && !last.group) { const o = oddsIn(l); if (o) last.odds = o; }
  }
  for (const l of legs) {
    if (!l.market) l.missing.push("stat");
    if (l.odds == null && !l.groupOdds) l.missing.push("cote");
  }
  return legs;
}

// Cote d'un ensemble de sélections : une MYCOMBI compte une seule fois sa cote de groupe.
export function legsOdds(legs) {
  const seen = new Set();
  let p = 1;
  for (const l of legs) {
    if (l.group) { if (!seen.has(l.group)) { seen.add(l.group); p *= l.groupOdds || 1; } }
    else p *= l.odds || 1;
  }
  return Math.round(p * 100) / 100;
}

/**
 * text : texte du ticket. ctx : { players } (index des joueurs, pour reconnaître les paris joueurs).
 * Retourne { book, legs: [{ kind, team, teamNick, player, playerId, market, side, x, line, odds, text, missing }], totalOdds, stake }.
 */
export function parseSlip(text, ctx = {}) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const all = norm(text);
  const pl = parsePlayerList(lines, ctx.players);
  const book = /betclic|bet clic|befclic/.test(all) ? "betclic_fr" : /winamax|enregistres|completer|sport\s+poker/.test(all) ? "winamax_fr" : null;
  const totalM = /cote\s*totale[^a-z0-9]{0,6}(\d{1,3}[,.]\d{1,2})/.exec(all);
  const stakeM = /mise\D{0,8}(\d{1,4}(?:[,.]\d{1,2})?)\s*€/.exec(all);
  if (pl.length) {
    const product = legsOdds(pl);
    return { book, legs: pl, totalOdds: totalM ? num(totalM[1]) : product, product, stake: stakeM ? num(stakeM[1]) : null };
  }
  // Lignes « rappel du match » (deux équipes, ou un horaire) : on les ignore.
  const isMatchLine = (l) => teamsIn(l).length >= 2 || TIME_RE.test(norm(l));
  const legs = [];
  let buf = [];
  const flush = (odds, oddsLineRest) => {
    const seg = [...buf, oddsLineRest].filter(Boolean);
    buf = [];
    if (!seg.length) return;
    legs.push({ seg, odds });
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const n = norm(l);
    if (/cote\s*totale|mise|gains? potentiel/.test(n)) continue;
    // Un montant en euros (solde, mise, gains) n'est pas une cote.
    const oddsHits = /€|eur\b/.test(n) ? [] : [...l.matchAll(ODDS_RE)].map((m) => num(m[1])).filter((x) => x > 1 && x < 60);
    if (isMatchLine(l)) { if (legs.length && !legs[legs.length - 1].match) legs[legs.length - 1].match = l; continue; }
    if (oddsHits.length) {
      flush(oddsHits[oddsHits.length - 1], l.replace(ODDS_RE, " ").trim());
      // La suite du libellé peut être sous la cote (« d'avance ou gagne ») : on l'accroche à ce pari.
      while (i + 1 < lines.length && !isMatchLine(lines[i + 1]) && ![...lines[i + 1].matchAll(ODDS_RE)].length && !teamsIn(lines[i + 1]).length && !/ecart de points|^[^a-z]*$/.test(norm(lines[i + 1])) && /[a-z]{3}/.test(norm(lines[i + 1]))) {
        legs[legs.length - 1].seg.push(lines[++i]);
      }
      continue;
    }
    buf.push(l);
  }
  const out = legs.map(({ seg, odds, match }) => {
    const t = norm(seg.join(" "));
    const teams = teamsIn(seg.join(" "));
    const team = teams[0] || (match ? teamsIn(match)[0] : null);
    const player = playerIn(seg.join(" "), ctx.players);
    const nums = [...t.matchAll(/(\d+(?:[,.]5)?)/g)].map((m) => num(m[1]));
    const leg = { odds, text: seg.join(" "), team: team?.full || null, teamNick: team?.nick || null, missing: [] };
    if (player && (!team || /plus de|moins de|\+ de|- de/.test(t))) {
      leg.kind = "player";
      leg.player = player.name; leg.playerId = player.id; leg.playerTeamId = player.teamId;
      leg.market = statOf(t);
      leg.side = /moins de|- de/.test(t) ? "under" : "over";
      const m = /(?:plus|moins|\+|-) de (\d+(?:[,.]5)?)/.exec(t);
      leg.line = m ? num(m[1]) : null;
      if (!leg.market) leg.missing.push("stat");
      if (leg.line == null) leg.missing.push("ligne");
      return leg;
    }
    leg.kind = "team";
    if (/avance/.test(t)) {
      leg.type = "lead";
      const m = /(\d+)\s*points?\s*d'?\s*avance|avance de (\d+)/.exec(t);
      leg.x = m ? num(m[1] || m[2]) : null;
    } else if (/ne perd pas|perd de/.test(t)) {
      leg.type = "spreadPlus";
      const m = /perd de (\d+)/.exec(t);
      leg.x = m ? num(m[1]) : null;
    } else if (/gagne (?:de|par) .{0,6}(?:ou ?\+|ou plus)|gagne de (\d+)/.test(t)) {
      leg.type = "spreadMinus";
      const m = /gagne (?:de|par) (\d+)/.exec(t) || /(\d{1,3})\s*o?u\s*\+|(\d{1,3})\s*ou plus/.exec(t);
      leg.x = m ? num(m[1] || m[2]) : null;
    } else if (/total|nombre de points/.test(t) && /plus de|moins de/.test(t)) {
      leg.type = "total";
      leg.side = /moins de/.test(t) ? "under" : "over";
      const m = /(?:plus|moins) de (\d+(?:[,.]5)?)/.exec(t);
      leg.x = m ? num(m[1]) : null;
    } else {
      leg.type = "ml";
    }
    // OCR : le « o » de « ou » lu comme un 0 (« 110ou+ » pour « 11 ou + ») ; un écart NBA ne dépasse pas 40.
    if (leg.x > 40 && leg.type !== "total" && leg.x % 10 === 0) leg.x = leg.x / 10;
    if (!leg.team && leg.type !== "total") leg.missing.push("équipe");
    if (leg.type !== "ml" && leg.x == null) leg.missing.push("X");
    if (nums.length === 0 && leg.type !== "ml" && leg.x == null) leg.x = null;
    return leg;
  });
  const product = out.length ? Math.round(out.reduce((p, l) => p * (l.odds || 1), 1) * 100) / 100 : null;
  return { book, legs: out, totalOdds: totalM ? num(totalM[1]) : product, product, stake: stakeM ? num(stakeM[1]) : null };
}

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

// Prétraitement : niveaux de gris, inversion si fond sombre, agrandissement ×2, seuillage.
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
    if (dark) v = 255 - v;
    v = v > 150 ? 255 : 0;
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
