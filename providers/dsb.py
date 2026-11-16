"""DSB via dsb.dk's uofficielle API (det samme som deres søgeside bruger).

API'et giver max 6 afgange pr. kald, så vi spørger flere tidspunkter parallelt.
"""
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date as Date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import requests

from . import cache

API = "https://www.dsb.dk/api/domestic/v1"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (offentlig prototype)",
    "Accept": "application/json",
    "Origin": "https://www.dsb.dk",
    "Referer": "https://www.dsb.dk/en/domestic/",
}
TZ = ZoneInfo("Europe/Copenhagen")
TIMEOUT = 20
SLOT = timedelta(minutes=90)  # 6 afgange dækker ca. 1,5 time på store strækninger

DISCOUNTS = {
    None: ("TT_ADULT", "Voksen"),
    "ung": ("TT_YOUNG", "Ung"),
    "studerende": ("TT_ADULT", "Voksen (ingen studierabat)"),
    "pensionist": ("TT_SENIOR", "Pensionist"),
    "barn": ("TT_CHILD_12_15", "Barn 12-15"),
}
OFFER_NAMES = {"OT_ORANGE": "Orange", "OT_ORANGEFRI": "Orange Fri", "OT_SINGLE": "Standard"}
MEANS = [
    "INTERCITY_TRAIN", "INTERCITY_EXPRESS_TRAIN", "REGIONAL_TRAIN", "OTHER_TRAINS", "S_TRAIN",
    "STANDARD_BUS", "EXPRESS_BUS", "OTHER_BUSSES", "SPECIAL_BUS", "FERRY", "METRO", "LIGHT_RAIL",
]


def autocomplete(query):
    """Danske stationer/byer til søgefeltet. Undlader varianter som '(Metro)' og '(Letbane)'."""
    key = ("dsb-ac", query.lower())
    if (hit := cache.get(key)) is not None:
        return hit
    r = requests.get(
        f"{API}/location/",
        params={"input": json.dumps({"searchText": query})},
        headers=HEADERS,
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    names = []
    for v in r.json().get("value", []):
        n = v.get("name", "")
        if v.get("type") == "STOP" and "(" not in n and n not in names:
            names.append(n)
    # Navne der starter med det skrevne først (DSB's søgning er lidt "fuzzy")
    q = query.lower()
    names.sort(key=lambda n: not n.lower().startswith(q))
    cache.set(key, names, ttl=24 * 3600)
    return names


def _location(name):
    key = ("dsb-loc", name.lower())
    if (hit := cache.get(key)) is not None:
        return hit
    r = requests.get(
        f"{API}/location/",
        params={"input": json.dumps({"searchText": name})},
        headers=HEADERS,
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    stops = [v for v in r.json().get("value", []) if v.get("type") == "STOP"]
    if not stops:
        raise ValueError(f"DSB kender ikke '{name}'")
    s = stops[0]
    loc = {"name": s["name"], "type": "STOP", "id": s["id"], "transports": [], "zones": [], "stopId": s["stopId"]}
    cache.set(key, loc, ttl=24 * 3600)
    return loc


def _search_slot(frm, to, start_utc, traveler):
    body = {
        "offerCollection": {
            "anonymousPassengerSpecifications": [{"travelerType": traveler, "externalRef": "passenger_1"}],
            "offerSearchCriteria": {
                "requestedOfferParts": ["ADMISSION", "RESERVATION"],
                "requestedOfferTypes": list(OFFER_NAMES),
                "customerGroups": ["B2C"],
            },
        },
        "tripSearch": {
            "strategy": {
                "arrivalLocation": to,
                "departureLocation": frm,
                "departureTime": start_utc.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "searchStrategy": "STRATEGY_DEPARTURE_TIME",
                "tripsBefore": 0,
                "tripsAfter": 6,
            },
            "meansOfTransportationClasses": MEANS,
            "flags": {"polyline": False, "polylineBeforeAfter": False,
                      "realTimeInformation": False, "turnByTurnNavigation": False},
        },
    }
    r = requests.get(f"{API}/search/", params={"input": json.dumps(body)}, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json().get("value", {}).get("tripOffers", [])


def _seat_price(offer):
    for part in offer.get("reservationOfferParts") or []:
        if any(p["productId"] == "PC_SEAT_STANDARD" for p in part["products"]):
            price = part.get("price")
            if price and part["status"]["category"] == "SELLABLE":
                return round(price["amount"] / 10 ** price["scale"])
    return None


def _parse(trip_offer, ticket_label):
    trip = trip_offer["trip"]
    legs = [l for l in trip["tripLegs"] if l.get("stops")]
    if not legs:
        return None
    dep = legs[0]["stops"][0]["plannedTimeAndTrackInfo"].get("departureTime")
    arr = legs[-1]["stops"][-1]["plannedTimeAndTrackInfo"].get("arrivalTime")
    if not dep or not arr:
        return None

    offers = [
        o for o in trip_offer["offers"]
        if o["contents"]["offerType"] in OFFER_NAMES and o["status"]["category"] == "SELLABLE"
    ]
    if not offers:
        return None
    best = min(offers, key=lambda o: o["offerSummary"]["minimalPrice"]["amount"])
    p = best["offerSummary"]["minimalPrice"]
    dep_dt, arr_dt = datetime.fromisoformat(dep), datetime.fromisoformat(arr)
    return {
        "id": trip["id"],
        "departure": dep[11:16],
        "arrival": arr[11:16],
        "departure_date": dep[:10],
        "duration_min": int((arr_dt - dep_dt).total_seconds() // 60),
        "price": round(p["amount"] / 10 ** p["scale"]),
        "ticket_type": f"{OFFER_NAMES[best['contents']['offerType']]} · {ticket_label}",
        "seat_price": _seat_price(best),
        "transfers": trip.get("changeCount", len(legs) - 1),
        # Åbner DSB-appen på telefon (universal link); på computer vises DSB's søgeside.
        "url": "https://www.dsb.dk/indland/billettype/",
    }


def search(from_name, to_name, day: Date, discount=None, time_from=None, time_to=None):
    traveler, label = DISCOUNTS.get(discount, DISCOUNTS[None])
    frm, to = _location(from_name), _location(to_name)

    key = ("dsb-search", frm["stopId"], to["stopId"], day.isoformat(), traveler, time_from, time_to)
    if (hit := cache.get(key)) is not None:
        return hit

    start = datetime.combine(day, time.fromisoformat(time_from) if time_from else time(5, 0), TZ)
    end = datetime.combine(day, time.fromisoformat(time_to) if time_to else time(23, 59), TZ)
    slots = []
    t = start
    while t <= end:
        slots.append(t.astimezone(ZoneInfo("UTC")))
        t += SLOT

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda s: _search_slot(frm, to, s, traveler), slots))

    seen, trips = set(), []
    for trip_offers in results:
        for to_ in trip_offers:
            parsed = _parse(to_, label)
            # Samme afgang kan komme i flere tidsvinduer (med nyt id), så dedup på tider.
            k = parsed and (parsed["departure_date"], parsed["departure"], parsed["arrival"], parsed["transfers"])
            if parsed and k not in seen:
                seen.add(k)
                trips.append(parsed)
    trips.sort(key=lambda x: x["price"])
    cache.set(key, trips)
    return trips
