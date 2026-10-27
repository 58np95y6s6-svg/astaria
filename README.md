# iBiBet

Outil de projection de stats joueurs NBA et de détection de paris « value » (Winamax, Betclic…). Tout tourne sur GitHub, sans serveur ni compte supplémentaire.

## Fonctionnalités

- **Matchs jour après jour**, puis compositions des deux équipes (comme sur Winamax), avec les blessés.
- **Fiche joueur** : saison en cours, 10 derniers matchs, saison passée, minutes projetées (ajustables).
- **Matchup** : ce que l'adversaire accorde au poste du joueur (paniers à 2 pts, à 3 pts, lancers, rebonds, passes, interceptions, contres), comparé à la façon dont le joueur marque.
- **Projection** pour chaque catégorie (PTS, REB, PD, 3PTS, INT, CTR et les combos P+R+PD, P+R, P+PD, R+PD, INT+CTR) : moyenne, médiane, fourchette, probabilité pour chaque ligne et « cote juste ».
- **Cotes Winamax et Betclic** via The Odds API, uniquement quand tu touches « Scanner les cotes » (≈10 crédits par match, cache de 10 min). Pinnacle et Betfair servent de référence invisible pour la probabilité. Tu peux aussi saisir une cote à la main.
- **Top 5 value** en haut de l'accueil et de chaque match : meilleurs matchups gratuits par défaut, meilleures cotes après un scan.
- **Value** : probabilité × cote − 1, avec mélange du modèle et du consensus du marché (Pinnacle pèse triple) et mise conseillée (Kelly ¼, plafonnée à 3 %).
- **Top value du jour** : scan de tous les matchs à venir.
- **Journal** : les paris se règlent automatiquement, avec suivi du ROI et de la fiabilité du modèle. Il est enregistré sur l'appareil, avec export et import.

## Utilisation

1. Ouvre le site GitHub Pages du dépôt.
2. ⚙︎ Réglages : colle ta clé gratuite The Odds API (https://the-odds-api.com, 500 crédits par mois, environ 10 par match ouvert). Elle reste sur ton appareil.
3. Les données se mettent à jour seules toutes les 30 min. Pour forcer une mise à jour : onglet **Actions** du dépôt → « Mise à jour des données NBA » → **Run workflow**.

## Comment ça marche

| Élément | Où |
|---|---|
| Site | GitHub Pages : `index.html`, `js/`, `styles.css` |
| Données NBA | GitHub Actions (`.github/workflows/update-data.yml`) lance `scripts/update.mjs` toutes les 30 min : feuilles de match ESPN agrégées, effectifs, blessés, saison précédente. Le résultat est publié dans la branche `data`, lue directement par le site. |
| Cotes | The Odds API, appelée par le navigateur sur demande (`js/odds.js`) |
| Projections | Précalculées par la tâche GitHub pour tous les joueurs des 3 prochains jours (`proj/`), utilisées par le Top 5 (`js/picks.js`) |
| Modèle | `js/model.js` (projections) et `js/value.js` (value, Kelly) |

Le modèle :

- **Défense par poste.** Pour chaque équipe : stats par minute accordées aux arrières, ailiers et pivots, divisées par la moyenne de la ligue, avec un rétrécissement vers 1 tant que l'échantillon est petit.
- **Taux du joueur.** Stats par minute : 55 % sur les 10 derniers matchs et 45 % sur la saison, avec un a priori tiré de la saison passée qui s'efface au fil des matchs.
- **Minutes.** Moyenne pondérée, puis ajustements : back-to-back, risque de large écart au score, coéquipiers absents au même poste.
- **Distribution.** Loi binomiale négative (dispersion mesurée sur l'historique du joueur), qui donne P(Over) et P(Under) pour chaque ligne.

## Limites

- Winamax et Betclic n'ont pas d'API publique. The Odds API ne publie pas toujours leurs cotes joueurs. Dans ce cas, l'outil compare aux autres bookmakers et tu peux saisir la cote toi-même en 10 secondes.
- Les API ESPN ne sont pas officielles et leur format peut changer.
- Une projection reste une estimation. Suis la fiabilité du modèle dans le Journal avant d'augmenter les mises.

## Développement

```bash
npm test   # tests du modèle + test de bout en bout avec données simulées
```
