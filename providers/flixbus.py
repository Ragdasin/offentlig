"""FlixBus via deres uofficielle søge-API (det samme som flixbus.dk bruger)."""
import json
from datetime import date as Date

import requests

from . import cache

API = "https://global.api.flixbus.com"
HEADERS = {"User-Agent": "Mozilla/5.0 (offentlig prototype)", "Accept": "application/json"}
TIMEOUT = 10

# Vores rabattyper -> FlixBus' passagertyper.
# FlixBus har ingen særskilt "ung"-billet i DK, så ung søges som voksen.
DISCOUNTS = {
    None: ("adult", "Voksen"),
    "ung": ("adult", "Voksen (ingen ungerabat)"),
    "studerende": ("student", "Studerende"),
    "pensionist": ("senior", "Senior"),
    "barn": ("children_6_14", "Barn 6-14"),
}


def autocomplete(query):
    """Returnerer [{'name': ..., 'id': ...}] for danske byer."""
    key = ("flix-ac", query.lower())
    if (hit := cache.get(key)) is not None:
        return hit
    r = requests.get(
        f"{API}/search/autocomplete/cities",
        params={"q": query, "lang": "da", "country": "dk", "flixbus_cities_only": "false"},
        headers=HEADERS,
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    result = [{"name": c["name"], "id": c["id"]} for c in r.json() if c.get("country") == "dk"]
    cache.set(key, result, ttl=24 * 3600)
    return result


def _clean(name):
    """DSB-navne som 'Aarhus H' / 'Odense St.' -> bynavn FlixBus forstår."""
    import re
    return re.sub(r"\s+(H|C|St\.?|Station|Busterminal|Banegård)$", "", name.split("/")[0].strip(), flags=re.I)


def _city_id(name):
    matches = autocomplete(name) or autocomplete(_clean(name))
    name = _clean(name) if not any(m["name"].lower() == name.lower() for m in matches) else name
    if not matches:
        raise ValueError(f"FlixBus kender ikke byen '{name}'")
    exact = [m for m in matches if m["name"].lower() == name.lower()]
    return (exact or matches)[0]["id"]


def search(from_name, to_name, day: Date, discount=None, **_):
    """Returnerer alle afgange som en liste af dicts, sorteret efter pris."""
    product, ticket_type = DISCOUNTS.get(discount, DISCOUNTS[None])
    from_id, to_id = _city_id(from_name), _city_id(to_name)
    ride_date = day.strftime("%d.%m.%Y")

    key = ("flix-search", from_id, to_id, ride_date, product)
    if (hit := cache.get(key)) is not None:
        return hit

    r = requests.get(
        f"{API}/search/service/v4/search",
        params={
            "from_city_id": from_id,
            "to_city_id": to_id,
            "departure_date": ride_date,
            "products": json.dumps({product: 1}),
            "currency": "DKK",
            "locale": "da",
            "search_by": "cities",
            "include_after_midnight_rides": "1",
        },
        headers=HEADERS,
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    data = r.json()

    booking_url = (
        "https://shop.flixbus.dk/search?"
        f"departureCity={from_id}&arrivalCity={to_id}&rideDate={ride_date}&{product}=1"
    )

    trips = []
    for block in data.get("trips", []):
        for t in block.get("results", {}).values():
            if t.get("status") != "available":
                continue
            price = t["price"].get("total_with_platform_fee") or t["price"]["total"]
            if not price:
                continue
            transfers = len(t.get("legs", [])) - 1
            trips.append({
                "departure": t["departure"]["date"][11:16],
                "arrival": t["arrival"]["date"][11:16],
                "departure_date": t["departure"]["date"][:10],
                "duration_min": t["duration"]["hours"] * 60 + t["duration"]["minutes"],
                "price": round(price),
                "ticket_type": ticket_type,
                "seat_price": None,  # pladsreservation vælges først ved booking hos FlixBus
                "transfers": transfers,
                "url": booking_url,
            })
    trips.sort(key=lambda x: x["price"])
    cache.set(key, trips)
    return trips
