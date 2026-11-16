import os
from datetime import datetime
from zoneinfo import ZoneInfo

from flask import Flask, jsonify, render_template, request

import emissions
from providers import PROVIDERS, dsb

app = Flask(__name__)

COMING_SOON = {}


@app.get("/")
def index():
    return render_template(
        "index.html",
        today=datetime.now(ZoneInfo("Europe/Copenhagen")).date().isoformat(),
        eco=emissions.for_template(),
        eco_sources=emissions.SOURCES,
        route=emissions.ROUTE,
    )


@app.get("/health")
def health():
    """Lille side som UptimeRobot besøger, så serveren ikke falder i søvn."""
    return "ok"


@app.get("/api/autocomplete")
def autocomplete():
    q = request.args.get("q", "").strip()
    if len(q) < 3:
        return jsonify([])
    try:
        return jsonify(dsb.autocomplete(q)[:8])
    except Exception:
        return jsonify([])


def _in_window(trip, time_from, time_to):
    if time_from and trip["departure"] < time_from:
        return False
    if time_to and trip["departure"] > time_to:
        return False
    return True


@app.get("/api/search/<provider>")
def search(provider):
    if provider in COMING_SOON:
        return jsonify({"status": "soon", "url": COMING_SOON[provider]})
    module = PROVIDERS.get(provider)
    if not module:
        return jsonify({"status": "error", "message": "Ukendt selskab"}), 404

    a = request.args
    try:
        day = datetime.strptime(a["date"], "%Y-%m-%d").date()
        trips = module.search(
            a["from"], a["to"], day, a.get("discount") or None,
            time_from=a.get("time_from") or None, time_to=a.get("time_to") or None,
        )
    except KeyError:
        return jsonify({"status": "error", "message": "Mangler fra, til eller dato"}), 400
    except ValueError as e:
        return jsonify({"status": "error", "message": str(e)})
    except Exception:
        app.logger.exception("Søgning fejlede hos %s", provider)
        return jsonify({"status": "error", "message": "Kunne ikke hente lige nu"})

    trips = [
        t for t in trips
        if t["departure_date"] == day.isoformat()
        and _in_window(t, a.get("time_from"), a.get("time_to"))
    ]
    return jsonify({"status": "ok", "trips": trips[:4]})


if __name__ == "__main__":
    # Lokalt: python app.py  (debug til). Online kører gunicorn, se render.yaml.
    app.run(debug=os.environ.get("FLASK_DEBUG", "1") == "1", port=int(os.environ.get("PORT", 5050)))
