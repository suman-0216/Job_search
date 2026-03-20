const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * ATIMUS CORE - STRATEGIC CAREER AGENT
 * 1. Fetch raw jobs from Apify
 * 2. Process & Score jobs via OpenAI
 * 3. Search for Recently Funded & Stealth Startups
 * 4. Save to Dashboard JSON
 */

async function run() {
    console.log('🦅 Atimus: Strategic Career Run Starting...');
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const APIFY_TOKEN = process.env.APIFY_TOKEN;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!APIFY_TOKEN || !OPENAI_API_KEY) {
        console.error('❌ Missing APIFY_TOKEN or OPENAI_API_KEY in Environment.');
        process.exit(1);
    }

    try {
        console.log('📡 Fetching raw LinkedIn/Wellfound data from Apify...');
        // Simulating Apify Data for now - in production, this would use https.request to Apify API
        const rawJobs = [
            { title: "Founding AI Engineer", company: "Stealth AI", location: "San Francisco", link: "https://example.com/1", description: "Building the future of RAG...", applicants: 12 },
            { title: "Software Engineer", company: "Google", location: "Mountain View", link: "https://example.com/2", description: "Search team...", applicants: 450 }
        ];

        console.log('🧠 Processing & Scoring Jobs via AI...');
        const processedJobs = await processWithAI(OPENAI_API_KEY, 'job-processor', rawJobs);

        console.log('💰 Hunting for Funded & Stealth Startups...');
        const fundedStartups = await processWithAI(OPENAI_API_KEY, 'funded-finder', "Recent AI Seed/Series A news in SF...");
        const stealthStartups = await processWithAI(OPENAI_API_KEY, 'stealth-detector', "LinkedIn 'building something in stealth' profiles in SF...");

        const today = new Date().toISOString().split('T')[0];
        const dashboardData = {
            date: today,
            jobs: processedJobs,
            funded: fundedStartups,
            stealth: stealthStartups,
            timestamp: new Date().toISOString()
        };

        const fileName = `jobs_${today}.json`;
        fs.writeFileSync(path.join(dataDir, fileName), JSON.stringify(dashboardData, null, 2));
        
        console.log(`✅ Run Complete. Saved results to ${fileName}.`);

    } catch (err) {
        console.error('❌ Run Failed:', err.message);
        process.exit(1);
    }
}

async function processWithAI(apiKey, mode, inputData) {
    let systemPrompt = "";
    if (mode === 'job-processor') {
        systemPrompt = "You are an AI job research assistant. Deduplicate, flag low-applicant roles, and calculate a 'startup_score' (0-10). Return a JSON array of jobs.";
    } else if (mode === 'funded-finder') {
        systemPrompt = "Identify recently funded AI startups in SF. Return JSON array with company_name, funding, and ceo_name.";
    } else if (mode === 'stealth-detector') {
        systemPrompt = "Detect stealth AI startups in SF. Return JSON array with description and founder info.";
    }

    const postData = JSON.stringify({
        model: "gpt-4-turbo-preview",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(inputData) }
        ],
        response_format: { type: "json_object" }
    });

    return new Promise((resolve) => {
        const options = {
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    const content = JSON.parse(parsed.choices[0].message.content);
                    // Handle various potential array keys from AI response
                    resolve(content.jobs || content.startups || content.companies || content.results || []);
                } catch (e) {
                    console.error("AI Parse Error:", e.message);
                    resolve([]);
                }
            });
        });
        req.on('error', (e) => {
            console.error("AI Request Error:", e.message);
            resolve([]);
        });
        req.write(postData);
        req.end();
    });
}

run();
