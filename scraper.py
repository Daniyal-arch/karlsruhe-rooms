"""
sw-ka.de Room Scraper (Playwright version)
Logs in with a real browser, scrapes rooms <= MAX_RENT, saves emails to CSV.
Setup: pip install playwright && python -m playwright install chromium
Env vars: SWKA_EMAIL, SWKA_PASSWORD (required)
Run:   python scraper.py
"""

import os, sys, io, csv, time, re
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

EMAIL    = os.environ["SWKA_EMAIL"]
PASSWORD = os.environ["SWKA_PASSWORD"]
MAX_RENT = 400
OUTPUT   = "rooms_under_400.csv"

LOGIN_URL    = "https://www.sw-ka.de/en/mein_account/"
LISTINGS_URL = "https://www.sw-ka.de/en/wohnen/zimmervermittlung/privatzimmer_suchen/"


def login(page):
    print("Opening login page...")
    page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(2000)

    # Accept cookies if banner appears
    try:
        page.click("button:has-text('Akzeptieren')", timeout=4000)
    except PWTimeout:
        pass
    try:
        page.click("button:has-text('Accept')", timeout=2000)
    except PWTimeout:
        pass

    # If no login form visible, click the Login link in the top-right nav
    if not page.query_selector("input[type='password']"):
        for sel in ["a[href*='login']", "a[href*='anmelden']",
                    "a:has-text('Login')", ".new_login_box a"]:
            try:
                page.click(sel, timeout=3000)
                page.wait_for_timeout(2000)
                if page.query_selector("input[type='password']"):
                    break
            except PWTimeout:
                pass

    email_sel = "input[type='email'], input[name*='email'], input[name*='user'], input[name*='login']"
    page.fill(email_sel, EMAIL)
    page.fill("input[type='password']", PASSWORD)

    # Submit
    page.click("button[type='submit'], input[type='submit']")
    page.wait_for_load_state("domcontentloaded", timeout=30000)
    page.wait_for_timeout(2000)

    if "abmelden" in page.content().lower() or "logout" in page.content().lower():
        print("Login successful!")
        return True
    print("Login uncertain — continuing (site may redirect automatically).")
    return False


def parse_rent(text):
    m = re.search(r"(\d{2,4})\s*[Ee]uro|(\d{2,4})\s*€", text)
    if m:
        return int(m.group(1) or m.group(2))
    return None


def fix_url(href):
    from urllib.parse import urljoin
    return urljoin(LISTINGS_URL, href)


def scrape_listings(page):
    results = []
    seen_ids = set()
    page_num = 1

    while True:
        url = LISTINGS_URL if page_num == 1 else f"{LISTINGS_URL}?tx_swkawohn_pi1[page]={page_num}"
        print(f"\nPage {page_num}: {url}")
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(2000)

        rows = page.query_selector_all("table tbody tr, .listing-item, article, li.room, .tx-swkawohn-pi1 li, .angebot")
        print(f"  Rows found: {len(rows)}")

        if not rows:
            snippet = page.inner_text("body")[:800].replace("\n", " ")
            print(f"  Page snippet: {snippet}")
            break

        new_on_page = 0
        for row in rows:
            text = row.inner_text()
            rent = parse_rent(text)
            if rent is None or rent > MAX_RENT:
                continue
            link_el = row.query_selector("a[href]")
            if not link_el:
                continue
            href = link_el.get_attribute("href")
            full_url = fix_url(href)
            # Extract ID for dedup
            id_match = re.search(r"id=(\d+)", full_url)
            listing_id = id_match.group(1) if id_match else full_url
            if listing_id in seen_ids:
                continue
            seen_ids.add(listing_id)
            new_on_page += 1
            results.append({"rent": rent, "url": full_url, "preview": text[:80].strip()})
            print(f"  EUR{rent}: {full_url}")

        if new_on_page == 0:
            print("  No new listings — reached last page.")
            break

        # Check for next page link
        next_btn = page.query_selector("a:has-text('Next'), a:has-text('Weiter'), a.next, .pagination .next")
        if not next_btn:
            # Also try: look for the current page number and see if there's a higher one
            page_links = page.query_selector_all(".pagination a, .pages a, nav.pager a")
            max_linked = 0
            for pl in page_links:
                t = pl.inner_text().strip()
                if t.isdigit() and int(t) > page_num:
                    max_linked = max(max_linked, int(t))
            if max_linked == 0:
                print("  No next page — done.")
                break

        page_num += 1
        time.sleep(1)

    return results


def get_detail(page, url):
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(1500)
    body = page.inner_text("body")

    emails = re.findall(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", body)
    emails = [e for e in emails if "sw-ka.de" not in e]

    phones = re.findall(r"[\+\(]?\d[\d\s\-\/\(\)]{7,18}\d", body)

    rent_m = re.search(r"(\d{2,4})\s*€", body)
    rent = int(rent_m.group(1)) if rent_m else None

    return {
        "rent": rent,
        "emails": "; ".join(sorted(set(emails))),
        "phones": "; ".join(list(dict.fromkeys(phones))[:3]),
        "url": url,
    }


def main():
    with sync_playwright() as pw:
        import os
        chrome_paths = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        ]
        exe = next((p for p in chrome_paths if os.path.exists(p)), None)
        if exe:
            browser = pw.chromium.launch(headless=False, executable_path=exe)
        else:
            browser = pw.chromium.launch(headless=False, channel="chrome")
        ctx = browser.new_context(locale="en-GB")
        page = ctx.new_page()
        page.set_default_timeout(60000)

        login(page)

        listings = scrape_listings(page)
        print(f"\nTotal rooms <= EUR{MAX_RENT}: {len(listings)}")

        if not listings:
            print("Nothing found. See page snippet above for clues.")
            browser.close()
            return

        print("\nFetching contact details...")
        results = []
        for i, item in enumerate(listings, 1):
            print(f"[{i}/{len(listings)}] {item['url']}")
            try:
                detail = get_detail(page, item["url"])
                results.append(detail)
                print(f"  Email: {detail['emails'] or '(none found)'}")
            except Exception as e:
                print(f"  Error: {e}")
            time.sleep(0.8)

        browser.close()

    with open(OUTPUT, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=["rent", "emails", "phones", "url"])
        writer.writeheader()
        writer.writerows(results)

    found = [r for r in results if r["emails"]]
    print(f"\nSaved to {OUTPUT}")
    print(f"Rooms: {len(results)} | With email: {len(found)}")
    if found:
        print("\n--- Emails ---")
        for r in found:
            print(f"  EUR{r['rent']}: {r['emails']}")


if __name__ == "__main__":
    main()
