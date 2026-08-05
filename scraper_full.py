"""
sw-ka.de Room Scraper — Full version
Scrapes every whole-apartment listing that houses GROUP_SIZE people and syncs
them to Google Sheets. Runs headless (no visible browser window) for
cloud/scheduled use.

Requirements: pip install playwright gspread google-auth
Browser:      python -m playwright install chromium
Env vars:     SWKA_EMAIL, SWKA_PASSWORD, GOOGLE_CREDS (JSON string), SHEET_ID
              GROUP_SIZE (default 3), MAX_RENT (default 1800)
"""

import os, sys, re, json, time, csv
from datetime import datetime
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

# ── Config ────────────────────────────────────────────────────────────────────
EMAIL    = os.environ.get("SWKA_EMAIL", "daniyalnahk@gmail.com")
PASSWORD = os.environ.get("SWKA_PASSWORD", "Daniyalkhan789@")
# Cold rent ceiling on the figure the listing advertises. Deliberately generous:
# it is a safety net against parse errors, not the real filter. Judge by the
# "Rent/Person (EUR)" column in the sheet instead.
MAX_RENT = int(os.environ.get("MAX_RENT", "2500"))
# How many people need to fit. One room may be shared by two, so a place with
# R lettable rooms sleeps R + 1 → we need R >= GROUP_SIZE - 1.
GROUP_SIZE = int(os.environ.get("GROUP_SIZE", "3"))
# Keep "check" rows (plausible but not certain) in the sheet. Set to "false"
# for confirmed matches only.
INCLUDE_MAYBE = os.environ.get("INCLUDE_MAYBE", "true").lower() == "true"
HEADLESS = os.environ.get("HEADLESS", "true").lower() == "true"

SHEET_ID     = os.environ.get("SHEET_ID", "")       # Google Sheet ID from URL
GOOGLE_CREDS = os.environ.get("GOOGLE_CREDS", "")   # Service account JSON string

LOGIN_URL    = "https://www.sw-ka.de/en/mein_account/"
LISTINGS_URL = "https://www.sw-ka.de/en/wohnen/zimmervermittlung/privatzimmer_suchen/"

COLUMNS = [
    "Scraped At", "Fit", "Why", "Flags",
    "Rent (EUR)", "Extra Costs (EUR)", "Total (EUR)",
    "Rent/Person (EUR)", "Rooms", "Sleeps",
    "Room Type", "Size (m2)", "Available From",
    "Name", "Email", "Phone", "Mobile",
    "Street", "ZIP", "City", "District",
    "Deposit (EUR)", "Electricity", "Heating", "Heating Type",
    "Facilities", "Setup", "Renovation",
    "Bus (min)", "Tram (min)", "Train (min)",
    "Restrictions", "Notes",
    "Listing URL",
]

# ── Room-type filter ──────────────────────────────────────────────────────────
# Every "Zimmertyp" sw-ka publishes, taken from a full crawl of the board:
#   "3-Zimmer-Wohnung"   "2,5-Zimmer-Wohnung"  → whole apartment, N rooms
#   "4 Einzelzimmer in 4er WG"                 → 4 rooms of a 4-person flat,
#                                                i.e. the whole flat is free
#   "1 Einzelzimmer in 4er WG"                 → one room in an existing flat
#   "Einzelzimmer" / "Doppelzimmer"            → one standalone room
# The leading count in "N Einzelzimmer in Mer WG" is how many rooms are on
# offer — N >= 2 means a group can move in together, which the earlier
# version missed entirely.

APARTMENT_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*-?\s*Zimmer\s*-?\s*Wohnung", re.I)
WG_ROOMS_RE  = re.compile(r"(\d+)\s*(?:Einzel|Doppel)?zimmer\s+in\s+(\d+)\s*er\s*WG", re.I)
WG_ANY_RE    = re.compile(r"in\s+(\d+)\s*er\s*WG", re.I)
DOUBLE_RE    = re.compile(r"Doppelzimmer", re.I)
SINGLE_RE    = re.compile(r"Einzelzimmer|Appartement|Apartment|Zimmer", re.I)

# Free-text rescues: the type says "one room" but the landlord is really
# offering the whole place, or explicitly welcomes a flatshare. These run on
# the landlord's own "Bemerkung" text only — the "Sonstiges" row renders every
# option label ("Nur Mann | Nur Frau | Paar | ...") whether selected or not,
# so it cannot be read as free text.
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


def assess(info: dict, remark: str = "") -> dict:
    """Decide whether a listing can house GROUP_SIZE people.

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
    big_enough = sleeps >= GROUP_SIZE

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
    if m and int(m.group(1)) >= GROUP_SIZE - 1:
        return {"fit": "check", "why": f"remark mentions {m.group(1)} rooms going at once",
                "flags": flags}
    if WG_FRIENDLY_RE.search(text):
        return {"fit": "check", "why": "landlord welcomes a flatshare",
                "flags": flags}
    if info["kind"] == "unknown":
        return {"fit": "check", "why": "room type not recognised — verify manually",
                "flags": flags}

    return {"fit": "no", "why": f"{info['kind']} sleeps {sleeps}", "flags": flags}

# ── Helpers ───────────────────────────────────────────────────────────────────
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

# ── Login ─────────────────────────────────────────────────────────────────────
def login(page):
    log("Logging in...")
    page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(2000)
    try: page.click("button:has-text('Akzeptieren')", timeout=3000)
    except: pass
    try: page.click("button:has-text('Accept')", timeout=2000)
    except: pass

    # If no login form yet, click the Login link in the top-right navigation
    if not page.query_selector("input[type='password']"):
        log("No login form visible — clicking Login link...")
        for sel in [
            "a[href*='login']", "a[href*='anmelden']",
            "a:has-text('Login')", "a:has-text('Anmelden')",
            ".new_login_box a", "a[href*='mein_account']",
        ]:
            try:
                page.click(sel, timeout=3000)
                page.wait_for_timeout(2000)
                if page.query_selector("input[type='password']"):
                    break
            except: pass

    # Fill credentials
    page.fill("input[type='email'], input[name*='email'], input[name*='user'], input[name*='login']", EMAIL)
    page.fill("input[type='password']", PASSWORD)
    page.click("button[type='submit'], input[type='submit']")
    page.wait_for_load_state("domcontentloaded", timeout=30000)
    page.wait_for_timeout(2000)
    ok = "abmelden" in page.content().lower() or "logout" in page.content().lower()
    log(f"Login {'OK' if ok else 'uncertain — continuing anyway'}")

# ── Collect listing URLs ──────────────────────────────────────────────────────
def collect_listings(page):
    """Walk every result page and return one entry per listing.

    Nothing is filtered on room type here: the free-text remark that rescues a
    mislabelled whole-flat offer only exists on the detail page, so the
    decision is made later in main(). Only the rent ceiling applies.
    """
    seen, results = set(), []
    over_budget = 0
    page_num = 1
    while True:
        # Pagination is ?cpage=N. The old tx_swkawohn_pi1[page] parameter was
        # ignored by the site, so every run only ever saw the first 40 offers.
        url = LISTINGS_URL if page_num == 1 else f"{LISTINGS_URL}?cpage={page_num}"
        log(f"Scanning page {page_num}...")
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(2000)

        rows = page.query_selector_all(
            "table tbody tr, .listing-item, article, li.room, .tx-swkawohn-pi1 li, .angebot"
        )
        discovered = 0
        for row in rows:
            text = row.inner_text()
            m = re.search(r"(\d{2,5})\s*[Ee]uro|(\d{2,5})\s*€", text)
            if not m: continue
            rent = int(m.group(1) or m.group(2))
            link = row.query_selector("a[href]")
            if not link: continue
            href = link.get_attribute("href")
            full = urljoin(LISTINGS_URL, href)
            id_m = re.search(r"id=(\d+)", full)
            key = id_m.group(1) if id_m else full
            if key in seen: continue
            seen.add(key)
            discovered += 1

            if rent > MAX_RENT:
                over_budget += 1
                continue

            # First cell of the result row is the Zimmertyp.
            type_text = text.split("\t")[0].strip()
            results.append({"rent": rent, "url": full, "type_text": type_text,
                            "info": classify(type_text)})

        log(f"  Page {page_num}: {discovered} listings found")
        if discovered == 0:
            break
        page_num += 1
        time.sleep(1)

    if over_budget:
        log(f"Skipped {over_budget} listings above the EUR{MAX_RENT} ceiling.")
    return results

# ── Parse detail page ─────────────────────────────────────────────────────────
SCAM_WARNING = "wohnen@sw-ka.de"  # appears in the fraud-warning text on every page

def parse_detail(page, url, rent_from_list, type_text="", info=None):
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    # The board is server-rendered, so a short settle is enough. This runs
    # ~136 times per crawl now that every listing is checked, and 3s each
    # blew past the job timeout.
    page.wait_for_timeout(700)

    # Save HTML of first listing for debugging (remove after confirming fields)
    if not os.path.exists("listing_real.html"):
        with open("listing_real.html", "w", encoding="utf-8") as f:
            f.write(page.content())

    # Scope everything to main content only — keeps navigation/footer out
    content_el = page.query_selector("#platocontent, .platocontent, main")
    body = content_el.inner_text() if content_el else page.inner_text("body")

    # Build kv map from main content tables only
    kv = {}
    selector = "#platocontent table tr, main table tr" if content_el else "table tr"
    for row in page.query_selector_all(selector):
        cells = row.query_selector_all("td, th")
        if len(cells) >= 2:
            k = cells[0].inner_text().strip().lower().rstrip(":").strip()
            v = cells[1].inner_text().strip()
            if k and v and SCAM_WARNING not in v:
                kv[k] = v

    def kv_get(*keys):
        for k in keys:
            kl = k.lower()
            for kk, vv in kv.items():
                if kl in kk and SCAM_WARNING not in vv:
                    return vv
        # Fallback: regex on scoped body text (stop before energy cert section)
        body_safe = body.split("Energieverbrauchsausweis")[0].split("energy performance")[0]
        return field(body_safe, *keys)

    # Email — search raw HTML for any email address
    raw_html = page.content()
    emails = re.findall(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", raw_html)
    emails = [e for e in emails if "sw-ka.de" not in e and "w3.org" not in e
              and not e.endswith(".png") and not e.endswith(".svg")]
    for a in page.query_selector_all("a[href^='mailto:']"):
        href = a.get_attribute("href").replace("mailto:", "").split("?")[0].strip()
        if href and "sw-ka.de" not in href:
            emails.append(href)
    email = "; ".join(sorted(set(emails)))

    # Phones
    phones_raw = re.findall(r"(?:Tel|Phone|Telefon|Mobil|Mobile)[\s\.:]*([+\d][\d\s\-\/\(\)]{6,18})", body, re.I)
    all_phones  = re.findall(r"(?<!\d)(?:\+49|0)[1-9][\d\s\-\/]{7,16}(?!\d)", body)
    phones = list(dict.fromkeys(p.strip() for p in (phones_raw or all_phones)))[:4]

    # Rent — prefer from kv, fallback to list value
    rent_str = kv_get("rent", "miete", "kaltmiete") or str(rent_from_list)
    rent_num = int(first_number(rent_str)) if first_number(rent_str) else rent_from_list
    extra_str = kv_get("additional costs", "nebenkosten", "betriebskosten")
    extra_num = int(first_number(extra_str)) if first_number(extra_str) else 0

    # Size — look specifically for "m²" pattern in body
    size_m = re.search(r"(\d+)\s*m[²2]", body)
    size = size_m.group(1) if size_m else first_number(kv_get("living space", "wohnfläche", "wohnraum"))

    # Room type — the detail page states it as "about 69 m² - 3-Zimmer-Wohnung".
    # Prefer the value from the results table, which is already just the type.
    room_type = type_text or kv_get("zimmertyp", "room type", "zimmerart")
    room_type = re.sub(r"^.*?m[²2]\s*-\s*", "", room_type).strip()
    if not info or info.get("kind") == "unknown":
        info = classify(room_type)
    rooms  = info.get("rooms")
    sleeps = info.get("sleeps")

    # Free text. "Bemerkung" is where landlords write "ganze WG frei" or
    # "nur Einzelperson", so it decides the borderline cases.
    remark = kv_get("bemerkung", "note", "hinweis", "anmerkung")
    misc   = kv_get("miscellaneous", "sonstiges", "restrictions")
    verdict = assess(info, remark)

    # Available from — look for date pattern first
    date_m = re.search(r"(\d{1,2}[./]\d{1,2}[./]\d{2,4}|sofort|immediately|ab sofort)", body, re.I)
    available = date_m.group(1) if date_m else kv_get("available", "verfügbar", "bezugsfrei")

    # Name — many landlords opt out of publishing
    name_raw = kv_get("name", "anbieter")
    name = "" if (not name_raw or SCAM_WARNING in name_raw or len(name_raw) > 100) else name_raw

    # Address — look for German postcode pattern (5 digits) to find city line
    street = kv_get("street", "straße", "strasse")
    zip_city_m = re.search(r"(\d{5})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)", body)
    zip_code = zip_city_m.group(1) if zip_city_m else kv_get("plz", "zip", "postleitzahl")
    city = zip_city_m.group(2) if zip_city_m else kv_get("city", "stadt", "ort")

    # Transport minutes
    bus_m   = re.search(r"(\d+)\s*(?:min[^a-z]|Minute)[^\d]*Bus",   body, re.I)
    tram_m  = re.search(r"(\d+)\s*(?:min[^a-z]|Minute)[^\d]*(?:Tram|Straßenbahn)", body, re.I)
    train_m = re.search(r"(\d+)\s*(?:min[^a-z]|Minute)[^\d]*(?:Train|S-Bahn|Zug)", body, re.I)
    # Also try reversed: "Bus ... X min"
    if not bus_m:
        bus_m = re.search(r"Bus[^\d]{0,30}(\d+)\s*min", body, re.I)
    if not tram_m:
        tram_m = re.search(r"(?:Tram|Straßenbahn)[^\d]{0,30}(\d+)\s*min", body, re.I)
    if not train_m:
        train_m = re.search(r"(?:S-Bahn|Zug|Train)[^\d]{0,30}(\d+)\s*min", body, re.I)

    return {
        "Scraped At":        datetime.now().strftime("%Y-%m-%d %H:%M"),
        "Fit":               verdict["fit"],
        "Why":               verdict["why"],
        "Flags":             "; ".join(verdict["flags"]),
        "Rent (EUR)":        rent_num,
        "Extra Costs (EUR)": extra_num if extra_num else "",
        "Total (EUR)":       rent_num + extra_num,
        "Rent/Person (EUR)": round((rent_num + extra_num) / GROUP_SIZE) if GROUP_SIZE else "",
        "Rooms":             rooms if rooms else "",
        "Sleeps":            sleeps if sleeps else "",
        "Room Type":         room_type,
        "Size (m2)":         size,
        "Available From":    available,
        "Name":              name,
        "Email":             email,
        "Phone":             phones[0] if len(phones) > 0 else "",
        "Mobile":            phones[1] if len(phones) > 1 else "",
        "Street":            street,
        "ZIP":               zip_code,
        "City":              city,
        "District":          kv_get("district", "stadtteil", "bezirk"),
        "Deposit (EUR)":     first_number(kv_get("deposit", "kaution")),
        "Electricity":       kv_get("electricity", "strom"),
        "Heating":           kv_get("heating costs", "heizkosten"),
        "Heating Type":      kv_get("heating", "heizung"),
        "Facilities":        kv_get("facilities", "ausstattung"),
        "Setup":             kv_get("setup", "einrichtung", "furnished", "möblierung"),
        "Renovation":        kv_get("renovation", "renovierung"),
        "Bus (min)":         bus_m.group(1) if bus_m else "",
        "Tram (min)":        tram_m.group(1) if tram_m else "",
        "Train (min)":       train_m.group(1) if train_m else "",
        "Restrictions":      misc,
        "Notes":             remark,
        "Listing URL":       url,
    }

# ── Google Sheets sync ────────────────────────────────────────────────────────
def sync_to_sheets(rows):
    if not SHEET_ID or not GOOGLE_CREDS:
        log("No Google Sheets config — skipping sync.")
        return

    try:
        import gspread
        from google.oauth2.service_account import Credentials

        scopes = ["https://www.googleapis.com/auth/spreadsheets"]
        creds_dict = json.loads(GOOGLE_CREDS)
        creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
        gc = gspread.authorize(creds)
        sh = gc.open_by_key(SHEET_ID)

        # Use first sheet or create one named "Rooms"
        try:
            ws = sh.worksheet("Rooms")
        except gspread.WorksheetNotFound:
            ws = sh.add_worksheet(title="Rooms", rows=500, cols=len(COLUMNS))

        # Write header + data
        data = [COLUMNS] + [[str(r.get(c, "")) for c in COLUMNS] for r in rows]
        ws.clear()
        ws.update(data, value_input_option="USER_ENTERED")

        # Bold the header row
        ws.format("1:1", {"textFormat": {"bold": True}})

        log(f"Google Sheets updated — {len(rows)} rows written.")
        log(f"Sheet URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}")

    except Exception as e:
        log(f"Google Sheets error: {e}")

# ── Save CSV ──────────────────────────────────────────────────────────────────
def save_csv(rows, path="rooms_full.csv"):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    log(f"CSV saved to {path}")

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    log(f"Starting scraper — places for {GROUP_SIZE} people ({GROUP_SIZE - 1}+ rooms), "
        f"max rent EUR{MAX_RENT}, include-maybes={INCLUDE_MAYBE}, headless={HEADLESS}")
    with sync_playwright() as pw:
        chrome_paths = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        ]
        exe = next((p for p in chrome_paths if os.path.exists(p)), None)

        if exe and not HEADLESS:
            browser = pw.chromium.launch(headless=False, executable_path=exe)
        elif exe:
            browser = pw.chromium.launch(headless=True, executable_path=exe)
        else:
            # Cloud / GitHub Actions: use installed Chromium
            browser = pw.chromium.launch(headless=True)

        page = browser.new_context(locale="en-GB").new_page()
        page.set_default_timeout(60000)

        login(page)
        listings = collect_listings(page)
        log(f"Total listings to process: {len(listings)}")

        results, rejected, errors = [], 0, 0
        for i, item in enumerate(listings, 1):
            try:
                detail = parse_detail(page, item["url"], item["rent"],
                                      item.get("type_text", ""), item.get("info"))
            except Exception as e:
                errors += 1
                log(f"[{i}/{len(listings)}] ERROR {item['url']}: {e}")
                time.sleep(1)
                continue

            fit = detail["Fit"]
            if fit == "match" or (fit == "check" and INCLUDE_MAYBE):
                results.append(detail)
                flags = f" [{detail['Flags']}]" if detail["Flags"] else ""
                log(f"[{i}/{len(listings)}] {fit.upper()}: {detail['Room Type']} | "
                    f"EUR{detail['Rent (EUR)']} (EUR{detail['Rent/Person (EUR)']}/person) | "
                    f"{detail['Why']}{flags} | "
                    f"{detail['Email'] or detail['Phone'] or '(no contact)'}")
            else:
                rejected += 1
            time.sleep(0.25)

        browser.close()

    # Confident matches first, then the ones worth a manual look; cheapest
    # per person at the top of each group.
    order = {"match": 0, "check": 1}
    results.sort(key=lambda r: (order.get(r["Fit"], 2), r["Rent/Person (EUR)"] or 9999))

    matches = sum(1 for r in results if r["Fit"] == "match")
    checks  = len(results) - matches
    log(f"\nDone — {len(listings)} listings scanned: {matches} match, "
        f"{checks} worth checking, {rejected} rejected, {errors} errors.")
    save_csv(results)
    sync_to_sheets(results)

if __name__ == "__main__":
    main()
