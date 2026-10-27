import { MARKETS, project, probLine, averages, shotProfile, valueOf, kelly, blend } from "./model.js";
import { evaluate, tag, BOOK_LABEL, FR_BOOKS, SHOWN_BOOKS, normName, marketConsensus } from "./value.js";
import { getDay, getGameData, teamRoster, teamContext, buildContext, getMeta, REPO_URL } from "./data.js";
import { getTeamOdds, cachedTeamOdds, getGameOdds, cachedGameOdds, quota as oddsQuota, testKey, checkCoverage, SCAN_LEVELS } from "./odds.js";
import { TEAM_MARKETS, projectGame, teamProb, teamLabel, evaluateTeam } from "./team.js";
import { topValue, topMatchups, cachedTop, diagLines, noFrOdds } from "./picks.js";
import { addBet as journalAdd, deleteBet, setStatus, updateBet, settleAll, exportBets, importBets, createCombo, splitCombo } from "./journal.js";

// ---------- utilitaires ----------
const $app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const f1 = (x) => (x == null || !Number.isFinite(x) ? "–" : (Math.round(x * 10) / 10).toFixed(1));
const eur = (x) => (x == null || !Number.isFinite(x) ? "–" : `${x.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`);
const f2 = (x) => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(2));
const pct = (x, d = 0) => (x == null || !Number.isFinite(x) ? "–" : `${(x * 100).toFixed(d)} %`);
const sgnPct = (x) => (x == null ? "–" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(0)} %`);
const GROUP_LABEL = { G: "arrières", F: "ailiers", C: "pivots" };

const settings = (() => {
  const def = { bankroll: 100, wModel: 0.6, oddsKey: "", scanLevel: "essential" };
  try { return { ...def, ...JSON.parse(localStorage.getItem("astaria-settings") || "{}") }; } catch { return def; }
})();
const scanCost = () => (SCAN_LEVELS[settings.scanLevel] || SCAN_LEVELS.essential).cost;
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
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === nav));
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) { document.getElementById("scroller")?.scrollTo(0, 0); fn(token, ...m.slice(1)); return; }
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
  $app.innerHTML = `<div id="topAcc"></div><div class="days">${strip}</div><div class="section-title"><b>Matchs</b><span class="muted small">heure de Paris</span></div><div id="games">${loader()}</div>`;
  setTimeout(() => document.querySelector(".day.on")?.scrollIntoView({ inline: "center", block: "nearest" }), 0);
  try {
    const day = await getDay(sel);
    if (stale(token)) return;
    const el = document.getElementById("games");
    if (!day) { el.innerHTML = `<div class="card empty">Données pas encore disponibles pour ce jour. Elles sont mises à jour automatiquement toutes les 30 min.</div>`; return; }
    const games = day.games || [];
    if (!games.length) { el.innerHTML = `<div class="card empty">Aucun match ce jour-là.</div>`; return; }
    el.innerHTML = games.map(gameCard).join("");
    if (games.some((g) => g.state === "pre")) mountTop("topAcc", `day-${sel}`, games, sel === today ? "Top 5 value du jour" : "Top 5 value du " + keyToDate(sel).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", timeZone: "UTC" }));
  } catch (e) { if (!stale(token)) document.getElementById("games").innerHTML = errorBox(e); }
}

// ---------- Accordéon « Top 5 value » ----------
function ago(t) {
  const m = Math.round((Date.now() - t) / 60e3);
  return m < 1 ? "à l'instant" : `il y a ${m} min`;
}

function topRow(p) {
  const t = tag(p);
  return `<a class="pick row" href="#/player/${p.playerId}/${p.gameId}/${p.teamId}">
    ${img(p.headshot, "av")}
    <div class="grow"><div class="main ell">${esc(p.player)}</div>
    <div class="small muted ell">${esc(MARKETS[p.key].short)} ${p.side === "over" ? "Over" : "Under"} ${p.line} · ${esc(p.bookLabel)} · ${pct(p.pFinal)}</div></div>
    <div class="center"><div class="odds num">${f2(p.odds)}</div><span class="chip ${t.cls}">${sgnPct(p.ev)}</span></div></a>`;
}

function matchupRow(r) {
  return `<a class="pick row" href="#/player/${r.playerId}/${r.gameId}/${r.teamId}">
    ${img(r.headshot, "av")}
    <div class="grow"><div class="main ell">${esc(r.player)}</div>
    <div class="small muted">${esc(MARKETS[r.key].short)} · proj. <b style="color:var(--text)">${f1(r.mean)}</b> vs moy. ${f1(r.avg)}</div></div>
    <div class="center"><span class="chip good">${sgnPct(r.edge)}</span></div></a>`;
}

function targetRow(t) {
  return `<a class="pick row" href="#/player/${t.playerId}/${t.gameId}/${t.teamId}">
    ${img(t.headshot, "av")}
    <div class="grow"><div class="main ell">${esc(t.player)}</div>
    <div class="small muted ell">${esc(MARKETS[t.key].short)} ${t.side === "over" ? "Plus de" : "Moins de"} ${t.line} · ${pct(t.pFinal)} · avantage ${t.edge >= 0.03 ? "fort" : "léger"} +${Math.round(t.edge * 100)} pts</div></div>
    <div class="center"><div class="small muted">prends si</div><div class="odds num">≥ ${f2(t.minOdds)}</div></div></a>`;
}

// Bloc commun « résultats d'un scan » : value FR, sinon lignes à viser, + diagnostic.
function scanResultsHTML(res, limit = 5) {
  const pos = res.picks.filter((p) => p.ev > 0);
  let html = "";
  if (pos.length) html += pos.slice(0, limit).map(topRow).join("");
  else if (noFrOdds(res) && res.targets?.length) {
    html += `<div class="note warn" style="margin:4px 0 8px">La source ne fournit pas les cotes joueurs Winamax/Betclic. Voici les <b>lignes à viser</b>, calculées avec les bookmakers de référence : vérifie la cote sur Winamax et prends le pari seulement si elle atteint la cote minimale.</div>`
      + res.targets.slice(0, limit).map(targetRow).join("");
  } else if (noFrOdds(res)) html += `<div class="empty">Aucune cote joueurs reçue pour ces matchs (ni Winamax/Betclic, ni référence). Réessaie plus près du match.</div>`;
  else html += `<div class="empty">Cotes Winamax/Betclic reçues, mais aucune n'a de value pour l'instant.</div>`;
  const dl = diagLines(res);
  if (dl.length || res.errors?.length) html += `<details class="mini"><summary>Détail du scan</summary><div class="small muted">${[...dl, ...(res.errors || [])].map(esc).join("<br>")}</div></details>`;
  return html;
}

function topSummary(res) {
  if (!res || res.mode !== "odds") return "Meilleurs matchups (gratuit) · scan des cotes à la demande";
  const pos = res.picks.filter((p) => p.ev > 0);
  if (pos.length) return `${Math.min(5, pos.length)} paris · meilleur ${sgnPct(pos[0].ev)} · ${ago(res.at)}`;
  if (noFrOdds(res)) return `${res.targets?.length ? `${Math.min(5, res.targets.length)} lignes à viser` : "Aucune ligne à viser"} · ${ago(res.at)}`;
  return `Aucune value pour l'instant · ${ago(res.at)}`;
}

function mountTop(id, scope, games, title) {
  const host = document.getElementById(id);
  if (!host) return;
  const pre = games.filter((g) => g.state === "pre").length;
  const cached = cachedTop(scope);
  const oddsRes = cached?.mode === "odds" ? cached : null;
  host.innerHTML = `<details class="acc top-acc">
    <summary><span class="acc-ico">🔥</span><div class="grow"><b>${esc(title)}</b><div class="small" data-sub>${esc(topSummary(oddsRes))}</div></div><span class="chev" aria-hidden="true"></span></summary>
    <div class="acc-body" data-body></div></details>`;
  const det = host.querySelector("details");
  const sub = host.querySelector("[data-sub]");
  const body = host.querySelector("[data-body]");
  const scanLabel = `Scanner les cotes (≈${pre * scanCost()} crédits max)`;
  const renderOdds = (res) => {
    sub.textContent = topSummary(res);
    body.innerHTML = scanResultsHTML(res, 5)
      + `<div class="row between acc-foot"><button class="link" data-rescan>↻ Rescanner</button>${res.quota ? `<span class="small muted">${res.quota} crédits restants</span>` : ""}<a class="link" href="#/value">Tout voir ›</a></div>`;
    body.querySelector("[data-rescan]").addEventListener("click", () => scan(true));
  };
  const renderMatchups = (res) => {
    body.innerHTML = `<div class="small muted" style="margin:2px 0 4px">Projections au-dessus de la moyenne grâce au matchup</div>`
      + (res.rows.length ? res.rows.slice(0, 5).map(matchupRow).join("") : `<div class="empty">Pas encore de projections pour ces matchs.</div>`)
      + `<div class="acc-foot">${settings.oddsKey ? `<button class="btn primary scan-btn" data-scan>📡 ${scanLabel}</button>` : `<a class="btn scan-btn" href="#/settings">Ajouter ma clé de cotes pour scanner</a>`}</div>`;
    body.querySelector("[data-scan]")?.addEventListener("click", () => scan(false));
  };
  async function scan(force = false) {
    body.innerHTML = loader("Scan des cotes Winamax / Betclic…");
    try {
      const res = await topValue(scope, games, { oddsKey: settings.oddsKey, wModel: settings.wModel, level: settings.scanLevel, force, onProgress: (i, n) => { sub.textContent = `Scan du match ${i}/${n}…`; } });
      if (host.isConnected) renderOdds(res);
    } catch (e) { body.innerHTML = errorBox(e); }
  }
  let loaded = false;
  det.addEventListener("toggle", async () => {
    if (!det.open || loaded) return;
    loaded = true;
    if (oddsRes) { renderOdds(oddsRes); return; }
    body.innerHTML = loader("Analyse des matchups…");
    try { renderMatchups(await topMatchups(`${scope}-mu`, games)); } catch (e) { body.innerHTML = errorBox(e); }
  });
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
  const isOut = (p) => /^out|suspen/i.test(p.status || "");
  const row = (p) => `<a class="player ${isOut(p) ? "out" : ""}" href="#/player/${p.id}/${g.id}/${tid}">
      ${img(p.headshot)}
      <div class="grow"><div class="ell"><b>${esc(p.name)}</b>${statusBadge(p.status)}</div>
      <div class="meta">${esc(p.pos)}${p.jersey ? ` · #${esc(p.jersey)}` : ""} · ${p.gp} m.j. · ${f1(p.mpg)} min</div></div>
      <div class="st num"><b>${f1(p.ppg)}</b> pts<br>${f1(p.rpg)} reb · ${f1(p.apg)} pd</div>
    </a>`;
  // Cinq probable : les titulaires récents disponibles, sinon les 5 plus gros temps de jeu.
  const avail = t.roster.filter((p) => !isOut(p));
  let five = avail.filter((p) => p.starts5 >= 3).slice(0, 5);
  if (five.length < 5) five = [...five, ...avail.filter((p) => !five.includes(p))].slice(0, 5);
  const bench = avail.filter((p) => !five.includes(p));
  const outs = t.roster.filter(isOut);
  const group = (title, list, extra = "") => list.length ? `<div class="card"><div class="group-title"><span>${title}</span><span>${extra}</span></div>${list.map(row).join("")}</div>` : "";
  const rosterHtml = t.roster.length
    ? group("Cinq probable", five, `${five.reduce((s, p) => s + p.ppg, 0).toFixed(0)} pts/m`) + group("Banc", bench, `${bench.length} joueurs`) + group("Absents", outs)
    : `<div class="card empty">Effectif indisponible.</div>`;
  const chips = [
    t.b2b && `<span class="chip warn">Back-to-back</span>`,
    opp.b2b && `<span class="chip good">Adversaire en back-to-back</span>`,
    `<span class="chip">Rythme ${f1(t.pace)} poss. (ligue ${f1(data.data.leaguePace)})</span>`,
    g.details && `<span class="chip">Écart ${esc(g.details)}</span>`,
    g.total && `<span class="chip">Total ${g.total}</span>`,
  ].filter(Boolean).join("");
  $app.innerHTML = `
    <a href="#/day/${g.dateKey}" class="back">‹ Matchs du jour</a>
    <div class="card game" style="cursor:default">
      <div class="team">${img(g.away.logo)}<div class="nm ell">${esc(g.away.short)}</div></div>
      <div class="mid"><div class="time">${g.state === "pre" ? parisTime(g.date) : `${g.away.score ?? ""} – ${g.home.score ?? ""}`}</div><div class="muted small">${parisDay(g.date)}</div></div>
      <div class="team right">${img(g.home.logo)}<div class="nm ell">${esc(g.home.short)}</div></div>
    </div>
    ${g.state === "pre" ? `<div id="gameTop"></div><div id="teamBets"></div>` : ""}
    <div class="seg">
      ${[g.away, g.home].map((x) => `<button class="${x.id === tid ? "on" : ""}" data-team="${x.id}">${img(x.logo)}${esc(x.abbr || x.short)}</button>`).join("")}
    </div>
    <div class="chips">${chips}</div>
    ${inj.length ? `<div class="note"><b>Infirmerie :</b> ${inj.map((i) => `${esc(i.name)} (${esc(i.status)})`).join(", ")}</div>` : ""}
    ${rosterHtml}
    <div class="row wrap"><span class="muted small">Données : ${data.data.gamesTotal} matchs analysés${data.data.updatedAt ? `, mis à jour ${new Date(data.data.updatedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}` : ""}</span></div>`;
  $app.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { location.hash = `#/game/${g.id}/${b.dataset.team}`; }));
  mountTop("gameTop", `game-${g.id}`, [g], "Top 5 value du match");
  mountTeamBets(data);
}

// ---------- Paris sur le match (vainqueur, handicap, totaux) ----------
const teamState = { open: false };
function mountTeamBets(data) {
  const host = document.getElementById("teamBets");
  if (!host) return;
  const g = data.game, core = data.gd.core;
  const proj = projectGame(core, g);
  const fav = proj.margin >= 0 ? g.home : g.away;
  const pFav = proj.margin >= 0 ? proj.pHome : 1 - proj.pHome;
  const render = () => {
    const odds = cachedTeamOdds(g.id);
    const rows = odds?.available ? evaluateTeam(proj, g, odds.offers, { wModel: 0.5 }) : [];
    const rowHtml = (r, i) => {
      const t = tag(r);
      return `<div class="pick row"><div class="grow"><div class="main">${esc(r.label)}</div>
        <div class="small muted">${esc(r.bookLabel)} · proba ${pct(r.pFinal)}${r.pMarket != null ? ` (marché ${pct(r.pMarket)})` : ""} · cote juste ${f2(r.fair)}</div></div>
        <div class="center"><div class="odds num">${f2(r.odds)}</div><span class="chip ${t.cls}">${sgnPct(r.ev)}</span><br><button class="btn sm" data-tbet="${i}" style="margin-top:4px">+ Journal</button></div></div>`;
    };
    const best = rows.filter((r) => r.ev > 0);
    const rest = rows.filter((r) => r.ev <= 0);
    host.innerHTML = `<details class="acc"${teamState.open ? " open" : ""}>
      <summary><span class="acc-ico" style="background:var(--soft)">🏆</span><div class="grow"><b>Paris sur le match</b>
        <div class="small muted">${esc(g.home.abbr)} ${Math.round(proj.ptsH)} – ${Math.round(proj.ptsA)} ${esc(g.away.abbr)} · ${esc(fav.abbr)} gagne à ${pct(pFav)}</div></div><span class="chev" aria-hidden="true"></span></summary>
      <div class="acc-body">
        <div class="chips">
          <span class="chip">Écart projeté ${esc(fav.abbr)} −${Math.abs(proj.margin).toFixed(1)}</span>
          <span class="chip">Total projeté ${proj.total.toFixed(1)}</span>
          ${proj.market.margin != null ? `<span class="chip neutral">Marché : ${esc(g.details || "")}${g.total ? ` · ${g.total}` : ""}</span>` : ""}
        </div>
        <div class="small muted" style="margin:6px 2px 10px">Modèle (attaque, défense, rythme, domicile) pondéré à ${Math.round(proj.modelWeight * 100)} % face au marché, selon le nombre de matchs joués.</div>
        ${odds?.available ? `${best.length ? `<h3>Value Winamax / Betclic</h3>${best.map((r) => rowHtml(r, rows.indexOf(r))).join("")}` : `<div class="note">Aucune cote Winamax/Betclic avec de la value sur ce match.</div>`}
          ${rest.length ? `<details class="mini"><summary>Autres cotes (${rest.length})</summary>${rest.map((r) => rowHtml(r, rows.indexOf(r))).join("")}</details>` : ""}
          <div class="row between acc-foot"><span class="small muted">Cotes ${new Date(odds.fetchedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}${odds.quota?.remaining ? ` · ${odds.quota.remaining} crédits restants` : ""}</span><button class="link" data-tscan="1">↻ Rafraîchir</button></div>`
        : settings.oddsKey ? `<button class="btn primary scan-btn" data-tscan="0">📡 Scanner Vainqueur / Handicap / Total (≈3 crédits)</button>` : `<a class="btn scan-btn" href="#/settings">Ajouter ma clé de cotes pour scanner</a>`}
        <div class="betbox">
          <div class="row between"><b>Mon pari sur le match</b><span class="small muted">calcul instantané</span></div>
          <div class="form" style="margin-top:8px">
            <div><label>Type</label><select id="tmk">${Object.entries(TEAM_MARKETS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
            <div data-tf="team"><label>Équipe</label><select id="tteam"><option value="${g.home.id}">${esc(g.home.abbr)}</option><option value="${g.away.id}">${esc(g.away.abbr)}</option></select></div>
            <div data-tf="spr" hidden style="grid-column:1/-1"><label>Handicap</label><select id="tspr"><option value="-1">Gagne par + de X pts</option><option value="1">Gagne ou perd par − de X pts</option></select></div>
            <div data-tf="side" hidden><label>Côté</label><select id="tside"><option value="over">Plus de</option><option value="under">Moins de</option></select></div>
            <div data-tf="line" hidden><label id="tlinel">Ligne</label><input type="number" inputmode="decimal" step="0.5" id="tline"></div>
            <div><label>Cote</label><input type="number" inputmode="decimal" step="0.01" id="todds" placeholder="1.85"></div>
            <div><label>Bookmaker</label><select id="tbook"><option value="winamax_fr">Winamax</option><option value="betclic_fr">Betclic</option></select></div>
            <div><label>Mise (€)</label><input type="number" inputmode="decimal" step="0.5" id="tstake" placeholder="conseillée"></div>
          </div>
          <div id="thint" class="small muted" style="margin-top:6px"></div>
          <div id="tres" class="small" style="margin-top:8px"></div>
          <button class="btn primary scan-btn" id="tadd" style="margin-top:10px">+ Ajouter au journal</button>
        </div>
      </div></details>`;
    const det = host.querySelector("details");
    det.addEventListener("toggle", () => { teamState.open = det.open; });
    host.querySelectorAll("[data-tscan]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true; b.textContent = "Scan…";
      const r = await getTeamOdds(g, settings.oddsKey, { force: b.dataset.tscan === "1" });
      if (!r.available) toast(r.reason === "event_not_found" ? "Match pas encore listé par la source" : r.error || "Cotes indisponibles");
      teamState.open = true; render();
    }));
    host.querySelectorAll("[data-tbet]").forEach((b) => b.addEventListener("click", () => {
      const r = rows[+b.dataset.tbet];
      const stake = prompt(`Mise en € pour « ${r.label} » @ ${r.odds} ?`, String(Math.max(1, Math.round(r.kelly * settings.bankroll * 10) / 10)));
      if (stake == null) return;
      saveTeamBet({ ...r, stake: parseFloat(String(stake).replace(",", ".")) || 1 });
    }));
    // Formulaire manuel
    const $ = (id) => document.getElementById(id);
    const num = (id) => parseFloat(String($(id).value).replace(",", "."));
    const sync = () => {
      const mk = $("tmk").value;
      host.querySelector('[data-tf="team"]').hidden = mk === "total";
      host.querySelector('[data-tf="side"]').hidden = !(mk === "total" || mk === "teamtotal");
      host.querySelector('[data-tf="line"]').hidden = mk === "ml";
      host.querySelector('[data-tf="spr"]').hidden = mk !== "spread";
      $("tlinel").textContent = mk === "spread" ? "X (écart en points)" : mk === "lead" ? "X (points d'avance)" : "Ligne";
      $("thint").textContent = mk === "spread" ? "Betclic « perd de 10 ou − » → X = 10,5 · « gagne de 11 ou + » → X = 10,5" : mk === "lead" ? "Betclic « possède 18 points d'avance ou gagne » → X = 18" : "";
    };
    const current = () => {
      const mk = $("tmk").value;
      const raw = num("tline");
      const line = mk === "ml" ? null : mk === "spread" ? Math.abs(raw) * Number($("tspr").value) : raw;
      const bet = { market: mk, teamId: mk === "total" ? null : $("tteam").value, side: mk === "total" || mk === "teamtotal" ? $("tside").value : null, line };
      if (mk !== "ml" && !Number.isFinite(bet.line)) return null;
      return bet;
    };
    const calc = () => {
      sync();
      const bet = current(), out = $("tres");
      if (!bet) { out.textContent = ""; return null; }
      const p = teamProb(proj, g, bet), odds = num("todds");
      if (!(odds > 1)) { out.innerHTML = `${esc(teamLabel(bet, g))} · proba <b>${pct(p)}</b> · cote juste <b>${f2(1 / p)}</b>`; return { bet, p }; }
      const e = p * odds - 1, k = kelly(p, odds), sug = Math.round(k * settings.bankroll * 10) / 10, t = tag({ ev: e, pFinal: p });
      out.innerHTML = `${esc(teamLabel(bet, g))} · proba <b>${pct(p)}</b> · cote juste <b>${f2(1 / p)}</b> · <span class="chip ${t.cls}">${t.text} ${sgnPct(e)}</span> · mise conseillée <b>${eur(sug)}</b>`;
      $("tstake").placeholder = sug ? `conseillée ${sug} €` : "1 €";
      return { bet, p, odds, e, sug };
    };
    ["tmk", "tteam", "tspr", "tside", "tline", "todds"].forEach((id) => $(id).addEventListener("input", calc));
    calc();
    $("tadd").addEventListener("click", () => {
      const c = calc();
      if (!c || !c.odds) { toast("Renseigne la ligne et la cote"); return; }
      saveTeamBet({ ...c.bet, odds: c.odds, book: $("tbook").value, pModel: c.p, pFinal: c.p, ev: c.e, stake: num("tstake") || c.sug || 1, label: teamLabel(c.bet, g) });
    });
  };
  const saveTeamBet = (r) => {
    try {
      const teamId = r.teamId || g.home.id;
      const team = teamId === g.home.id ? g.home : g.away;
      journalAdd({ kind: "team", eventId: g.id, season: g.season, gameDate: g.dateKey, matchup: `${g.away.abbr} @ ${g.home.abbr}`,
        player: r.market === "total" ? `${g.away.abbr} @ ${g.home.abbr}` : team.name, playerId: "team",
        market: r.market, teamId, oppId: teamId === g.home.id ? g.away.id : g.home.id, side: r.side, line: r.line,
        odds: r.odds, book: r.book, stake: r.stake, pModel: r.pModel, pFinal: r.pFinal, ev: r.ev, label: r.label || teamLabel(r, g) });
      toast(`Ajouté au journal ✓ (${eur(r.stake)})`);
    } catch (e) { toast(e.message); }
  };
  render();
}

// ---------- Joueur ----------
const playerState = { minutes: null, market: "pts", manual: {}, open: new Set() };

async function viewPlayer(token, pid, gid, tid) {
  $app.innerHTML = loader("Analyse du joueur…");
  playerState.minutes = null;
  let data;
  try {
    data = await buildContext((await getGame(gid)).gd, pid, tid);
  } catch (e) { if (!stale(token)) $app.innerHTML = errorBox(e); return; }
  if (stale(token)) return;
  // Les cotes ne sont demandées que sur le bouton « Scanner » (sauf si déjà en cache : gratuit).
  const st = { data, odds: cachedGameOdds(gid) || { idle: true } };
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
  const back = `<a href="#/game/${g.id}/${d.teamId}" class="back">‹ ${esc(d.teamName || "Effectif")}</a>`;
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
  const minutesCard = `
    <div class="row between"><span class="muted small">Minutes projetées</span><b class="odds num" id="minv">${f1(proj.minutesUsed)}</b></div>
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
    ${d.injuries.missing?.length ? `<div class="note">Absents pris en compte : ${d.injuries.missing.map((x) => `${esc(x.name)} (${f1(x.mpg)} min)`).join(", ")}</div>` : ""}`;

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
  const eligible = dedup(allPicks);
  const best = eligible.filter((p) => p.ev > 0).sort((a, b) => b.ev - a.ev).slice(0, 5);
  const bestKeys = new Set(best.map((p) => `${p.key}|${p.side}|${p.line}`));
  const safest = eligible.filter((p) => p.ev >= 0 && !bestKeys.has(`${p.key}|${p.side}|${p.line}`)).sort((a, b) => b.pFinal - a.pFinal).slice(0, 3);
  // Lignes à viser : cotes de référence (books US, Pinnacle) quand le modèle est plus optimiste que le marché.
  const tmap = new Map();
  for (const k of Object.keys(MARKETS)) {
    const offs = playerOffers(st, k);
    if (!offs.length) continue;
    for (const r of evaluate(k, proj.stats[k], offs, { wModel: settings.wModel, allBooks: true })) {
      if (SHOWN_BOOKS.has(r.book) || r.pMarket == null) continue;
      const edge = r.pModel - r.pMarket;
      if (r.pFinal < 0.5 || edge < 0.01) continue;
      const key = `${k}|${r.side}`;
      if (!tmap.has(key) || edge > tmap.get(key).edge) tmap.set(key, { ...r, edge, minOdds: Math.round(r.fair * 1.03 * 100) / 100 });
    }
  }
  const pTargets = [...tmap.values()].sort((a, b) => b.edge - a.edge).slice(0, 5);
  const targetLine = (t) => `<div class="pick row" data-goto="${t.key}|${t.side}|${t.line}">
    <div class="grow"><div class="main">${esc(t.label)} ${t.side === "over" ? "Plus de" : "Moins de"} ${t.line}</div>
    <div class="small muted">proba ${pct(t.pFinal)} · avantage ${t.edge >= 0.03 ? "fort" : "léger"} +${Math.round(t.edge * 100)} pts · ligne de référence</div></div>
    <div class="center"><div class="small muted">prends si</div><div class="odds num">≥ ${f2(t.minOdds)}</div></div></div>`;
  const oddsInfo = oddsStatus(st.odds);
  const bestCard = `<div class="card">
    <h2>Meilleurs paris</h2>
    ${st.odds == null ? loader("Récupération des cotes…") : ""}
    ${best.length ? `${best.map((p) => pickRow(p, d)).join("")}`
      : pTargets.length ? `<div class="small muted" style="margin-bottom:4px">Lignes à viser : vérifie la cote sur Winamax et joue seulement si elle atteint le seuil (puis « Mon pari » pour l'ajouter au journal).</div>${pTargets.map(targetLine).join("")}`
      : st.odds && !st.odds.idle ? `<div class="muted">Aucun avantage détecté sur les lignes du marché. Tu peux saisir une cote Winamax dans « Mon pari ».</div>` : ""}
    ${safest.length ? `<details class="mini"><summary>Les plus probables (${safest.length})</summary>${safest.map((p) => pickRow(p, d)).join("")}</details>` : ""}
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
    return `<tr${l === lineRef ? ` style="background:var(--soft)"` : ""}><td>${l}</td><td>${pct(p.over)}</td><td>${f2(1 / p.over)}</td><td>${pct(p.under)}</td><td>${f2(1 / p.under)}</td><td>${hr}/${sp.l10Values.length}</td></tr>`;
  }).join("");
  const offersByLine = {};
  for (const o of offers) (offersByLine[o.line] ||= []).push(o);
  const offersHtml = offers.length ? `<div class="scroll"><table><thead><tr><th>Bookmaker</th><th>Ligne</th><th>Over</th><th>Under</th><th>Meilleur côté</th></tr></thead><tbody>
    ${offers.filter((o) => SHOWN_BOOKS.has(o.book)).sort((a, b) => (FR_BOOKS.has(b.book) - FR_BOOKS.has(a.book)) || a.line - b.line).map((o) => {
      const ps = picksMk.filter((p) => p.book === o.book && p.line === o.line).sort((a, b) => b.ev - a.ev)[0];
      const t = ps ? tag(ps) : null;
      return `<tr><td>${esc(BOOK_LABEL[o.book] || o.book)}</td><td>${o.line}</td><td>${f2(o.over)}</td><td>${f2(o.under)}</td>
      <td>${ps ? `<span class="chip ${t.cls}">${ps.side === "over" ? "Over" : "Under"} ${sgnPct(ps.ev)}</span>` : "–"}</td></tr>`;
    }).join("")}</tbody></table></div>` : "";
  // Ligne(s) du marché d'après les bookmakers de référence, avec la cote minimale à exiger chez Winamax.
  const refCount = {};
  for (const o of offers) if (!SHOWN_BOOKS.has(o.book) && o.over && o.under) refCount[o.line] = (refCount[o.line] || 0) + 1;
  const refLines = Object.entries(refCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([l]) => +l).sort((a, b) => a - b);
  const refHtml = refLines.length ? `<div class="scroll"><table><thead><tr><th>Ligne marché</th><th>Plus de</th><th>Moins de</th></tr></thead><tbody>${refLines.map((l) => {
    const pl = probLine(sp.dist, l);
    const cons = marketConsensus(offers, l);
    const pO = blend(pl.over, cons == null ? null : cons * (1 - pl.push), settings.wModel);
    const pU = blend(pl.under, cons == null ? null : (1 - cons) * (1 - pl.push), settings.wModel);
    const cell = (p) => `${pct(p)} · cote ≥ <b>${f2(((1 - pl.push) / p) * 1.03)}</b>`;
    return `<tr><td><b>${l}</b> <span class="small muted">(${refCount[l]} books)</span></td><td>${cell(pO)}</td><td>${cell(pU)}</td></tr>`;
  }).join("")}</tbody></table></div><div class="small muted">Cote minimale à exiger chez Winamax pour avoir de la value (proba modèle + marché).</div>` : "";
  const offersBlock = offersHtml + refHtml || `<div class="muted small">${st.odds?.idle ? "Cotes non scannées : utilise les cotes justes ci-dessous ou scanne le match." : "Pas de cote reçue pour ce marché."}</div>`;

  const tabs = Object.entries(MARKETS).map(([k, v]) => `<button data-mk="${k}" class="${k === mk ? "on" : ""}">${v.short}</button>`).join("");
  const marketCard = `<div class="card" id="mkt">
    <div class="tabs">${tabs}</div>
    <div class="row between"><h2 style="margin:6px 0">${MARKETS[mk].label}</h2><div class="center"><div class="odds num">${f1(sp.mean)}</div><div class="muted small">projection</div></div></div>
    <div class="small muted">Médiane ${sp.median} · 50 % de chances entre ${sp.p25} et ${sp.p75} · saison ${f1(sp.season)} · 10 derniers ${f1(sp.l10)}</div>
    ${spark(sp.l10Values, lineRef, d.logs.slice(-10))}
    <div class="betbox">
      <div class="row between"><b>Mon pari · ${MARKETS[mk].short}</b><span class="small muted">calcul instantané</span></div>
      <div class="form" style="margin-top:8px">
        <div><label>Bookmaker</label><select id="mbook"><option value="winamax_fr">Winamax</option><option value="betclic_fr">Betclic</option></select></div>
        <div><label>Côté</label><select id="mside"><option value="over">Plus de</option><option value="under">Moins de</option></select></div>
        <div><label>Ligne</label><input type="number" inputmode="decimal" step="0.5" id="mline" value="${lineRef}"></div>
        <div><label>Cote</label><input type="number" inputmode="decimal" step="0.01" id="modds" placeholder="1.85"></div>
        <div><label>Mise (€)</label><input type="number" inputmode="decimal" step="0.5" id="mstake" placeholder="conseillée"></div>
      </div>
      <div id="mres" class="small" style="margin-top:8px"></div>
      <button class="btn primary scan-btn" id="mjournal" style="margin-top:10px">+ Ajouter au journal</button>
    </div>
    <h3>Cotes</h3>${offersBlock}
    <h3>Probabilités par ligne (modèle seul)</h3>
    <div class="scroll"><table><thead><tr><th>Ligne</th><th>P(Over)</th><th>Cote juste</th><th>P(Under)</th><th>Cote juste</th><th>10 dern.</th></tr></thead><tbody>${ladder}</tbody></table></div>
    <div class="note">Une cote est « value » si elle est <b>supérieure à la cote juste</b>.</div>
  </div>`;

  // --- Derniers matchs ---
  const recent = d.logs.slice(-10).reverse().map((l) => `<tr><td>${l.d.slice(6, 8)}/${l.d.slice(4, 6)}</td><td>${l.home ? "vs" : "@"} ${esc(teamAbbr(d, l.opp))}</td><td>${Math.round(l.min)}</td><td><b>${l.pts}</b></td><td>${l.reb}</td><td>${l.ast}</td><td>${l.fg3m}/${l.fg3a}</td><td>${l.stl}</td><td>${l.blk}</td><td>${l.pts + l.reb + l.ast}</td></tr>`).join("");

  // --- Tuiles de projection (lecture rapide) ---
  const TILE_KEYS = ["pts", "reb", "ast", "fg3m", "pra", "stl", "blk"];
  const tiles = TILE_KEYS.map((k) => {
    const sp2 = proj.stats[k];
    const ref = sp2.season ?? (prior ? prior[k] : null);
    const diff = ref ? sp2.mean / ref - 1 : null;
    const cls = diff == null ? "" : diff > 0.04 ? "up" : diff < -0.04 ? "down" : "";
    return `<button class="tile ${k === playerState.market ? "on" : ""}" data-tile="${k}">
      <span class="tl">${MARKETS[k].short}</span><b class="num">${f1(sp2.mean)}</b>
      <span class="tr ${cls}">${diff == null ? "&nbsp;" : `${diff >= 0 ? "▲" : "▼"} moy. ${f1(ref)}`}</span></button>`;
  }).join("");

  const acc = (id, title, html, sub = "") => `<details class="acc" data-acc="${id}"${playerState.open.has(id) ? " open" : ""}>
    <summary><div class="grow"><b>${title}</b>${sub ? `<div class="small muted">${sub}</div>` : ""}</div><span class="chev" aria-hidden="true"></span></summary>
    <div class="acc-body">${html}</div></details>`;

  $app.innerHTML = `${back}
    <div class="card phead">
      ${img(d.player.headshot)}
      <div class="grow"><div class="name">${esc(name)}${statusBadge(inj?.status)}</div>
      <div class="muted small">${esc(d.player.pos || "")} · ${esc(d.teamName)} ${d.home ? "vs" : "@"} ${esc(d.oppName)}</div>
      <div class="muted small">${parisDay(g.date)} · ${parisTime(g.date)} · <b style="color:#fff">${f1(proj.minutesUsed)} min</b> projetées</div>
      ${inj ? `<div class="small" style="color:#ffb4b6">${esc(inj.status)} ${esc(inj.detail || "")}</div>` : ""}
      </div>
    </div>
    <div class="tiles">${tiles}</div>
    <button class="btn ai-btn" data-ai>🧠 Analyse IA avec Claude</button>
    ${bestCard}
    ${marketCard}
    ${acc("minutes", "Minutes & contexte", minutesCard, [d.b2b && "back-to-back", d.injuries.missing?.length && `${d.injuries.missing.length} absent(s)`, `rythme ×${f2(proj.context.pace)}`].filter(Boolean).join(" · "))}
    ${acc("matchup", `Matchup défensif`, `<div class="scroll">${matchup}</div>`, `${esc(d.oppName)} face aux ${grp}`)}
    ${acc("stats", "Statistiques détaillées", `<div class="scroll"><table>
      <thead><tr><th></th><th>Saison passée</th><th>Saison (${d.logs.length} m.)</th><th>10 derniers</th><th>Projection</th></tr></thead>
      <tbody>${rows}${shoot}</tbody></table></div>
      ${d.logs.length < 5 ? `<div class="note warn">Début de saison : peu de matchs, la projection s'appuie aussi sur la saison passée.</div>` : ""}`, "saison, 10 derniers, saison passée")}
    ${acc("logs", "10 derniers matchs", recent ? `<div class="scroll"><table><thead><tr><th>Date</th><th>Adv.</th><th>Min</th><th>Pts</th><th>Reb</th><th>PD</th><th>3pts</th><th>Int</th><th>Ctr</th><th>PRA</th></tr></thead><tbody>${recent}</tbody></table></div>` : `<div class="muted">Aucun match cette saison.</div>`)}`;

  $app.querySelectorAll("details[data-acc]").forEach((el) => el.addEventListener("toggle", () => { el.open ? playerState.open.add(el.dataset.acc) : playerState.open.delete(el.dataset.acc); }));
  $app.querySelector("[data-ai]").addEventListener("click", () => {
    const text = buildAIPrompt(d, proj, st, allPicks);
    // Tout se fait dans le geste de l'utilisateur (sinon iOS bloque l'ouverture / la copie).
    navigator.clipboard?.writeText(text).catch(() => {});
    window.open(`https://claude.ai/new?q=${encodeURIComponent(text)}`, "_blank", "noopener");
    toast("Message copié ✓ — colle-le si le champ est vide");
  });
  $app.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => {
    const [k, side, line] = b.dataset.goto.split("|");
    playerState.market = k; playerState.prefill = { side, line }; renderPlayer(st);
    document.querySelector(".betbox")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }));
  $app.querySelectorAll("[data-tile]").forEach((b) => b.addEventListener("click", () => {
    playerState.market = b.dataset.tile; renderPlayer(st);
    document.getElementById("mkt")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));

  // --- événements ---
  const range = document.getElementById("minr");
  range.addEventListener("input", () => { document.getElementById("minv").textContent = f1(+range.value); });
  range.addEventListener("change", () => { playerState.minutes = +range.value; renderPlayer(st); });
  document.getElementById("minreset")?.addEventListener("click", () => { playerState.minutes = null; renderPlayer(st); });
  $app.querySelectorAll("[data-mk]").forEach((b) => b.addEventListener("click", () => { playerState.market = b.dataset.mk; renderPlayer(st); }));
  // --- « Mon pari » : calcul en direct + ajout au journal ---
  const num = (id) => parseFloat(String(document.getElementById(id).value).replace(",", "."));
  const calc = () => {
    const line = num("mline"), odds = num("modds"), side = document.getElementById("mside").value;
    const out = document.getElementById("mres");
    if (!Number.isFinite(line)) { out.textContent = ""; return null; }
    const pl = probLine(sp.dist, line);
    const p = pl[side];
    const fair = p > 0 ? (1 - pl.push) / p : null;
    if (!Number.isFinite(odds) || odds <= 1) { out.innerHTML = `Proba modèle <b>${pct(p)}</b> · cote juste <b>${f2(fair)}</b> — saisis la cote pour voir la value.`; return { line, side, p, pl, odds: null }; }
    const e = p * odds + pl.push - 1;
    const k = kelly(p / (1 - pl.push || 1), odds);
    const stakeSug = Math.round(k * settings.bankroll * 10) / 10;
    const t = tag({ ev: e, pFinal: p });
    out.innerHTML = `Proba <b>${pct(p)}</b> · cote juste <b>${f2(fair)}</b> · <span class="chip ${t.cls}">${t.text} ${sgnPct(e)}</span> · mise conseillée <b>${eur(stakeSug || 0)}</b>`;
    document.getElementById("mstake").placeholder = stakeSug ? `conseillée ${stakeSug} €` : "1 €";
    return { line, side, p, pl, odds, e, stakeSug };
  };
  ["mline", "modds", "mside"].forEach((id) => document.getElementById(id).addEventListener("input", calc));
  if (playerState.prefill) {
    document.getElementById("mside").value = playerState.prefill.side;
    document.getElementById("mline").value = playerState.prefill.line;
    playerState.prefill = null;
  }
  calc();
  document.getElementById("mjournal").addEventListener("click", () => {
    const c = calc();
    if (!c || !c.odds) { toast("Saisis la ligne et la cote"); return; }
    const stake = num("mstake") || c.stakeSug || 1;
    try {
      journalAdd({
        market: mk, side: c.side, line: c.line, odds: c.odds, book: document.getElementById("mbook").value, stake,
        pModel: c.p, pFinal: c.p, ev: c.e, mean: sp.mean,
        eventId: g.id, season: g.season, gameDate: g.dateKey, matchup: `${g.away.abbr} @ ${g.home.abbr}`, playerId: d.player.id, player: d.player.name,
      });
      toast(`Ajouté au journal ✓ (mise ${eur(stake)})`);
    } catch (er) { toast(er.message); }
  });
  $app.querySelectorAll("[data-bet]").forEach((b) => b.addEventListener("click", () => addBet(JSON.parse(b.dataset.bet), d)));
  $app.querySelectorAll("[data-scan-odds]").forEach((b) => b.addEventListener("click", async () => {
    const force = !st.odds?.idle;
    st.odds = null;
    renderPlayer(st);
    st.odds = await getGameOdds(g, settings.oddsKey, { force, level: settings.scanLevel });
    if (location.hash.includes(`/player/${d.player.id}/`)) renderPlayer(st);
  }));
}

// ---------- Message pour l'analyse IA (Claude) ----------
function buildAIPrompt(d, proj, st, picks) {
  const g = d.game;
  const r1 = (x) => (x == null || !Number.isFinite(x) ? "–" : (Math.round(x * 10) / 10).toString());
  const season = averages(d.logs);
  const l10 = averages(d.logs.slice(-10));
  const prior = d.prior ? averages(d.prior) : null;
  const keys = ["pts", "reb", "ast", "fg3m", "stl", "blk", "pra", "pr", "pa", "ra"];
  const projLines = keys.map((k) => {
    const s = proj.stats[k];
    return `- ${MARKETS[k].label} : projection ${r1(s.mean)} (médiane ${s.median}, 50 % entre ${s.p25} et ${s.p75}) · saison ${r1(season[k])} · 10 derniers ${r1(l10[k])}${prior ? ` · saison passée ${r1(prior[k])}` : ""}`;
  }).join("\n");
  const F = d.opp.factors, R = d.opp.ranks;
  const grp = GROUP_LABEL[d.player.group] || "joueurs";
  const fx = (k) => `${((F[k] ?? 1) - 1) >= 0 ? "+" : ""}${Math.round(((F[k] ?? 1) - 1) * 100)} %${R[k] ? ` (${R[k]}e/${d.opp.nTeams} plus généreuse)` : ""}`;
  const prof = shotProfile(d.logs.length >= 3 ? d.logs : [...(d.prior || []), ...d.logs]);
  const logs = d.logs.slice(-10).reverse().map((l) => `${l.d.slice(6, 8)}/${l.d.slice(4, 6)} ${l.home ? "vs" : "@"} ${teamAbbr(d, l.opp)} : ${Math.round(l.min)} min, ${l.pts} pts, ${l.reb} reb, ${l.ast} pd, ${l.fg3m}/${l.fg3a} à 3 pts, ${l.stl} int, ${l.blk} ctr`).join("\n");
  const odds = picks.filter((p) => SHOWN_BOOKS.has(p.book)).sort((a, b) => b.ev - a.ev).slice(0, 12)
    .map((p) => `- ${p.bookLabel} · ${p.label} ${p.side === "over" ? "Over" : "Under"} ${p.line} @ ${p.odds.toFixed(2)} → proba estimée ${Math.round(p.pFinal * 100)} %, cote juste ${p.fair ? p.fair.toFixed(2) : "–"}, value ${p.ev >= 0 ? "+" : ""}${Math.round(p.ev * 100)} %`).join("\n");
  const inj = d.injuries.missing?.length ? d.injuries.missing.map((x) => `${x.name} (${r1(x.mpg)} min/m)`).join(", ") : "aucun absent notable de la rotation";
  const m = proj.minutes;
  return `Tu es un analyste expert en paris NBA (props joueurs). Analyse le match à venir de ${d.player.name} et propose les meilleurs paris chez Winamax ou Betclic.

RÉPONDS EXACTEMENT AVEC CE GABARIT (en français, lecture sur téléphone) :
- Aucune phrase d'introduction ni de conclusion, aucun paragraphe.
- Chaque ligne fait au plus ~12 mots. Remplace ce qui est entre <>.
- 1 à 3 paris conseillés maximum, classés du meilleur au moins bon.
- Si aucune cote n'est fournie, la « cote » = cote minimale à exiger (≥).

**🏆 VERDICT :** <le pari n°1 en une ligne>

**🎯 PARIS CONSEILLÉS**

**1. <Marché> <Over/Under> <ligne>** · <Winamax|Betclic> @ <cote>
📊 <proba> % · <⭐ de 1 à 5> · mise <x> %
💡 <raison principale>

**2. …** (même format)

**⛔ À ÉVITER**
- <pari> — <raison>

**📋 EN BREF**
- ⏱️ Minutes : <…>
- 🛡️ Matchup : <…>
- 📈 Forme : <…>
- ⚠️ Risque n°1 : <…>
- 🔎 Info récente : <uniquement si une news (blessure, compo) change l'analyse, sinon supprime la ligne>

Vérifie si possible les dernières infos (blessures, compo). N'invente aucune donnée.

MATCH : ${d.teamName} ${d.home ? "reçoit" : "à"} ${d.oppName} — ${parisDay(g.date)} ${parisTime(g.date)} (heure de Paris)
Écart prévu : ${d.spread == null ? "inconnu" : `${d.spread > 0 ? "+" : ""}${d.spread} pour ${d.teamName}`} · Total : ${g.total ?? "inconnu"}
Back-to-back : ${d.b2b ? "oui" : "non"} (adversaire : ${d.oppB2b ? "oui" : "non"}) · Rythme attendu ×${proj.context.pace.toFixed(2)}

JOUEUR : ${d.player.name} (${d.player.pos || "?"}, ${grp})${d.playerInjury ? ` — statut : ${d.playerInjury.status} ${d.playerInjury.detail || ""}` : ""}
Minutes projetées : ${r1(proj.minutesUsed)} (saison ${r1(m.season)}, 10 derniers ${r1(m.l10)}${m.prior ? `, saison passée ${r1(m.prior)}` : ""})${m.adjustments.length ? ` · ajustements : ${m.adjustments.map((a) => `${a.label} ${a.delta >= 0 ? "+" : ""}${r1(a.delta)}`).join(", ")}` : ""}
Absents dans son équipe : ${inj}
Matchs joués cette saison : ${d.logs.length}

PROJECTIONS DU MODÈLE :
${projLines}

MATCHUP — ${d.oppName} face aux ${grp} (par minute, vs moyenne de la ligue, ${d.opp.games} matchs) :
- Paniers à 2 pts ${fx("fg2m")} · à 3 pts ${fx("fg3m")} · lancers ${fx("ftm")}
- Points ${fx("pts")} · rebonds ${fx("reb")} · passes ${fx("ast")} · interceptions ${fx("stl")} · contres ${fx("blk")}
- Profil du joueur : ${Math.round(prof.two * 100)} % de ses points à 2 pts, ${Math.round(prof.three * 100)} % à 3 pts, ${Math.round(prof.ft * 100)} % aux lancers

10 DERNIERS MATCHS :
${logs || "aucun cette saison"}

COTES WINAMAX / BETCLIC :
${odds || "non scannées — propose les lignes et cotes minimales à viser"}`;
}

function teamAbbr(d, id) {
  if (d.game.home.id === id) return d.game.home.abbr;
  if (d.game.away.id === id) return d.game.away.abbr;
  return d.teamsAbbr?.[id] || "";
}

function scanButton(label = "Scanner les cotes Winamax / Betclic") {
  return settings.oddsKey
    ? `<button class="btn primary scan-btn" data-scan-odds>📡 ${label}</button><div class="small muted center" style="margin-top:6px">≈${scanCost()} crédits max pour tout le match · ${oddsQuota()?.remaining ? `${oddsQuota().remaining} restants` : "500/mois"}</div>`
    : `<a class="btn scan-btn" href="#/settings">Ajouter ma clé de cotes pour scanner</a>`;
}

function oddsStatus(o) {
  if (!o) return "";
  if (o.idle) return `<div class="muted small" style="margin-bottom:10px">Projections et stats ci-dessous (gratuites). Scanne les cotes seulement si le joueur t'intéresse.</div>${scanButton()}`;
  if (o.available) {
    const fr = o.frBooks?.length ? o.frBooks.map((b) => BOOK_LABEL[b] || b).join(", ") : null;
    return `<div class="note">Cotes ${o.cached ? "en cache" : "à jour"} (${new Date(o.fetchedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })})
      · ${fr ? esc(fr) : "lignes de référence (cotes Winamax/Betclic non fournies par la source)"}${o.quota?.remaining ? ` · ${o.quota.remaining} crédits restants` : ""}
      <button class="btn sm" data-scan-odds style="margin-left:6px">↻ Rafraîchir</button></div>`;
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
      <div class="small muted">${esc(p.bookLabel)} · proba ${pct(p.pFinal)} (modèle ${pct(p.pModel)}${p.pMarket != null ? `, marché ${pct(p.pMarket)}` : ""}) · cote juste ${f2(p.fair)}${hit}</div>
      ${stake > 0 ? `<div class="small muted">Mise conseillée : ${eur(stake)} (Kelly ¼, bankroll ${eur(settings.bankroll)})</div>` : ""}
    </div>
    <div class="center"><div class="odds num">${f2(p.odds)}</div><button class="btn sm" data-bet='${esc(JSON.stringify(bet))}'>+ Journal</button></div>
  </div>`;
}

async function addBet(b, d) {
  const stake = prompt(`Mise en € pour ${MARKETS[b.market].label} ${b.side === "over" ? "Over" : "Under"} ${b.line} @ ${b.odds} ?`, String(b.stake || 1));
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

// ---------- Top value du jour (liste complète) ----------
const valueState = { sort: "ev" };

async function viewValue(token) {
  const today = etKey();
  const scope = `day-${today}`;
  $app.innerHTML = `<div class="section-title"><b>Value du jour</b><span class="muted small" id="vsub"></span></div>
    <div class="card">
      <div class="row wrap between">
        <span class="small muted">Winamax & Betclic</span>
        <button class="btn primary sm" id="scanAll">${settings.oddsKey ? "📡 Scanner les cotes" : "Ajouter ma clé"}</button>
      </div>
      <div class="small muted" style="margin-top:6px">≈${scanCost()} crédits max par match (niveau « ${SCAN_LEVELS[settings.scanLevel]?.label || "Essentiel"} »), puis 10 min de cache.</div>
    </div>
    <div class="tabs"><button data-sort="ev" class="${valueState.sort === "ev" ? "on" : ""}">Meilleure value</button><button data-sort="p" class="${valueState.sort === "p" ? "on" : ""}">Plus probables</button><button data-sort="odds" class="${valueState.sort === "odds" ? "on" : ""}">Meilleure cote</button></div>
    <div id="picks" class="card">${loader()}</div>`;
  const show = (res) => {
    const el = document.getElementById("picks");
    if (!el) return;
    document.getElementById("vsub").textContent = res ? ago(res.at) : "";
    if (!res || res.mode !== "odds") { el.innerHTML = `<div class="empty">${settings.oddsKey ? "Touche « Scanner les cotes » pour comparer Winamax et Betclic à nos projections." : "Ajoute ta clé The Odds API dans ⚙︎ Réglages pour comparer les cotes."}</div>`; return; }
    let list = res.picks.filter((p) => p.ev >= 0);
    if (valueState.sort === "ev") list = list.filter((p) => p.ev > 0).sort((a, b) => b.ev - a.ev);
    if (valueState.sort === "p") list.sort((a, b) => b.pFinal - a.pFinal);
    if (valueState.sort === "odds") list = list.filter((p) => p.ev > 0).sort((a, b) => b.odds - a.odds);
    el.innerHTML = list.length
      ? list.slice(0, 40).map(topRow).join("") + (diagLines(res).length ? `<details class="mini"><summary>Détail du scan</summary><div class="small muted">${diagLines(res).map(esc).join("<br>")}</div></details>` : "")
      : scanResultsHTML(res, 20);
  };
  $app.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => { valueState.sort = b.dataset.sort; viewValue(token); }));
  const run = async () => {
    if (!settings.oddsKey) { location.hash = "#/settings"; return; }
    const btn = document.getElementById("scanAll");
    btn.disabled = true;
    try {
      const games = (await getDay(today))?.games || [];
      const res = await topValue(scope, games, { oddsKey: settings.oddsKey, wModel: settings.wModel, level: settings.scanLevel, force: !!cachedTop(scope), onProgress: (i, n) => { document.getElementById("vsub").textContent = `match ${i}/${n}…`; } });
      if (!stale(token)) show(res);
    } catch (e) { document.getElementById("picks").innerHTML = errorBox(e); } finally { btn.disabled = false; }
  };
  document.getElementById("scanAll").addEventListener("click", run);
  const c = cachedTop(scope);
  show(c && c.mode === "odds" ? c : null); // jamais de scan automatique
}

// ---------- Journal ----------
const J_TAB_KEY = "astaria-journal-tab";
const J_DONE = ["won", "lost", "push", "void"];
const J_LABEL = { pending: "En cours", won: "Gagné", lost: "Perdu", push: "Remboursé", void: "Annulé" };
const betProfit = (b) => (b.status === "won" ? b.stake * (b.odds - 1) : b.status === "lost" ? -b.stake : 0);
const sEur = (x) => (!Number.isFinite(x) ? "–" : `${x > 0.004 ? "+" : x < -0.004 ? "−" : ""}${eur(Math.abs(Math.round(x * 100) / 100))}`);
const betDayKey = (b) => b.gameDate || etKey(new Date(b.settledAt || b.createdAt));
const dayLong = (k) => keyToDate(k).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const dayShort = (k) => `${k.slice(6, 8)}/${k.slice(4, 6)}`;
const initials = (name) => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const jState = { combine: false, sel: new Set() };
const legIcon = (st) => ({ won: "✓", lost: "✗", push: "↺", void: "–", pending: "•" }[st] || "•");
const legLine = (l) => `<div class="jleg ${l.status}"><span class="jleg-i">${legIcon(l.status)}</span><div class="grow ell">${l.kind === "team" ? `<b>${esc(l.label)}</b>${l.resultText ? ` <span class="muted">(${l.resultText})</span>` : ""}` : `<b>${esc(l.player)}</b> · ${esc(MARKETS[l.market]?.short || l.market)} ${l.side === "under" ? "Moins" : "Plus"} ${l.line}${l.result != null ? ` <span class="muted">(${l.result})</span>` : ""}`}</div><span class="num">${f2(l.odds)}</span></div>`;
const betTitle = (b) => b.kind === "team" ? esc(b.label) : betTitle0(b);
const betTitle0 = (b) => `${esc(MARKETS[b.market]?.label || b.market)} · ${b.side === "under" ? "Moins de" : "Plus de"} ${b.line}`;

// Courbe du profit cumulé (SVG fait main).
function profitCurve(done) {
  if (done.length < 2) return `<div class="jchart-empty"><div class="jchart-ghost" aria-hidden="true"></div><div class="small muted">La courbe apparaîtra dès ${done.length ? "le 2ᵉ pari réglé" : "2 paris réglés"}.</div></div>`;
  const W = 320, H = 156, L = 44, R = 12, T = 14, B = 22;
  const ys = [0];
  for (const b of done) ys.push(ys[ys.length - 1] + betProfit(b));
  let lo = Math.min(0, ...ys), hi = Math.max(0, ...ys);
  if (hi - lo < 1) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.1; hi += pad; lo -= pad;
  const n = ys.length - 1;
  const X = (i) => L + (i * (W - L - R)) / n;
  const Y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const pts = ys.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
  const line = `M${pts.join("L")}`;
  const y0 = Y(0).toFixed(1);
  const area = `${line}L${X(n).toFixed(1)},${y0}L${X(0).toFixed(1)},${y0}Z`;
  const last = ys[n], top = Math.max(...ys), bot = Math.min(...ys);
  const tick = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v) >= 100 ? Math.round(Math.abs(v)) : String(Math.round(Math.abs(v) * 10) / 10).replace(".", ",")}`;
  const yTicks = [...new Set([top, 0, bot].map((v) => Math.round(v * 10) / 10))]
    .filter((v, i, a) => !a.some((w, j) => j < i && Math.abs(Y(w) - Y(v)) < 12))
    .map((v) => `<text x="${L - 8}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end">${v === 0 ? "0 €" : tick(v)}</text>${v !== 0 ? `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="jgrid"/>` : ""}`).join("");
  const d0 = betDayKey(done[0]), d1 = betDayKey(done[n - 1]);
  const lx = X(n), ly = Y(last);
  return `<svg class="jchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Profit cumulé : ${esc(sEur(last))} après ${n} paris">
    <defs>
      <clipPath id="jcUp"><rect x="0" y="0" width="${W}" height="${y0}"/></clipPath>
      <clipPath id="jcDn"><rect x="0" y="${y0}" width="${W}" height="${H}"/></clipPath>
    </defs>
    ${yTicks}
    <line x1="${L}" x2="${W - R}" y1="${y0}" y2="${y0}" class="jzero"/>
    <path d="${area}" class="jarea up" clip-path="url(#jcUp)"/><path d="${area}" class="jarea dn" clip-path="url(#jcDn)"/>
    <path d="${line}" class="jline up" clip-path="url(#jcUp)"/><path d="${line}" class="jline dn" clip-path="url(#jcDn)"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4.5" class="jdot ${last >= 0 ? "up" : "dn"}"/>
    <text x="${L}" y="${H - 5}" text-anchor="start">${dayShort(d0)}</text>
    <text x="${W - R}" y="${H - 5}" text-anchor="end">${dayShort(d1)}</text>
    <text x="${(L + W - R) / 2}" y="${H - 5}" text-anchor="middle">${n} paris</text>
  </svg>`;
}

// Barres horizontales : profit par clé (marché / bookmaker).
function profitBars(done, keyOf, labelOf) {
  const m = new Map();
  for (const b of done) { const k = keyOf(b); const r = m.get(k) || { p: 0, n: 0 }; r.p += betProfit(b); r.n++; m.set(k, r); }
  const rows = [...m.entries()].sort((a, b) => b[1].p - a[1].p);
  if (!rows.length) return `<div class="small muted">Pas encore de pari réglé.</div>`;
  const max = Math.max(...rows.map(([, r]) => Math.abs(r.p)), 1);
  return rows.map(([k, r]) => `<div class="jbar"><div class="jbar-l"><b class="ell">${esc(labelOf(k))}</b><span>${r.n} pari${r.n > 1 ? "s" : ""}</span></div>
    <div class="jbar-t"><i class="${r.p >= 0 ? "up" : "dn"}" style="width:${Math.max(3, (Math.abs(r.p) / max) * 100).toFixed(1)}%"></i></div>
    <b class="jbar-v num ${r.p > 0 ? "up" : r.p < 0 ? "down" : ""}">${sEur(r.p)}</b></div>`).join("");
}

function betEditBox(b) {
  if (b.type === "combo") return `<div class="editbox" id="edit-${b.id}" hidden><div class="form">
    <div><label>Mise (€)</label><input type="number" inputmode="decimal" step="0.5" data-f="stake" value="${b.stake}"></div>
    <div><label>Cote du combiné</label><input type="number" inputmode="decimal" step="0.01" data-f="odds" value="${b.odds}"></div>
  </div><button class="btn primary scan-btn" data-save="${b.id}" style="margin-top:10px">Enregistrer</button></div>`;
  return `<div class="editbox" id="edit-${b.id}" hidden><div class="form">
    <div><label>Mise (€)</label><input type="number" inputmode="decimal" step="0.5" data-f="stake" value="${b.stake}"></div>
    <div><label>Cote</label><input type="number" inputmode="decimal" step="0.01" data-f="odds" value="${b.odds}"></div>
    <div><label>Ligne</label><input type="number" inputmode="decimal" step="0.5" data-f="line" value="${b.line}"></div>
    <div><label>Côté</label><select data-f="side"><option value="over"${b.side === "over" ? " selected" : ""}>Plus de</option><option value="under"${b.side === "under" ? " selected" : ""}>Moins de</option></select></div>
    <div style="grid-column:1/-1"><label>Bookmaker</label><select data-f="book"><option value="winamax_fr"${b.book === "winamax_fr" ? " selected" : ""}>Winamax</option><option value="betclic_fr"${b.book === "betclic_fr" ? " selected" : ""}>Betclic</option></select></div>
  </div><button class="btn primary scan-btn" data-save="${b.id}" style="margin-top:10px">Enregistrer</button></div>`;
}

function comboCard(b) {
  const sameGame = new Set(b.legs.map((l) => l.eventId)).size < b.legs.length;
  return `<div class="card jbet jcombo">
    <div class="row jbet-head">
      <div class="jav combo">🔗</div>
      <div class="grow"><div class="jbet-name ell">Combiné · ${b.legs.length} sélections</div><div class="small muted ell">${esc(b.matchup || "")}${b.book && b.book !== "mixed" ? ` · ${esc(BOOK_LABEL[b.book] || b.book)}` : ""}</div></div>
      <div class="jodds num">${f2(b.odds)}</div>
    </div>
    <div class="jlegs">${b.legs.map(legLine).join("")}</div>
    ${b.pFinal != null ? `<div class="small muted" style="margin:6px 2px 0">Proba estimée du combiné : <b>${pct(b.pFinal)}</b>${sameGame ? " · ⚠️ sélections du même match, corrélées" : ""}</div>` : sameGame ? `<div class="small muted" style="margin:6px 2px 0">⚠️ Sélections du même match : résultats corrélés</div>` : ""}
    <div class="jstats"><div><span>Mise</span><b class="num">${eur(b.stake)}</b></div><div><span>Gain potentiel</span><b class="num up">+${eur(b.stake * (b.odds - 1))}</b></div><div><span>Retour</span><b class="num">${eur(b.stake * b.odds)}</b></div></div>
    <div class="jact">
      <button class="jbtn won" data-set="${b.id}|won">✓ Gagné</button><button class="jbtn lost" data-set="${b.id}|lost">✗ Perdu</button><button class="jbtn" data-uncombo="${b.id}">Défaire</button>
      <button class="jbtn ico" data-edit="${b.id}" aria-label="Modifier">✎</button><button class="jbtn ico" data-del="${b.id}" aria-label="Supprimer">✕</button>
    </div>
    ${betEditBox(b)}
  </div>`;
}

function pendingCard(b) {
  if (b.type === "combo") return comboCard(b);
  if (jState.combine) {
    const on = jState.sel.has(b.id);
    return `<button class="card jbet jpick${on ? " on" : ""}" data-pick="${b.id}">
      <span class="jcheck" aria-hidden="true">${on ? "✓" : ""}</span>
      <span class="grow" style="text-align:left"><span class="jbet-name ell" style="display:block">${esc(b.player)}</span>
      <span class="small muted">${esc(MARKETS[b.market]?.short || b.market)} ${b.side === "under" ? "Moins" : "Plus"} ${b.line} · ${esc(BOOK_LABEL[b.book] || b.book)}${b.matchup ? ` · ${esc(b.matchup)}` : ""}</span></span>
      <span class="jodds num">${f2(b.odds)}</span></button>`;
  }
  const meta = [b.matchup && esc(b.matchup), b.gameDate && dayShort(b.gameDate), esc(BOOK_LABEL[b.book] || b.book)].filter(Boolean).join(" · ");
  return `<div class="card jbet">
    <div class="row jbet-head">
      <div class="jav">${esc(initials(b.player))}</div>
      <div class="grow"><div class="jbet-name ell">${esc(b.player)}</div><div class="small muted ell">${meta}</div></div>
      <div class="jodds num">${f2(b.odds)}</div>
    </div>
    ${b.check ? `<div class="note warn" style="margin:8px 0">Score final ${esc(b.resultText || "")} : défaite. ${esc(b.player)} a-t-il possédé une avance de ${Math.abs(b.line)} pts ? Règle-le à la main.</div>` : ""}
    <div class="jbet-pick">${betTitle(b)}${b.pFinal != null ? ` <span class="chip">proba ${pct(b.pFinal)}</span>` : ""}</div>
    <div class="jstats"><div><span>Mise</span><b class="num">${eur(b.stake)}</b></div><div><span>Gain potentiel</span><b class="num up">+${eur(b.stake * (b.odds - 1))}</b></div><div><span>Retour</span><b class="num">${eur(b.stake * b.odds)}</b></div></div>
    <div class="jact">
      <button class="jbtn won" data-set="${b.id}|won">✓ Gagné</button><button class="jbtn lost" data-set="${b.id}|lost">✗ Perdu</button><button class="jbtn" data-set="${b.id}|push" aria-label="Remboursé">↺ Remb.</button>
      <button class="jbtn ico" data-edit="${b.id}" aria-label="Modifier">✎</button><button class="jbtn ico" data-del="${b.id}" aria-label="Supprimer">✕</button>
    </div>
    ${betEditBox(b)}
  </div>`;
}

function settledRow(b) {
  const p = betProfit(b);
  if (b.type === "combo") {
    const icon = { won: "✓", lost: "✗", push: "↺", void: "–" }[b.status] || "";
    return `<details class="jrow ${b.status}"><summary>
      <div class="jav st">${icon}</div>
      <div class="grow"><div class="jbet-name ell">🔗 Combiné · ${b.legs.length} sélections</div>
        <div class="small ell muted">${b.legs.map((l) => `${legIcon(l.status)} ${esc(l.player.split(" ").pop())}`).join(" · ")}</div></div>
      <div class="jrow-r"><b class="num ${p > 0 ? "up" : p < 0 ? "down" : "muted"}">${b.status === "push" || b.status === "void" ? J_LABEL[b.status] : sEur(p)}</b><span class="small muted num">${eur(b.stake)} @ ${f2(b.odds)}</span></div>
    </summary>
    <div class="jrow-body">
      <div class="jlegs">${b.legs.map(legLine).join("")}</div>
      ${b.origOdds ? `<div class="small muted">Cote recalculée (sélection remboursée) : ${f2(b.origOdds)} → ${f2(b.odds)}</div>` : ""}
      <div class="jact">
        ${b.manual ? `<button class="jbtn" data-set="${b.id}|pending">↶ Annuler le règlement</button>` : `<span class="small muted grow">Réglé automatiquement</span>`}
        <button class="jbtn ico" data-edit="${b.id}" aria-label="Modifier">✎</button><button class="jbtn ico" data-del="${b.id}" aria-label="Supprimer">✕</button>
      </div>
      ${betEditBox(b)}
    </div></details>`;
  }
  const unit = MARKETS[b.market]?.parts?.length === 1 ? ` ${MARKETS[b.market].short.toLowerCase()}` : "";
  const res = b.kind === "team" ? (b.resultText ? `score <b>${b.resultText}</b>` : "réglé à la main") : b.result != null ? `<b>${b.result}${esc(unit)}</b> vs ${b.line}` : b.status === "void" ? "n'a pas joué" : "réglé à la main";
  const icon = { won: "✓", lost: "✗", push: "↺", void: "–" }[b.status] || "";
  return `<details class="jrow ${b.status}"><summary>
      <div class="jav st">${icon}</div>
      <div class="grow"><div class="jbet-name ell">${esc(b.player)}</div>
        <div class="small ell">${b.kind === "team" ? esc(b.label) : `${esc(MARKETS[b.market]?.short || b.market)} ${b.side === "under" ? "Moins" : "Plus"} ${b.line}`} · <span class="muted">${res}</span></div></div>
      <div class="jrow-r"><b class="num ${p > 0 ? "up" : p < 0 ? "down" : "muted"}">${b.status === "push" || b.status === "void" ? J_LABEL[b.status] : sEur(p)}</b><span class="small muted num">${eur(b.stake)} @ ${f2(b.odds)}</span></div>
    </summary>
    <div class="jrow-body">
      <div class="small muted">${betTitle(b)}${b.matchup ? ` · ${esc(b.matchup)}` : ""} · ${esc(BOOK_LABEL[b.book] || b.book)}${b.pFinal != null ? ` · proba ${pct(b.pFinal)}` : ""}</div>
      <div class="jact">
        ${b.manual ? `<button class="jbtn" data-set="${b.id}|pending">↶ Annuler le règlement</button>` : `<span class="small muted grow">Réglé automatiquement</span>`}
        <button class="jbtn ico" data-edit="${b.id}" aria-label="Modifier">✎</button><button class="jbtn ico" data-del="${b.id}" aria-label="Supprimer">✕</button>
      </div>
      ${betEditBox(b)}
    </div></details>`;
}

async function viewJournal(token, keep) {
  const sc = document.getElementById("scroller");
  const y = keep ? sc?.scrollTop || 0 : 0;
  if (!keep) $app.innerHTML = `<div class="section-title"><b>Journal des paris</b></div>${loader()}`;
  let bets;
  try { bets = await settleAll(); } catch (e) { if (!stale(token)) $app.innerHTML = `<div class="section-title"><b>Journal des paris</b></div>${errorBox(e)}`; return; }
  if (stale(token)) return;
  const pending = bets.filter((b) => b.status === "pending");
  const done = bets.filter((b) => J_DONE.includes(b.status))
    .sort((a, b) => betDayKey(a).localeCompare(betDayKey(b)) || String(a.settledAt || a.createdAt).localeCompare(String(b.settledAt || b.createdAt)));
  const settled = done.filter((b) => b.status !== "void");
  const staked = settled.reduce((s, b) => s + b.stake, 0);
  const profit = settled.reduce((s, b) => s + betProfit(b), 0);
  const decided = settled.filter((b) => b.status !== "push");
  const wonBets = decided.filter((b) => b.status === "won");
  const totalWon = wonBets.reduce((s, b) => s + b.stake * (b.odds - 1), 0);
  const withP = decided.filter((b) => b.pFinal != null);
  const expectedRate = withP.length ? withP.reduce((t, b) => t + b.pFinal, 0) / withP.length : null;
  const avgOdds = decided.length ? decided.reduce((s, b) => s + b.odds, 0) / decided.length : null;
  const atStake = pending.reduce((t, b) => t + b.stake, 0);
  const potential = pending.reduce((t, b) => t + b.stake * (b.odds - 1), 0);
  // Calibration : proba annoncée vs taux de réussite réel
  const buckets = [[0, 0.5], [0.5, 0.55], [0.55, 0.6], [0.6, 0.65], [0.65, 0.7], [0.7, 1.01]].map(([a, b]) => {
    const xs = decided.filter((x) => x.pFinal != null && x.pFinal >= a && x.pFinal < b);
    return { a, b, n: xs.length, hit: xs.filter((x) => x.status === "won").length, exp: xs.reduce((s, x) => s + x.pFinal, 0) };
  }).filter((x) => x.n);
  let tab = "";
  try { tab = localStorage.getItem(J_TAB_KEY) || ""; } catch {}
  if (tab !== "pending" && tab !== "settled") tab = pending.length || !done.length ? "pending" : "settled";
  // Terminés : groupés par jour, du plus récent au plus ancien.
  const days = new Map();
  for (const b of [...done].reverse()) { const k = betDayKey(b); if (!days.has(k)) days.set(k, []); days.get(k).push(b); }
  const settledHTML = days.size ? [...days.entries()].map(([k, xs]) => {
    const p = xs.reduce((s, b) => s + betProfit(b), 0);
    return `<div class="jday"><span>${dayLong(k)}</span><b class="num ${p > 0 ? "up" : p < 0 ? "down" : ""}">${sEur(p)}</b></div><div class="card jlist">${xs.map(settledRow).join("")}</div>`;
  }).join("") : `<div class="card empty">Aucun pari terminé pour l'instant.<br><span class="small">Ils s'afficheront ici une fois réglés.</span></div>`;
  const kpi = (val, lbl, sub, cls = "") => `<div class="kpi jkpi"><b class="num ${cls}">${val}</b><span>${lbl}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
  $app.innerHTML = `<div class="section-title"><b>Journal des paris</b><span class="small muted">${bets.length} pari${bets.length > 1 ? "s" : ""}</span></div>
    <div class="kpis jkpis">
      ${kpi(settled.length ? sEur(profit) : "–", "Profit total", `${settled.length} réglé${settled.length > 1 ? "s" : ""} · ${eur(staked)} misés`, profit > 0 ? "up" : profit < 0 ? "down" : "")}
      ${kpi(wonBets.length ? `+${eur(totalWon)}` : "–", "Total gagné", `${wonBets.length} pari${wonBets.length > 1 ? "s" : ""} gagnant${wonBets.length > 1 ? "s" : ""}`, wonBets.length ? "up" : "")}
      ${kpi(staked ? sgnPct(profit / staked) : "–", "ROI", "profit ÷ mises", staked ? (profit >= 0 ? "up" : "down") : "")}
      ${kpi(decided.length ? pct(wonBets.length / decided.length) : "–", "Réussite", decided.length ? `${wonBets.length}/${decided.length}${expectedRate != null ? ` · attendu ${pct(expectedRate)}` : ""}` : "aucun pari décidé")}
      ${kpi(eur(atStake), "En jeu", pending.length ? `${pending.length} en cours · +${eur(potential)} pot.` : "rien en cours")}
      ${kpi(avgOdds ? f2(avgOdds) : "–", "Cote moyenne", "paris décidés")}
    </div>
    <div class="card jcurve">
      <div class="row between"><h2 style="margin:0">Évolution du profit</h2>${settled.length ? `<span class="chip ${profit > 0 ? "good" : profit < 0 ? "bad" : ""} num">${sEur(profit)}</span>` : ""}</div>
      ${profitCurve(done)}
      ${done.length ? `<div class="jsplit-h"><span class="small muted">Profit par</span><div class="jmini" role="tablist"><button class="on" data-split="market">Marché</button><button data-split="book">Bookmaker</button></div></div>
      <div data-split-p="market">${profitBars(done, (b) => b.market, (k) => MARKETS[k]?.label || TEAM_MARKETS[k] || (k === "combo" ? "Combinés" : k))}</div>
      <div data-split-p="book" hidden>${profitBars(done, (b) => b.book, (k) => BOOK_LABEL[k] || (k === "mixed" ? "Plusieurs books" : k))}</div>` : ""}
    </div>
    <div class="jtabs" role="tablist">
      <button role="tab" data-jtab="pending" class="${tab === "pending" ? "on" : ""}">En cours <span>${pending.length}</span></button>
      <button role="tab" data-jtab="settled" class="${tab === "settled" ? "on" : ""}">Terminés <span>${done.length}</span></button>
    </div>
    <section data-jpanel="pending"${tab === "pending" ? "" : " hidden"}>
      <details class="acc jfree"${bets.length ? "" : " open"}><summary><div class="jplus">+</div><div class="grow"><b>Pari libre</b><div class="small muted">n'importe quel pari, réglé à la main</div></div><span class="chev" aria-hidden="true"></span></summary>
        <div class="acc-body"><div class="form">
          <div style="grid-column:1/-1"><label>Joueur</label><input type="text" id="fplayer" placeholder="Jayson Tatum"></div>
          <div style="grid-column:1/-1"><label>Match (facultatif)</label><input type="text" id="fmatch" placeholder="BKN @ BOS"></div>
          <div><label>Marché</label><select id="fmarket">${Object.entries(MARKETS).map(([k, m]) => `<option value="${k}">${m.label}</option>`).join("")}</select></div>
          <div><label>Côté</label><select id="fside"><option value="over">Plus de</option><option value="under">Moins de</option></select></div>
          <div><label>Ligne</label><input type="number" inputmode="decimal" step="0.5" id="fline"></div>
          <div><label>Cote</label><input type="number" inputmode="decimal" step="0.01" id="fodds"></div>
          <div><label>Bookmaker</label><select id="fbook"><option value="winamax_fr">Winamax</option><option value="betclic_fr">Betclic</option></select></div>
          <div><label>Mise (€)</label><input type="number" inputmode="decimal" step="0.5" id="fstake" value="1"></div>
        </div><button class="btn primary scan-btn" id="freeAdd" style="margin-top:10px">+ Ajouter au journal</button></div></details>
      ${pending.filter((b) => b.type !== "combo").length >= 2 ? `<div class="row between jcombo-bar-top">
        ${jState.combine ? `<span class="small"><b>Mode combiné</b> · touche les paris à combiner</span><button class="btn sm" data-combine="off">Annuler</button>`
          : `<span class="small muted">${pending.length} en cours</span><button class="btn sm" data-combine="on">🔗 Faire un combiné</button>`}</div>` : ""}
      ${pending.length ? (jState.combine ? pending.filter((b) => b.type !== "combo") : pending).map(pendingCard).join("") : `<div class="card empty">Aucun pari en cours.<br><span class="small">Ajoute-en depuis une fiche joueur (« + Journal ») ou via « Pari libre ».</span></div>`}
    </section>
    <section data-jpanel="settled"${tab === "settled" ? "" : " hidden"}>${settledHTML}</section>
    ${buckets.length ? `<details class="acc"><summary><div class="grow"><b>Fiabilité du modèle</b><div class="small muted">proba annoncée vs réussite réelle</div></div><span class="chev" aria-hidden="true"></span></summary><div class="acc-body"><table><thead><tr><th>Proba annoncée</th><th>Paris</th><th>Attendu</th><th>Réel</th></tr></thead><tbody>
      ${buckets.map((x) => `<tr><td>${(x.a * 100).toFixed(0)}–${Math.min(100, x.b * 100).toFixed(0)} %</td><td>${x.n}</td><td>${pct(x.exp / x.n)}</td><td>${pct(x.hit / x.n)}</td></tr>`).join("")}
      </tbody></table><div class="note">Si « Réel » reste nettement sous « Attendu » sur 100+ paris, le modèle est trop optimiste : baisse le poids du modèle dans ⚙︎ Réglages.</div></div></details>` : ""}
    ${jState.combine ? (() => {
      const sel = pending.filter((b) => jState.sel.has(b.id));
      const odds = sel.reduce((t, b) => t * b.odds, 1);
      const p = sel.length && sel.every((b) => b.pFinal != null) ? sel.reduce((t, b) => t * b.pFinal, 1) : null;
      return `<div class="combobar">
        <div class="row between"><b>${sel.length} sélection${sel.length > 1 ? "s" : ""}</b><span>cote <b class="num">${sel.length ? f2(odds) : "–"}</b>${p != null ? ` · proba ${pct(p)}` : ""}</span></div>
        <div class="row" style="margin-top:8px"><input type="number" inputmode="decimal" step="0.5" id="cstake" placeholder="Mise (€)" style="flex:1">
        <button class="btn primary" id="cmake"${sel.length < 2 ? " disabled" : ""}>Créer le combiné</button></div>
        ${sel.length >= 2 ? `<div class="small" id="cgain" data-odds="${odds}" style="margin-top:6px;opacity:.85">Saisis ta mise pour voir le gain potentiel</div>` : ""}
      </div>`;
    })() : ""}
    <div class="card jsave">
      <div class="row"><button class="btn grow" id="jexp">⬇︎ Exporter</button><label class="btn grow" style="margin:0;color:inherit;font-size:15px">⬆︎ Importer<input type="file" id="jimp" accept="application/json" hidden></label></div>
      <p class="small muted" style="margin:10px 2px 0">Réglage automatique dès que la feuille de match est intégrée (toutes les 30 min). Le journal reste sur cet appareil : exporte-le pour le sauvegarder.</p>
    </div>`;
  if (keep && sc) sc.scrollTop = y;
  const again = () => viewJournal(routeToken, true);
  $app.querySelectorAll("[data-jtab]").forEach((b) => b.addEventListener("click", () => {
    const t = b.dataset.jtab;
    try { localStorage.setItem(J_TAB_KEY, t); } catch {}
    $app.querySelectorAll("[data-jtab]").forEach((x) => x.classList.toggle("on", x === b));
    $app.querySelectorAll("[data-jpanel]").forEach((p) => { p.hidden = p.dataset.jpanel !== t; });
  }));
  $app.querySelectorAll("[data-split]").forEach((b) => b.addEventListener("click", () => {
    $app.querySelectorAll("[data-split]").forEach((x) => x.classList.toggle("on", x === b));
    $app.querySelectorAll("[data-split-p]").forEach((p) => { p.hidden = p.dataset.splitP !== b.dataset.split; });
  }));
  document.getElementById("jexp").addEventListener("click", exportBets);
  document.getElementById("jimp").addEventListener("change", async (e) => {
    try { const n = await importBets(e.target.files[0]); toast(`${n} pari(s) importé(s)`); again(); } catch (er) { toast(er.message); }
  });
  $app.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
    const box = document.getElementById(`edit-${b.dataset.edit}`);
    box.hidden = !box.hidden;
    if (!box.hidden) box.querySelector("input").focus();
  }));
  $app.querySelectorAll("[data-save]").forEach((b) => b.addEventListener("click", () => {
    const box = document.getElementById(`edit-${b.dataset.save}`);
    const val = (f) => box.querySelector(`[data-f="${f}"]`).value;
    const n = (f) => parseFloat(String(val(f)).replace(",", "."));
    updateBet(b.dataset.save, { stake: n("stake"), odds: n("odds"), line: n("line"), side: val("side"), book: val("book") });
    toast("Pari modifié ✓");
    again();
  }));
  $app.querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", () => {
    const [id, st] = b.dataset.set.split("|");
    setStatus(id, st);
    toast(st === "pending" ? "Remis en cours" : `Réglé : ${J_LABEL[st]}`);
    again();
  }));
  document.getElementById("freeAdd")?.addEventListener("click", () => {
    const v = (id) => document.getElementById(id).value.trim();
    const n = (id) => parseFloat(v(id).replace(",", "."));
    if (!v("fplayer") || !Number.isFinite(n("fline")) || !(n("fodds") > 1)) { toast("Joueur, ligne et cote obligatoires"); return; }
    try {
      journalAdd({ eventId: "manual", season: 0, gameDate: etKey(), matchup: v("fmatch"), playerId: "manual", player: v("fplayer"),
        market: v("fmarket"), side: v("fside"), line: n("fline"), odds: n("fodds"), book: v("fbook"), stake: n("fstake") || 1 });
      try { localStorage.setItem(J_TAB_KEY, "pending"); } catch {}
      toast("Ajouté ✓"); again();
    } catch (e) { toast(e.message); }
  });
  $app.querySelectorAll("[data-combine]").forEach((b) => b.addEventListener("click", () => {
    jState.combine = b.dataset.combine === "on"; jState.sel.clear(); again();
  }));
  $app.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.pick;
    jState.sel.has(id) ? jState.sel.delete(id) : jState.sel.add(id);
    again();
  }));
  document.getElementById("cstake")?.addEventListener("input", (e) => {
    const g = document.getElementById("cgain");
    const st = parseFloat(String(e.target.value).replace(",", "."));
    if (g) g.textContent = st > 0 ? `Gain potentiel : +${eur(st * (+g.dataset.odds - 1))} · retour ${eur(st * +g.dataset.odds)}` : "Saisis ta mise pour voir le gain potentiel";
  });
  document.getElementById("cmake")?.addEventListener("click", () => {
    try {
      const st = parseFloat(String(document.getElementById("cstake").value).replace(",", "."));
      const c = createCombo([...jState.sel], st);
      jState.combine = false; jState.sel.clear();
      toast(`Combiné créé ✓ cote ${f2(c.odds)}`); again();
    } catch (e) { toast(e.message); }
  });
  $app.querySelectorAll("[data-uncombo]").forEach((b) => b.addEventListener("click", () => {
    if (!confirm("Défaire ce combiné en paris simples ?")) return;
    splitCombo(b.dataset.uncombo); toast("Combiné défait"); again();
  }));
  $app.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
    if (!confirm("Supprimer ce pari ?")) return;
    deleteBet(b.dataset.del);
    again();
  }));
}

// ---------- Réglages ----------
async function viewSettings(token) {
  $app.innerHTML = `<div class="section-title"><b>Réglages</b></div>
    <div class="card form">
      <div><label>Bankroll (€)</label><input type="number" id="bk" value="${settings.bankroll}" min="1"></div>
      <div><label>Poids du modèle vs marché : <b id="wmv">${Math.round(settings.wModel * 100)} %</b></label><input type="range" id="wm" min="0.2" max="1" step="0.05" value="${settings.wModel}"></div>
      <div><label>Clé The Odds API</label><input type="password" id="ok" value="${esc(settings.oddsKey)}" autocomplete="off" placeholder="colle ta clé ici"></div>
    </div>
    <div class="row wrap" style="margin-top:-2px"><button class="btn sm" id="testk">Tester la clé (gratuit)</button><span class="small" id="testkr"></span></div>
    <div class="card">
      <label>Cotes scannées</label>
      <select id="lvl">${Object.entries(SCAN_LEVELS).map(([k, v]) => `<option value="${k}"${settings.scanLevel === k ? " selected" : ""}>${v.label} — ≈${v.cost} crédits/match max</option>`).join("")}</select>
      <div class="small muted" style="margin-top:6px">Essentiel = PTS, REB, PD, 3PTS, P+R+PD. Avec 500 crédits/mois (≈16/jour), reste sur Essentiel et scanne seulement les matchs qui t'intéressent.</div>
      <div class="row wrap" style="margin-top:10px"><button class="btn sm" id="cov">Vérifier Winamax/Betclic (≈1 crédit)</button></div>
      <div class="small" id="covr" style="margin-top:6px"></div>
    </div>
    <div class="note">Clé gratuite sur <a href="https://the-odds-api.com/#get-access" target="_blank" rel="noopener" style="text-decoration:underline">the-odds-api.com</a> (500 crédits/mois). Elle reste sur cet appareil. Sans clé, tu peux saisir tes cotes à la main.</div>
    <div class="note">Le poids du modèle règle la confiance accordée à nos projections face au consensus des bookmakers (DraftKings, FanDuel, Pinnacle… servent de référence, sans être affichés). 60 % est un bon départ ; ajuste selon la fiabilité mesurée dans le Journal.</div>
    <div class="card" id="dstatus">${loader("État des données…")}</div>`;
  document.getElementById("bk").addEventListener("change", (e) => { settings.bankroll = Math.max(1, +e.target.value || 100); saveSettings(); toast("Enregistré"); });
  const wm = document.getElementById("wm");
  wm.addEventListener("input", () => { document.getElementById("wmv").textContent = `${Math.round(wm.value * 100)} %`; });
  wm.addEventListener("change", () => { settings.wModel = +wm.value; saveSettings(); toast("Enregistré"); });
  document.getElementById("ok").addEventListener("change", (e) => { settings.oddsKey = e.target.value.trim(); saveSettings(); toast("Clé enregistrée"); });
  document.getElementById("lvl").addEventListener("change", (e) => { settings.scanLevel = e.target.value; saveSettings(); toast("Enregistré"); });
  document.getElementById("cov").addEventListener("click", async (e) => {
    const out = document.getElementById("covr");
    if (!settings.oddsKey) { out.textContent = "Ajoute d'abord ta clé."; return; }
    e.target.disabled = true; out.textContent = "Vérification…";
    try { out.textContent = (await checkCoverage(settings.oddsKey)).msg; }
    catch (er) { out.textContent = er.status === 401 ? "Clé invalide" : `Erreur : ${er.message}`; } finally { e.target.disabled = false; }
  });
  document.getElementById("testk").addEventListener("click", async (e) => {
    const k = document.getElementById("ok").value.trim();
    if (k !== settings.oddsKey) { settings.oddsKey = k; saveSettings(); }
    const out = document.getElementById("testkr");
    if (!k) { out.textContent = "Colle d'abord ta clé."; return; }
    e.target.disabled = true; out.textContent = "Vérification…";
    try { const r = await testKey(k); out.textContent = r.msg; out.className = `small ${r.ok ? "up" : "down"}`; }
    catch { out.textContent = "Connexion impossible"; } finally { e.target.disabled = false; }
  });
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

// ---------- Comportement d'app native ----------
// Pas de zoom (pincement iOS, double-tap), pas de menu en appui long sur les éléments d'interface.
["gesturestart", "gesturechange", "gestureend"].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
let lastTouch = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouch < 300 && !e.target.closest("input, select, textarea")) e.preventDefault();
  lastTouch = now;
}, { passive: false });
document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

// ---------- PWA ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((r) => {
      r.update().catch(() => {});
      // Revérifie à chaque retour sur l'app (iOS garde l'app ouverte en arrière-plan).
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") r.update().catch(() => {}); });
    }).catch(() => {});
  });
  // Nouvelle version installée → on recharge une fois pour l'afficher.
  let reloaded = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
}
(function installHint() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let dismissed = false;
  try { dismissed = localStorage.getItem("astaria-install-hint") === "0"; } catch {}
  if (standalone || !ios || dismissed) return;
  const el = document.getElementById("installHint");
  el.className = "install";
  el.innerHTML = `<div class="card"><img src="icons/apple-touch-icon.png" alt=""><div class="grow">Installe l'app : touche <b>Partager</b> <span aria-hidden="true">⬆︎</span> puis <b>« Sur l'écran d'accueil »</b>.</div><button aria-label="Fermer">✕</button></div>`;
  el.querySelector("button").addEventListener("click", () => { el.remove(); try { localStorage.setItem("astaria-install-hint", "0"); } catch {} });
})();
