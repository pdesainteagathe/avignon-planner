# 🎭 Planificateur — Festival Off d'Avignon

Propose un **planning de réservation optimal** pour le Festival Off : tu saisis
tes créneaux de présence et une liste de spectacles classés par préférence,
l'app te sort le meilleur emploi du temps possible — un maximum de pièces qui te
plaisent, **30 min de battement** minimum entre deux, sans conflit d'horaire, en
tenant compte des dispos (« complet »).

## Stack

- **Front statique** : React + TypeScript + Vite. Tout se passe dans le
  navigateur (optimiseur inclus), hébergeable en statique (Netlify/Vercel/Pages).
- **Optimiseur** (`src/lib/optimizer.ts`) : branch & bound exact (Job Interval
  Selection) avec démarrage glouton et repli approximatif si l'instance explose.
- **Scraper** (`scraper/`) : Node + Playwright, produit `public/catalog.json`.
  Le front le charge s'il existe, sinon catalogue de démonstration.

## Démarrer

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests optimiseur + planning
npm run build    # bundle de prod dans dist/
```

## Comment ça marche

1. **Créneaux de présence** — jours + plages horaires (arrivée/départ).
2. **Catalogue** — recherche et ajout des spectacles voulus.
3. **Ordre de préférence** — classement ; poids de satisfaction décroissant.
4. **Réglages** — battement (déf. 30 min) + stratégie (voir un max de pièces /
   privilégier ses premiers choix).

L'optimiseur choisit **au plus une représentation par pièce**, non
chevauchantes (battement inclus), dans les créneaux, en maximisant la
satisfaction totale. Les pièces non casées sont listées avec la raison
(complet / hors créneaux / conflit).

## Architecture data (scraping)

Catalogue peu volatil → crawl complet **rare**. Dispos volatiles → refresh
**ciblé sur les favoris**, fréquent. Voir [`scraper/README.md`](scraper/README.md).

## En ligne

👉 **https://pdesainteagathe.github.io/avignon-planner/**

Hébergé sur GitHub Pages (branche `gh-pages`). Pour redéployer après un scrape
ou une modif :

```bash
npm run scrape:favorites   # (optionnel) rafraîchir catalogue + favoris
npm run deploy             # build + publie sur gh-pages
```

Le build embarque `public/catalog.json` et `public/favorites.json` : le site
déployé fonctionne sans backend. Le `base` Pages est géré par `VITE_BASE`.

## Roadmap

- **V1 (fait)** : saisie, catalogue, optimiseur, contrainte 30 min, dispos par pièce.
- **Scraper** : brancher les vrais sélecteurs sur le DOM live (mode `dump`).
- **V2** : login espace client pour dispos perso (mini-backend) ; distances
  entre théâtres dans la contrainte de battement ; export .ics / partage.
