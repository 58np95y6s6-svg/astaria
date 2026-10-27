import { MARKETS, project, probLine, averages, shotProfile, valueOf } from "./model.js";
import { evaluate, tag, BOOK_LABEL, FR_BOOKS, normName } from "./value.js";
import { getDay, getGameData, teamRoster, teamContext, buildContext, getMeta, REPO_URL } from "./data.js";
import { getGameOdds, quota as oddsQuota } from "./odds.js";
import { addBet as journalAdd, deleteBet, settleAll, exportBets, importBets } from "./journal.js";

// ---------- utilitaires ----------
const $app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const f1 = (x) => (x == null || !Number.isFinite(x) ? "–" : (Math.round(x * 10) / 10).toFixed(1));
const f2 = (x) => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(2));
const pct = (x, d = 0) => (x == null || !Number.isFinite(x) ? "–" : `${(x * 100).toFixed(d)} %`);
const sgnPct = (x) => (x == null ? "–" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(0)} %`);
const GROUP_LABEL = { G: "arrières", F: "ailiers", C: "pivots" };

const settings = (() => {
  const def = { bankroll: 100, wModel: 0.6, oddsKey: "", frOnly: false };
  try { return { ...def, ...JSON.parse(localStorage.getItem("astaria-settings") || "{}") }; } catch { return def; }
})();
function saveSettings() { try { localStorage.setItem("astaria-settings", JSON.stringify(settings)); } catch {} }

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

const loader = (txt = "Chargement…") => `<div class="loader">${esc(txt)}</div>`;
const errorBox = (e) => `<div class="card empty">⚠️ ${esc(e.message || e)}</div>`;

function etKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d).replaceAll("-", "");
}
function keyToDate(k) { return new Date(Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8), 12)); }
function shiftKey(k, n) { const d = keyToDate(k); d.setUTCDate(d.getUTCDate() + n); return etKey(d); }
const parisTime = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const parisDay = (iso) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Paris" });
const statusBadge = (s) => {
  if (!s) return "";
  if (/^out|suspen/i.test(s)) return `<span class="badge out">${/suspen/i.test(s) ? "SUSP." : "OUT"}</span>`;
  return `<span class="badge dtd">${esc(/doubt/i.test(s) ? "DOUTEUX" : /quest/i.test(s) ? "INCERTAIN" : /day/i.test(s) ? "J-À-J" : s.toUpperCase())}</span>`;
};
const img = (src, cls = "") => (src ? `<img src="${esc(src)}" alt="" loading="lazy" class="${cls}" onerror="this.style.visibility='hidden'">` : `<div class="ph ${cls}"></div>`);

// ---------- routeur ----------
const routes = [
  [/^#?\/?$/, viewHome],
  [/^#\/day\/(\d{8})$/, viewHome],
  [/^#\/game\/(\d+)(?:\/(\d+))?$/, viewGame],
  [/^#\/player\/(\d+)\/(\d+)\/(\d+)$/, viewPlayer],
  [/^#\/value$/, viewValue],
  [/^#\/journal$/, viewJournal],
  [/^#\/settings$/, viewSettings],
];
let routeToken = 0;
function router() {
  const h = location.hash || "#/";
  const token = ++routeToken;
  const nav = h.startsWith("#/value") ? "value" : h.startsWith("#/journal") ? "journal" : h.startsWith("#/settings") ? "settings" : "home";
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("on", a.dataset.nav === nav));
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) { window.scrollTo(0, 0); fn(token, ...m.slice(1)); return; }
  }
  $app.innerHTML = `<div class="empty">Page introuvable. <a href="#/">Retour</a></div>`;
}
const stale = (token) => token !== routeToken;
window.addEventListener("hashchange", router);

// ---------- Accueil : matchs jour après jour ----------
async function viewHome(token, day) {
  const today = etKey();
  const sel = day || sessionStorage.getItem("astaria-day") || today;
  try { sessionStorage.setItem("astaria-day", sel); } catch {}
  const days = Array.from({ length: 8 }, (_, i) => shiftKey(today, i - 1));
  const strip = days.map((k) => {
    const d = keyToDate(k);
    const wd = d.toLocaleDateString("fr-FR", { weekday: "short", timeZone: "UTC" });
    const label = k === today ? "Auj." : k === shiftKey(today, 1) ? "Demain" : k === shiftKey(today, -1) ? "Hier" : wd;
    return `<a class="day ${k === sel ? "on" : ""}" href="#/day/${k}"><small>${label}</small><b>${d.getUTCDate()}</b><small>${d.toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" })}</small></a>`;
  }).join("");
  $app.innerHTML = `<h1>Matchs NBA</h1><div class="days">${strip}</div><p class="muted small">Date US (heure de New York). Horaires affichés à l'heure de Paris.</p><div id="games">${loader()}</div>`;
  setTimeout(() => document.querySelector(".day.on")?.scrollIntoView({ inline: "center", block: "nearest" }), 0);
  try {
    const day = await getDay(sel);
    if (stale(token)) return;
    const el = document.getElementById("games");
    if (!day) { el.innerHTML = `<div class="card empty">Données pas encore disponibles pour ce jour. Elles sont mises à jour automatiquement toutes les 30 min.</div>`; return; }
    const games = day.games || [];
    if (!games.length) { el.innerHTML = `<div class="card empty">Aucun match ce jour-là.</div>`; return; }
    el.innerHTML = games.map(gameCard).join("");
  } catch (e) { if (!stale(token)) document.getElementById("games").innerHTML = errorBox(e); }
}

function gameCard(g) {
  const pre = g.state === "pre";
  const mid = pre
    ? `<div class="time">${parisTime(g.date)}</div><div class="muted small">${parisDay(g.date)}</div>`
    : `<div class="score num">${g.away.score ?? ""} – ${g.home.score ?? ""}</div><div class="muted small">${esc(g.statusText)}</div>`;
  const line = [g.details && `Écart ${esc(g.details)}`, g.total && `Total ${g.total}`].filter(Boolean).join(" · ");
  return `<a class="card game" href="#/game/${g.id}">
    <div class="team">${img(g.away.logo)}<div class="grow"><div class="nm">${esc(g.away.abbr)}</div><div class="muted small">${esc(g.away.record)}</div></div></div>
    <div class="mid">${mid}${line ? `<div class="muted small">${line}</div>` : ""}</div>
    <div class="team right">${img(g.home.logo)}<div class="grow"><div class="nm">${esc(g.home.abbr)}</div><div class="muted small">${esc(g.home.record)}</div></div></div>
  </a>`;
}

// ---------- Match : compositions des deux équipes ----------
const gameCache = new Map();
async function getGame(id) {
  const c = gameCache.get(id);
  if (c && Date.now() - c.at < 120e3) return c.data;
  const gd = await getGameData(id);
  const g = gd.game;
  const [hr, ar] = await Promise.all([teamRoster(gd, g.home), teamRoster(gd, g.away)]);
  const tc = (t) => teamContext(gd.core, g, t.id);
  const data = {
    gd, game: g, injuries: gd.injuries,
    teams: { [g.home.id]: { ...g.home, ...tc(g.home), roster: hr }, [g.away.id]: { ...g.away, ...tc(g.away), roster: ar } },
    data: { gamesTotal: Object.keys(gd.core.processed || {}).length, updatedAt: gd.updatedAt, leaguePace: tc(g.home).leaguePace },
  };
  gameCache.set(id, { at: Date.now(), data });
  return data;
}

async function viewGame(token, id, teamSel) {
  $app.innerHTML = loader("Chargement du match…");
  let data;
  try { data = await getGame(id); } catch (e) { if (!stale(token)) $app.innerHTML = errorBox(e); return; }
  if (stale(token)) return;
  const g = data.game;
  const tid = teamSel && data.teams[teamSel] ? teamSel : g.away.id;
  const t = data.teams[tid];
  const opp = data.teams[tid === g.home.id ? g.away.id : g.home.id];
  const inj = data.injuries[tid] || [];
  const rosterHtml = t.roster.length ? t.roster.map((p) => {
    const out = /^out|suspen/i.test(p.status || "");
    return `<a class="player ${out ? "out" : ""}" href="#/player/${p.id}/${g.id}/${tid}">
      ${img(p.headshot)}
      <div class="grow"><div class="ell"><b>${esc(p.name)}</b>${statusBadge(p.status)}${p.starts5 >= 3 ? `<span class="badge start">TITU.</span>` : ""}</div>
      <div class="meta">${esc(p.pos)}${p.jersey ? ` · #${esc(p.jersey)}` : ""} · ${p.gp} m.j. · ${f1(p.mpg)} min</div></div>
      <div class="st num"><b>${f1(p.ppg)}</b> pts<br><span class="muted">${f1(p.rpg)} reb · ${f1(p.apg)} pd</span></div>
    </a>`;
  }).join("") : `<div class="empty">Effectif indisponible.</div>`;
  const chips = [
    t.b2b && `<span class="chip warn">Back-to-back</span>`,
    opp.b2b && `<span class="chip good">Adversaire en back-to-back</span>`,
    `<span class="chip">Rythme ${f1(t.pace)} poss. (ligue ${f1(data.data.leaguePace)})</span>`,
    g.details && `<span class="chip">Écart ${esc(g.details)}</span>`,
    g.total && `<span class="chip">Total ${g.total}</span>`,
  ].filter(Boolean).join("");
  $app.innerHTML = `
    <a href="#/day/${g.dateKey}" class="muted small">‹ Matchs du jour</a>
    <div class="card game" style="cursor:default">
      <div class="team">${img(g.away.logo)}<div class="nm ell">${esc(g.away.short)}</div></div>
      <div class="mid"><div class="time">${g.state === "pre" ? parisTime(g.date) : `${g.away.score ?? ""} – ${g.home.score ?? ""}`}</div><div class="muted small">${parisDay(g.date)}</div></div>
      <div class="team right">${img(g.home.logo)}<div class="nm ell">${esc(g.home.short)}</div></div>
    </div>
    <div class="seg">
      ${[g.away, g.home].map((x) => `<button class="${x.id === tid ? "on" : ""}" data-team="${x.id}">${img(x.logo)}${esc(x.abbr || x.short)}</button>`).join("")}
    </div>
    <div class="chips">${chips}</div>
    ${inj.length ? `<div class="note"><b>Infirmerie :</b> ${inj.map((i) => `${esc(i.name)} (${esc(i.status)})`).join(", ")}</div>` : ""}
    <div class="card">${rosterHtml}</div>
    <div class="row wrap"><a class="btn" href="#/value" data-scan="${g.id}">⚡ Value de ce match</a>
    <span class="muted small">Données : ${data.data.gamesTotal} matchs analysés${data.data.updatedAt ? `, mis à jour ${new Date(data.data.updatedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}` : ""}</span></div>`;
  $app.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { location.hash = `#/game/${g.id}/${b.dataset.team}`; }));
  $app.querySelector("[data-scan]")?.addEventListener("click", () => { valueState.only = g.id; });
}

// ---------- Joueur ----------
const playerState = { minutes: null, market: "pts", manual: {} };

async function viewPlayer(token, pid, gid, tid) {
  $app.innerHTML = loader("Analyse du joueur…");
  playerState.minutes = null;
  let data, oddsP;
  try {
    const G = await getGame(gid);
    oddsP = getGameOdds(G.game, settings.oddsKey); // les cotes ne sont demandées qu'à l'ouverture d'un joueur
    data = await buildContext(G.gd, pid, tid);
  } catch (e) { if (!stale(token)) $app.innerHTML = errorBox(e); return; }
  if (stale(token)) return;
  const st = { data, odds: null };
  renderPlayer(st);
  st.odds = await oddsP;
  if (stale(token)) return;
  renderPlayer(st);
}

function playerOffers(st, key) {
  const name = normName(st.data.player?.name || "");
  const p = st.odds?.players?.[name];
  const list = [...(p?.markets?.[key] || [])];
  for (const m of playerState.manual[key] || []) list.push(m);
  return list;
}

function renderPlayer(st) {
  const d = st.data;
  const g = d.game;
  const ctx = { logs: d.logs, prior: d.prior, factors: d.opp.factors, pace: d.pace, home: d.home, b2b: d.b2b, spread: d.spread, injuries: d.injuries, minutesOverride: playerState.minutes };
  const proj = project(ctx);
  const name = d.player?.name || "Joueur";
  const back = `<a href="#/game/${g.id}/${d.teamId}" class="muted small">‹ ${esc(d.teamName || "Effectif")}</a>`;
  if (!proj) {
    $app.innerHTML = `${back}<div class="card empty">Pas encore de données pour ${esc(name)} cette saison (ni la précédente).</div>`;
    return;
  }
  const season = averages(d.logs);
  const l10 = averages(d.logs.slice(-10));
  const prior = d.prior ? averages(d.prior) : null;
  const inj = d.playerInjury;

  // --- Tableau des stats ---
  const rows = ["min", "pts", "reb", "ast", "fg3m", "stl", "blk", "tov", "pra"].map((k) => {
    const lab = k === "min" ? "Minutes" : k === "tov" ? "Balles perdues" : MARKETS[k].label;
    const pr = k === "min" ? proj.minutesUsed : k === "tov" ? proj.mean.tov : proj.stats[k].mean;
    const med = k === "min" || k === "tov" ? "" : `<div class="muted small">méd. ${proj.stats[k].median} · ${proj.stats[k].p25}–${proj.stats[k].p75}</div>`;
    return `<tr><td>${lab}</td><td>${prior ? f1(prior[k]) : "–"}</td><td>${d.logs.length ? f1(season[k]) : "–"}</td><td>${d.logs.length ? f1(l10[k]) : "–"}</td><td class="proj">${f1(pr)}${med}</td></tr>`;
  }).join("");
  const shoot = `<tr><td>Adresse</td><td>${prior ? pct(prior.fgPct) : "–"}</td><td>${pct(season.fgPct)}</td><td>${pct(l10.fgPct)}</td><td></td></tr>
    <tr><td>3 pts</td><td>${prior ? `${pct(prior.fg3Pct)}` : "–"}</td><td>${f1(season.fg3m)}/${f1(season.fg3a)}</td><td>${f1(l10.fg3m)}/${f1(l10.fg3a)}</td><td></td></tr>`;

  // --- Matchup ---
  const F = d.opp.factors, R = d.opp.ranks;
  const prof = shotProfile(d.logs.length >= 3 ? d.logs : [...(d.prior || []), ...d.logs]);
  const mRow = (lab, k, share) => {
    const v = (F[k] ?? 1) - 1;
    const cls = v > 0.03 ? "up" : v < -0.03 ? "down" : "";
    const rank = R[k] ? `${R[k]}<sup>e</sup>/${d.opp.nTeams}` : "–";
    return `<tr><td>${lab}</td><td class="${cls}">${sgnPct(v)}</td><td>${rank}</td><td>${share != null ? pct(share) : ""}</td></tr>`;
  };
  const grp = GROUP_LABEL[d.player.group] || "joueurs";
  const matchup = `
    <table><thead><tr><th>Accordé aux ${grp}</th><th>vs ligue</th><th>Rang*</th><th>Part du joueur</th></tr></thead><tbody>
      ${mRow("Paniers à 2 pts", "fg2m", prof.two)}
      ${mRow("Paniers à 3 pts", "fg3m", prof.three)}
      ${mRow("Lancers francs", "ftm", prof.ft)}
      ${mRow("Points", "pts")}
      ${mRow("Rebonds", "reb")}
      ${mRow("Passes décisives", "ast")}
      ${mRow("Interceptions", "stl")}
      ${mRow("Contres", "blk")}
    </tbody></table>
    <div class="note">Ex. : « Paniers à 3 pts +12 % » = ${esc(d.oppName)} encaisse 12 % de paniers à 3 pts de plus par minute que la moyenne face aux ${grp} (ajusté à l'échantillon : ${d.opp.games} matchs). « Part du joueur » = part de ses points marqués à 2 pts / 3 pts / lancers. *Rang 1 = défense la plus généreuse.</div>`;

  // --- Minutes ---
  const m = proj.minutes;
  const adjHtml = m.adjustments.map((a) => `<div class="row between small"><span>${esc(a.label)}</span><b class="${a.delta >= 0 ? "up" : "down"}">${a.delta >= 0 ? "+" : ""}${f1(a.delta)} min</b></div>`).join("");
  const minutesCard = `<div class="card">
    <div class="row between"><h2 style="margin:0">Minutes projetées</h2><b class="odds num" id="minv">${f1(proj.minutesUsed)}</b></div>
    <div class="small muted">Base ${f1(m.base)} (saison ${f1(m.season)}, 10 derniers ${f1(m.l10)}${m.prior ? `, saison passée ${f1(m.prior)}` : ""})</div>
    ${adjHtml}
    <input type="range" min="0" max="44" step="0.5" value="${f1(proj.minutesUsed)}" id="minr" aria-label="Ajuster les minutes">
    <div class="row between small muted"><span>Ajuste si tu as une info (rotation, blessure…)</span>${playerState.minutes != null ? `<button class="btn sm" id="minreset">Auto</button>` : ""}</div>
    <div class="chips" style="margin-top:6px">
      <span class="chip">${d.home ? "Domicile" : "Extérieur"}</span>
      <span class="chip">Rythme ×${f2(proj.context.pace)}</span>
      ${d.b2b ? `<span class="chip warn">Back-to-back</span>` : ""}
      ${d.oppB2b ? `<span class="chip good">Adv. en back-to-back</span>` : ""}
      ${proj.context.usageBoost > 1.005 ? `<span class="chip good">Usage +${((proj.context.usageBoost - 1) * 100).toFixed(0)} % (absents)</span>` : ""}
      ${proj.context.rebBoost > 1.005 ? `<span class="chip good">Rebonds +${((proj.context.rebBoost - 1) * 100).toFixed(0)} % (absents)</span>` : ""}
      ${proj.context.wPrior > 0.05 ? `<span class="chip neutral">Saison passée pèse ${(proj.context.wPrior * 100).toFixed(0)} %</span>` : ""}
    </div>
    ${d.injuries.missing?.length ? `<div class="note">Absents pris en compte : ${d.injuries.missing.map((x) => `${esc(x.name)} (${f1(x.mpg)} min)`).join(", ")}</div>` : ""}
  </div>`;

  // --- Meilleurs paris (tous marchés) ---
  const allPicks = [];
  for (const k of Object.keys(MARKETS)) {
    const offers = playerOffers(st, k);
    if (offers.length) allPicks.push(...evaluate(k, proj.stats[k], offers, { wModel: settings.wModel }));
  }
  // Un seul pari par (marché, côté, ligne) : celui avec la meilleure cote (les books FR passent en premier à cote égale).
  const dedup = (list) => {
    const m = new Map();
    for (const p of list) {
      const k = `${p.key}|${p.side}|${p.line}`;
      const cur = m.get(k);
      if (!cur || p.odds > cur.odds || (p.odds === cur.odds && p.fr && !cur.fr)) m.set(k, p);
    }
    return [...m.values()];
  };
  const eligible = dedup(allPicks.filter((p) => !settings.frOnly || p.fr));
  const best = eligible.filter((p) => p.ev > 0).sort((a, b) => b.ev - a.ev).slice(0, 5);
  const bestKeys = new Set(best.map((p) => `${p.key}|${p.side}|${p.line}`));
  const safest = eligible.filter((p) => p.ev >= 0 && !bestKeys.has(`${p.key}|${p.side}|${p.line}`)).sort((a, b) => b.pFinal - a.pFinal).slice(0, 3);
  const oddsInfo = oddsStatus(st.odds);
  const bestCard = `<div class="card">
    <h2>💡 Paris conseillés</h2>
    ${st.odds == null ? loader("Récupération des cotes…") : ""}
    ${best.length ? `<h3>Meilleure value</h3>${best.map((p) => pickRow(p, d)).join("")}` : st.odds ? `<div class="muted">Aucune value détectée pour l'instant${allPicks.length ? "" : " (pas de cotes)"}. Saisis une cote Winamax/Betclic dans un marché ci-dessous.</div>` : ""}
    ${safest.length ? `<h3>Les plus probables (EV ≥ 0)</h3>${safest.map((p) => pickRow(p, d)).join("")}` : ""}
    ${oddsInfo}
  </div>`;

  // --- Marché sélectionné ---
  const mk = playerState.market;
  const sp = proj.stats[mk];
  const offers = playerOffers(st, mk);
  const lineRef = offers[0]?.line ?? Math.floor(sp.mean) + 0.5;
  const picksMk = offers.length ? evaluate(mk, sp, offers, { wModel: settings.wModel }) : [];
  const center = Math.floor(sp.mean);
  const ladderLines = Array.from({ length: 7 }, (_, i) => center - 3 + i + 0.5).filter((l) => l > 0);
  const ladder = ladderLines.map((l) => {
    const p = probLine(sp.dist, l);
    const hr = sp.l10Values.filter((v) => v > l).length;
    return `<tr${l === lineRef ? ` style="background:var(--bg2)"` : ""}><td>${l}</td><td>${pct(p.over)}</td><td>${f2(1 / p.over)}</td><td>${pct(p.under)}</td><td>${f2(1 / p.under)}</td><td>${hr}/${sp.l10Values.length}</td></tr>`;
  }).join("");
  const offersByLine = {};
  for (const o of offers) (offersByLine[o.line] ||= []).push(o);
  const offersHtml = offers.length ? `<div class="scroll"><table><thead><tr><th>Bookmaker</th><th>Ligne</th><th>Over</th><th>Under</th><th>Meilleur côté</th></tr></thead><tbody>
    ${offers.sort((a, b) => (FR_BOOKS.has(b.book) - FR_BOOKS.has(a.book)) || a.line - b.line).map((o) => {
      const ps = picksMk.filter((p) => p.book === o.book && p.line === o.line).sort((a, b) => b.ev - a.ev)[0];
      const t = ps ? tag(ps) : null;
      return `<tr><td>${FR_BOOKS.has(o.book) ? "🇫🇷 " : ""}${esc(BOOK_LABEL[o.book] || o.book)}</td><td>${o.line}</td><td>${f2(o.over)}</td><td>${f2(o.under)}</td>
      <td>${ps ? `<span class="chip ${t.cls}">${ps.side === "over" ? "Over" : "Under"} ${sgnPct(ps.ev)}</span>` : "–"}</td></tr>`;
    }).join("")}</tbody></table></div>` : `<div class="muted small">Pas de cote reçue pour ce marché.</div>`;

  const tabs = Object.entries(MARKETS).map(([k, v]) => `<button data-mk="${k}" class="${k === mk ? "on" : ""}">${v.short}</button>`).join("");
  const marketCard = `<div class="card">
    <div class="tabs">${tabs}</div>
    <div class="row between"><h2 style="margin:6px 0">${MARKETS[mk].label}</h2><div class="center"><div class="odds num">${f1(sp.mean)}</div><div class="muted small">projection</div></div></div>
    <div class="small muted">Médiane ${sp.median} · 50 % de chances entre ${sp.p25} et ${sp.p75} · saison ${f1(sp.season)} · 10 derniers ${f1(sp.l10)}</div>
    ${spark(sp.l10Values, lineRef, d.logs.slice(-10))}
    <h3>Cotes</h3>${offersHtml}
    <h3>Probabilités par ligne (modèle seul)</h3>
    <div class="scroll"><table><thead><tr><th>Ligne</th><th>P(Over)</th><th>Cote juste</th><th>P(Under)</th><th>Cote juste</th><th>10 dern.</th></tr></thead><tbody>${ladder}</tbody></table></div>
    <div class="note">Une cote est « value » si elle est <b>supérieure à la cote juste</b>.</div>
    <h3>Saisir une cote (Winamax, Betclic…)</h3>
    <div class="form">
      <div><label>Bookmaker</label><select id="mbook"><option value="winamax_fr">Winamax</option><option value="betclic_fr">Betclic</option><option value="unibet_fr">Unibet</option><option value="parionssport_fr">Parions Sport</option></select></div>
      <div><label>Ligne</label><input type="number" step="0.5" id="mline" value="${lineRef}"></div>
      <div><label>Cote Over</label><input type="number" step="0.01" id="mover" placeholder="1.85"></div>
      <div><label>Cote Under</label><input type="number" step="0.01" id="munder" placeholder="1.85"></div>
      <div style="align-self:end"><button class="btn primary" id="madd">Calculer</button></div>
    </div>
  </div>`;

  // --- Derniers matchs ---
  const recent = d.logs.slice(-10).reverse().map((l) => `<tr><td>${l.d.slice(6, 8)}/${l.d.slice(4, 6)}</td><td>${l.home ? "vs" : "@"} ${esc(teamAbbr(d, l.opp))}</td><td>${Math.round(l.min)}</td><td><b>${l.pts}</b></td><td>${l.reb}</td><td>${l.ast}</td><td>${l.fg3m}/${l.fg3a}</td><td>${l.stl}</td><td>${l.blk}</td><td>${l.pts + l.reb + l.ast}</td></tr>`).join("");

  $app.innerHTML = `${back}
    <div class="card phead">
      ${img(d.player.headshot)}
      <div class="grow"><div class="name">${esc(name)}${statusBadge(inj?.status)}</div>
      <div class="muted small">${esc(d.player.pos || "")} · ${esc(d.teamName)} ${d.home ? "vs" : "@"} ${esc(d.oppName)} · ${parisDay(g.date)} ${parisTime(g.date)}</div>
      ${inj ? `<div class="small" style="color:var(--warn)">${esc(inj.status)} ${esc(inj.detail || "")}</div>` : ""}
      </div>
    </div>
    ${bestCard}
    ${minutesCard}
    <div class="card"><h2>Statistiques & projection</h2><div class="scroll"><table>
      <thead><tr><th></th><th>Saison passée</th><th>Saison (${d.logs.length} m.)</th><th>10 derniers</th><th>Projection</th></tr></thead>
      <tbody>${rows}${shoot}</tbody></table></div>
      ${d.logs.length < 5 ? `<div class="note warn">Début de saison : peu de matchs, la projection s'appuie aussi sur la saison passée.</div>` : ""}
    </div>
    ${marketCard}
    <div class="card"><h2>Matchup : ${esc(d.oppName)} face aux ${grp}</h2><div class="scroll">${matchup}</div></div>
    <div class="card"><h2>10 derniers matchs</h2>${recent ? `<div class="scroll"><table><thead><tr><th>Date</th><th>Adv.</th><th>Min</th><th>Pts</th><th>Reb</th><th>PD</th><th>3pts</th><th>Int</th><th>Ctr</th><th>PRA</th></tr></thead><tbody>${recent}</tbody></table></div>` : `<div class="muted">Aucun match cette saison.</div>`}</div>`;

  // --- événements ---
  const range = document.getElementById("minr");
  range.addEventListener("input", () => { document.getElementById("minv").textContent = f1(+range.value); });
  range.addEventListener("change", () => { playerState.minutes = +range.value; renderPlayer(st); });
  document.getElementById("minreset")?.addEventListener("click", () => { playerState.minutes = null; renderPlayer(st); });
  $app.querySelectorAll("[data-mk]").forEach((b) => b.addEventListener("click", () => { playerState.market = b.dataset.mk; renderPlayer(st); }));
  document.getElementById("madd").addEventListener("click", () => {
    const line = parseFloat(document.getElementById("mline").value);
    const over = parseFloat(document.getElementById("mover").value) || null;
    const under = parseFloat(document.getElementById("munder").value) || null;
    if (!Number.isFinite(line) || (!over && !under)) { toast("Ligne + au moins une cote"); return; }
    const book = document.getElementById("mbook").value;
    const list = (playerState.manual[mk] ||= []).filter((o) => !(o.book === book && o.line === line));
    list.push({ book, line, over, under, manual: true });
    playerState.manual[mk] = list;
    renderPlayer(st);
  });
  $app.querySelectorAll("[data-bet]").forEach((b) => b.addEventListener("click", () => addBet(JSON.parse(b.dataset.bet), d)));
  $app.querySelector("[data-refresh-odds]")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    st.odds = await getGameOdds(g, settings.oddsKey, { force: true });
    renderPlayer(st);
  });
}

function teamAbbr(d, id) {
  if (d.game.home.id === id) return d.game.home.abbr;
  if (d.game.away.id === id) return d.game.away.abbr;
  return d.teamsAbbr?.[id] || "";
}

function oddsStatus(o) {
  if (!o) return "";
  if (o.available) {
    const fr = o.frBooks?.length ? o.frBooks.map((b) => BOOK_LABEL[b] || b).join(", ") : null;
    return `<div class="note">Cotes ${o.cached ? "en cache" : "à jour"} (${new Date(o.fetchedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })})
      · ${fr ? `🇫🇷 ${esc(fr)}` : "aucun book FR n'a publié de cotes joueurs sur ce match"}${o.quota?.remaining ? ` · ${o.quota.remaining} crédits restants` : ""}
      <button class="btn sm" data-refresh-odds style="margin-left:6px">Rafraîchir</button></div>`;
  }
  const msg = { no_key: "Pas de clé The Odds API (⚙︎ Réglages) : saisis tes cotes Winamax/Betclic à la main ci-dessous.", event_not_found: "Match pas encore listé par le fournisseur de cotes.", finished: "Match terminé.", error: `Cotes indisponibles : ${o.error || ""}` }[o.reason] || "Cotes indisponibles.";
  return `<div class="note warn">${esc(msg)}</div>`;
}

function pickRow(p, d) {
  const t = tag(p);
  const stake = Math.max(0, Math.round(p.kelly * settings.bankroll * 10) / 10);
  const bet = { market: p.key, side: p.side, line: p.line, odds: p.odds, book: p.book, pModel: p.pModel, pFinal: p.pFinal, ev: p.ev, mean: p.mean, stake };
  const hit = p.hitL10 ? ` · ${p.hitL10.hits}/${p.hitL10.n} sur 10 dern.` : "";
  return `<div class="pick row">
    <div class="grow">
      <div class="main">${esc(p.label)} ${p.side === "over" ? "Over" : "Under"} ${p.line} <span class="chip ${t.cls}">${t.text} ${sgnPct(p.ev)}</span></div>
      <div class="small muted">${p.fr ? "🇫🇷 " : ""}${esc(p.bookLabel)} · proba ${pct(p.pFinal)} (modèle ${pct(p.pModel)}${p.pMarket != null ? `, marché ${pct(p.pMarket)}` : ""}) · cote juste ${f2(p.fair)}${hit}</div>
      ${stake > 0 ? `<div class="small muted">Mise conseillée : ${stake} (Kelly ¼, bankroll ${settings.bankroll})</div>` : ""}
    </div>
    <div class="center"><div class="odds num">${f2(p.odds)}</div><button class="btn sm" data-bet='${esc(JSON.stringify(bet))}'>+ Journal</button></div>
  </div>`;
}

async function addBet(b, d) {
  const stake = prompt(`Mise pour ${MARKETS[b.market].label} ${b.side === "over" ? "Over" : "Under"} ${b.line} @ ${b.odds} ?`, String(b.stake || 1));
  if (stake == null) return;
  try {
    journalAdd({
      ...b, stake: parseFloat(stake) || 1, eventId: d.game.id, season: d.game.season, gameDate: d.game.dateKey,
      matchup: `${d.game.away.abbr} @ ${d.game.home.abbr}`, playerId: d.player.id, player: d.player.name,
    });
    toast("Ajouté au journal ✓");
  } catch (e) { toast(e.message); }
}

function spark(values, line, logs) {
  if (!values.length) return "";
  const W = 320, H = 90, n = values.length, max = Math.max(line * 1.3, ...values, 1);
  const bw = W / n;
  const bars = values.map((v, i) => {
    const h = (v / max) * (H - 16);
    const c = v > line ? "var(--good)" : "var(--bad)";
    return `<rect x="${i * bw + 3}" y="${H - 14 - h}" width="${bw - 6}" height="${h}" rx="3" fill="${c}" opacity=".85"/><text x="${i * bw + bw / 2}" y="${H - 2}" text-anchor="middle" font-size="10" fill="var(--muted)">${v}</text>`;
  }).join("");
  const y = H - 14 - (line / max) * (H - 16);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="10 derniers matchs vs ligne ${line}">${bars}<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="var(--accent)" stroke-dasharray="4 3" stroke-width="1.5"/></svg>
  <div class="small muted">10 derniers matchs (du plus ancien au plus récent) vs ligne ${line}</div>`;
}

// ---------- Top value du jour ----------
const valueState = { picks: [], scanned: new Set(), sort: "ev", only: null, quota: null, date: null, games: [] };

async function viewValue(token) {
  const today = etKey();
  if (valueState.date !== today) Object.assign(valueState, { picks: [], scanned: new Set(), date: today, games: [] });
  $app.innerHTML = `<h1>Top value du jour</h1>
    <div class="card">
      <div class="small muted">Chaque match scanné consomme environ 10 crédits The Odds API (1 appel, puis cache 10 min). Les joueurs sont projetés avec le même modèle que la fiche joueur.</div>
      <div class="row wrap" style="margin-top:10px">
        <button class="btn primary" id="scanAll">Scanner les matchs à venir</button>
        <label class="row" style="gap:6px"><input type="checkbox" id="frOnly" ${settings.frOnly ? "checked" : ""}> Books FR uniquement</label>
      </div>
      <div id="scanStatus" class="small muted" style="margin-top:8px"></div>
    </div>
    <div class="tabs"><button data-sort="ev" class="${valueState.sort === "ev" ? "on" : ""}">Meilleure value</button><button data-sort="p" class="${valueState.sort === "p" ? "on" : ""}">Plus probables</button><button data-sort="odds" class="${valueState.sort === "odds" ? "on" : ""}">Meilleure cote (EV>0)</button></div>
    <div id="picks" class="card"></div>`;
  document.getElementById("frOnly").addEventListener("change", (e) => { settings.frOnly = e.target.checked; saveSettings(); renderPicks(); });
  $app.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => { valueState.sort = b.dataset.sort; viewValue(token); }));
  document.getElementById("scanAll").addEventListener("click", () => scan(token));
  renderPicks();
  if (valueState.only) { const id = valueState.only; valueState.only = null; scan(token, [id]); }
}

async function scan(token, ids) {
  const status = document.getElementById("scanStatus");
  const btn = document.getElementById("scanAll");
  btn.disabled = true;
  try {
    if (!ids) {
      status.textContent = "Liste des matchs…";
      const games = (await getDay(etKey()))?.games || [];
      ids = games.filter((g) => g.state === "pre").map((g) => g.id);
      if (!ids.length) { status.textContent = "Aucun match à venir aujourd'hui."; return; }
    }
    for (const [i, id] of ids.entries()) {
      if (stale(token)) return;
      status.textContent = `Scan ${i + 1}/${ids.length}…`;
      const r = await scanGame(id).catch((e) => ({ error: e.message, picks: [] }));
      if (r.error) status.textContent = r.error;
      valueState.picks = valueState.picks.filter((p) => p.gameId !== id);
      const matchup = r.game ? `${r.game.away.abbr} @ ${r.game.home.abbr}` : "";
      for (const p of r.picks || []) valueState.picks.push({ ...p, gameId: id, matchup, season: r.game?.season, gameDate: r.game?.dateKey });
      if (r.odds?.quota?.remaining) valueState.quota = r.odds.quota.remaining;
      if (r.odds && !r.odds.available) status.textContent = `Match ${matchup} : ${r.odds.reason === "no_key" ? "clé API absente" : r.odds.error || r.odds.reason}`;
      valueState.scanned.add(id);
      renderPicks();
    }
    status.textContent = `${valueState.scanned.size} match(s) scanné(s)${valueState.quota ? ` · ${valueState.quota} crédits restants` : ""}.`;
  } catch (e) { status.textContent = e.message; } finally { btn.disabled = false; }
}

// Scan d'un match : cotes de tous les joueurs → projection → paris classés par value.
async function scanGame(id) {
  const G = await getGame(id);
  const gd = G.gd, g = G.game;
  const odds = await getGameOdds(g, settings.oddsKey);
  if (!odds.available) return { game: g, picks: [], odds };
  const byName = new Map();
  for (const [tid, r] of Object.entries(gd.rosters || {})) for (const p of r) byName.set(normName(p.name), { id: p.id, tid });
  for (const [pid, p] of Object.entries(gd.core.players)) {
    if ((p.teamId === g.home.id || p.teamId === g.away.id) && !byName.has(normName(p.name))) byName.set(normName(p.name), { id: pid, tid: p.teamId });
  }
  const picks = [];
  await Promise.all(Object.entries(odds.players).map(async ([n, op]) => {
    const who = byName.get(n);
    if (!who) return;
    const ctx = await buildContext(gd, who.id, who.tid);
    const inj = ctx.playerInjury;
    if (inj && /^out/i.test(inj.status)) return;
    const proj = project(ctx);
    if (!proj) return;
    for (const [mk, offers] of Object.entries(op.markets)) {
      if (!proj.stats[mk]) continue;
      for (const b of evaluate(mk, proj.stats[mk], offers, { wModel: settings.wModel }).slice(0, 2)) {
        picks.push({ ...b, playerId: who.id, player: ctx.player.name, teamId: ctx.teamId, status: inj?.status || null });
      }
    }
  }));
  return { game: g, picks: picks.sort((a, b) => b.ev - a.ev), odds };
}

function renderPicks() {
  const el = document.getElementById("picks");
  if (!el) return;
  let list = valueState.picks.filter((p) => (!settings.frOnly || p.fr) && !(p.status && /^out/i.test(p.status)));
  if (valueState.sort === "ev") list = list.filter((p) => p.ev > 0).sort((a, b) => b.ev - a.ev);
  if (valueState.sort === "p") list = list.filter((p) => p.ev >= 0).sort((a, b) => b.pFinal - a.pFinal);
  if (valueState.sort === "odds") list = list.filter((p) => p.ev > 0).sort((a, b) => b.odds - a.odds);
  if (!list.length) { el.innerHTML = `<div class="empty">${valueState.scanned.size ? "Aucun pari ne passe les filtres." : "Lance un scan pour voir les meilleurs paris du jour."}</div>`; return; }
  el.innerHTML = list.slice(0, 40).map((p) => {
    const t = tag(p);
    return `<a class="pick row" href="#/player/${p.playerId}/${p.gameId}/${p.teamId}">
      <div class="grow"><div class="main">${esc(p.player)} — ${esc(p.label)} ${p.side === "over" ? "Over" : "Under"} ${p.line}</div>
      <div class="small muted">${esc(p.matchup)} · ${p.fr ? "🇫🇷 " : ""}${esc(p.bookLabel)} · proba ${pct(p.pFinal)} · cote juste ${f2(p.fair)} · proj. ${f1(p.mean)}${p.status ? ` · ⚠️ ${esc(p.status)}` : ""}</div></div>
      <div class="center"><div class="odds num">${f2(p.odds)}</div><span class="chip ${t.cls}">${sgnPct(p.ev)}</span></div></a>`;
  }).join("");
}

// ---------- Journal ----------
async function viewJournal(token) {
  $app.innerHTML = `<h1>Journal des paris</h1>${loader()}`;
  let bets;
  try { bets = await settleAll(); } catch (e) { if (!stale(token)) $app.innerHTML = `<h1>Journal des paris</h1>${errorBox(e)}`; return; }
  if (stale(token)) return;
  const settled = bets.filter((b) => ["won", "lost", "push"].includes(b.status));
  const staked = settled.reduce((s, b) => s + b.stake, 0);
  const profit = settled.reduce((s, b) => s + (b.status === "won" ? b.stake * (b.odds - 1) : b.status === "lost" ? -b.stake : 0), 0);
  const decided = settled.filter((b) => b.status !== "push");
  const won = decided.filter((b) => b.status === "won").length;
  const expected = decided.reduce((s, b) => s + (b.pFinal ?? 0), 0);
  const avgOdds = decided.length ? decided.reduce((s, b) => s + b.odds, 0) / decided.length : null;
  // Calibration : proba annoncée vs taux de réussite réel
  const buckets = [[0, 0.5], [0.5, 0.55], [0.55, 0.6], [0.6, 0.65], [0.65, 0.7], [0.7, 1.01]].map(([a, b]) => {
    const xs = decided.filter((x) => x.pFinal != null && x.pFinal >= a && x.pFinal < b);
    return { a, b, n: xs.length, hit: xs.filter((x) => x.status === "won").length, exp: xs.reduce((s, x) => s + x.pFinal, 0) };
  }).filter((x) => x.n);
  const label = { pending: "En cours", won: "Gagné", lost: "Perdu", push: "Remboursé", void: "Annulé (n'a pas joué)" };
  const cls = { won: "good", lost: "bad", push: "neutral", void: "neutral", pending: "" };
  $app.innerHTML = `<h1>Journal des paris</h1>
    <div class="kpis">
      <div class="kpi"><b class="${profit >= 0 ? "up" : "down"}">${profit >= 0 ? "+" : ""}${f2(profit)}</b><span>Profit (unités)</span></div>
      <div class="kpi"><b>${staked ? sgnPct(profit / staked) : "–"}</b><span>ROI</span></div>
      <div class="kpi"><b>${decided.length ? `${won}/${decided.length}` : "–"}</b><span>Réussite ${decided.length ? pct(won / decided.length) : ""} (attendu ${decided.length ? pct(expected / decided.length) : "–"})</span></div>
      <div class="kpi"><b>${avgOdds ? f2(avgOdds) : "–"}</b><span>Cote moyenne · ${bets.filter((b) => b.status === "pending").length} en cours</span></div>
    </div>
    ${buckets.length ? `<div class="card"><h2>Fiabilité du modèle</h2><table><thead><tr><th>Proba annoncée</th><th>Paris</th><th>Attendu</th><th>Réel</th></tr></thead><tbody>
      ${buckets.map((x) => `<tr><td>${(x.a * 100).toFixed(0)}–${Math.min(100, x.b * 100).toFixed(0)} %</td><td>${x.n}</td><td>${pct(x.exp / x.n)}</td><td>${pct(x.hit / x.n)}</td></tr>`).join("")}
      </tbody></table><div class="note">Si « Réel » reste nettement sous « Attendu » sur 100+ paris, le modèle est trop optimiste : baisse le poids du modèle dans ⚙︎ Réglages.</div></div>` : ""}
    <div class="card">${bets.length ? bets.map((b) => `<div class="pick row">
      <div class="grow"><div class="main">${esc(b.player)} — ${esc(MARKETS[b.market]?.label || b.market)} ${b.side === "over" ? "Over" : "Under"} ${b.line}</div>
      <div class="small muted">${esc(b.matchup)} · ${b.gameDate ? `${b.gameDate.slice(6, 8)}/${b.gameDate.slice(4, 6)}` : ""} · ${esc(BOOK_LABEL[b.book] || b.book)} · mise ${b.stake}${b.pFinal != null ? ` · proba ${pct(b.pFinal)}` : ""}${b.result != null ? ` · résultat <b>${b.result}</b>` : ""}</div></div>
      <div class="center"><div class="odds num">${f2(b.odds)}</div><span class="chip ${cls[b.status]}">${label[b.status] || b.status}</span><br><button class="btn sm" data-del="${b.id}" style="margin-top:4px">✕</button></div></div>`).join("") : `<div class="empty">Aucun pari. Ajoute-en depuis une fiche joueur (« + Journal »).</div>`}</div>
    <p class="muted small">Les paris se règlent automatiquement quand la feuille de match est intégrée (toutes les 30 min). Le journal est enregistré sur cet appareil : exporte-le pour le sauvegarder ou le transférer.</p>
    <div class="row wrap"><button class="btn sm" id="jexp">⬇︎ Exporter</button><label class="btn sm">⬆︎ Importer<input type="file" id="jimp" accept="application/json" hidden></label></div>`;
  document.getElementById("jexp").addEventListener("click", exportBets);
  document.getElementById("jimp").addEventListener("change", async (e) => {
    try { const n = await importBets(e.target.files[0]); toast(`${n} pari(s) importé(s)`); viewJournal(routeToken); } catch (er) { toast(er.message); }
  });
  $app.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Supprimer ce pari ?")) return;
    deleteBet(b.dataset.del);
    viewJournal(routeToken);
  }));
}

// ---------- Réglages ----------
async function viewSettings(token) {
  $app.innerHTML = `<h1>Réglages</h1>
    <div class="card form">
      <div><label>Bankroll (unités)</label><input type="number" id="bk" value="${settings.bankroll}" min="1"></div>
      <div><label>Poids du modèle vs marché : <b id="wmv">${Math.round(settings.wModel * 100)} %</b></label><input type="range" id="wm" min="0.2" max="1" step="0.05" value="${settings.wModel}"></div>
      <div><label>Clé The Odds API</label><input type="password" id="ok" value="${esc(settings.oddsKey)}" autocomplete="off" placeholder="colle ta clé ici"></div>
    </div>
    <div class="note">Clé gratuite sur <a href="https://the-odds-api.com/#get-access" target="_blank" rel="noopener" style="text-decoration:underline">the-odds-api.com</a> (500 crédits/mois, ≈10 par match ouvert). Elle reste sur cet appareil. Sans clé, tu peux saisir tes cotes à la main.</div>
    <div class="note">Le poids du modèle règle la confiance accordée à nos projections face au consensus des bookmakers (Pinnacle compte triple). 60 % est un bon départ ; ajuste selon la fiabilité mesurée dans le Journal.</div>
    <div class="card" id="dstatus">${loader("État des données…")}</div>`;
  document.getElementById("bk").addEventListener("change", (e) => { settings.bankroll = Math.max(1, +e.target.value || 100); saveSettings(); toast("Enregistré"); });
  const wm = document.getElementById("wm");
  wm.addEventListener("input", () => { document.getElementById("wmv").textContent = `${Math.round(wm.value * 100)} %`; });
  wm.addEventListener("change", () => { settings.wModel = +wm.value; saveSettings(); toast("Enregistré"); });
  document.getElementById("ok").addEventListener("change", (e) => { settings.oddsKey = e.target.value.trim(); saveSettings(); toast("Clé enregistrée"); });
  renderStatus(token);
}

async function renderStatus(token) {
  const el = document.getElementById("dstatus");
  try {
    const s = await getMeta();
    if (stale(token)) return;
    const q = oddsQuota();
    const runUrl = REPO_URL ? `${REPO_URL}/actions/workflows/update-data.yml` : null;
    el.innerHTML = `<h2>Données</h2>
      ${s ? `<div class="small">Saison ${s.season - 1}-${String(s.season).slice(2)} · <b>${s.gamesTotal}</b> matchs analysés · ${s.players} joueurs · ${s.teams} équipes</div>
      <div class="small muted">Dernière mise à jour : ${new Date(s.updatedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} (automatique toutes les 30 min via GitHub)</div>` : `<div class="small">Pas encore de données : la première mise à jour GitHub n'a pas encore tourné.</div>`}
      <div class="small">Cotes : ${settings.oddsKey ? `✅ clé enregistrée${q?.remaining ? ` · ${q.remaining} crédits restants` : ""}` : "❌ pas de clé (saisie manuelle uniquement)"}</div>
      ${runUrl ? `<a class="btn" style="margin-top:10px" href="${runUrl}" target="_blank" rel="noopener">Forcer une mise à jour (GitHub)</a>
      <div class="small muted" style="margin-top:6px">Sur GitHub : « Run workflow » → « Run workflow ».</div>` : ""}`;
  } catch (e) { el.innerHTML = errorBox(e); }
}

router();
