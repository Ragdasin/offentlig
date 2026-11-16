"""Simpel in-memory cache med udløbstid (nok til ~100 brugere)."""
import time

_store = {}
TTL_SECONDS = 10 * 60


def get(key):
    hit = _store.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    _store.pop(key, None)
    return None


def set(key, value, ttl=TTL_SECONDS):
    _store[key] = (time.time() + ttl, value)
