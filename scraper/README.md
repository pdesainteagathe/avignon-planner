# Scraper — Festival Off d'Avignon

Produit `public/catalog.json`, consommé automatiquement par le front (sinon il
retombe sur le catalogue de démonstration).

## Pourquoi deux modes ?

Le catalogue et les disponibilités n'ont pas la même volatilité :

| Donnée | Change | Volume | Mode | Fréquence conseillée |
|---|---|---|---|---|
| Titres, lieux, horaires, durées | quasi jamais pendant le festival | ~1900 fiches | `catalog` | 1×/jour (nuit) |
| Disponibilités (« complet ») | en continu | favoris uniquement | `availability` | toutes les 1–2 h |

Scraper 1900 fiches toutes les 2 h serait du gâchis (et se ferait repérer). On
crawle donc le catalogue **rarement et en entier**, et on rafraîchit les dispos
**souvent mais seulement sur les favoris**.

## Installation

```bash
npm i -D playwright
npx playwright install chromium
```

## Utilisation

```bash
# 1) Catalogue complet (rare)
node scraper/scrape.mjs catalog

# 2) Rafraîchir les dispos des favoris (souvent) — ids = ids du catalog.json
node scraper/scrape.mjs availability --ids off-8283,off-8412

# 3) Découvrir/vérifier les sélecteurs CSS sur une fiche réelle
node scraper/scrape.mjs dump --url https://www.festivaloffavignon.com/spectacles/representations/8283-...
```

## ⚠️ Sélecteurs à vérifier

Le bloc `SELECTORS` dans `scrape.mjs` est écrit d'après la structure observée du
site mais **doit être confirmé sur le DOM réel** (le site change à chaque
édition). Lance le mode `dump` sur une fiche, repère les vraies classes, et
ajuste `SELECTORS`. C'est la seule partie site-spécifique.

## Automatisation (plus tard)

- Cron nuit → `node scraper/scrape.mjs catalog`
- Cron horaire → `availability --ids <favoris>`
- Puis publier `public/catalog.json` (commit + redeploy statique, ou upload sur
  le CDN). Le front le recharge au prochain chargement de page.

## Login (V2)

Les disponibilités fines / quotas par carte d'abonnement nécessitent d'être
connecté. C'est **le seul** chemin qui a besoin d'un login → à isoler dans un
petit backend perso (mode `availability` étendu), pas dans le site statique.
