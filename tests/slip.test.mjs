import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseSlip } from "../js/slip.js";

const read = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

test("ticket Betclic (texte OCR réel) : 4 paris équipe + cote totale", () => {
  const r = parseSlip(read("ticket-betclic.txt"));
  assert.equal(r.book, "betclic_fr");
  assert.equal(r.totalOdds, 3.1);
  assert.deepEqual(r.legs.map((l) => [l.teamNick, l.type, l.x, l.odds]), [
    ["celtics", "lead", 18, 1.14], ["pistons", "spreadPlus", 10, 1.32], ["spurs", "spreadMinus", 11, 1.28], ["lakers", "lead", 18, 1.61],
  ]);
});

test("ticket Winamax : paris joueurs, solde ignoré, mise lue", () => {
  const players = { 8: { name: "Duncan Robinson", teamId: "8" }, 22: { name: "Jrue Holiday", teamId: "22" }, 1: { name: "Jayson Tatum", teamId: "2" } };
  const r = parseSlip(read("ticket-winamax.txt"), { players });
  assert.equal(r.book, "winamax_fr");
  assert.equal(r.totalOdds, 2.91);
  assert.equal(r.stake, 2.5);
  assert.deepEqual(r.legs.map((l) => [l.player, l.market, l.side, l.line, l.odds]), [
    ["Duncan Robinson", "pra", "over", 15.5, 1.5], ["Jrue Holiday", "ast", "over", 3.5, 1.94],
  ]);
});
