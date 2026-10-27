// Test de bout en bout : script de mise à jour (GitHub Actions) puis code du navigateur,
// avec de fausses réponses ESPN / The Odds API.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installMockFetch } from "./fixtures.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astaria-"));
process.env.DATA_DIR = dir;
globalThis.ASTARIA_DATA_BASE = "https://data.test/";
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k), key: (i) => [...store.keys()][i], get length() { return store.size; },
};
Object.defineProperty(globalThis.localStorage, "keys", { value: () => [...store.keys()] });
installMockFetch(dir);

test("pipeline complet", async () => {
  await import("../scripts/update.mjs");
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  assert.equal(meta.gamesTotal, 3);
  assert.ok(fs.existsSync(path.join(dir, "games/9004.json")), "match à venir préparé");
  assert.ok(fs.existsSync(path.join(dir, "prior/2026/101.json")), "saison précédente préparée");

  const data = await import("../js/data.js");
  const day = await data.getDay("20261027");
  assert.equal(day.games[0].id, "9004");

  const gd = await data.getGameData("9004");
  const bos = await data.teamRoster(gd, gd.game.home.id === "1" ? gd.game.home : gd.game.away);
  assert.equal(bos.length, 3);
  assert.equal(bos[0].gp, 2);
  const lal = await data.teamRoster(gd, gd.game.home);
  assert.equal(lal.find((p) => p.id === "203").status, "Out");

  const ctx = await data.buildContext(gd, "101", "1");
  assert.equal(ctx.logs.length, 2);
  assert.equal(ctx.player.group, "F");
  assert.equal(ctx.prior.length, 40);
  assert.equal(ctx.opp.games, 2);
  assert.equal(ctx.home, false);
  assert.equal(ctx.teamName, "Boston Celtics");

  const { project } = await import("../js/model.js");
  const proj = project(ctx);
  assert.ok(proj.stats.pts.mean > 10);

  const { getGameOdds } = await import("../js/odds.js");
  const o = await getGameOdds(gd.game, "test");
  assert.equal(o.available, true, JSON.stringify(o));
  assert.equal(o.players["jayson tatum"].markets.pts.length, 2);
  const again = await getGameOdds(gd.game, "test");
  assert.equal(again.cached, true, "2e ouverture = cache, pas de crédit consommé");
  assert.equal((await getGameOdds(gd.game, "")).reason, "no_key");

  const { evaluate } = await import("../js/value.js");
  const picks = evaluate("pts", proj.stats.pts, o.players["jayson tatum"].markets.pts);
  assert.ok(picks.length === 4);

  const j = await import("../js/journal.js");
  j.addBet({ eventId: "9002", season: 2027, playerId: "101", player: "Jayson Tatum", market: "pts", side: "over", line: 10.5, odds: 1.9, stake: 2 });
  j.addBet({ eventId: "9002", season: 2027, playerId: "999", player: "DNP Guy", market: "pts", side: "over", line: 0.5, odds: 1.9 });
  const bets = await j.settleAll();
  assert.equal(bets.find((b) => b.playerId === "101").status, "won");
  assert.equal(bets.find((b) => b.playerId === "999").status, "void");
});
