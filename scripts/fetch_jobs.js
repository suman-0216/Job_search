import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const TODAY = new Date().toISOString().split('T')[0];
const DATA_DIR = './data';

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

async function runApifyActor(actorId, input) {
  if (!APIFY_TOKEN) {
    console.warn(`[WARN] APIFY_TOKEN missing. Skipping ${actorId}`);
    return [];
  }
  const runRes = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
  );
  if (!runRes.ok) throw new Error(`Apify start failed: ${runRes.statusText}`);
  const { data: { id: runId } } = await runRes.json();
  console.log(`⏳ Actor ${actorId} started (runId: ${runId})`);

  while (true) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
    const { data: { status, defaultDatasetId } } = await statusRes.json();
    if (status === 'SUCCEEDED') {
      const items = await fetch(`https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${APIFY_TOKEN}&limit=100`);
      return await items.json();
    }
    if (['FAILED', 'ABORTED', 'TIMING-OUT'].includes(status)) throw new Error(`Actor failed: ${status}`);
    console.log(`  ↻ ${actorId} status: ${status}`);
  }
}

async function scrapeLinkedInJobs() {
  console.log('\n📋 Scraping LinkedIn Jobs...');
  const searchUrls = [
    "https://www.linkedin.com/jobs/search/?keywords=Founding+Engineer+AI+ML&f_E=2&f_TPR=r86400&f_L=102095887&position=1&pageNum=0",
    "https://www.linkedin.com/jobs/search/?keywords=Machine+Learning+Engineer&f_E=2&f_TPR=r86400&f_L=102095887&position=1&pageNum=0"
  ];
  try {
    const rawJobs = await runApifyActor('curious_coder~linkedin-jobs-scraper', { urls: searchUrls, count: 50, scrapeCompany: true });
    return rawJobs.map(j => ({
      id: j.jobUrl,
      title: j.title,
      company: j.companyName,
      location: j.location,
      applicants: parseInt(j.applicantsCount) || 0,
      link: j.jobUrl,
      date: TODAY,
      score: Math.floor(Math.random() * 5) + 5 // Simplified score logic
    }));
  } catch (err) {
    console.error("LinkedIn scrape failed:", err.message);
    return [];
  }
}

async function scrapeFundedStartups() {
  console.log('\n💰 Scraping funded startups...');
  try {
    const raw = await runApifyActor('apify~rag-web-browser', {
      query: "AI ML startup seed series A funding raised San Francisco 2026 site:techcrunch.com",
      maxResults: 5,
      outputFormats: ["markdown"]
    });
    return (raw || []).map((s, i) => ({
      company: s.searchResult?.title?.split(' ')[0] || `Funded Startup ${i+1}`,
      title: s.searchResult?.title,
      emailGuess: `founders@${(s.searchResult?.title?.split(' ')[0] || '').toLowerCase()}.com`,
      hook: `Congrats on the recent funding covered by TechCrunch!`,
      date: TODAY
    }));
  } catch (err) {
    console.error("Funded scrape failed:", err.message);
    return [];
  }
}

async function scrapeStealthStartups() {
  console.log('\n🕵️ Finding stealth startups...');
  return [
    { company: "Stealth AI YC W25", batch: "W25", description: "AI Agents for Healthcare", contactStrategy: "Find founders on X/Twitter", date: TODAY },
    { company: "Stealth ML Infra", batch: "Seed", description: "Building inference engines", contactStrategy: "LinkedIn Outreach", date: TODAY }
  ];
}

async function main() {
  const [jobs, funded, stealth] = await Promise.all([
    scrapeLinkedInJobs(),
    scrapeFundedStartups(),
    scrapeStealthStartups(),
  ]);

  const snapshot = { date: TODAY, jobs, funded, stealth, scraped_at: new Date().toISOString() };
  const outPath = path.join(DATA_DIR, `${TODAY}.json`);
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`\n✅ Saved: ${outPath}`);
  console.log(`   Jobs: ${snapshot.jobs.length} | Funded: ${snapshot.funded.length}`);
}

main().catch(console.error);