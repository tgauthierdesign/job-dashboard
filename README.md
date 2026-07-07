# Job Dashboard — Thomas (UX/UI/VR Designer)

Dashboard statique de veille d'offres d'emploi pour Thomas.
Cible : UX/UI/VR Designer, région Perros-Guirec / Lannion / Bretagne, dispo septembre 2026.

## Structure

- `index.html` — page
- `styles.css` — styles
- `app.js` — chargement + tri + filtres
- `jobs.json` — **les données** (seul fichier à mettre à jour)

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
