# Scraper — Festival Off d'Avignon

Produit `public/catalog.json`, consommé automatiquement par le front (sinon il
retombe sur le catalogue de démonstration).

**HTTP pur, sans navigateur ni login.** Le site est rendu côté serveur : le
programme pagine via `?page=N` (48 cartes/page), et chaque page de
représentations expose chaque date avec `data-date`, `data-heure`,
`data-nb-place` (places restantes), `data-status` et `data-can-reserve`. Testé
en prod : dates, dispos et places sont récupérées en clair.

## Pourquoi deux modes ?

| Donnée | Change | Volume | Mode | Fréquence |
|---|---|---|---|---|
| Titres, lieux, horaires, durées | quasi jamais | ~1900 fiches | `catalog` | 1×/jour |
| Dispos / places restantes | en continu | favoris uniquement | `availability` | 1–2 h |

Crawler 1900 fiches toutes les 2 h serait du gâchis. On crawle le catalogue
**rarement et en entier**, on rafraîchit les dispos **souvent, sur les favoris**.

## Utilisation

```bash
# Catalogue complet (~1900 spectacles, quelques minutes, poli : 5 en //, 150 ms)
node scraper/scrape.mjs catalog

# Test rapide sur 8 spectacles
node scraper/scrape.mjs catalog --limit 8

# Rafraîchir les dispos de favoris (ids = ceux du catalog.json, ex "off-8060")
node scraper/scrape.mjs availability --ids off-8060,off-9155

# Debug d'un spectacle
node scraper/scrape.mjs one --url https://www.festivaloffavignon.com/spectacles/representations/8060-mes-pires-potes
```

Options `catalog` : `--limit N`, `--pages N`, `--concurrency C`.

## Modèle de données produit

```jsonc
{
  "source": "festivaloffavignon.com",
  "generatedAt": "2026-07-08T09:25",
  "shows": [{
    "id": "off-8060", "title": "...", "venue": "...", "genre": "...",
    "durationMin": 60, "ticketUrl": "https://.../representations/8060-...",
    "performances": [
      { "id": "235928", "start": "2026-07-08T21:40", "available": true, "seatsLeft": 118 }
    ]
  }]
}
```

`available` = le site autorise la réservation (`data-can-reserve=1` + statut
`available`). Les dates passées sont `available:false` (et de toute façon
écartées par les créneaux de présence).

## Automatisation (plus tard)

- Cron nuit → `node scraper/scrape.mjs catalog`
- Cron horaire → `availability --ids <favoris>`
- Publier `public/catalog.json` (commit + redeploy statique, ou upload CDN).

## Login (V2)

Le niveau public suffit déjà (dispos + places restantes). Le login espace-client
ne servirait qu'aux quotas/abonnement perso → mini-backend dédié, hors site
statique. Le lien favori du site renvoie d'ailleurs vers `/espace-client/connexion`.

## Politesse / robustesse

- User-Agent navigateur, `Accept-Language: fr-FR`, 5 requêtes en parallèle max,
  150 ms entre requêtes, 3 tentatives avec backoff.
- La seule partie fragile = les sélecteurs (`.global-card`, `.card-nom`,
  `.theatre`, `.heure`, `.duree`, `.js-card-date`). À revérifier à chaque édition
  du festival (mode `one` pour diagnostiquer).
