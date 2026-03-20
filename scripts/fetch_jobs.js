import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- AI SKILL EXTRACTION ---
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
if (!GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY is not defined.");
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

async function extractSkillsWithAI(jobDescription) {
    if (!jobDescription || jobDescription.length < 50) return [];
    try {
        const prompt = `Extract the top 5-7 most important technical skills or technologies from this job description. Return them as a simple comma-separated list. Example: Python, PyTorch, AWS, Docker, Kubernetes. Job Description: "${jobDescription}"`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        return text.split(',').map(skill => skill.trim()).filter(Boolean);
    } catch (error) {
        console.error('Error with Google AI skill extraction:', error);
        return [];
    }
}
// --- END AI SECTION ---


const APIFY_TOKEN = process.env.APIFY_TOKEN;
const DATA_DIR = './data';
const NOW = new Date();
const TIMESTAMP = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}-${String(NOW.getDate()).padStart(2, '0')}-${String(NOW.getHours()).padStart(2, '0')}${String(NOW.getMinutes()).padStart(2, '0')}`;

// Helper to run an Apify actor and wait for results
async function runApifyActor(actorId, input, timeoutSecs = 300) {
    console.log(`Starting Apify actor: ${actorId}`);
    const runResponse = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    const runData = await runResponse.json();
    const { id: runId } = runData.data;

    const startTime = Date.now();
    while ((Date.now() - startTime) < timeoutSecs * 1000) {
        await new Promise(r => setTimeout(r, 5000));
        const statusResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
        const statusData = await statusResponse.json();
        const { status, defaultDatasetId } = statusData.data;

        console.log(`Run ${runId} status: ${status}`);
        if (status === 'SUCCEEDED') {
            const itemsResponse = await fetch(`https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${APIFY_TOKEN}&limit=200`);
            return await itemsResponse.json();
        }
        if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
            throw new Error(`Actor run ${runId} failed with status: ${status}`);
        }
    }
    throw new Error(`Actor run ${runId} timed out after ${timeoutSecs} seconds.`);
}

async function scrapeLinkedInJobs() {
    console.log('Scraping LinkedIn Jobs...');
    const searchUrls = [
        "https://www.linkedin.com/jobs/search/?keywords=Founding%20Engineer%20AI%20ML&f_E=1%2C2&f_TPR=r86400&location=United%20States",
        "https://www.linkedin.com/jobs/search/?keywords=AI%20Engineer%20startup&f_E=1%2C2&f_TPR=r86400&geoId=102752184", // San Francisco Bay Area
        "https://www.linkedin.com/jobs/search/?keywords=Machine%20Learning%20Engineer&f_E=1%2C2&f_TPR=r86400&location=California%2C%20United%20States"
    ];
    const jobs = await runApifyActor('curious_coder/linkedin-jobs-scraper', { startUrls: searchUrls.map(url => ({ url })) });

    if (!Array.isArray(jobs)) {
        console.log('No jobs returned from scraper.');
        return [];
    }

    console.log(`Enriching ${jobs.length} jobs with AI skill tagging...`);
    const enrichedJobs = [];
    for (const job of jobs) {
        await new Promise(resolve => setTimeout(resolve, 200)); 
        const skills = await extractSkillsWithAI(job.description);
        enrichedJobs.push({ ...job, skills });
        console.log(`- Tagged "${job.title}" with skills: [${skills.join(', ')}]`);
    }
    
    return enrichedJobs;
}

async function scrapeFundedStartups() {
    console.log('Scraping recently funded startups...');
    return await runApifyActor('apify/google-search-scraper', {
        queries: ["AI ML startup seed series A funding raised San Francisco last 7 days site:techcrunch.com"],
        resultsPerPage: 10,
    });
}

async function scrapeStealthStartups() {
    console.log('Finding stealth startups...');
    return await runApifyActor('apify/google-search-scraper', {
        queries: [
            "linkedin stealth startup AI engineer San Francisco",
            "ycombinator.com W26 OR S26 batch AI",
            "wellfound.com jobs engineer AI ML founding"
        ],
        resultsPerPage: 15,
    });
}

async function main() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const [jobs, funded, stealth] = await Promise.allSettled([
        scrapeLinkedInJobs(),
        scrapeFundedStartups(),
        scrapeStealthStartups(),
    ]);

    const snapshot = {
        scrapedAt: NOW.toISOString(),
        timestamp: TIMESTAMP,
        jobs: jobs.status === 'fulfilled' ? jobs.value : { error: jobs.reason.message },
        funded_startups: funded.status === 'fulfilled' ? funded.value : { error: funded.reason.message },
        stealth_startups: stealth.status === 'fulfilled' ? stealth.value : { error: stealth.reason.message },
    };

    const outPath = path.join(DATA_DIR, `${TIMESTAMP}.json`);
    fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
    console.log(`Data saved to ${outPath}`);
}

main().catch(error => {
    console.error('An error occurred during the fetch process:', error);
    process.exit(1);
});
