import re
from urllib.parse import urlparse

import requests

LATLNG_RE = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$")
GMAPS_AT_RE = re.compile(r"@(-?\d+\.\d+),(-?\d+\.\d+)")
GMAPS_Q_RE = re.compile(r"[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)")

USER_AGENT = "shm-across-america/1.0"


class GeocodeError(Exception):
    pass


def _in_range(lat, lng):
    return -90 <= lat <= 90 and -180 <= lng <= 180


def _looks_like_url(s):
    return s.startswith("http://") or s.startswith("https://")


def _resolve_maps_url(url):
    """Extract lat/lng from a Google Maps URL, following redirects first
    so short links (maps.app.goo.gl, goo.gl/maps/...) resolve to their
    long form, which usually carries an @lat,lng or ?q=lat,lng segment.
    """
    final_url = url
    try:
        resp = requests.get(
            url, allow_redirects=True, timeout=8, headers={"User-Agent": USER_AGENT}
        )
        final_url = resp.url
    except Exception:
        pass

    m = GMAPS_AT_RE.search(final_url) or GMAPS_Q_RE.search(final_url)
    if not m:
        # some redirects land the coords in the page body instead of the URL
        try:
            m = GMAPS_AT_RE.search(resp.text) or GMAPS_Q_RE.search(resp.text)
        except Exception:
            m = None
    if not m:
        return None
    return float(m.group(1)), float(m.group(2))


def forward_geocode(query):
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "jsonv2", "limit": 1},
            headers={"User-Agent": USER_AGENT},
            timeout=8,
        )
        resp.raise_for_status()
        results = resp.json()
    except Exception:
        return None
    if not results:
        return None
    return float(results[0]["lat"]), float(results[0]["lon"])


def reverse_geocode(lat, lng):
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lng, "format": "jsonv2", "zoom": 10},
            headers={"User-Agent": USER_AGENT},
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()
        addr = data.get("address", {})
        place = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("county")
        state = addr.get("state")
        if place and state:
            return f"{place}, {state}"
        return place or data.get("name")
    except Exception:
        return None


def resolve_location(raw):
    """Resolve a free-form location string to (lat, lng, label, exact).

    Accepts, in order: a bare "lat, lng" pair, a Google Maps URL (including
    short links, which get resolved via redirect), or a place name/address
    (forward-geocoded via Nominatim). Raises GeocodeError if nothing about
    the input resolves to real coordinates.

    `exact` is True only when the input was already a literal "lat, lng"
    pair -- callers should treat a False result as a guess worth
    confirming with the user before committing to it, since a place name
    or maps link can resolve to the wrong spot.
    """
    raw = (raw or "").strip()
    if not raw:
        raise GeocodeError("Enter a location.")

    m = LATLNG_RE.match(raw)
    if m:
        lat, lng = float(m.group(1)), float(m.group(2))
        exact = True
    elif _looks_like_url(raw):
        if "google" not in urlparse(raw).netloc and "goo.gl" not in urlparse(raw).netloc:
            raise GeocodeError("That link isn't a Google Maps link.")
        coords = _resolve_maps_url(raw)
        if not coords:
            raise GeocodeError("Couldn't find coordinates in that Google Maps link.")
        lat, lng = coords
        exact = False
    else:
        coords = forward_geocode(raw)
        if not coords:
            raise GeocodeError(f'Couldn\'t find a place called "{raw}".')
        lat, lng = coords
        exact = False

    if not _in_range(lat, lng):
        raise GeocodeError("Those coordinates are out of range.")

    label = reverse_geocode(lat, lng)
    return lat, lng, label, exact
