# Hub perso — Thomas

Mini-hub statique (GitHub Pages) à 4 onglets : **Emploi**, **Recherche Mac**, **Tâches**, **Kiosque**.
Navigation par onglets en haut de page (`#jobs`, `#mac`, `#tasks`, `#kiosque` dans l'URL).
Chaque onglet lit son propre fichier JSON → mises à jour indépendantes, sans backend.

## Structure

- `index.html` — page + navigation onglets
- `styles.css` — styles (thème sombre partagé)
- `app.js` — routeur d'onglets + rendu de chaque section
- `jobs.json` — données **Emploi** (inchangé, cf. schéma ci-dessous)
- `mac-listings.json` — données **Recherche Mac** (écrit par le cron de veille)
- `tasks.json` — données **Tâches** (base committée ; édition live via navigateur)
- `kiosque-summary.json` — résumé **Kiosque** (extrait du data.json de kiosque-strojna)
- `scripts/update-mac-listings.py` — met à jour `mac-listings.json` (appelé par le cron Mac)
- `scripts/update-kiosque-summary.py` — régénère `kiosque-summary.json` depuis Strojna

### Onglet Recherche Mac
Le cron « Mac Studio/Mini » (agent main) scrape LeBonCoin/BackMarket/Vinted toutes les 3 h.
À chaque run il appelle `scripts/update-mac-listings.py --check --status … --commit` (et un
`--add "plateforme|titre|prix|url|note"` par trouvaille valide). Le script gère la
déduplication par URL, la date de dernière vérification et le push. Le scraping est
actuellement **bloqué** (Cloudflare/Datadome/cookie wall) → `scraping_status: "failing"` et un
bandeau d'avertissement s'affiche pour signaler que la liste peut être obsolète.

### Onglet Tâches
`tasks.json` est la base committée. **L'édition live (ajout/coche/archive) se fait dans le
navigateur et est stockée en `localStorage`** (par appareil, pas de backend). Le bouton
« Exporter tasks.json » génère le JSON à jour à transmettre à Jarvis (ou lui demander de mettre
à jour `tasks.json`) pour rendre les changements permanents/multi-appareils. Statuts : `todo`
(À faire) / `doing` (En cours) / `done` (Fait), plus archivage.

### Onglet Kiosque
Résumé condensé du dashboard Strojna. `scripts/update-kiosque-summary.py` lit le gros
`data.json` de `kiosque-strojna` (~6 Mo) et n'en garde que les indicateurs clés : CA du
dernier mois clos, prévision de la semaine en cours + meilleur jour prévu, food cost moyen,
et alertes (food cost élevé, stock obsolète). À relancer après le pipeline Strojna quotidien.

---

## Onglet Emploi — données

- `jobs.json` — **les données** (seul fichier à mettre à jour pour la veille emploi)

## Mise à jour des données (cron)

Il suffit de réécrire `jobs.json` puis `git commit && git push` : GitHub Pages se met à jour tout seul.
Ne pas toucher au HTML/CSS/JS pour un rafraîchissement de données.

### Schéma de `jobs.json`

```jsonc
{
  "last_updated": "2026-07-07T10:20:00+02:00",   // ISO 8601, affiché en petit sur le dashboard
  "candidate": { ... },                          // contexte (informatif)
  "local_keywords": ["Lannion", "Perros-Guirec", ...],
  "jobs": [
    {
      "id": "slug-unique",          // string, identifiant stable
      "title": "Designer UI/UX Web",
      "company": "APITIC",
      "location": "Lannion",
      "contract": "CDI",            // "CDI" | "CDD" | "Freelance" | null
      "salary": "50–55 K€",         // string ou null si non affiché
      "posted": "2026-07-06",       // date ISO (YYYY-MM-DD) ou null → "il y a N jours" auto-calculé
      "new": true,                  // badge 🆕
      "local": true,                // badge ⭐ + carte mise en avant (bordure orange, tri en tête)
      "url": "https://…",           // lien direct cliquable vers l'annonce
      "note": "texte optionnel"     // string ou null
    }
  ],
  "resources": [                    // tuiles spéciales "ressource à surveiller" (job boards, etc.)
    {
      "id": "…", "title": "…", "company": "…", "location": "…",
      "local": true, "url": "https://…", "note": "…"
    }
  ]
}
```

**Règles de tri (dans `app.js`, automatique) :** `local` d'abord → `new` → puis par date de publication décroissante.
Le filtre "Remote" détecte automatiquement `remote`/`télétravail` dans `location`/`note`.
