"""Klimaaftryk pr. selskab for en referencetur Aarhus → København (pr. person).

Emissionsfaktorer (g CO2e pr. personkm, well-to-wheel, gennemsnitlig belægning):
  COWI for DSB (2026) "Sammenligning af emissionsfaktorer", data fra 2025:
    Tog IC3 (diesel) 50,9 g  — Aarhus–Fredericia er endnu ikke elektrificeret, så IC3 kører hele vejen
    Tog EB+DD (el)    3,0 g  — til sammenligning
    Fjernbus         19,2 g  (TEMA2015, 63 % belægning)
    Færge Aarhus–Odden, landgangspassager 118,7 g (TEMA2015, belægning 2025)
  Flix (2026) "2025 Avoided Emissions Methodology": FlixBus Danmark 20,5 g

Afstande (ca.): Aarhus–København 300 km ad vej/bane.
Kombardos færgerute: færge Aarhus–Odden ca. 75 km + bus Odden–København ca. 100 km.
"""

ROUTE = "Aarhus → København"
TRAIN_ROAD_KM = 300
FERRY_KM, ODDEN_BUS_KM = 75, 100

G_IC3, G_EL, G_BUS, G_FERRY, G_FLIX_OWN = 50.9, 3.0, 19.2, 118.7, 20.5


def fmt(v):
    return f"{v:.1f}".replace(".", ",")


def kg(g_per_km, km):
    return g_per_km * km / 1000


# Tog og bus: kilderne er uenige, så vi viser et interval
#   COWI 2026: IC3 50,9 g, fjernbus 19,2 g
#   Transportministeriet (svar til Transportudvalget, 2021): tog 26 g, bus 25 g
G_TOG_TRM, G_BUS_TRM = 26, 25

# Stjerner sættes manuelt ud fra det, kilderne er enige om:
# tog og fjernbus ligger tæt, bus + færge er klart dårligst.
TRIP = {
    "flixbus": {
        "stars": 3,
        "low": kg(G_BUS, TRAIN_ROAD_KM), "high": kg(G_BUS_TRM, TRAIN_ROAD_KM),
        "how": f"Fjernbus, ca. {TRAIN_ROAD_KM} km. Interval efter kilde",
        "own": f"FlixBus' eget tal: ca. {fmt(kg(G_FLIX_OWN, TRAIN_ROAD_KM))} kg",
    },
    "dsb": {
        "stars": 3,
        "low": kg(G_TOG_TRM, TRAIN_ROAD_KM), "high": kg(G_IC3, TRAIN_ROAD_KM),
        "how": f"IC3-dieseltog, ca. {TRAIN_ROAD_KM} km. Interval efter kilde. "
               f"Med eltog ville det være ca. {fmt(kg(G_EL, TRAIN_ROAD_KM))} kg",
        "own": "COWI-tallet er beregnet for DSB",
    },
    "kombardo": {
        "stars": 1,
        "low": kg(G_FERRY, FERRY_KM) + kg(G_BUS, ODDEN_BUS_KM),
        "high": kg(G_FERRY, FERRY_KM) + kg(G_BUS, ODDEN_BUS_KM),
        "how": f"Færge Aarhus–Odden (ca. {FERRY_KM} km) + bus til København (ca. {ODDEN_BUS_KM} km). Færgen trækker op",
        "own": "Kombardo oplyser ingen tal (busserne kører på HVO-diesel)",
    },
}

SOURCES = [
    ("COWI for DSB (2026): Sammenligning af emissionsfaktorer",
     "https://www.dsb.dk/globalassets/om-dsb/baeredygtighed/miljo/sammenligning-af-emissionsfaktorer---2026-v.2.pdf"),
    ("Flix (2026): 2025 Avoided Emissions Methodology",
     "https://corporate.flix.com/wp-content/uploads/2026/03/2025-Avoided-Emissions-Methodology-Document.pdf"),
    ("Transportministerens svar til Folketingets Transportudvalg (2021)", None),
]


def for_template():
    """Stjerner (3 = mest klimavenlig), tekst og bjælke på fælles skala."""
    scale = max(t["high"] for t in TRIP.values())
    out = {}
    for p, t in TRIP.items():
        same = round(t["low"], 1) == round(t["high"], 1)
        out[p] = {
            **t,
            "kg_text": f"ca. {fmt(t['low'])} kg" if same else f"ca. {fmt(t['low'])}–{fmt(t['high'])} kg",
            "left": 0 if same else round(t["low"] / scale * 100, 1),
            "width": round((t["high"] if same else t["high"] - t["low"]) / scale * 100, 1),
            "range": not same,
        }
    return out
