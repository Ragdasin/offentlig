"""Kombardo Expressen via Molslinjens uofficielle booking-API (bruges af kombardoexpressen.dk)."""
import uuid
from datetime import date as Date

import requests

from . import cache

API = "https://api.molslinjen.dk/api/v1/booking/steps"
TIMEOUT = 15

# Kombardo har kun voksen / barn (4-12) / småbørn i bookingen.
DISCOUNTS = {
    None: ("adult", "Voksen"),
    "ung": ("adult", "Voksen (ingen ungerabat)"),
    "studerende": ("adult", "Voksen (ingen studierabat)"),
    "pensionist": ("adult", "Voksen (ingen pensionistrabat)"),
    "barn": ("child", "Barn 4-12"),
}


def _headers():
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "lang": "da", "language": "da", "Accept-Language": "da",
        "line": "Kombardo", "site": "Kombardo", "source": "web",
        "clientplatform": "Nuxt", "contentsource": "U12",
        "sessionkey": str(uuid.uuid4()),
        "User-Agent": "Mozilla/5.0 (offentlig prototype)",
        "Origin": "https://www.kombardoexpressen.dk",
        "Referer": "https://www.kombardoexpressen.dk/",
    }


def _routes():
    if (hit := cache.get("komb-routes")) is not None:
        return hit
    r = requests.get(f"{API}/details/routes", headers=_headers(), timeout=TIMEOUT)
    r.raise_for_status()
    routes = [x for x in r.json()["routes"] if not x["isSubRoute"]]
    cache.set("komb-routes", routes, ttl=24 * 3600)
    return routes


def _norm(s):
    return s.lower().replace("kbh", "københavn").strip()


def _find_route(from_name, to_name):
    f, t = _norm(from_name), _norm(to_name)
    for r in _routes():
        dep, arr = _norm(r["departureHarbor"]["name"]), _norm(r["arrivalHarbor"]["name"])
        if (dep.startswith(f) or f.startswith(dep)) and (arr.startswith(t) or t.startswith(arr)):
            return r
    return None


def search(from_name, to_name, day: Date, discount=None, **_):
    pax, label = DISCOUNTS.get(discount, DISCOUNTS[None])
    route = _find_route(from_name, to_name)
    if not route:
        raise ValueError(f"Kombardo kører ikke {from_name} → {to_name}")

    d = day.isoformat()
    key = ("komb-search", route["id"], d, pax)
    if (hit := cache.get(key)) is not None:
        return hit

    body = {
        "date": d,
        "booking": {
            "currency": 0, "includeEnRouteDepartures": False, "originalPhoneNumber": "", "reservationId": None,
            "tickets": [{
                "directionType": 0,
                "departure": {"regionId": route["departureHarbor"]["region"]["id"], "date": d,
                              "routeId": route["id"], "subline": None},
                "transport": {"transportId": route.get("defaultTransportType") or "8888BUS", "carId": ""},
                "passengerInfo": {"adultCount": int(pax == "adult"), "childCount": int(pax == "child"),
                                  "infantCount": 0, "passengerData": []},
                "lineItems": [],
                "goods": {"weightFee": 0, "weight": 0, "dangerousGoods": {"limitedQuantity": False, "goods": []}},
                "notes": [],
            }],
        },
        "tripCardNumber": None, "direction": 0, "softPassengersOnly": False,
    }
    r = requests.post(f"{API}/departure/departures", headers=_headers(), json=body, timeout=TIMEOUT)
    r.raise_for_status()

    trips = []
    for x in r.json().get("departures", []):
        lp = x.get("lowestPrice")
        if x.get("soldOut") or not lp:
            continue
        h, m, _s = (int(v) for v in x["travelTime"].split(":"))
        trips.append({
            "departure": x["departureTime"][:5],
            "arrival": x["arrivalTime"][:5],
            "departure_date": x["date"][:10],
            "duration_min": h * 60 + m,
            "price": round(lp["price"]["value"]),
            "ticket_type": f"{lp['ticketTypeName']} · {label}",
            "seat_price": None,
            "transfers": 0,
            "url": "https://www.kombardoexpressen.dk/booking",
        })
    trips.sort(key=lambda x: x["price"])
    cache.set(key, trips)
    return trips
