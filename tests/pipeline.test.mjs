// Test de bout en bout avec de fausses réponses ESPN / The Odds API.
import test from "node:test";
import assert from "node:assert/strict";

process.env.ASTARIA_MEMORY_STORE = "1";
process.env.ODDS_API_KEY = "test";

import { installMockFetch } from "./fixtures.mjs";
installMockFetch();

const call = async (mod, url, init) => {
  const { default: h } = await import(`../netlify/functions/${mod}.mjs`);
  const res = await h(new Request("https://x.test" + url, init));
  return { status: res.status, body: await res.json() };
};

test("pipeline complet", async () => {
  const up = await call("status", "/api/status", { method: "POST" });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.equal(up.body.gamesTotal, 3);

  const games = await call("games", "/api/games?date=20261027");
  assert.equal(games.body.games[0].id, "9004");

  const g = await call("game", "/api/game?id=9004");
  assert.equal(g.status, 200, JSON.stringify(g.body));
  const bos = g.body.teams["1"];
  assert.equal(bos.roster.length, 3);
  assert.equal(bos.roster[0].gp, 2);
  const lal = g.body.teams["2"];
  assert.equal(lal.roster.find((p) => p.id === "203").status, "Out");

  const p = await call("player", "/api/player?id=101&game=9004&team=1");
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal(p.body.logs.length, 2);
  assert.equal(p.body.player.group, "F");
  assert.ok(p.body.prior.length === 40);
  assert.ok(p.body.opp.games === 2);
  assert.equal(p.body.home, false);

  const reaves = await call("player", "/api/player?id=202&game=9004&team=2");
  assert.equal(reaves.body.b2b, false);
  assert.ok(reaves.body.injuries.missingUsage >= 0);

  const o = await call("odds", "/api/odds?game=9004");
  assert.equal(o.body.available, true, JSON.stringify(o.body));
  assert.ok(o.body.players["jayson tatum"].markets.pts.length === 2);

  const s = await call("scan", "/api/scan?game=9004");
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.ok(s.body.picks.length > 0);
  assert.equal(s.body.picks[0].player, "Jayson Tatum");
  // Le scan doit donner la même projection que la fiche joueur (même contexte, mêmes facteurs adversaire).
  const { project } = await import("../public/js/model.js");
  const d = p.body;
  const client = project({ logs: d.logs, prior: d.prior, factors: d.opp.factors, pace: d.pace, home: d.home, b2b: d.b2b, spread: d.spread, injuries: d.injuries });
  const sp = s.body.picks.find((x) => x.key === "pts");
  assert.ok(Math.abs(sp.mean - client.stats.pts.mean) < 1e-9, `${sp.mean} vs ${client.stats.pts.mean}`);

  const add = await call("journal", "/api/journal", { method: "POST", body: JSON.stringify({ eventId: "9002", season: 2027, playerId: "101", player: "Jayson Tatum", market: "pts", side: "over", line: 10.5, odds: 1.9, stake: 2 }), headers: { "content-type": "application/json" } });
  assert.equal(add.status, 200, JSON.stringify(add.body));
  const j = await call("journal", "/api/journal");
  assert.equal(j.body.bets[0].status, "won");
});
