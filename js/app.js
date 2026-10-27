import { MARKETS, project, probLine, averages, shotProfile, valueOf } from "./model.js";
import { evaluate, tag, BOOK_LABEL, FR_BOOKS, SHOWN_BOOKS, normName } from "./value.js";
import { getDay, getGameData, teamRoster, teamContext, buildContext, getMeta, REPO_URL } from "./data.js";
import { getGameOdds, cachedGameOdds, quota as oddsQuota, testKey } from "./odds.js";
import { topValue, topMatchups, cachedTop } from "./picks.js";
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
  const def = { bankroll: 100, wModel: 0.6, oddsKey: "" };
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
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === nav));
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

function topSummary(res) {
  if (!res || res.mode !== "odds") return "Meilleurs matchups (gratuit) · scan des cotes à la demande";
  const pos = res.picks.filter((p) => p.ev > 0);
  return pos.length ? `${Math.min(5, pos.length)} paris · meilleur ${sgnPct(pos[0].ev)} · ${ago(res.at)}` : `Aucune value pour l'instant · ${ago(res.at)}`;
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
  const scanLabel = `Scanner les cotes (≈${pre * 10} crédits)`;
  const renderOdds = (res) => {
    sub.textContent = topSummary(res);
    const pos = res.picks.filter((p) => p.ev > 0);
    body.innerHTML = (pos.length ? pos.slice(0, 5).map(topRow).join("") : `<div class="empty">Aucune cote Winamax/Betclic avec de la value pour l'instant.</div>`)
      + (res.errors?.length ? `<div class="note">${res.errors.map(esc).join("<br>")}</div>` : "")
      + `<div class="row between acc-foot"><button class="link" data-scan>↻ Rescanner</button>${res.quota ? `<span class="small muted">${res.quota} crédits restants</span>` : ""}<a class="link" href="#/value">Tout voir ›</a></div>`;
    body.querySelector("[data-scan]").addEventListener("click", scan);
  };
  const renderMatchups = (res) => {
    body.innerHTML = `<div class="small muted" style="margin:2px 0 4px">Projections au-dessus de la moyenne grâce au matchup</div>`
      + (res.rows.length ? res.rows.slice(0, 5).map(matchupRow).join("") : `<div class="empty">Pas encore de projections pour ces matchs.</div>`)
      + `<div class="acc-foot">${settings.oddsKey ? `<button class="btn primary scan-btn" data-scan>📡 ${scanLabel}</button>` : `<a class="btn scan-btn" href="#/settings">Ajouter ma clé de cotes pour scanner</a>`}</div>`;
    body.querySelector("[data-scan]")?.addEventListener("click", scan);
  };
  async function scan() {
    body.innerHTML = loader("Scan des cotes Winamax / Betclic…");
    try {
      const res = await topValue(scope, games, { oddsKey: settings.oddsKey, wModel: settings.wModel, onProgress: (i, n) => { sub.textContent = `Scan du match ${i}/${n}…`; } });
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
    ${g.state === "pre" ? `<div id="gameTop"></div>` : ""}
    <div class="seg">
      ${[g.away, g.home].map((x) => `<button class="${x.id === tid ? "on" : ""}" data-team="${x.id}">${img(x.logo)}${esc(x.abbr || x.short)}</button>`).join("")}
    </div>
    <div class="chips">${chips}</div>
    ${inj.length ? `<div class="note"><b>Infirmerie :</b> ${inj.map((i) => `${esc(i.name)} (${esc(i.status)})`).join(", ")}</div>` : ""}
    ${rosterHtml}
    <div class="row wrap"><span class="muted small">Données : ${data.data.gamesTotal} matchs analysés${data.data.updatedAt ? `, mis à jour ${new Date(data.data.updatedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}` : ""}</span></div>`;
  $app.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { location.hash = `#/game/${g.id}/${b.dataset.team}`; }));
  mountTop("gameTop", `game-${g.id}`, [g], "Top 5 value du match");
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
  const oddsInfo = oddsStatus(st.odds);
  const bestCard = `<div class="card">
    <h2>Meilleurs paris</h2>
    ${st.odds == null ? loader("Récupération des cotes…") : ""}
    ${best.length ? `${best.map((p) => pickRow(p, d)).join("")}` : st.odds && !st.odds.idle ? `<div class="muted">Aucune value détectée${allPicks.length ? "" : " (pas de cotes)"}. Tu peux saisir une cote Winamax/Betclic dans un marché ci-dessous.</div>` : ""}
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
    }).join("")}</tbody></table></div>` : `<div class="muted small">Pas de cote reçue pour ce marché.</div>`;

  const tabs = Object.entries(MARKETS).map(([k, v]) => `<button data-mk="${k}" class="${k === mk ? "on" : ""}">${v.short}</button>`).join("");
  const marketCard = `<div class="card" id="mkt">
    <div class="tabs">${tabs}</div>
    <div class="row between"><h2 style="margin:6px 0">${MARKETS[mk].label}</h2><div class="center"><div class="odds num">${f1(sp.mean)}</div><div class="muted small">projection</div></div></div>
    <div class="small muted">Médiane ${sp.median} · 50 % de chances entre ${sp.p25} et ${sp.p75} · saison ${f1(sp.season)} · 10 derniers ${f1(sp.l10)}</div>
    ${spark(sp.l10Values, lineRef, d.logs.slice(-10))}
    <h3>Cotes</h3>${offersHtml}
    <h3>Probabilités par ligne (modèle seul)</h3>
    <div class="scroll"><table><thead><tr><th>Ligne</th><th>P(Over)</th><th>Cote juste</th><th>P(Under)</th><th>Cote juste</th><th>10 dern.</th></tr></thead><tbody>${ladder}</tbody></table></div>
    <div class="note">Une cote est « value » si elle est <b>supérieure à la cote juste</b>.</div>
    <h3>Saisir une cote Winamax / Betclic</h3>
    <div class="form">
      <div><label>Bookmaker</label><select id="mbook"><option value="winamax_fr">Winamax</option><option value="betclic_fr">Betclic</option></select></div>
      <div><label>Ligne</label><input type="number" step="0.5" id="mline" value="${lineRef}"></div>
      <div><label>Cote Over</label><input type="number" step="0.01" id="mover" placeholder="1.85"></div>
      <div><label>Cote Under</label><input type="number" step="0.01" id="munder" placeholder="1.85"></div>
      <div style="align-self:end"><button class="btn primary" id="madd">Calculer</button></div>
    </div>
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
  $app.querySelectorAll("[data-scan-odds]").forEach((b) => b.addEventListener("click", async () => {
    const force = !st.odds?.idle;
    st.odds = null;
    renderPlayer(st);
    st.odds = await getGameOdds(g, settings.oddsKey, { force });
    if (location.hash.includes(`/player/${d.player.id}/`)) renderPlayer(st);
  }));
}

function teamAbbr(d, id) {
  if (d.game.home.id === id) return d.game.home.abbr;
  if (d.game.away.id === id) return d.game.away.abbr;
  return d.teamsAbbr?.[id] || "";
}

function scanButton(label = "Scanner les cotes Winamax / Betclic") {
  return settings.oddsKey
    ? `<button class="btn primary scan-btn" data-scan-odds>📡 ${label}</button><div class="small muted center" style="margin-top:6px">≈10 crédits pour tout le match · ${oddsQuota()?.remaining ? `${oddsQuota().remaining} restants` : "500/mois"}</div>`
    : `<a class="btn scan-btn" href="#/settings">Ajouter ma clé de cotes pour scanner</a>`;
}

function oddsStatus(o) {
  if (!o) return "";
  if (o.idle) return `<div class="muted small" style="margin-bottom:10px">Projections et stats ci-dessous (gratuites). Scanne les cotes seulement si le joueur t'intéresse.</div>${scanButton()}`;
  if (o.available) {
    const fr = o.frBooks?.length ? o.frBooks.map((b) => BOOK_LABEL[b] || b).join(", ") : null;
    return `<div class="note">Cotes ${o.cached ? "en cache" : "à jour"} (${new Date(o.fetchedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })})
      · ${fr ? esc(fr) : "Winamax et Betclic n'ont pas encore publié de cotes joueurs sur ce match"}${o.quota?.remaining ? ` · ${o.quota.remaining} crédits restants` : ""}
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
      <div class="small muted" style="margin-top:6px">≈10 crédits par match, puis 10 min de cache.</div>
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
    el.innerHTML = (list.length ? list.slice(0, 40).map(topRow).join("") : `<div class="empty">Aucun pari ne passe les filtres.</div>`)
      + (res.errors?.length ? `<div class="note">${res.errors.map(esc).join("<br>")}</div>` : "");
  };
  $app.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => { valueState.sort = b.dataset.sort; viewValue(token); }));
  const run = async () => {
    if (!settings.oddsKey) { location.hash = "#/settings"; return; }
    const btn = document.getElementById("scanAll");
    btn.disabled = true;
    try {
      const games = (await getDay(today))?.games || [];
      const res = await topValue(scope, games, { oddsKey: settings.oddsKey, wModel: settings.wModel, onProgress: (i, n) => { document.getElementById("vsub").textContent = `match ${i}/${n}…`; } });
      if (!stale(token)) show(res);
    } catch (e) { document.getElementById("picks").innerHTML = errorBox(e); } finally { btn.disabled = false; }
  };
  document.getElementById("scanAll").addEventListener("click", run);
  const c = cachedTop(scope);
  show(c && c.mode === "odds" ? c : null); // jamais de scan automatique
}

// ---------- Journal ----------
async function viewJournal(token) {
  $app.innerHTML = `<div class="section-title"><b>Journal des paris</b></div>${loader()}`;
  let bets;
  try { bets = await settleAll(); } catch (e) { if (!stale(token)) $app.innerHTML = `<div class="section-title"><b>Journal des paris</b></div>${errorBox(e)}`; return; }
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
  $app.innerHTML = `<div class="section-title"><b>Journal des paris</b></div>
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
  $app.innerHTML = `<div class="section-title"><b>Réglages</b></div>
    <div class="card form">
      <div><label>Bankroll (unités)</label><input type="number" id="bk" value="${settings.bankroll}" min="1"></div>
      <div><label>Poids du modèle vs marché : <b id="wmv">${Math.round(settings.wModel * 100)} %</b></label><input type="range" id="wm" min="0.2" max="1" step="0.05" value="${settings.wModel}"></div>
      <div><label>Clé The Odds API</label><input type="password" id="ok" value="${esc(settings.oddsKey)}" autocomplete="off" placeholder="colle ta clé ici"></div>
    </div>
    <div class="row wrap" style="margin-top:-2px"><button class="btn sm" id="testk">Tester la clé (gratuit)</button><span class="small" id="testkr"></span></div>
    <div class="note">Clé gratuite sur <a href="https://the-odds-api.com/#get-access" target="_blank" rel="noopener" style="text-decoration:underline">the-odds-api.com</a> (500 crédits/mois, ≈10 par match ouvert). Elle reste sur cet appareil. Sans clé, tu peux saisir tes cotes à la main.</div>
    <div class="note">Le poids du modèle règle la confiance accordée à nos projections face au consensus des bookmakers (Pinnacle et Betfair servent de référence, sans être affichés). 60 % est un bon départ ; ajuste selon la fiabilité mesurée dans le Journal.</div>
    <div class="card" id="dstatus">${loader("État des données…")}</div>`;
  document.getElementById("bk").addEventListener("change", (e) => { settings.bankroll = Math.max(1, +e.target.value || 100); saveSettings(); toast("Enregistré"); });
  const wm = document.getElementById("wm");
  wm.addEventListener("input", () => { document.getElementById("wmv").textContent = `${Math.round(wm.value * 100)} %`; });
  wm.addEventListener("change", () => { settings.wModel = +wm.value; saveSettings(); toast("Enregistré"); });
  document.getElementById("ok").addEventListener("change", (e) => { settings.oddsKey = e.target.value.trim(); saveSettings(); toast("Clé enregistrée"); });
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

// ---------- PWA ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
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
