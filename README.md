# iBiFit

Suivi des séances de sport de l'Apple Watch, en PWA (app web installable sur l'iPhone), avec **correction de la distance** quand la montre se trompe, typiquement la marche sur tapis.

## Fonctionnalités

- **Séances** : kcal actives et totales, durée totale, distance corrigée, allure (min/km) et vitesse (km/h) recalculées, FC moyenne.
- **Correction de distance** par type d'activité. Par défaut, marche sur tapis = ×1,5 (montre 0,8 km → réel 1,2 km). Réglable, ou remplacée par la distance du tapis saisie pour une séance.
- **Ajout d'une séance** :
  - capture d'écran du détail de la séance (app Forme / Santé), lue sur le téléphone par OCR ;
  - lien d'import, utilisable par un Raccourci iPhone (`#/import?type=walk_treadmill&min=25.2&km=0.8&kcal=96`) ;
  - saisie manuelle.
- **Stats** : totaux sur 4 semaines, 12 semaines ou tout l'historique ; distance, kcal ou minutes par semaine ; courbe d'allure.
- **App native** : défilement interne, pas de zoom, fonctionne hors ligne, données stockées sur l'appareil, export et import JSON.

## Limite

Une app web ne peut pas lire l'app Santé directement : Apple réserve HealthKit aux apps natives de l'App Store. D'où la capture d'écran, le lien Raccourci ou la saisie.

## Développement

```bash
npm test
```

L'ancienne app NBA (iBiBet) est conservée sur la branche `nba-archive`.

## Comparaisons, paliers et stories

- **Paliers de vitesse** : « 5 min à 3,5 puis 40 min à 6 » → distance réelle calculée (prime sur le facteur, pas sur une distance réelle saisie).
- **60 comparaisons** : lieux célèbres (pyramide de Khéops, Golden Gate, Everest à la verticale, Muraille de Chine, Terre → Lune…) et objets bout à bout (baguettes, baleines bleues, tours Eiffel couchées, A380…), avec une phrase drôle ; chaque séance en tire une différente, avec une vue aérienne stylisée et le trajet dessiné. L'onglet Stats affiche le défi cumulé.
- **Story Instagram** : image 1080×1920 générée sur le téléphone, partagée via la feuille de partage iOS (Instagram → Story).
