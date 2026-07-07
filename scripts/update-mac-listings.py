#!/usr/bin/env python3
"""Met à jour mac-listings.json (onglet "Recherche Mac" du dashboard).

Appelé par le cron de veille Mac (agent main, id 07ce75df-...). À chaque run le cron
DOIT au minimum enregistrer la vérification (--check) pour que le dashboard affiche
une date de "dernière vérification" fraîche, même quand aucune annonce n'est trouvée.

Exemples
--------
  # Fin de run sans trouvaille (scraping en échec, cas actuel) :
  python3 update-mac-listings.py --check --status failing --commit

  # Une trouvaille valide :
  python3 update-mac-listings.py --check --status ok \
      --add "LeBonCoin|Mac Studio M2 Ultra 64Go 1To|2500 € TTC|https://www.leboncoin.fr/ad/ordinateurs/xxxx|vérifié M2 Ultra" \
      --commit

--add répétable. Champs séparés par '|' : plateforme|titre|prix|url|note
Déduplication par URL (une annonce déjà connue est mise à jour, pas dupliquée).
"""
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone, timedelta

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(REPO, "mac-listings.json")
PARIS = timezone(timedelta(hours=2))  # Europe/Paris (été) — suffisant pour l'affichage


def now_iso():
    return datetime.now(PARIS).replace(microsecond=0).isoformat()


def slugify(url, platform):
    m = re.search(r"(\d{6,})", url or "")
    if m:
        return (platform or "ad").lower().replace(" ", "")[:3] + "-" + m.group(1)
    base = re.sub(r"[^a-z0-9]+", "-", (url or platform or "ad").lower()).strip("-")
    return base[:40] or "ad-" + now_iso()[:10]


def load():
    if os.path.exists(DATA):
        with open(DATA, encoding="utf-8") as f:
            return json.load(f)
    return {"last_checked": None, "scraping_status": "unknown", "status_note": "",
            "target": {}, "listings": []}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--check", action="store_true", help="met à jour last_checked = maintenant")
    p.add_argument("--status", choices=["ok", "failing", "partial", "unknown"])
    p.add_argument("--note", help="status_note (message de statut affiché en cas d'échec)")
    p.add_argument("--add", action="append", default=[], help="plateforme|titre|prix|url|note")
    p.add_argument("--commit", action="store_true", help="git add/commit/push après écriture")
    args = p.parse_args()

    d = load()
    d.setdefault("listings", [])

    if args.check:
        d["last_checked"] = now_iso()
    if args.status:
        d["scraping_status"] = args.status
    if args.note is not None:
        d["status_note"] = args.note

    added = 0
    for raw in args.add:
        parts = [x.strip() for x in raw.split("|")]
        while len(parts) < 5:
            parts.append("")
        platform, title, price, url, note = parts[:5]
        if not title or not url:
            print("skip (titre/url manquant):", raw, file=sys.stderr)
            continue
        entry = {
            "id": slugify(url, platform),
            "title": title,
            "price": price or None,
            "platform": platform or "?",
            "url": url,
            "found_at": now_iso()[:10],
            "note": note or None,
        }
        existing = next((x for x in d["listings"] if x.get("url") == url), None)
        if existing:
            existing.update({k: v for k, v in entry.items() if k != "found_at"})
        else:
            d["listings"].append(entry)
            added += 1

    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"mac-listings.json: status={d.get('scraping_status')} "
          f"listings={len(d['listings'])} (+{added}) checked={d.get('last_checked')}")

    if args.commit:
        msg = f"mac: veille {now_iso()[:16]} (+{added} annonce(s))" if added else \
              f"mac: veille {now_iso()[:16]} (rien de neuf)"
        try:
            subprocess.run(["git", "-C", REPO, "add", "mac-listings.json"], check=True)
            r = subprocess.run(["git", "-C", REPO, "commit", "-m", msg])
            if r.returncode == 0:
                subprocess.run(["git", "-C", REPO, "push"], check=True)
                print("pushed ✅")
            else:
                print("rien à committer")
        except subprocess.CalledProcessError as e:
            print("git error:", e, file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
