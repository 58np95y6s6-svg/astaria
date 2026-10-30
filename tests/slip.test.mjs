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

test("ticket Betclic « Nom + de X » + MYCOMBI : groupe à cote unique, cote totale recalculée", async () => {
  const players = { 1: { name: "Tyrese Maxey", teamId: "20" }, 2: { name: "Ausar Thompson", teamId: "8" }, 3: { name: "Duncan Robinson", teamId: "8" } };
  const r = parseSlip(read("ticket-betclic-mycombi.txt"), { players });
  assert.equal(r.book, "betclic_fr");
  assert.equal(r.stake, 2.49);
  assert.equal(r.totalOdds, 4.4, "1,33 × 3,31 (la cote totale du ticket n'est pas lue)");
  assert.deepEqual(r.legs.map((l) => [l.player, l.market, l.line, l.odds, l.groupOdds]), [
    ["Tyrese Maxey", "pts", 19.5, 1.33, null],
    ["Ausar Thompson", "reb", 6.5, null, 3.31], ["Ausar Thompson", "pts", 9.5, null, 3.31], ["Duncan Robinson", "pts", 9.5, null, 3.31],
  ]);
  const { comboOutcome } = await import("../js/journal.js");
  const legs = r.legs.map((l) => ({ ...l, status: "won" }));
  assert.equal(comboOutcome(legs).odds, 4.4);
  legs[2].status = "lost";
  assert.equal(comboOutcome(legs).status, "lost", "une sélection de la MYCOMBI perdue → combiné perdu");
});
