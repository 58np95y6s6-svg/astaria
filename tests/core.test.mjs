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

import { parseSegments, segmentsKm, segmentsText } from "../js/core.js";
test("paliers de vitesse : « 5 min à 3,5 puis 40min à 6 »", () => {
  const segs = parseSegments("5 min à 3,5 puis 40min à 6");
  assert.deepEqual(segs, [{ min: 5, speed: 3.5 }, { min: 40, speed: 6 }]);
  assert.equal(Math.round(segmentsKm(segs) * 1000) / 1000, 4.292);
  assert.deepEqual(parseSegments("10' @ 4.5 km/h, 20 mn a 5,5km/h"), [{ min: 10, speed: 4.5 }, { min: 20, speed: 5.5 }]);
  assert.equal(segmentsText(segs), "5 min à 3,5 puis 40 min à 6");
  const c = corrected({ type: "walk_treadmill", watchKm: 2.9, durationSec: 45 * 60, segments: segs });
  assert.equal(c.km, 4.29);
  assert.equal(c.source, "paliers");
  // La distance réelle saisie prime toujours.
  assert.equal(corrected({ type: "walk_treadmill", watchKm: 2.9, realKm: 4, durationSec: 2700, segments: segs }).km, 4);
});

import { placesFor, pickFor, ratioText, nextChallenge, placeSVG, PLACES } from "../js/places.js";
test("comparaison à un lieu connu", () => {
  const list = placesFor(4.35);
  assert.ok(list.length >= 30, `${list.length} comparaisons`);
  assert.ok(list[0].ratio > 0.5 && list[0].ratio < 2.5, list[0].place.id);
  assert.ok(PLACES.length >= 50);
  assert.deepEqual(ratioText(4.35 / 0.00065, PLACES.find((p) => p.id === "baguette")), { big: (6692).toLocaleString("fr-FR"), line: "baguettes mises bout à bout" });
  assert.ok(pickFor(4.35, "a") && pickFor(4.35, "b"));
  assert.deepEqual(ratioText(4.35 / 3.337, PLACES.find((p) => p.id === "monaco")), { big: "1,3", line: "tour du circuit de Monaco" });
  assert.equal(ratioText(4.35 / 0.346, PLACES.find((p) => p.id === "foottour")).line, "tours de terrain de foot");
  assert.ok(PLACES.length >= 70);
  assert.deepEqual(ratioText(2.9 / 2.74, PLACES.find((p) => p.id === "goldengate")), { big: "1,1×", line: "le Golden Gate Bridge" });
  assert.deepEqual(ratioText(0.8, PLACES.find((p) => p.id === "wall")), { big: "80 %", line: "de la Grande Muraille de Chine" });
  assert.equal(ratioText(0.5, PLACES.find((p) => p.id === "centralpark")).line, "de Central Park");
  assert.equal(ratioText(0.5, PLACES.find((p) => p.id === "champs")).line, "des Champs-Élysées");
  assert.equal(nextChallenge(50).place.id, "tmb");
  for (const p of PLACES) assert.match(placeSVG(p, 0.4), /^<svg/);
});

import { spanSec } from "../js/core.js";
test("plage horaire « 17:02-17:28 » → début, fin, durée", () => {
  const r = parseWorkoutText("Marche en intérieur\n17:02-17:28\nDistance\n0,80KM");
  assert.deepEqual([r.startTime, r.endTime, r.durationSec], ["17:02", "17:28", 26 * 60]);
  const r2 = parseWorkoutText(`Marche en intérieur\n17:02-17:28\nTemps d'entraînement Distance\n0:25:12 0,80KM`);
  assert.equal(r2.durationSec, 1512); // la durée affichée prime
  assert.equal(spanSec("23:40", "00:10"), 1800);
});

import { foodFor, foodText, qty, periodRange, summarize, streaks, motivation, FOODS } from "../js/recap.js";
test("calories → nourriture", () => {
  const f = foodFor(255, "x", 3);
  assert.equal(f.length, 3);
  assert.equal(new Set(f.map((x) => x.f.e)).size, 3);
  const bm = FOODS.find((x) => x.id === "bigmac");
  assert.equal(foodText(bm, 255 / 503), "½ Big Mac");
  assert.equal(foodText(FOODS.find((x) => x.id === "croissant"), 2.2), "2 croissants");
  assert.equal(qty(1.3), "1,5");
  assert.ok(FOODS.length >= 25);
});
test("périodes, totaux, séries, motivation", () => {
  const now = new Date("2026-11-13T10:00:00"); // vendredi
  const w = periodRange("week", 0, now);
  assert.equal(w.start.getDay(), 1);
  assert.equal(w.start.getDate(), 9);
  assert.equal(periodRange("month", -1, now).start.getMonth(), 9);
  const d = (s) => new Date(s).toISOString();
  const list = [
    { id: 1, date: d("2026-11-13T07:00:00"), durationSec: 2700, kcalActive: 255 },
    { id: 2, date: d("2026-11-12T07:00:00"), durationSec: 2700, kcalActive: 250 },
    { id: 3, date: d("2026-11-11T07:00:00"), durationSec: 1800, kcalActive: 150 },
    { id: 4, date: d("2026-11-03T07:00:00"), durationSec: 1800, kcalActive: 150 },
  ];
  const corr = (x) => ({ km: x.durationSec / 600, paceSec: 600 });
  const s = summarize(list, w, corr);
  assert.deepEqual([s.n, s.km, s.kcal, s.days.size], [3, 12, 655, 3]);
  assert.deepEqual(streaks(list, now), { dayStreak: 3, weekStreak: 2 });
  assert.match(motivation({ kind: "week", cur: s, prev: { km: 6, n: 1 }, goalKm: 12, isCurrent: true }), /Objectif atteint/);
  assert.match(motivation({ kind: "week", cur: s, prev: { km: 6, n: 1 }, goalKm: 30, isCurrent: true }), /\+100 %/);
});

import { SAT } from "../js/sat.js";
test("vues satellite : tracés réels pour les lieux", () => {
  assert.ok(Object.keys(SAT).length >= 45);
  for (const [k, v] of Object.entries(SAT)) {
    assert.ok(PLACES.find((p) => p.id === k), `lieu inconnu : ${k}`);
    assert.ok(v.path.length >= 2 && v.path.every(([a, b]) => Math.abs(a) <= 85 && Math.abs(b) <= 180), k);
  }
});

import { parseHealthWorkout, healthDate } from "../js/core.js";
test("export Santé : séance de marche sur tapis", () => {
  const xml = `<Workout workoutActivityType="HKWorkoutActivityTypeWalking" duration="48.1666" durationUnit="min" sourceName="Apple Watch" creationDate="2026-11-13 07:31:00 +0100" startDate="2026-11-13 06:42:00 +0100" endDate="2026-11-13 07:30:10 +0100">
  <MetadataEntry key="HKIndoorWorkout" value="1"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="x" endDate="y" sum="255.4" unit="kcal"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="x" endDate="y" sum="2.9013" unit="km"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierBasalEnergyBurned" startDate="x" endDate="y" sum="60.2" unit="kcal"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" startDate="x" endDate="y" average="104.3" minimum="80" maximum="120" unit="count/min"/>
 </Workout>`;
  const w = parseHealthWorkout(xml);
  assert.equal(w.type, "walk_treadmill");
  assert.equal(w.date, healthDate("2026-11-13 06:42:00 +0100"));
  assert.equal(w.date, "2026-11-13T05:42:00.000Z");
  assert.deepEqual([w.durationSec, w.watchKm, w.kcalActive, w.kcalTotal, w.hrAvg], [2890, 2.9, 255, 316, 104]);
  // ancien format (attributs totaux, miles)
  const old = parseHealthWorkout(`<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" totalDistance="3.1" totalDistanceUnit="mi" totalEnergyBurned="300" totalEnergyBurnedUnit="kcal" startDate="2020-05-01 18:00:00 +0200" endDate="2020-05-01 18:30:00 +0200"/>`);
  assert.deepEqual([old.type, old.watchKm, old.kcalActive], ["run_out", 4.99, 300]);
});
