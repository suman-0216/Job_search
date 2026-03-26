"""
Job Scraper — YC + Wellfound (FAST MULTI-TAB VERSION)

SETUP:
    pip install playwright beautifulsoup4
    python -m playwright install

RUN:
    python job_scraper_fast.py
"""

import json
import re
import time
from datetime import datetime, timezone
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright


# ─────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────
OUTPUT_FILE = "jobs_output.json"

JOB_TITLES = ["Software Engineer", "Founding Engineer", "AI Engineer"]
LOCATIONS  = ["San Francisco, CA", "United States", "California"]

MAX_JOBS = 10
DAYS_OLD = 7


# ─────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────
def log(source: str, msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] [{source.upper():10}] {msg}")


def clean(text):
    if not text:
        return ""
    text = re.sub(r"\s+", " ", str(text)).strip()
    return text[:300] + "..." if len(text) > 300 else text


def slug(text: str):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def is_recent(posted_text: str):
    if not posted_text:
        return True

    t = posted_text.lower()

    if "hour" in t or "minute" in t or "just now" in t:
        return True

    m = re.search(r"(\d+)\s*day", t)
    if m:
        return int(m.group(1)) <= DAYS_OLD

    m = re.search(r"(\d+)\s*week", t)
    if m:
        return int(m.group(1)) * 7 <= DAYS_OLD

    return False


# ─────────────────────────────────────────────────────
# PARSERS (same as before)
# ─────────────────────────────────────────────────────
def parse_yc_html(html, location):
    s = BeautifulSoup(html, "html.parser")
    jobs, seen = [], set()

    for card in s.find_all("div"):
        if len(jobs) >= MAX_JOBS:
            break

        a = card.find("a", href=re.compile(r"^/jobs/\d+$"))
        if not a:
            continue

        url = f"https://www.workatastartup.com{a['href']}"
        if url in seen:
            continue
        seen.add(url)

        title = clean(a.get_text())
        if len(title) < 3:
            continue

        company = ""
        comp_a = card.find("a", href=re.compile(r"/company/"))
        if comp_a:
            company = clean(comp_a.get_text())

        text = card.get_text(" ", strip=True)

        salary = ""
        m = re.search(r"\$[\d,]+[k]?(?:\s*[-–]\s*\$[\d,]+[k]?)?", text)
        if m:
            salary = m.group(0)

        posted = ""
        p = re.search(r"\d+\s*(day|hour|week)s?\s*ago|just now", text)
        if p:
            posted = p.group(0)

        if not is_recent(posted):
            continue

        jobs.append({
            "source": "yc",
            "title": title,
            "company": company,
            "location": location,
            "url": url,
            "salary": salary,
            "posted": posted,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
        })

    return jobs


def parse_wellfound_html(html, location):
    s = BeautifulSoup(html, "html.parser")
    jobs, seen = [], set()

    for a in s.find_all("a", href=re.compile(r"/jobs/")):
        if len(jobs) >= MAX_JOBS:
            break

        href = a["href"]
        url = f"https://wellfound.com{href}" if href.startswith("/") else href

        if url in seen:
            continue
        seen.add(url)

        title = clean(a.get_text())
        if len(title) < 3:
            continue

        card = a.find_parent("div") or a
        text = card.get_text(" ", strip=True)

        company = ""
        comp_a = card.find("a", href=re.compile(r"/company/"))
        if comp_a:
            company = clean(comp_a.get_text())

        salary = ""
        m = re.search(r"\$[\d,]+[k]?(?:\s*[-–]\s*\$[\d,]+[k]?)?", text)
        if m:
            salary = m.group(0)

        posted = ""
        p = re.search(r"\d+\s*(day|hour|week)s?\s*ago|just now", text)
        if p:
            posted = p.group(0)

        if not is_recent(posted):
            continue

        jobs.append({
            "source": "wellfound",
            "title": title,
            "company": company,
            "location": location,
            "url": url,
            "salary": salary,
            "posted": posted,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
        })

    return jobs


# ─────────────────────────────────────────────────────
# FAST MULTI-TAB SCRAPER
# ─────────────────────────────────────────────────────
def scrape():
    yc_jobs = []
    wf_jobs = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=100)
        context = browser.new_context()

        tasks = []
        pages = []

        # create tasks
        for title in JOB_TITLES:
            for location in LOCATIONS:
                tasks.append(("yc", title, location))
                tasks.append(("wf", title, location))

        # create tabs
        for _ in tasks:
            pages.append(context.new_page())

        # execute tasks
        for i, (source, title, location) in enumerate(tasks):
            page = pages[i]

            try:
                if source == "yc":
                    url = (
                        "https://www.workatastartup.com/jobs"
                        f"?query={title.replace(' ', '+')}"
                        f"&location={location.replace(' ', '+')}"
                    )

                    log("yc", f"{title} / {location}")
                    page.goto(url, timeout=60000)
                    page.wait_for_load_state("networkidle")

                    for _ in range(3):
                        page.mouse.wheel(0, 2000)
                        time.sleep(0.7)

                    html = page.content()
                    jobs = parse_yc_html(html, location)
                    yc_jobs.extend(jobs)

                    log("yc", f"→ {len(jobs)} jobs")

                else:
                    loc_slug = slug(location.split(",")[0])
                    role = slug(title)

                    url = f"https://wellfound.com/role/l/{role}/{loc_slug}"

                    log("wf", f"{title} / {location}")
                    page.goto(url, timeout=60000)
                    page.wait_for_load_state("networkidle")

                    for _ in range(4):
                        page.mouse.wheel(0, 2500)
                        time.sleep(0.7)

                    html = page.content()
                    jobs = parse_wellfound_html(html, location)
                    wf_jobs.extend(jobs)

                    log("wf", f"→ {len(jobs)} jobs")

            except Exception as e:
                log("error", f"{source} failed: {e}")

        browser.close()

    return yc_jobs, wf_jobs


# ─────────────────────────────────────────────────────
# SAVE
# ─────────────────────────────────────────────────────
def save(yc_jobs, wf_jobs):
    data = {
        "yc": yc_jobs,
        "wellfound": wf_jobs,
        "total": len(yc_jobs) + len(wf_jobs)
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"\nSaved → {OUTPUT_FILE}")


# ─────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────
if __name__ == "__main__":
    yc, wf = scrape()
    save(yc, wf)

    print("\nSUMMARY")
    print("YC:", len(yc))
    print("Wellfound:", len(wf))
    print("TOTAL:", len(yc) + len(wf))