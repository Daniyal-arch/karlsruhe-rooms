"""
SW-KA room scraper — writes directly to Postgres via SQLAlchemy.
Marks any previously-active listings no longer found as inactive.
"""
import sys, io, os, re, time
from datetime import datetime, timezone
from urllib.parse import urljoin

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from playwright.sync_api import sync_playwright
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.models.room import Room
from app.database import Base
from app.services.geocoder import geocode_room

EMAIL        = os.environ["SWKA_EMAIL"]
PASSWORD     = os.environ["SWKA_PASSWORD"]
DATABASE_URL = os.environ["DATABASE_URL"]
MAX_RENT     = int(os.environ.get("MAX_RENT", "9999"))  # no limit — web filters handle this
HEADLESS     = os.environ.get("HEADLESS", "false").lower() == "true"

LOGIN_URL    = "https://www.sw-ka.de/en/mein_account/"
LISTINGS_URL = "https://www.sw-ka.de/en/wohnen/zimmervermittlung/privatzimmer_suchen/"
SCAM_WARNING = "wohnen@sw-ka.de"

engine = create_engine(DATABASE_URL)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)


def log(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def login(page):
    page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(2000)
    try:
        page.click("button:has-text('Akzeptieren')", timeout=3000)
    except Exception:
        pass
    try:
        page.click("button:has-text('Accept')", timeout=2000)
    except Exception:
        pass
    if not page.query_selector("input[type='password']"):
        log("No login form — clicking Login link...")
        for sel in ["a[href*='login']", "a[href*='anmelden']", "a:has-text('Login')",
                    "a:has-text('Anmelden')", ".new_login_box a", "a[href*='mein_account']"]:
            try:
                page.click(sel, timeout=3000)
                page.wait_for_timeout(2000)
                if page.query_selector("input[type='password']"):
                    break
            except Exception:
                pass
    page.fill("input[type='email'], input[name*='email'], input[name*='user'], input[name*='login']", EMAIL)
    page.fill("input[type='password']", PASSWORD)
    page.click("button[type='submit'], input[type='submit']")
    page.wait_for_load_state("domcontentloaded", timeout=30000)
    page.wait_for_timeout(2000)
    log("Login OK")


def collect_listings(page) -> list[dict]:
    """Returns list of {url, rent} dicts for all listings under MAX_RENT."""
    seen, results = set(), []
    page_num = 1
    while True:
        url = LISTINGS_URL if page_num == 1 else f"{LISTINGS_URL}?tx_swkawohn_pi1[page]={page_num}"
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(2000)
        log(f"Scanning page {page_num}...")

        rows = page.query_selector_all(
            "table tbody tr, .listing-item, article, li.room, .tx-swkawohn-pi1 li, .angebot"
        )
        new_count = 0
        for row in rows:
            text = row.inner_text()
            m = re.search(r"(\d{2,4})\s*[Ee]uro|(\d{2,4})\s*€", text)
            if not m:
                continue
            rent = int(m.group(1) or m.group(2))
            if rent > MAX_RENT:
                continue
            link = row.query_selector("a[href]")
            if not link:
                continue
            href = link.get_attribute("href")
            full = urljoin(LISTINGS_URL, href)
            id_m = re.search(r"id=(\d+)", full)
            key = id_m.group(1) if id_m else full
            if key in seen:
                continue
            seen.add(key)
            results.append({"url": full, "rent": rent})
            new_count += 1

        log(f"  Page {page_num}: {new_count} new listings under EUR{MAX_RENT}")
        if new_count == 0:
            break
        page_num += 1
        time.sleep(1)
    return results


def parse_detail(page, url: str, rent_from_list: int = 0) -> dict:
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(2000)

    content_el = page.query_selector("#platocontent, .platocontent, main")
    body = content_el.inner_text() if content_el else page.inner_text("body")

    # Build key-value map from tables in main content
    kv = {}
    selector = "#platocontent table tr, main table tr" if content_el else "table tr"
    for row in page.query_selector_all(selector):
        cells = row.query_selector_all("td, th")
        if len(cells) >= 2:
            k = cells[0].inner_text().strip().lower().rstrip(":").strip()
            v = cells[1].inner_text().strip()
            if k and v and SCAM_WARNING not in v:
                kv[k] = v

    def kv_get(*keys) -> str:
        for k in keys:
            for kk, vv in kv.items():
                if k.lower() in kk and SCAM_WARNING not in vv:
                    return vv
        body_safe = body.split("Energieverbrauchsausweis")[0].split("energy performance")[0]
        for k in keys:
            m = re.search(rf"{re.escape(k)}\s*[:\-]?\s*(.+?)(?:\n|$)", body_safe, re.I)
            if m:
                return m.group(1).strip()
        return ""

    def first_num(s: str):
        m = re.search(r"(\d+)", (s or "").replace(",", "").replace(".", ""))
        return int(m.group(1)) if m else None

    def first_float(s: str):
        m = re.search(r"([\d,]+)", s or "")
        return float(m.group(1).replace(",", ".")) if m else None

    # Email — search raw HTML
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
    all_phones = re.findall(r"(?<!\d)(?:\+49|0)[1-9][\d\s\-\/]{7,16}(?!\d)", body)
    phones = list(dict.fromkeys(p.strip() for p in (phones_raw or all_phones)))[:4]

    # Rent — kv table first, fallback to listing page value
    rent_str = kv_get("rent", "miete", "kaltmiete") or str(rent_from_list)
    rent = first_num(rent_str) or rent_from_list or None
    extra_str = kv_get("additional costs", "nebenkosten", "betriebskosten")
    extra = first_num(extra_str) or 0

    # Size
    size_m = re.search(r"(\d+)\s*m[²2]", body)
    size = float(size_m.group(1)) if size_m else first_float(kv_get("living space", "wohnfläche"))

    # Available from
    date_m = re.search(r"(\d{1,2}[./]\d{1,2}[./]\d{2,4}|sofort|immediately|ab sofort)", body, re.I)
    available = date_m.group(1) if date_m else kv_get("available", "verfügbar", "bezugsfrei")

    # Address
    street = kv_get("street", "straße", "strasse")
    zip_city = re.search(r"(\d{5})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)", body)
    zip_code = zip_city.group(1) if zip_city else kv_get("plz", "zip")
    city = zip_city.group(2) if zip_city else kv_get("city", "stadt", "ort")

    # Transport
    bus_m   = re.search(r"(\d+)\s*min[^a-z]*Bus|Bus[^\d]{0,30}(\d+)\s*min", body, re.I)
    tram_m  = re.search(r"(\d+)\s*min[^a-z]*(?:Tram|Straßenbahn)|(?:Tram|Straßenbahn)[^\d]{0,30}(\d+)\s*min", body, re.I)
    train_m = re.search(r"(\d+)\s*min[^a-z]*(?:S-Bahn|Zug|Train)|(?:S-Bahn|Zug|Train)[^\d]{0,30}(\d+)\s*min", body, re.I)

    return {
        "listing_url":     url,
        "rent_eur":        rent,
        "extra_costs_eur": extra or None,
        "total_eur":       (rent + extra) if rent else None,
        "deposit_eur":     first_num(kv_get("deposit", "kaution")),
        "room_type":       kv_get("room type", "zimmerart", "zimmer"),
        "size_m2":         size,
        "available_from":  available,
        "setup":           kv_get("setup", "einrichtung", "furnished", "möblierung"),
        "renovation":      kv_get("renovation", "renovierung"),
        "electricity":     kv_get("electricity", "strom"),
        "heating":         kv_get("heating costs", "heizkosten"),
        "heating_type":    kv_get("heating", "heizung"),
        "facilities":      kv_get("facilities", "ausstattung"),
        "street":          street,
        "zip_code":        zip_code,
        "city":            city,
        "district":        kv_get("district", "stadtteil", "bezirk"),
        "bus_min":         first_num(bus_m.group(1) or bus_m.group(2)) if bus_m else None,
        "tram_min":        first_num(tram_m.group(1) or tram_m.group(2)) if tram_m else None,
        "train_min":       first_num(train_m.group(1) or train_m.group(2)) if train_m else None,
        "restrictions":    kv_get("miscellaneous", "sonstiges", "restrictions"),
        "email":           email,
        "phone":           phones[0] if phones else "",
        "mobile":          phones[1] if len(phones) > 1 else "",
        "scraped_at":      datetime.now(timezone.utc),
    }


def upsert_room(db, data: dict):
    lat = lng = None
    if data.get("street") or data.get("zip_code") or data.get("city"):
        coords = geocode_room(data.get("street", ""), data.get("zip_code", ""), data.get("city", ""))
        if coords:
            lat, lng = coords

    existing = db.query(Room).filter(Room.listing_url == data["listing_url"]).first()
    if existing:
        for k, v in data.items():
            if v is not None:
                setattr(existing, k, v)
        if lat:
            existing.latitude, existing.longitude = lat, lng
            existing.location = func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326)
        existing.is_active = True
        existing.last_seen = datetime.now(timezone.utc)
    else:
        room = Room(**data, latitude=lat, longitude=lng)
        if lat:
            room.location = func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326)
        db.add(room)
    db.commit()


def run():
    log(f"Starting scraper — max rent EUR{MAX_RENT}, headless={HEADLESS}")
    db = Session()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=HEADLESS)
        page = browser.new_page()

        login(page)
        listings = collect_listings(page)
        log(f"Total listings to process: {len(listings)}")

        for i, item in enumerate(listings, 1):
            log(f"[{i}/{len(listings)}] {item['url']}")
            try:
                data = parse_detail(page, item["url"], item["rent"])
                upsert_room(db, data)
                log(f"  EUR{data.get('rent_eur')} | {data.get('city')} | {data.get('email') or data.get('phone') or '(no contact)'}")
            except Exception as e:
                log(f"  ERROR: {e}")
            time.sleep(0.5)

        browser.close()

    urls = [item["url"] for item in listings]
    updated = (
        db.query(Room)
        .filter(Room.is_active == True, Room.listing_url.notin_(urls))
        .update({"is_active": False}, synchronize_session=False)
    )
    db.commit()
    log(f"Marked {updated} stale listings as inactive.")
    log(f"Done — {len(listings)} listings processed.")
    db.close()


if __name__ == "__main__":
    run()
