#!/usr/bin/env python3
"""Extrait un résumé condensé depuis le gros data.json de kiosque-strojna
et l'écrit dans kiosque-summary.json (onglet "Kiosque" du dashboard).

Le data.json source (~6 Mo) est régénéré chaque jour par le pipeline Strojna.
Ce script n'en garde que les indicateurs clés → fichier léger lisible par le front.

Usage :
  python3 update-kiosque-summary.py [--src /chemin/vers/data.json] [--commit]
"""
import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, date

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "kiosque-summary.json")
DEFAULT_SRC = "/Users/jarvis/.openclaw/workspace-jarvis-strojna/Projet Kiosque/kiosque-strojna/data.json"

MONTHS_FR = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
             "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
DOW_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]


def dow_name(iso):
    try:
        return DOW_FR[date.fromisoformat(iso).weekday()]
    except Exception:
        return "?"


def days_since(iso):
    try:
        return (date.today() - date.fromisoformat(iso[:10])).days
    except Exception:
        return None


def build(d):
    out = {
        "generated_at": datetime.now().astimezone().replace(microsecond=0).isoformat(),
        "restaurant": (d.get("restaurant") or {}).get("name", "Strojna"),
    }

    # --- CA dernier mois clos ---
    monthly = d.get("monthly") or []
    if len(monthly) >= 2:
        last, prev = monthly[-1], monthly[-2]
        out["last_closed_month"] = {
            "label": f"{MONTHS_FR[last['month']]} {last['year']}",
            "ca_ttc": last.get("total_ttc"),
            "prev_label": f"{MONTHS_FR[prev['month']]} {prev['year']}",
            "prev_ca": prev.get("total_ttc"),
        }

    # --- Prévision semaine en cours ---
    weeks = (d.get("cash_forecast") or {}).get("weeks") or []
    if weeks:
        w = weeks[0]
        best = None
        for day in w.get("days", []):
            if day.get("ca") is not None and (best is None or day["ca"] > best["ca"]):
                best = day
        out["week_forecast"] = {
            "label": f"{w.get('week_start', '')[5:]} → {w.get('week_end', '')[5:]}",
            "estimated_ca": w.get("estimated_ca"),
            "estimated_net": w.get("estimated_net"),
            "confidence_pct": w.get("confidence_pct"),
            "best_day": {
                "date": best["date"], "dow": dow_name(best["date"]), "ca": best["ca"]
            } if best else None,
        }

    # --- Food cost ---
    ca = d.get("cost_analysis") or {}
    summ = ca.get("summary") or {}
    out["food_cost"] = {
        "avg_pct": summ.get("avg_food_cost_pct"),
        "target_pct": round(ca.get("target_food_cost_pct")) if ca.get("target_food_cost_pct") else None,
        "items_above_35pct": summ.get("items_above_35pct"),
    }

    # --- Stock ---
    cur = (d.get("stock") or {}).get("current") or {}
    stock_age = days_since(cur.get("date")) if cur.get("date") else None
    if cur:
        out["stock"] = {
            "total_value_eur": cur.get("total_value_eur"),
            "item_count": cur.get("item_count"),
            "date": cur.get("date"),
            "stale": bool(stock_age is not None and stock_age > 30),
        }

    # --- Alertes ---
    alerts = []
    fc = out["food_cost"]
    if fc["avg_pct"] is not None and fc["target_pct"]:
        if fc["avg_pct"] <= fc["target_pct"]:
            alerts.append({"level": "ok",
                           "text": f"Food cost moyen {fc['avg_pct']:.1f} % — sous la cible de {fc['target_pct']} %."})
        else:
            alerts.append({"level": "crit",
                           "text": f"Food cost moyen {fc['avg_pct']:.1f} % au-dessus de la cible ({fc['target_pct']} %)."})
    if fc["items_above_35pct"]:
        alerts.append({"level": "warn",
                       "text": f"{fc['items_above_35pct']} produit(s) avec un food cost > 35 % — à revoir."})
    if out.get("stock", {}).get("stale"):
        alerts.append({"level": "warn",
                       "text": f"Inventaire stock daté du {out['stock']['date']} "
                               f"({stock_age} j) — potentiellement obsolète."})
    out["alerts"] = alerts
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--src", default=DEFAULT_SRC)
    p.add_argument("--commit", action="store_true")
    args = p.parse_args()

    if not os.path.exists(args.src):
        print("source introuvable:", args.src, file=sys.stderr)
        sys.exit(1)
    with open(args.src, encoding="utf-8") as f:
        d = json.load(f)

    out = build(d)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("kiosque-summary.json écrit —",
          out.get("last_closed_month", {}).get("label"),
          "| alertes:", len(out["alerts"]))

    if args.commit:
        try:
            subprocess.run(["git", "-C", REPO, "add", "kiosque-summary.json"], check=True)
            r = subprocess.run(["git", "-C", REPO, "commit", "-m",
                                f"kiosque: maj résumé {out['generated_at'][:16]}"])
            if r.returncode == 0:
                subprocess.run(["git", "-C", REPO, "push"], check=True)
                print("pushed ✅")
        except subprocess.CalledProcessError as e:
            print("git error:", e, file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
