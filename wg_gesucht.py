"""wg-gesucht.de Room Scraper.

Unlike sw-ka.de this needs no login: search results and listing detail pages
are both plain server-rendered HTML for the fields we need (rent, deposit,
room type, address, free-text description). Contact details (email/phone)
are not exposed without logging in, so those columns are left blank for this
source — not chased further since the current ask is filtering/visibility,
not outreach automation on this particular site.

City code 68 = Karlsruhe; "0+2" combines the WG-Zimmer (0) and Wohnung (2)
categories into one search so whole apartments and shared-flat rooms both
show up. Pagination via `&page=N` has been observed to return overlapping
results between pages (results appear sorted by recent activity, which
shifts between requests) and to clamp to the last real page for anything
beyond it - the same "stop when a page contributes zero new listings" rule
used for sw-ka.de handles both quirks correctly.
"""

import re
import time
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from common import classify, first_number, log, to_int_or_none

BASE_URL = "https://www.wg-gesucht.de"
LISTINGS_URL = "https://www.wg-gesucht.de/wg-zimmer-und-wohnungen-in-Karlsruhe.68.0+2.1.0.html"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
}
MAX_PAGES = 15
REQUEST_DELAY_SECONDS = 0.5

# Badge/title text that tells us the room type: "3-Zimmer-Wohnung" (whole
# apartment) or "Ner WG" (shared-flat size). "in " is prepended before
# feeding it to classify() below since its WG_ANY_RE regex expects
# "in Ner WG" phrasing (matches sw-ka.de's own title convention); harmless
# for the apartment case since APARTMENT_RE doesn't care what precedes it.
BADGE_RE = re.compile(r"(\d+(?:[.,]\d+)?\s*-?\s*Zimmer\s*-?\s*Wohnung|\d+\s*er\s*WG)", re.I)
RENT_RE = re.compile(r"(\d{2,5})\s*€")
ID_RE = re.compile(r"\.(\d+)\.html$")


def collect_listings(max_rent):
    """Walk result pages and return one entry per listing: {rent, url, type_text}.

    Only the rent ceiling applies here (mirrors sw-ka.de's collect_listings) -
    the same room-type/free-text rescue logic only has the full remark to
    work with on the detail page.
    """
    seen, results = set(), []
    over_budget = 0
    for page_num in range(1, MAX_PAGES + 1):
        url = LISTINGS_URL if page_num == 1 else f"{LISTINGS_URL}?page={page_num}"
        log(f"[wg-gesucht] Scanning page {page_num}...")
        resp = requests.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")

        cards = soup.select(".wgg_card.offer_list_item")
        discovered = 0
        for card in cards:
            link = card.select_one("a[href]")
            if not link or not link.get("href"):
                continue
            href = urljoin(BASE_URL, link["href"])
            id_m = ID_RE.search(href)
            key = id_m.group(1) if id_m else href
            if key in seen:
                continue
            seen.add(key)
            discovered += 1

            text = card.get_text(" ", strip=True)
            rent_m = RENT_RE.search(text)
            rent = int(rent_m.group(1)) if rent_m else None
            if rent is not None and rent > max_rent:
                over_budget += 1
                continue

            badge_m = BADGE_RE.search(text)
            title = card.select_one("h2, h3, .truncate_title")
            title_text = title.get_text(strip=True) if title else ""
            type_text = f"{title_text} in {badge_m.group(1)}" if badge_m else title_text

            results.append({"rent": rent, "url": href, "type_text": type_text})

        log(f"  [wg-gesucht] Page {page_num}: {discovered} new listings")
        if discovered == 0:
            break
        time.sleep(REQUEST_DELAY_SECONDS)

    if over_budget:
        log(f"[wg-gesucht] Skipped {over_budget} listings above the EUR{max_rent} ceiling.")
    return results


def parse_detail(url, rent_from_list, type_text=""):
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")

    kv = {}
    address_text = ""
    for label_el in soup.select(".section_panel_detail"):
        text = label_el.get_text(" ", strip=True)
        if re.search(r"\b\d{5}\b", text):
            address_text = text
            continue
        label = text.rstrip(":").strip().lower()
        value_div = label_el.parent.find_next_sibling("div")
        value = value_div.get_text(" ", strip=True) if value_div else ""
        if label and value:
            kv[label] = value

    def kv_get(*keys):
        for k in keys:
            for kk, vv in kv.items():
                if k.lower() in kk:
                    return vv
        return ""

    rent_str = kv_get("miete") or str(rent_from_list or "")
    rent_num = int(first_number(rent_str)) if first_number(rent_str) else rent_from_list
    extra_str = kv_get("nebenkosten")
    extra_num = int(first_number(extra_str)) if first_number(extra_str) else 0

    zip_m = re.search(r"(\d{5})\s+(.+)$", address_text)
    zip_code = zip_m.group(1) if zip_m else ""
    rest = zip_m.group(2).strip() if zip_m else ""
    # "Karlsruhe Innenstadt-Ost" -> city "Karlsruhe", district the remainder.
    city, _, district = rest.partition(" ")
    street = address_text[: zip_m.start()].strip() if zip_m else ""

    size_m = re.search(r"(\d+(?:[.,]\d+)?)\s*m[²2]", soup.get_text())
    size = size_m.group(1) if size_m else ""

    info = classify(type_text)

    # Multiple free-text sections exist (WG description, "we're looking for",
    # etc.) - concatenate them all so the whole-flat/WG-friendly rescue
    # regexes see everything a landlord wrote, not just the first block.
    remark = "\n".join(
        el.get_text("\n", strip=True) for el in soup.select(".section_freetext")
    )

    available = kv_get("frei ab")
    posted = ""  # not exposed without login on this site

    return {
        "Source": "wg-gesucht",
        "Fit": None,  # filled in by caller via common.assess()
        "info": info,
        "remark": remark,
        "Rent (EUR)": rent_num,
        "Extra Costs (EUR)": extra_num if extra_num else "",
        "Total (EUR)": (rent_num or 0) + extra_num,
        "Rooms": info.get("rooms") if info.get("rooms") else "",
        "Sleeps": info.get("sleeps") if info.get("sleeps") else "",
        "Room Type": type_text,
        "Size (m2)": size,
        "Available From": available,
        "Posted": posted,
        "Name": "",
        "Email": "",
        "Phone": "",
        "Mobile": "",
        "Street": street,
        "ZIP": zip_code,
        "City": city,
        "District": district,
        "Deposit (EUR)": to_int_or_none(kv_get("kaution")),
        "Electricity": "",
        "Heating": "",
        "Heating Type": "",
        "Facilities": "",
        "Setup": "",
        "Renovation": "",
        "Bus (min)": "",
        "Tram (min)": "",
        "Train (min)": "",
        "Restrictions": "",
        "Notes": remark,
        "Listing URL": url,
    }
