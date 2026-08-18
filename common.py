"""Shared room-type classification, fit assessment, and price/room filtering
used by every scraper source (sw-ka.de, wg-gesucht.de, ...).

German phrasing for whole apartments ("N-Zimmer-Wohnung") and shared-flat
rooms ("Zimmer in Ner WG") is consistent enough across sites that these
regexes were pulled out of scraper_full.py verbatim rather than duplicated
per source.
"""

import re
from datetime import datetime

# ── Column schema shared by every source ────────────────────────────────────
COLUMNS = [
    "Source", "Listing URL", "Fit", "Best Match", "Available From", "Posted",
    "Room Type", "Rooms", "Sleeps",
    "Rent/Person (EUR)", "Total (EUR)", "Rent (EUR)", "Extra Costs (EUR)",
    "Size (m2)", "City", "District", "Street", "ZIP",
    "Email", "Phone", "Mobile", "Name",
    "Why", "Flags", "Notes", "Restrictions",
    "Deposit (EUR)", "Electricity", "Heating", "Heating Type",
    "Facilities", "Setup", "Renovation",
    "Bus (min)", "Tram (min)", "Train (min)",
    "Scraped At",
]

# ── Room-type filter ──────────────────────────────────────────────────────────
# Every "Zimmertyp" convention seen across sw-ka.de and wg-gesucht.de:
#   "3-Zimmer-Wohnung"   "2,5-Zimmer-Wohnung"  → whole apartment, N rooms
#   "4 Einzelzimmer in 4er WG"                 → 4 rooms of a 4-person flat,
#                                                i.e. the whole flat is free
#   "1 Einzelzimmer in 4er WG" / "Zimmer in 4er WG" → one room in an existing flat
#   "Einzelzimmer" / "Doppelzimmer"            → one standalone room
# The leading count in "N Einzelzimmer in Mer WG" is how many rooms are on
# offer — N >= 2 means a group can move in together.

APARTMENT_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*-?\s*Zimmer\s*-?\s*Wohnung", re.I)
WG_ROOMS_RE  = re.compile(r"(\d+)\s*(?:Einzel|Doppel)?zimmer\s+in\s+(\d+)\s*er\s*WG", re.I)
WG_ANY_RE    = re.compile(r"in\s+(\d+)\s*er\s*WG", re.I)
DOUBLE_RE    = re.compile(r"Doppelzimmer", re.I)
SINGLE_RE    = re.compile(r"Einzelzimmer|Appartement|Apartment|Zimmer", re.I)

# Free-text rescues: the type says "one room" but the landlord is really
# offering the whole place, or explicitly welcomes a flatshare. These run on
# the landlord's own free-text remark only ("Bemerkung" on sw-ka.de, the
# description block on wg-gesucht.de) — a structured "Sonstiges" row renders
# every option label whether selected or not, so it cannot be read as free text.
#
# "ganze Wohnung" must be about availability: "Internet in der ganzen Wohnung"
# is not an offer, so require a frei/vermieten word close behind it.
WHOLE_FLAT_RE = re.compile(
    r"(?:ganze[sn]?|gesamte[sn]?|komplette[rn]?)\s+(?:\S+\s+){0,2}?(?:WG|Wohnung|Haus)"
    r"[^.!?]{0,40}?(?:frei|vermiet|verf(?:ü|ue)gbar|zu\s+haben|beziehbar)"
    r"|WG[-\s]?Aufl(?:ö|oe)sung"
    r"|whole\s+(?:flat|apartment)|entire\s+(?:flat|apartment)", re.I)
# "2 Zim. frei", "3 Zimmer frei", "2 Einzelzimmer (je 11qm)" — several rooms
# of one place going at once.
MULTI_ROOM_RE = re.compile(
    r"\b([2-9])\s*(?:Einzel)?[Zz]im(?:mer)?\b\.?\s*(?:\([^)]*\)\s*)?"
    r"(?:frei|zu\s+vermieten|verf(?:ü|ue)gbar|in\b)", re.I)
WG_FRIENDLY_RE = re.compile(
    r"WG[-\s]?geeignet|WG[-\s]?tauglich|f(?:ü|ue)r\s+(?:eine\s+)?WG\b|"
    r"WG[-\s]?Neugr(?:ü|ue)ndung|WG[-\s]?f(?:ä|ae)hig|"
    r"ideal\s+f(?:ü|ue)r\s+\d*\s*er?[-\s]?WG", re.I)
# Hard "one tenant only" statements — never silently drop these, just flag them.
SINGLE_ONLY_RE = re.compile(
    r"nur\s+(?:f(?:ü|ue)r\s+)?(?:eine\s+)?Einzelperson|nur\s+f(?:ü|ue)r\s+1\s*(?:Person|Student)|"
    r"keine\s+WG|nicht\s+f(?:ü|ue)r\s+(?:eine\s+)?WG|Einzelmieter", re.I)


def classify(type_text: str) -> dict:
    """Map a Zimmertyp string to {kind, rooms, sleeps}.

    `rooms` is how many lettable rooms this one offer covers. `sleeps` assumes
    a group may share one room two-up — that is what makes a 2-room place
    viable for three people.
    """
    t = (type_text or "").strip()

    m = APARTMENT_RE.search(t)
    if m:
        # "2,5-Zimmer-Wohnung" — the half room is a box room, not a bedroom.
        rooms = int(float(m.group(1).replace(",", ".")))
        return {"kind": "apartment", "rooms": rooms, "sleeps": rooms + 1}

    m = WG_ROOMS_RE.search(t)
    if m:
        offered, wg_size = int(m.group(1)), int(m.group(2))
        if offered >= 2:
            # Several rooms of the same flat are free at once.
            kind = "whole_wg" if offered >= wg_size else "wg_multi"
            return {"kind": kind, "rooms": offered, "sleeps": offered + 1}
        return {"kind": "wg_room", "rooms": 1, "sleeps": 1}

    if WG_ANY_RE.search(t):
        return {"kind": "wg_room", "rooms": 1, "sleeps": 1}
    if DOUBLE_RE.search(t):
        return {"kind": "double_room", "rooms": 1, "sleeps": 2}
    if SINGLE_RE.search(t):
        return {"kind": "single_room", "rooms": 1, "sleeps": 1}

    return {"kind": "unknown", "rooms": None, "sleeps": None}


def assess(info: dict, remark: str = "", group_size: int = 3) -> dict:
    """Decide whether a listing can house `group_size` people.

    Returns {fit, why, flags}. `fit` is "match" (confident), "check" (worth a
    look — the type alone says no but the free text hints otherwise, or the
    size fits but the landlord added a caveat) or "no".
    """
    text = remark or ""
    flags = []
    if SINGLE_ONLY_RE.search(text):
        flags.append("landlord says single tenant only")

    sleeps = info.get("sleeps") or 0
    rooms  = info.get("rooms")
    big_enough = sleeps >= group_size

    if big_enough:
        why = (f"{rooms} rooms → sleeps {sleeps}"
               if info["kind"] == "apartment"
               else f"{rooms} rooms of a shared flat on offer → sleeps {sleeps}")
        # Don't discard on a caveat — surface it and let a human judge.
        if SINGLE_ONLY_RE.search(text):
            return {"fit": "check", "why": f"{why}, but landlord wants one tenant",
                    "flags": flags}
        return {"fit": "match", "why": why, "flags": flags}

    # Too small on paper — look for a whole-flat or WG-friendly hint.
    if WHOLE_FLAT_RE.search(text):
        return {"fit": "check", "why": "remark suggests the whole place is free",
                "flags": flags}
    m = MULTI_ROOM_RE.search(text)
    if m and int(m.group(1)) >= group_size - 1:
        return {"fit": "check", "why": f"remark mentions {m.group(1)} rooms going at once",
                "flags": flags}
    if WG_FRIENDLY_RE.search(text):
        return {"fit": "check", "why": "landlord welcomes a flatshare",
                "flags": flags}
    if info["kind"] == "unknown":
        return {"fit": "check", "why": "room type not recognised — verify manually",
                "flags": flags}

    return {"fit": "no", "why": f"{info['kind']} sleeps {sleeps}", "flags": flags}


# ── Price / room-count gate ──────────────────────────────────────────────────
# Real inclusion rule for the sheet: rooms/rent/deposit and confident fit.
# A missing/unparseable deposit or rent doesn't hard-exclude — it's treated as
# "unknown, worth a manual look" rather than silently dropped.
ALLOWED_ROOMS = (2, 3, 4)
MAX_RENT_FILTER = 1200
MAX_DEPOSIT_FILTER = 2200


def _within(value, ceiling) -> bool:
    """True if value is missing (unknown -> don't exclude) or <= ceiling."""
    return value in (None, "") or value <= ceiling


def passes_room_price_filter(detail: dict) -> bool:
    """Room-count/price gate only - the Fit/"check"-vs-"match" tier is a
    separate decision the caller already makes (see INCLUDE_MAYBE in
    scraper_full.py). Combine both before deciding what goes in the sheet."""
    if detail.get("Rooms") not in ALLOWED_ROOMS:
        return False
    return (_within(detail.get("Rent (EUR)"), MAX_RENT_FILTER)
            and _within(detail.get("Deposit (EUR)"), MAX_DEPOSIT_FILTER))


def is_best_match(detail: dict) -> bool:
    """Top-tier rows: confident fit, in the room-count range, and both price
    ceilings are known and satisfied (not just "unknown, maybe okay")."""
    rent = detail.get("Rent (EUR)")
    deposit = detail.get("Deposit (EUR)")
    return (detail.get("Fit") == "match"
            and detail.get("Rooms") in ALLOWED_ROOMS
            and rent not in (None, "") and rent <= MAX_RENT_FILTER
            and deposit not in (None, "") and deposit <= MAX_DEPOSIT_FILTER)


# ── Text-extraction helpers ──────────────────────────────────────────────────
def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def field(text, *labels):
    """Extract value after any of the given labels in plain text."""
    for label in labels:
        m = re.search(rf"{re.escape(label)}\s*[:\-]?\s*(.+?)(?:\n|$)", text, re.I)
        if m:
            return m.group(1).strip()
    return ""


def first_number(text):
    m = re.search(r"(\d+)", text.replace(",", "").replace(".", ""))
    return m.group(1) if m else ""


def to_int_or_none(text):
    """first_number() returns a numeric string or "" — this gives a real int
    (or None) so price fields can be compared, not just displayed."""
    n = first_number(text or "")
    return int(n) if n else None
