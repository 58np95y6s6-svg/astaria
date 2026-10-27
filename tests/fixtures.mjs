// Fausses réponses ESPN / The Odds API pour les tests.
const TEAMS = {
  1: { id: "1", abbreviation: "BOS", displayName: "Boston Celtics", shortDisplayName: "Celtics" },
  2: { id: "2", abbreviation: "LAL", displayName: "Los Angeles Lakers", shortDisplayName: "Lakers" },
  3: { id: "3", abbreviation: "NYK", displayName: "New York Knicks", shortDisplayName: "Knicks" },
};
const roster = {
  1: [["101", "Jayson Tatum", "SF"], ["102", "Jrue Holiday", "PG"], ["103", "Kristaps Porzingis", "C"]],
  2: [["201", "LeBron James", "SF"], ["202", "Austin Reaves", "SG"], ["203", "Anthony Davis", "C"]],
  3: [["301", "Jalen Brunson", "PG"], ["302", "Mikal Bridges", "SF"], ["303", "Karl-Anthony Towns", "C"]],
};
const LABELS = ["MIN", "PTS", "FG", "3PT", "FT", "REB", "AST", "TO", "STL", "BLK", "OREB", "DREB", "PF", "+/-"];
function line(seed, min) {
  const r = (n) => Math.floor(((seed * 9301 + n * 49297) % 233280) / 233280 * 1000) % 7;
  const fg3m = 1 + (r(1) % 4), fg3a = fg3m + 3, fg2m = 4 + r(2), fg2a = fg2m + 6, ftm = 2 + (r(3) % 4), fta = ftm + 1;
  const pts = 2 * fg2m + 3 * fg3m + ftm;
  return [String(min), String(pts), `${fg2m + fg3m}-${fg2a + fg3a}`, `${fg3m}-${fg3a}`, `${ftm}-${fta}`, String(5 + r(4)), String(3 + r(5)), "2", "1", String(r(6) % 3), "1", String(4 + r(4)), "2", "+3"];
}
const GAMES = [
  { id: "9001", date: "2026-10-22T23:30Z", key: "20261022", home: "1", away: "2", done: true },
  { id: "9002", date: "2026-10-24T23:30Z", key: "20261024", home: "3", away: "1", done: true },
  { id: "9003", date: "2026-10-25T23:30Z", key: "20261025", home: "2", away: "3", done: true },
  { id: "9004", date: "2026-10-27T23:30Z", key: "20261027", home: "2", away: "1", done: false },
];
const comp = (g) => ({
  id: g.id, date: g.date,
  competitors: [
    { homeAway: "home", id: g.home, team: { ...TEAMS[g.home], logo: "" }, score: g.done ? "110" : "0", records: [{ summary: "2-1" }] },
    { homeAway: "away", id: g.away, team: { ...TEAMS[g.away], logo: "" }, score: g.done ? "104" : "0", records: [{ summary: "1-2" }] },
  ],
  odds: [{ details: "BOS -4.5", overUnder: 228.5, spread: 4.5 }],
  status: { type: { state: g.done ? "post" : "pre", completed: g.done, shortDetail: g.done ? "Final" : "7:30 PM" } },
});
function summary(g) {
  const box = g.done ? [g.home, g.away].map((t, ti) => ({
    team: TEAMS[t],
    statistics: [{ labels: LABELS, athletes: roster[t].map(([id, name, pos], i) => ({
      starter: true, didNotPlay: false,
      athlete: { id, displayName: name, position: { abbreviation: pos }, headshot: { href: "" } },
      stats: line(+id + +g.id, 30 + i * 2),
    })).concat([{ didNotPlay: true, athlete: { id: "999", displayName: "DNP Guy" }, stats: [] }]) }],
  })) : [];
  return {
    header: { id: g.id, competitions: [comp(g)] },
    boxscore: { players: box },
    injuries: g.id === "9004" ? [{ team: { id: "2" }, injuries: [{ athlete: { id: "203", displayName: "Anthony Davis" }, status: "Out", details: { type: "Knee" } }] }] : [],
    pickcenter: [{ details: "BOS -4.5", overUnder: 228.5, spread: 4.5 }],
  };
}

import fs from "node:fs";
import path from "node:path";

// dataDir : dossier servi à l'adresse https://data.test/ (simule raw.githubusercontent.com).
export function installMockFetch(dataDir) {
globalThis.fetch = async (input) => {
  const u = new URL(String(input));
  if (u.hostname === "data.test") {
    const f = path.join(dataDir, decodeURIComponent(u.pathname));
    if (!fs.existsSync(f)) return new Response("404", { status: 404 });
    return new Response(fs.readFileSync(f), { status: 200, headers: { "content-type": "application/json" } });
  }
  const ok = (body, headers = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
  if (u.pathname.endsWith("/scoreboard")) {
    const d = u.searchParams.get("dates");
    return ok({ events: GAMES.filter((g) => g.key === d).map((g) => ({ id: g.id, date: g.date, season: { type: 2 }, status: comp(g).status, competitions: [comp(g)] })) });
  }
  if (u.pathname.endsWith("/summary")) return ok(summary(GAMES.find((g) => g.id === u.searchParams.get("event"))));
  if (/\/teams\/(\d+)\/roster$/.test(u.pathname)) {
    const t = u.pathname.match(/teams\/(\d+)/)[1];
    return ok({ athletes: roster[t].map(([id, name, pos]) => ({ id, displayName: name, position: { abbreviation: pos }, jersey: "0" })) });
  }
  if (u.pathname.includes("/gamelog")) {
    return ok({ labels: ["MIN", "FG", "FG%", "3PT", "3P%", "FT", "FT%", "REB", "AST", "BLK", "STL", "PF", "TO", "PTS"],
      seasonTypes: [{ displayName: "2025-26 Regular Season", categories: [{ events: Array.from({ length: 40 }, () => ({ stats: ["34", "9-19", "47", "3-8", "37", "4-5", "80", "7", "6", "1", "1", "2", "3", "25"] })) }] }] });
  }
  if (u.hostname === "api.the-odds-api.com") {
    if (u.pathname.endsWith("/events")) return ok([{ id: "oddsev1", home_team: "Los Angeles Lakers", away_team: "Boston Celtics", commence_time: "2026-10-27T23:30:00Z" }]);
    return ok({ bookmakers: [
      { key: "winamax_fr", title: "Winamax", markets: [{ key: "player_points", outcomes: [
        { name: "Over", description: "Jayson Tatum", price: 2.1, point: 18.5 }, { name: "Under", description: "Jayson Tatum", price: 1.7, point: 18.5 }] }] },
      { key: "pinnacle", title: "Pinnacle", markets: [{ key: "player_points", outcomes: [
        { name: "Over", description: "Jayson Tatum", price: 1.8, point: 18.5 }, { name: "Under", description: "Jayson Tatum", price: 2.0, point: 18.5 }] }] },
    ] }, { "x-requests-remaining": "490" });
  }
  throw new Error("URL non simulée : " + u);
};
}
