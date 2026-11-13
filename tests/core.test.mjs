import test from "node:test";
import assert from "node:assert/strict";
import { corrected, parseDuration, fmtDuration, fmtPace, parseWorkoutText, parseImportParams, factorFor } from "../js/core.js";

test("marche sur tapis : 0,8 km montre → 1,2 km (facteur 1,5), allure recalculée", () => {
  const c = corrected({ type: "walk_treadmill", watchKm: 0.8, durationSec: 25 * 60 });
  assert.equal(c.km, 1.2);
  assert.equal(c.factor, 1.5);
  assert.equal(fmtPace(c.paceSec), "20'50 /km");
  assert.equal(c.speed, 2.9);
});

test("distance réelle saisie (tapis) : prime sur le facteur", () => {
  const c = corrected({ type: "walk_treadmill", watchKm: 0.8, realKm: 1.3, durationSec: 1800 });
  assert.equal(c.km, 1.3);
  assert.equal(c.source, "réel");
});

test("facteur réglable par activité", () => {
  assert.equal(factorFor("walk_treadmill", { factors: { walk_treadmill: 1.42 } }), 1.42);
  assert.equal(corrected({ type: "run_out", watchKm: 5, durationSec: 1500 }).km, 5);
});

test("durées", () => {
  assert.equal(parseDuration("25:12"), 1512);
  assert.equal(parseDuration("0:25:12"), 1512);
  assert.equal(parseDuration("1:05:03"), 3903);
  assert.equal(parseDuration("1h05"), 3900);
  assert.equal(parseDuration("25 min 12 s"), 1512);
  assert.equal(fmtDuration(3903), "1:05:03");
  assert.equal(fmtDuration(1512), "25:12");
});

test("lecture d'une capture de l'app Forme (français, grille libellé / valeur)", () => {
  const txt = `15:32\nMarche en intérieur\nOuvert\n17:02-17:28\nDétails de l'entraînement\nTemps d'entraînement\nDistance\n0:25:12\n0,80KM\nCalories actives\nCalories totales\n96KCAL\n131KCAL\nFréquence cardiaque moyenne\n104BPM`;
  const r = parseWorkoutText(txt);
  assert.equal(r.type, "walk_treadmill");
  assert.equal(r.durationSec, 1512);
  assert.equal(r.watchKm, 0.8);
  assert.equal(r.kcalActive, 96);
  assert.equal(r.kcalTotal, 131);
  assert.equal(r.hrAvg, 104);
});

test("import par lien (Raccourci)", () => {
  const r = parseImportParams("type=walk_treadmill&min=25.2&km=0,8&kcal=96");
  assert.deepEqual([r.type, r.durationSec, r.watchKm, r.kcalActive], ["walk_treadmill", 1512, 0.8, 96]);
});

test("capture lue en deux colonnes par l'OCR (« Calories actives Calories totales » / « 96KCAL 131KCAL »)", () => {
  const txt = `Marche en intérieur\nTemps d'entraînement Distance\n0:25:12 0,80KM\nCalories actives Calories totales\n96KCAL 131KCAL\nFréquence cardiaque moyenne Allure moyenne\n104BPM 31'30'/KM`;
  const r = parseWorkoutText(txt);
  assert.deepEqual([r.type, r.durationSec, r.watchKm, r.kcalActive, r.kcalTotal, r.hrAvg], ["walk_treadmill", 1512, 0.8, 96, 131, 104]);
});

test("carte « Exercices » du Résumé Santé (vraie capture, OCR brut)", () => {
  const txt = `07:26 ::7-@\nRésumé s 27\nPoints clés\nD Exercices\nVous avez parcouru 2,9 kilomètres lors de\nvotre dernier exercice.\n. Marche\nAT  48min 255keal 2,9 km\nO Nombre de pas\nJusqu'ici, vous avez fait plus de pas que\nd'habitude.\n@ Aujourd'hui @ Moyenne\n4 547 pas 1 7 pas\n|\n00:00 07:00 00:00\nD Distance (marche et course)\nVous = eo ss etre\nenn aa @e8\nderni Résumé Partage Parcourir`;
  const r = parseWorkoutText(txt);
  assert.deepEqual([r.type, r.durationSec, r.watchKm, r.kcalActive], ["walk_treadmill", 48 * 60, 2.9, 255]);
  const c = corrected({ type: r.type, watchKm: r.watchKm, durationSec: r.durationSec });
  assert.equal(c.km, 4.35);
});

test("marche extérieure reste extérieure", () => {
  assert.equal(parseWorkoutText("Marche en extérieur\n1:02:00\n5,1 km").type, "walk_out");
});
