# Dispos billetteries des théâtres (Mapado & co) — recap

> Statut : **V1 livrée** (couverture partielle) · exploration de la couverture
> complète **en pause**. Ce document fige tout ce qu'on a trouvé pour reprendre
> plus tard sans re-fouiller.

## Objectif

Compléter la disponibilité **Ticket'Off** (billetterie centrale du festival) avec
la billetterie **propre de chaque théâtre**. Motivation : une séance « quota
atteint sur Ticket'Off » (l'allocation en ligne de Ticket'Off est épuisée) est
souvent **encore vendue par le théâtre** sur son propre canal. On veut le
signaler et re-rendre ces séances planifiables.

## Ce qui est livré (V1)

- `scraper/mapado.mjs` (`npm run scrape:theatres`) : scrape les billetteries
  Mapado, annote chaque représentation d'un `theatreStatus` (`onSale`/`soldOut`).
- Intégré au workflow `refresh.yml` (après `scrape:favorites`).
- Planning : quota Ticket'Off **mais** `onSale` au théâtre → badge vert
  **« 🎭 dispo au théâtre »**, séance planifiable ; quota **et** `soldOut` au
  théâtre → confirmée épuisée, non planifiée.
- **Résultat mesuré** : 392 séances annotées, **47 séances « quota Ticket'Off »
  récupérées** comme dispo au théâtre (sur 3 théâtres).

## Modèle de données (rappel)

Tout est dénormalisé par séance dans `public/catalog.json` :

```jsonc
{
  "start": "2026-07-10T11:20",
  "status": "online" | "quota" | "closed",   // Ticket'Off (qte>0 / qte=0 / clôturé)
  "seatsLeft": 20,                            // places en ligne Ticket'Off (si online)
  "theatreStatus": "onSale" | "soldOut"       // billetterie du théâtre (Mapado), si connue
}
```
Timestamps au niveau catalogue : `generatedAt` (full scrape Ticket'Off),
`theatresRefreshedAt` (dernier passage Mapado).

## Plateformes des théâtres (favoris)

Les théâtres choisissent librement leur canal — **pas de standard**.

| Plateforme | Théâtres favoris | Scrapable |
|---|---|---|
| **Mapado** | Train Bleu, Oriflamme, **11 • Avignon** | ✅ (fait) |
| **BilletReduc** | Gémeaux, Béliers | ✅ à faire (autre parser) |
| Site maison / inconnu | Chêne Noir, Reine Blanche, Artéphile… | ? au cas par cas |

Sous-domaines Mapado (pattern variable) :
- `billetterie-theatredutrainbleu.mapado.com` (57 spectacles)
- `billetterie-oriflamme.mapado.com` (9)
- `11avignon.mapado.com` (33) — **sans** le préfixe `billetterie-`

## Détails techniques Mapado (pour reprendre)

- **Homepage** billetterie : `__NEXT_DATA__` contient les événements
  `{title, slug}` ; `slug = "<eventId>-<slug-titre>"`.
- **Page événement** `/event/<slug>` : `__NEXT_DATA__` contient les
  `event_dates` **de la page 1 seulement (7 dates max**, `hydra:itemsPerPage:7`).
- **Champ de dispo fiable, VÉRIFIÉ** : `notInStockContingentBookableStock`
  (places réservables en ligne au théâtre). `> 0` = `onSale`, `0` = `soldOut`.

### ⚠️ Pièges (erreurs commises, à ne pas refaire)
- `availabilityStatus: "onSale"` est au niveau **événement** (« vente ouverte »),
  **pas** par date → ne dit rien sur les places.
- `bookableStock` est un **autre pool** (contingent réservé) : il peut valoir 44
  alors que la date est SOLD OUT. **Ne pas s'y fier.**
- Le « SOLD OUT » **rendu** (tuiles, classe `EventDateSelectorItem__ButtonDaySoldoutOverlay`)
  est fiable **mais seulement pour les ~7 dates visibles**.

## Blocage : couverture complète des dates

Le festival dure ~18 dates/spectacle, mais on n'en a que ~7 en HTTP pur.

| Piste testée | Verdict |
|---|---|
| `__NEXT_DATA__` de la page | plafonné à 7 (page 1) |
| SSR `?page=2`, `?date=`, `?startDate=`… | même 7 dates, ou HTTP 500 |
| API `/v1/event_dates?ticketing=/v1/ticketings/<eventId>&page=1..3` | **Bearer token requis** |

- **API Mapado** : base `https://ticketing.mapado.net/v1`, **auth Bearer
  obligatoire** (token du compte Pro du théâtre) → non public.
  Docs : https://help.mapado.com (recherche « API Mapado token »).
- La pagination existe : `hydra:first/last`, `hydra:itemsPerPage:7`, ~3 pages.
  La query complète (extraite) :
  `/v1/event_dates?availabilityStatus=opened,cancelled&dateMaybeNull=true&fields=...&sellingDevice=/v1/selling_devices/<id>&ticketing=/v1/ticketings/<eventId>&page=N`

### Seule voie robuste pour la couverture complète
**Navigateur headless (Playwright)** : charger la page événement, cliquer « › »
pour paginer les semaines, lire les tuiles rendues. Le navigateur exécute le flux
d'auth du SPA qu'on ne peut pas rejouer en HTTP.

**Coût** : dépendance Playwright + `playwright install chromium` (~150 Mo) en CI,
~5 s/événement × ~100 = **+8 min** sur le job quotidien, rendu plus fragile.
→ **Décision en attente** (mettre dans un job CI séparé si on y va).

## Reprise — options
1. **Playwright** pour la couverture complète des dates Mapado (le plus demandé).
2. **Adaptateur BilletReduc** (Gémeaux, Béliers) — nouveaux théâtres plutôt que
   nouvelles dates.
3. Étendre la **table théâtre → billetterie** (au-delà des favoris).

## Fichiers concernés
- `scraper/mapado.mjs` — adaptateur (config `MAPADO_THEATRES`).
- `scraper/lib.mjs` — `fetchText`, `pool`.
- `src/types.ts` — `Performance.theatreStatus`.
- `src/lib/planning.ts` — logique quota × theatreStatus.
- `src/components/PlanningView.tsx` — badge « 🎭 dispo au théâtre ».
