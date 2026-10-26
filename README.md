# Astaria NBA

Outil de projection de stats joueurs NBA et de détection de paris « value » (Winamax, Betclic…).

- **Matchs jour après jour**, puis compositions des deux équipes (comme sur Winamax), avec les blessés.
- **Fiche joueur** : saison en cours, 10 derniers matchs, saison passée, minutes projetées (ajustables).
- **Matchup** : ce que l'adversaire accorde au poste du joueur (paniers à 2 pts, à 3 pts, lancers, rebonds, passes, interceptions, contres), comparé à la façon dont le joueur marque.
- **Projection** pour chaque catégorie (PTS, REB, PD, 3PTS, INT, CTR et les combos P+R+PD, P+R, P+PD, R+PD, INT+CTR) : moyenne, médiane, fourchette, probabilité pour chaque ligne et « cote juste ».
- **Cotes** via The Odds API, chargées seulement à l'ouverture d'un joueur, avec un cache de 10 min par match. Tu peux aussi saisir à la main une cote Winamax ou Betclic.
- **Value** : probabilité × cote − 1, avec mélange du modèle et du consensus du marché (Pinnacle pèse triple) et mise conseillée (Kelly ¼, plafonnée à 3 %).
- **Top value du jour** : scan de tous les matchs à venir.
- **Journal** : les paris se règlent automatiquement, avec suivi du ROI et de la fiabilité du modèle (probabilité annoncée comparée au résultat réel).

## Comment ça marche

| Étape | Détail |
|---|---|
| Données | API publiques ESPN : calendrier, feuilles de match, effectifs, blessures. Une tâche planifiée Netlify agrège toutes les feuilles de match de la saison toutes les 30 min dans Netlify Blobs. |
| Défense par poste | Pour chaque équipe : stats par minute accordées aux arrières, ailiers et pivots, divisées par la moyenne de la ligue, avec un rétrécissement vers 1 tant que l'échantillon est petit. |
| Taux du joueur | Stats par minute : 55 % sur les 10 derniers et 45 % sur la saison, avec un a priori tiré de la saison passée qui s'efface au fil des matchs. |
| Minutes | Moyenne pondérée, puis ajustements : back-to-back, risque de large écart au score, coéquipiers absents au même poste. |
| Distribution | Loi binomiale négative (dispersion mesurée sur l'historique du joueur), qui donne P(Over) et P(Under) pour chaque ligne. |

Le modèle est dans `public/js/model.js`, la logique de value dans `public/js/value.js`. Le même code tourne dans le navigateur et sur le serveur.

## Mise en ligne (Netlify)

1. Sur Netlify : **Add new site → Import an existing project → GitHub →** ce dépôt. Les réglages sont lus depuis `netlify.toml`, rien à changer.
2. **Site configuration → Environment variables** :
   - `ODDS_API_KEY` : clé gratuite sur https://the-odds-api.com (500 crédits/mois ; environ 10 crédits par match ouvert).
   - `JOURNAL_KEY` (conseillé) : un mot de passe pour protéger ton journal. À saisir ensuite dans ⚙︎ Réglages.
   - Optionnels : `ODDS_BOOKMAKERS` (liste de bookmakers), `ODDS_MARKETS`, `ODDS_TTL_MIN` (durée du cache des cotes, 10 par défaut).
3. Redéploie, puis ouvre ⚙︎ Réglages → **Mettre à jour maintenant** pour charger la saison sans attendre la tâche planifiée.

## Limites

- Winamax et Betclic n'ont pas d'API publique. The Odds API ne publie pas toujours leurs cotes joueurs. Dans ce cas, l'outil compare aux autres bookmakers et tu peux saisir la cote toi-même en 10 secondes.
- Les API ESPN ne sont pas officielles et leur format peut changer.
- Une projection reste une estimation. Suis la fiabilité du modèle dans le Journal avant d'augmenter les mises.

## Développement

```bash
npm install
npm test   # tests du modèle + test de bout en bout avec données simulées
```
